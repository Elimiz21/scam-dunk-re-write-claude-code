/**
 * Admin Market Analysis API - Get daily scan summaries and trends
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") || "30");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get daily scan summaries
    const summaries = await prisma.dailyScanSummary.findMany({
      where: {
        scanDate: { gte: startDate },
      },
      orderBy: { scanDate: "desc" },
    });

    // Get risk distribution trend
    const riskTrend = summaries.map((s) => ({
      date: s.scanDate.toISOString().split("T")[0],
      low: s.lowRiskCount,
      medium: s.mediumRiskCount,
      high: s.highRiskCount,
      total: s.evaluated,
    }));

    // Get latest high-risk stocks
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
        include: {
          stock: true,
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

    // Get promoted stocks
    const promotedStocks = await prisma.promotedStock.findMany({
      where: { isActive: true },
      orderBy: { addedDate: "desc" },
      take: 10,
    });

    // Calculate aggregate stats
    const latestSummary = summaries[0];
    const previousSummary = summaries[1];

    const stats = {
      totalStocksTracked: latestSummary?.evaluated || 0,
      highRiskCount: latestSummary?.highRiskCount || 0,
      highRiskChange: latestSummary && previousSummary
        ? latestSummary.highRiskCount - previousSummary.highRiskCount
        : 0,
      mediumRiskCount: latestSummary?.mediumRiskCount || 0,
      lowRiskCount: latestSummary?.lowRiskCount || 0,
      lastScanDate: latestSummary?.scanDate?.toISOString() || null,
      promotedCount: promotedStocks.length,
    };

    return NextResponse.json({
      stats,
      riskTrend: riskTrend.reverse(),
      highRiskStocks,
      promotedStocks,
      summaries: summaries.slice(0, 7),
    });
  } catch (error) {
    console.error("Market analysis error:", error);
    return NextResponse.json(
      { error: "Failed to fetch market analysis" },
      { status: 500 }
    );
  }
}
