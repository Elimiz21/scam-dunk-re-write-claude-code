/**
 * Social Scan API - List scans and trigger new ones
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasRole } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';

// GET - Fetch social scan runs and mentions
export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const ticker = searchParams.get("ticker");
    const platform = searchParams.get("platform");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const promotionalOnly = searchParams.get("promotionalOnly") === "true";

    // Fetch recent scan runs
    const scanRuns = await prisma.socialScanRun.findMany({
      orderBy: { scanDate: "desc" },
      take: 10,
      select: {
        id: true,
        scanDate: true,
        status: true,
        tickersScanned: true,
        tickersWithMentions: true,
        totalMentions: true,
        platformsUsed: true,
        duration: true,
        errors: true,
        createdAt: true,
      },
    });

    // Build mention filters
    const mentionWhere: any = {};
    if (ticker) mentionWhere.ticker = { contains: ticker, mode: "insensitive" };
    if (platform) mentionWhere.platform = platform;
    if (promotionalOnly) mentionWhere.isPromotional = true;
    if (dateFrom || dateTo) {
      mentionWhere.createdAt = {};
      if (dateFrom) mentionWhere.createdAt.gte = new Date(dateFrom);
      if (dateTo) mentionWhere.createdAt.lte = new Date(dateTo + "T23:59:59Z");
    }

    // Fetch mentions with pagination
    const [mentions, totalMentions] = await Promise.all([
      prisma.socialMention.findMany({
        where: mentionWhere,
        orderBy: [{ promotionScore: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          ticker: true,
          stockName: true,
          platform: true,
          source: true,
          discoveredVia: true,
          title: true,
          content: true,
          url: true,
          author: true,
          postDate: true,
          engagement: true,
          sentiment: true,
          isPromotional: true,
          promotionScore: true,
          redFlags: true,
          createdAt: true,
          scanRun: {
            select: { scanDate: true },
          },
        },
      }),
      prisma.socialMention.count({ where: mentionWhere }),
    ]);

    // Aggregate stats
    const stats = await prisma.socialMention.aggregate({
      _count: true,
      _avg: { promotionScore: true },
    });

    const promotionalCount = await prisma.socialMention.count({
      where: { isPromotional: true },
    });

    const uniqueTickers = await prisma.socialMention.groupBy({
      by: ["ticker"],
      _count: true,
      orderBy: { _count: { ticker: "desc" } },
      take: 20,
    });

    const platformBreakdown = await prisma.socialMention.groupBy({
      by: ["platform"],
      _count: true,
      _avg: { promotionScore: true },
    });

    return NextResponse.json({
      scanRuns: scanRuns.map(run => ({
        ...run,
        platformsUsed: run.platformsUsed ? JSON.parse(run.platformsUsed) : [],
        errors: run.errors ? JSON.parse(run.errors) : [],
      })),
      mentions: mentions.map(m => ({
        ...m,
        engagement: m.engagement ? JSON.parse(m.engagement as string) : {},
        redFlags: m.redFlags ? JSON.parse(m.redFlags as string) : [],
      })),
      pagination: {
        page,
        limit,
        total: totalMentions,
        totalPages: Math.ceil(totalMentions / limit),
      },
      stats: {
        totalMentions: stats._count,
        avgPromotionScore: Math.round(stats._avg.promotionScore || 0),
        promotionalCount,
        uniqueTickers: uniqueTickers.map(t => ({
          ticker: t.ticker,
          count: t._count,
        })),
        platformBreakdown: platformBreakdown.map(p => ({
          platform: p.platform,
          count: p._count,
          avgScore: Math.round(p._avg.promotionScore || 0),
        })),
      },
    });
  } catch (error) {
    console.error("Social scan GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch social scan data" },
      { status: 500 }
    );
  }
}

// POST - Trigger a new social scan (stores results in DB)
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasRole(session, ["OWNER", "ADMIN"])) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await request.json();
    const { tickers, date } = body;

    const scanDate = date || new Date().toISOString().split("T")[0];

    // Create scan run record
    const scanRun = await prisma.socialScanRun.create({
      data: {
        scanDate: new Date(scanDate),
        status: "RUNNING",
        triggeredBy: session.id,
      },
    });

    // Log the action
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "SOCIAL_SCAN_TRIGGERED",
        resource: scanRun.id,
        details: JSON.stringify({ tickers, date: scanDate }),
      },
    });

    // Note: The actual scan would be triggered as a background process.
    // For now, we return the scan run ID so the frontend can poll for results.
    // In production, this would call the scan orchestrator via a queue or subprocess.

    return NextResponse.json({
      scanRunId: scanRun.id,
      status: "RUNNING",
      message: "Social scan triggered. Poll for results.",
    });
  } catch (error) {
    console.error("Social scan POST error:", error);
    return NextResponse.json(
      { error: "Failed to trigger social scan" },
      { status: 500 }
    );
  }
}
