/**
 * Admin Market Analysis API - Get daily scan summaries and trends
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30");

    // Unpersonalized aggregate — cache for 60s across admin viewers.
    const payload = await cached(`market-analysis:${days}`, 60, () =>
      buildMarketAnalysis(days),
    );

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Market analysis error:", error);
    return NextResponse.json(
      { error: "Failed to fetch market analysis" },
      { status: 500 },
    );
  }
}

async function buildMarketAnalysis(days: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const now = new Date();
  const currentWindowStart = new Date(now);
  currentWindowStart.setDate(currentWindowStart.getDate() - 7);
  const previousWindowStart = new Date(currentWindowStart);
  previousWindowStart.setDate(previousWindowStart.getDate() - 7);

  // Independent queries run together. `select` on summaries avoids pulling the
  // byExchange/bySector @db.Text JSON blobs that this route never reads.
  const [summaries, promotedStocks, currentPromotedCount, previousPromotedCount] =
    await Promise.all([
      prisma.dailyScanSummary.findMany({
        where: { scanDate: { gte: startDate } },
        orderBy: { scanDate: "desc" },
        select: {
          scanDate: true,
          evaluated: true,
          lowRiskCount: true,
          mediumRiskCount: true,
          highRiskCount: true,
        },
      }),
      prisma.promotedStock.findMany({
        where: { isActive: true },
        orderBy: { addedDate: "desc" },
        take: 10,
      }),
      prisma.promotedStock.count({
        where: { addedDate: { gte: currentWindowStart } },
      }),
      prisma.promotedStock.count({
        where: {
          addedDate: { gte: previousWindowStart, lt: currentWindowStart },
        },
      }),
    ]);

  // Get risk distribution trend
  const riskTrend = summaries.map((s) => ({
    date: s.scanDate.toISOString().split("T")[0],
    low: s.lowRiskCount,
    medium: s.mediumRiskCount,
    high: s.highRiskCount,
    total: s.evaluated,
  }));

  // Get latest high-risk stocks (depends on the latest summary's date).
  // `select` avoids the signals @db.Text blob and pulls only the stock fields used.
  const latestScan = summaries[0]?.scanDate;
  let highRiskStocks: {
    symbol: string;
    name: string;
    totalScore: number;
    signalCount: number;
    lastPrice: number | null;
    priceChangePct: number | null;
  }[] = [];

  if (latestScan) {
    const highRisk = await prisma.stockDailySnapshot.findMany({
      where: {
        scanDate: latestScan,
        riskLevel: "HIGH",
      },
      select: {
        totalScore: true,
        signalCount: true,
        lastPrice: true,
        priceChangePct: true,
        stock: { select: { symbol: true, name: true } },
      },
      orderBy: { totalScore: "desc" },
      take: 20,
    });

    highRiskStocks = highRisk.map((s) => ({
      symbol: s.stock.symbol,
      name: s.stock.name,
      totalScore: s.totalScore,
      signalCount: s.signalCount,
      lastPrice: s.lastPrice,
      priceChangePct: s.priceChangePct,
    }));
  }

  // Calculate aggregate stats
  const latestSummary = summaries[0];
  const previousSummary = summaries[1];

  const stats = {
    totalStocksTracked: latestSummary?.evaluated || 0,
    highRiskCount: latestSummary?.highRiskCount || 0,
    highRiskChange:
      latestSummary && previousSummary
        ? latestSummary.highRiskCount - previousSummary.highRiskCount
        : 0,
    mediumRiskCount: latestSummary?.mediumRiskCount || 0,
    lowRiskCount: latestSummary?.lowRiskCount || 0,
    lastScanDate: latestSummary?.scanDate?.toISOString() || null,
    promotedCount: promotedStocks.length,
    promotedChange: currentPromotedCount - previousPromotedCount,
    promotedDirection:
      currentPromotedCount > previousPromotedCount
        ? "up"
        : currentPromotedCount < previousPromotedCount
          ? "down"
          : "flat",
    hasMorePromotedStocks: currentPromotedCount > previousPromotedCount,
  };

  return {
    stats,
    riskTrend: riskTrend.reverse(),
    highRiskStocks,
    promotedStocks,
    summaries: summaries.slice(0, 7),
  };
}
