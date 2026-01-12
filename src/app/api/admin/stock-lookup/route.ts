/**
 * Admin Stock Lookup API - Search and get stock history
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
    const symbol = searchParams.get("symbol")?.toUpperCase();
    const query = searchParams.get("q");
    const days = parseInt(searchParams.get("days") || "90");

    // Search mode
    if (query && !symbol) {
      const stocks = await prisma.trackedStock.findMany({
        where: {
          OR: [
            { symbol: { contains: query.toUpperCase() } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 20,
        orderBy: { symbol: "asc" },
      });

      return NextResponse.json({
        results: stocks.map((s) => ({
          symbol: s.symbol,
          name: s.name,
          exchange: s.exchange,
          sector: s.sector,
        })),
      });
    }

    // Lookup mode
    if (!symbol) {
      return NextResponse.json({ error: "Symbol required" }, { status: 400 });
    }

    const stock = await prisma.trackedStock.findUnique({
      where: { symbol },
    });

    if (!stock) {
      return NextResponse.json({ error: "Stock not found" }, { status: 404 });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get daily snapshots
    const snapshots = await prisma.stockDailySnapshot.findMany({
      where: {
        stockId: stock.id,
        scanDate: { gte: startDate },
      },
      orderBy: { scanDate: "desc" },
    });

    // Get alerts for this stock
    const alerts = await prisma.stockRiskAlert.findMany({
      where: {
        stockId: stock.id,
        alertDate: { gte: startDate },
      },
      orderBy: { alertDate: "desc" },
    });

    // Check if promoted
    const promotion = await prisma.promotedStock.findFirst({
      where: {
        symbol,
        isActive: true,
      },
    });

    // Calculate statistics
    const latestSnapshot = snapshots[0];
    const riskHistory = snapshots.map((s) => ({
      date: s.scanDate.toISOString().split("T")[0],
      riskLevel: s.riskLevel,
      totalScore: s.totalScore,
      price: s.lastPrice,
      volume: s.volume,
    }));

    // Count risk level occurrences
    const riskCounts = snapshots.reduce((acc, s) => {
      acc[s.riskLevel] = (acc[s.riskLevel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      stock: {
        symbol: stock.symbol,
        name: stock.name,
        exchange: stock.exchange,
        sector: stock.sector,
        industry: stock.industry,
        isOTC: stock.isOTC,
      },
      current: latestSnapshot ? {
        riskLevel: latestSnapshot.riskLevel,
        totalScore: latestSnapshot.totalScore,
        lastPrice: latestSnapshot.lastPrice,
        priceChangePct: latestSnapshot.priceChangePct,
        volume: latestSnapshot.volume,
        volumeRatio: latestSnapshot.volumeRatio,
        signalCount: latestSnapshot.signalCount,
        signals: latestSnapshot.signals,
        scanDate: latestSnapshot.scanDate,
      } : null,
      riskHistory: riskHistory.reverse(),
      riskCounts,
      alerts: alerts.map((a) => ({
        alertType: a.alertType,
        alertDate: a.alertDate,
        previousRiskLevel: a.previousRiskLevel,
        newRiskLevel: a.newRiskLevel,
        previousScore: a.previousScore,
        newScore: a.newScore,
      })),
      promotion: promotion ? {
        promoterName: promotion.promoterName,
        platform: promotion.promotionPlatform,
        entryPrice: promotion.entryPrice,
        addedDate: promotion.addedDate,
        outcome: promotion.outcome,
        currentGainPct: promotion.currentGainPct,
      } : null,
      daysTracked: snapshots.length,
    });
  } catch (error) {
    console.error("Stock lookup error:", error);
    return NextResponse.json(
      { error: "Failed to lookup stock" },
      { status: 500 }
    );
  }
}
