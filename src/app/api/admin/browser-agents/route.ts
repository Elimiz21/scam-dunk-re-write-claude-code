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

    // Fetch all data in parallel, tolerating individual failures so the
    // page still renders partial data instead of showing a blanket error.
    const results = await Promise.allSettled([
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

    const sessions = results[0].status === "fulfilled" ? results[0].value : [];
    const totalSessions = results[1].status === "fulfilled" ? results[1].value : 0;
    const platformConfigs = results[2].status === "fulfilled" ? results[2].value : [];
    const stats = results[3].status === "fulfilled" ? results[3].value : getEmptyStats();
    const recentEvidence = results[4].status === "fulfilled" ? results[4].value : [];

    // Log any individual failures for debugging
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        const labels = ["sessions", "sessionCount", "platformConfigs", "stats", "evidence"];
        console.error(`Browser agents query failed [${labels[i]}]:`, r.reason);
      }
    });

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

function getEmptyStats() {
  return {
    totalSessions: 0,
    todaySessions: 0,
    weekSessions: 0,
    totalEvidence: 0,
    runningSessions: 0,
    platformBreakdown: [],
    avgBrowserMinutes: 0,
    totalSuspensions: 0,
  };
}

async function getBrowserAgentStats() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(todayStart);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const results = await Promise.allSettled([
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

    const val = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
      r.status === "fulfilled" ? r.value : fallback;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const platformBreakdown = val(results[5] as any, []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const avgResult = val(results[6] as any, { _avg: { browserMinutes: null } }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const suspResult = val(results[7] as any, { _sum: { suspensionCount: 0 } }) as any;

    return {
      totalSessions: val(results[0], 0) as number,
      todaySessions: val(results[1], 0) as number,
      weekSessions: val(results[2], 0) as number,
      totalEvidence: val(results[3], 0) as number,
      runningSessions: val(results[4], 0) as number,
      platformBreakdown: platformBreakdown.map((p: Record<string, unknown>) => ({
        platform: p.platform,
        sessions: (p._count as Record<string, number>)?.id || 0,
        mentions: (p._sum as Record<string, number>)?.mentionsFound || 0,
        pagesVisited: (p._sum as Record<string, number>)?.pagesVisited || 0,
        browserMinutes: Math.round(((p._sum as Record<string, number>)?.browserMinutes || 0) * 10) / 10,
      })),
      avgBrowserMinutes:
        Math.round((avgResult._avg?.browserMinutes || 0) * 10) / 10,
      totalSuspensions: suspResult._sum?.suspensionCount || 0,
    };
  } catch (err) {
    console.error("getBrowserAgentStats error:", err);
    return getEmptyStats();
  }
}
