/**
 * Browser Agents API
 * GET: Fetch browser agent sessions, stats, and evidence
 * POST: Trigger a manual browser scan
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasRole } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const platform = searchParams.get("platform") || undefined;
    const status = searchParams.get("status") || undefined;

    // Build filter
    const where: Record<string, unknown> = {};
    if (platform) where.platform = platform;
    if (status) where.status = status;

    // Fetch sessions, platform configs, and stats in parallel
    const [sessions, totalSessions, platformConfigs, stats, recentEvidence] =
      await Promise.all([
        prisma.browserAgentSession.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            _count: { select: { evidence: true } },
          },
        }),
        prisma.browserAgentSession.count({ where }),
        prisma.browserPlatformConfig.findMany({
          orderBy: { platform: "asc" },
        }),
        getBrowserAgentStats(),
        prisma.browserEvidence.findMany({
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            session: {
              select: { platform: true, scanDate: true },
            },
          },
        }),
      ]);

    return NextResponse.json({
      sessions,
      pagination: {
        page,
        limit,
        total: totalSessions,
        totalPages: Math.ceil(totalSessions / limit),
      },
      platformConfigs,
      stats,
      recentEvidence,
    });
  } catch (error) {
    console.error("Get browser agents error:", error);
    return NextResponse.json(
      { error: "Failed to fetch browser agent data" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasRole(session, ["OWNER", "ADMIN"])) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action } = body;

    if (action === "trigger_scan") {
      const { tickers, platforms } = body;

      if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
        return NextResponse.json(
          { error: "At least one ticker is required" },
          { status: 400 }
        );
      }

      // Create a placeholder session record to track the request
      const scanSession = await prisma.browserAgentSession.create({
        data: {
          scanDate: new Date(),
          platform: platforms?.join(",") || "all",
          status: "PENDING",
          tickersSearched: JSON.stringify(tickers),
        },
      });

      // Log the action
      await prisma.adminAuditLog.create({
        data: {
          adminUserId: session.id,
          action: "BROWSER_SCAN_TRIGGERED",
          resource: tickers.join(","),
          details: JSON.stringify({ platforms, sessionId: scanSession.id }),
        },
      });

      return NextResponse.json({
        success: true,
        message: `Browser scan queued for ${tickers.length} ticker(s)`,
        sessionId: scanSession.id,
      });
    }

    if (action === "clear_sessions") {
      const { olderThanDays } = body;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (olderThanDays || 30));

      const deleted = await prisma.browserAgentSession.deleteMany({
        where: {
          createdAt: { lt: cutoff },
          status: { in: ["COMPLETED", "FAILED"] },
        },
      });

      await prisma.adminAuditLog.create({
        data: {
          adminUserId: session.id,
          action: "BROWSER_SESSIONS_CLEARED",
          details: JSON.stringify({
            olderThanDays: olderThanDays || 30,
            deletedCount: deleted.count,
          }),
        },
      });

      return NextResponse.json({
        success: true,
        deleted: deleted.count,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Browser agents POST error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

async function getBrowserAgentStats() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(todayStart);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [
    totalSessions,
    todaySessions,
    weekSessions,
    totalEvidence,
    runningSessions,
    platformBreakdown,
    avgBrowserMinutes,
    suspensionCount,
  ] = await Promise.all([
    prisma.browserAgentSession.count(),
    prisma.browserAgentSession.count({
      where: { scanDate: { gte: todayStart } },
    }),
    prisma.browserAgentSession.count({
      where: { scanDate: { gte: weekAgo } },
    }),
    prisma.browserEvidence.count(),
    prisma.browserAgentSession.count({
      where: { status: { in: ["RUNNING", "PENDING"] } },
    }),
    prisma.browserAgentSession.groupBy({
      by: ["platform"],
      _count: { id: true },
      _sum: { mentionsFound: true, pagesVisited: true, browserMinutes: true },
      where: { scanDate: { gte: weekAgo } },
    }),
    prisma.browserAgentSession.aggregate({
      _avg: { browserMinutes: true },
      where: {
        status: "COMPLETED",
        scanDate: { gte: weekAgo },
      },
    }),
    prisma.browserAgentSession.aggregate({
      _sum: { suspensionCount: true },
      where: { scanDate: { gte: weekAgo } },
    }),
  ]);

  return {
    totalSessions,
    todaySessions,
    weekSessions,
    totalEvidence,
    runningSessions,
    platformBreakdown: platformBreakdown.map((p) => ({
      platform: p.platform,
      sessions: p._count.id,
      mentions: p._sum.mentionsFound || 0,
      pagesVisited: p._sum.pagesVisited || 0,
      browserMinutes: Math.round((p._sum.browserMinutes || 0) * 10) / 10,
    })),
    avgBrowserMinutes:
      Math.round((avgBrowserMinutes._avg.browserMinutes || 0) * 10) / 10,
    totalSuspensions: suspensionCount._sum.suspensionCount || 0,
  };
}
