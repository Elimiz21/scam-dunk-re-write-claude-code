/**
 * Social Scan API - List scans and trigger new ones
 *
 * GET  - Fetch scan history, mentions, and stats
 * POST - Trigger a real social media scan using high-risk stocks from the latest daily scan
 *
 * Uses Promise.allSettled so the page renders even if DB tables are empty or missing.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasRole } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { runSocialScanAndStore } from "@/lib/social-scan/orchestrate";
import { ScanTarget } from "@/lib/social-scan/types";

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — scanning takes time

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

    // Fetch all data in parallel, tolerating individual failures so the
    // page still renders with empty state instead of a blanket error
    const results = await Promise.allSettled([
      prisma.socialScanRun.findMany({
        orderBy: { scanDate: "desc" },
        take: 10,
        select: {
          id: true, scanDate: true, status: true, tickersScanned: true,
          tickersWithMentions: true, totalMentions: true, platformsUsed: true,
          duration: true, errors: true, createdAt: true,
        },
      }),
      prisma.socialMention.findMany({
        where: mentionWhere,
        orderBy: [{ promotionScore: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, ticker: true, stockName: true, platform: true, source: true,
          discoveredVia: true, title: true, content: true, url: true,
          author: true, postDate: true, engagement: true, sentiment: true,
          isPromotional: true, promotionScore: true, redFlags: true,
          createdAt: true, scanRun: { select: { scanDate: true } },
        },
      }),
      prisma.socialMention.count({ where: mentionWhere }),
      prisma.socialMention.aggregate({ _count: true, _avg: { promotionScore: true } }),
      prisma.socialMention.count({ where: { isPromotional: true } }),
      prisma.socialMention.groupBy({
        by: ["ticker"], _count: true,
        orderBy: { _count: { ticker: "desc" } }, take: 20,
      }),
      prisma.socialMention.groupBy({
        by: ["platform"], _count: true, _avg: { promotionScore: true },
      }),
    ]);

    const val = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
      r.status === "fulfilled" ? r.value : fallback;

    // Log any failures for debugging (table missing, etc.)
    const labels = ["scanRuns", "mentions", "mentionCount", "stats", "promoCount", "tickers", "platforms"];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`Social scan query failed [${labels[i]}]:`, r.reason);
      }
    });

    const scanRuns = val(results[0], [] as any[]);
    const mentions = val(results[1], [] as any[]);
    const totalMentions = val(results[2], 0 as number);
    const statsAgg = val(results[3], { _count: 0, _avg: { promotionScore: null } } as any);
    const promotionalCount = val(results[4], 0 as number);
    const uniqueTickers = val(results[5], [] as any[]);
    const platformBreakdown = val(results[6], [] as any[]);

    return NextResponse.json({
      scanRuns: scanRuns.map((run: any) => ({
        ...run,
        platformsUsed: run.platformsUsed ? JSON.parse(run.platformsUsed) : [],
        errors: run.errors ? JSON.parse(run.errors) : [],
      })),
      mentions: mentions.map((m: any) => ({
        ...m,
        engagement: m.engagement ? JSON.parse(m.engagement as string) : {},
        redFlags: m.redFlags ? JSON.parse(m.redFlags as string) : [],
      })),
      pagination: {
        page, limit, total: totalMentions,
        totalPages: Math.ceil(totalMentions / limit),
      },
      stats: {
        totalMentions: statsAgg._count || 0,
        avgPromotionScore: Math.round(statsAgg._avg?.promotionScore || 0),
        promotionalCount,
        uniqueTickers: uniqueTickers.map((t: any) => ({ ticker: t.ticker, count: t._count })),
        platformBreakdown: platformBreakdown.map((p: any) => ({
          platform: p.platform, count: p._count,
          avgScore: Math.round(p._avg?.promotionScore || 0),
        })),
      },
    });
  } catch (error) {
    console.error("Social scan GET error:", error);
    // Return empty state instead of 500 so the page still renders
    return NextResponse.json({
      scanRuns: [],
      mentions: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      stats: {
        totalMentions: 0, avgPromotionScore: 0, promotionalCount: 0,
        uniqueTickers: [], platformBreakdown: [],
      },
    });
  }
}

// POST - Trigger a new social scan
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

    // Build manual ticker list if provided
    let manualTickers: ScanTarget[] | undefined;
    if (tickers && Array.isArray(tickers) && tickers.length > 0) {
      manualTickers = tickers.map((t: string) => ({
        ticker: t.trim().toUpperCase(),
        name: '',
        riskScore: 0,
        riskLevel: 'HIGH' as const,
        signals: [],
      }));
    }

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
        details: JSON.stringify({
          tickers: manualTickers?.map(t => t.ticker) || 'auto-from-daily-scan',
          date: scanDate,
        }),
      },
    });

    // Run the actual scan (this takes time — up to a few minutes)
    const result = await runSocialScanAndStore({
      scanRunId: scanRun.id,
      triggeredBy: session.id,
      manualTickers,
    });

    return NextResponse.json({
      scanRunId: scanRun.id,
      status: result.status,
      tickersScanned: result.tickersScanned,
      tickersWithMentions: result.tickersWithMentions,
      totalMentions: result.totalMentions,
      platformsUsed: result.platformsUsed,
      errors: result.errors,
      duration: result.duration,
      message: result.tickersScanned === 0
        ? "No high-risk tickers found in the latest daily scan. Run the enhanced daily pipeline first, or provide tickers manually."
        : `Scan complete: ${result.totalMentions} mentions found across ${result.tickersWithMentions} ticker(s).`,
    });
  } catch (error: any) {
    console.error("Social scan POST error:", error);
    // Give specific error message if table doesn't exist
    const msg = error?.message?.includes('does not exist')
      ? "Database tables not set up. Click 'Setup Database' above to create them automatically."
      : "Failed to run social scan";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
