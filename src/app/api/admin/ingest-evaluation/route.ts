/**
 * Admin Ingest Evaluation API - Import daily evaluation data into history tables
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for large imports

interface EvaluationStock {
  symbol: string;
  name: string;
  exchange: string;
  sector?: string;
  industry?: string;
  marketCap?: number;
  lastPrice?: number;
  previousClose?: number;
  priceChangePct?: number;
  volume?: number;
  avgVolume?: number;
  volumeRatio?: number;
  riskLevel: string;
  totalScore: number;
  isLegitimate: boolean;
  isInsufficient?: boolean;
  signals: Array<{ code: string; category: string; weight: number; description?: string }>;
  signalSummary?: string;
  evaluatedAt: string;
  priceDataSource?: string;
}

interface EvaluationSummary {
  totalStocks: number;
  evaluated: number;
  skippedNoData: number;
  byRiskLevel: Record<string, number>;
  byExchange: Record<string, { total: number; LOW: number; MEDIUM: number; HIGH: number }>;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  apiCallsMade?: number;
}

// Available evaluation dates (hardcoded for now, could be made dynamic)
const AVAILABLE_DATES = ["2026-01-12", "2026-01-11"];

export async function POST(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { date } = body; // Format: YYYY-MM-DD

    if (!date) {
      return NextResponse.json({ error: "Date required (YYYY-MM-DD)" }, { status: 400 });
    }

    if (!AVAILABLE_DATES.includes(date)) {
      return NextResponse.json({ error: `No evaluation data available for ${date}` }, { status: 404 });
    }

    // Get the base URL from the request headers
    const headersList = headers();
    const host = headersList.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    // Fetch evaluation file from public folder
    const evaluationUrl = `${baseUrl}/evaluation-data/fmp-evaluation-${date}.json`;
    const summaryUrl = `${baseUrl}/evaluation-data/fmp-summary-${date}.json`;

    const evalResponse = await fetch(evaluationUrl);
    if (!evalResponse.ok) {
      return NextResponse.json({ error: `Evaluation file not found for ${date}` }, { status: 404 });
    }

    const evaluationData: EvaluationStock[] = await evalResponse.json();

    // Try to fetch summary (optional)
    let summaryData: EvaluationSummary | null = null;
    try {
      const summaryResponse = await fetch(summaryUrl);
      if (summaryResponse.ok) {
        summaryData = await summaryResponse.json();
      }
    } catch {
      // Summary is optional
    }

    const scanDate = new Date(date);
    scanDate.setHours(0, 0, 0, 0);

    let stocksCreated = 0;
    let stocksUpdated = 0;
    let snapshotsCreated = 0;
    let alertsCreated = 0;

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < evaluationData.length; i += batchSize) {
      const batch = evaluationData.slice(i, i + batchSize);

      for (const stock of batch) {
        // Upsert stock record
        const trackedStock = await prisma.trackedStock.upsert({
          where: { symbol: stock.symbol },
          create: {
            symbol: stock.symbol,
            name: stock.name,
            exchange: stock.exchange,
            sector: stock.sector || null,
            industry: stock.industry || null,
            isOTC: stock.exchange === "OTC",
          },
          update: {
            name: stock.name,
            sector: stock.sector || undefined,
            industry: stock.industry || undefined,
          },
        });

        if (trackedStock.createdAt.getTime() > Date.now() - 1000) {
          stocksCreated++;
        } else {
          stocksUpdated++;
        }

        // Check for existing snapshot
        const existingSnapshot = await prisma.stockDailySnapshot.findUnique({
          where: {
            stockId_scanDate: {
              stockId: trackedStock.id,
              scanDate,
            },
          },
        });

        if (!existingSnapshot) {
          // Create snapshot
          await prisma.stockDailySnapshot.create({
            data: {
              stockId: trackedStock.id,
              scanDate,
              riskLevel: stock.riskLevel,
              totalScore: stock.totalScore,
              isLegitimate: stock.isLegitimate,
              isInsufficient: stock.isInsufficient || false,
              lastPrice: stock.lastPrice || null,
              previousClose: stock.previousClose || null,
              priceChangePct: stock.priceChangePct || null,
              volume: stock.volume || null,
              avgVolume: stock.avgVolume || null,
              volumeRatio: stock.volumeRatio || null,
              marketCap: stock.marketCap || null,
              signals: JSON.stringify(stock.signals || []),
              signalSummary: stock.signalSummary || null,
              signalCount: stock.signals?.length || 0,
              dataSource: stock.priceDataSource || "FMP",
              evaluatedAt: new Date(stock.evaluatedAt),
            },
          });
          snapshotsCreated++;

          // Check for risk alerts (compare with previous day)
          const previousSnapshot = await prisma.stockDailySnapshot.findFirst({
            where: {
              stockId: trackedStock.id,
              scanDate: { lt: scanDate },
            },
            orderBy: { scanDate: "desc" },
          });

          if (previousSnapshot) {
            // Create alert if risk level changed
            if (previousSnapshot.riskLevel !== stock.riskLevel) {
              let alertType = "RISK_CHANGED";
              if (stock.riskLevel === "HIGH" && previousSnapshot.riskLevel !== "HIGH") {
                alertType = "NEW_HIGH_RISK";
              } else if (
                (stock.riskLevel === "HIGH" || stock.riskLevel === "MEDIUM") &&
                previousSnapshot.riskLevel === "LOW"
              ) {
                alertType = "RISK_INCREASED";
              } else if (
                stock.riskLevel === "LOW" &&
                (previousSnapshot.riskLevel === "HIGH" || previousSnapshot.riskLevel === "MEDIUM")
              ) {
                alertType = "RISK_DECREASED";
              }

              await prisma.stockRiskAlert.create({
                data: {
                  stockId: trackedStock.id,
                  alertDate: scanDate,
                  alertType,
                  previousRiskLevel: previousSnapshot.riskLevel,
                  newRiskLevel: stock.riskLevel,
                  previousScore: previousSnapshot.totalScore,
                  newScore: stock.totalScore,
                  priceAtAlert: stock.lastPrice || null,
                  volumeAtAlert: stock.volume || null,
                  triggeringSignals: stock.signalSummary || null,
                },
              });
              alertsCreated++;
            }
          } else if (stock.riskLevel === "HIGH") {
            // First time seeing this stock and it's high risk
            await prisma.stockRiskAlert.create({
              data: {
                stockId: trackedStock.id,
                alertDate: scanDate,
                alertType: "NEW_HIGH_RISK",
                newRiskLevel: stock.riskLevel,
                newScore: stock.totalScore,
                priceAtAlert: stock.lastPrice || null,
                volumeAtAlert: stock.volume || null,
                triggeringSignals: stock.signalSummary || null,
              },
            });
            alertsCreated++;
          }
        }
      }
    }

    // Create daily summary
    if (summaryData) {
      await prisma.dailyScanSummary.upsert({
        where: { scanDate },
        create: {
          scanDate,
          totalStocks: summaryData.totalStocks,
          evaluated: summaryData.evaluated,
          skippedNoData: summaryData.skippedNoData,
          lowRiskCount: summaryData.byRiskLevel?.LOW || 0,
          mediumRiskCount: summaryData.byRiskLevel?.MEDIUM || 0,
          highRiskCount: summaryData.byRiskLevel?.HIGH || 0,
          insufficientCount: summaryData.byRiskLevel?.INSUFFICIENT || 0,
          byExchange: JSON.stringify(summaryData.byExchange || {}),
          scanDurationMins: summaryData.durationMinutes || null,
          apiCallsMade: summaryData.apiCallsMade || null,
        },
        update: {
          totalStocks: summaryData.totalStocks,
          evaluated: summaryData.evaluated,
          skippedNoData: summaryData.skippedNoData,
          lowRiskCount: summaryData.byRiskLevel?.LOW || 0,
          mediumRiskCount: summaryData.byRiskLevel?.MEDIUM || 0,
          highRiskCount: summaryData.byRiskLevel?.HIGH || 0,
          insufficientCount: summaryData.byRiskLevel?.INSUFFICIENT || 0,
          byExchange: JSON.stringify(summaryData.byExchange || {}),
          scanDurationMins: summaryData.durationMinutes || null,
          apiCallsMade: summaryData.apiCallsMade || null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      date,
      stocksCreated,
      stocksUpdated,
      snapshotsCreated,
      alertsCreated,
      totalProcessed: evaluationData.length,
    });
  } catch (error) {
    console.error("Ingest evaluation error:", error);
    return NextResponse.json(
      { error: "Failed to ingest evaluation data", details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get already ingested dates from DailyScanSummary
    const ingestedSummaries = await prisma.dailyScanSummary.findMany({
      select: { scanDate: true },
      orderBy: { scanDate: "desc" },
    });
    const ingestedDates = ingestedSummaries.map((s) => s.scanDate.toISOString().split("T")[0]);

    return NextResponse.json({
      availableDates: AVAILABLE_DATES,
      ingestedDates,
      pendingDates: AVAILABLE_DATES.filter((d) => !ingestedDates.includes(d)),
    });
  } catch (error) {
    console.error("List evaluations error:", error);
    return NextResponse.json({ error: "Failed to list evaluations" }, { status: 500 });
  }
}
