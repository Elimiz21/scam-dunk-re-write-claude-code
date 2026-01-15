/**
 * Admin Ingest Evaluation API - Import daily evaluation data into history tables
 * Fetches data from Supabase Storage
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { supabase, EVALUATION_BUCKET } from "@/lib/supabase";

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

async function fetchEvaluationFile(filename: string): Promise<{ data: EvaluationStock[] | null; error?: string }> {
  // Get public URL from Supabase Storage
  const { data: urlData } = supabase.storage
    .from(EVALUATION_BUCKET)
    .getPublicUrl(filename);

  try {
    const response = await fetch(urlData.publicUrl);
    if (!response.ok) {
      return { data: null, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    // Check content type
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      return { data: null, error: `Expected JSON but got ${contentType}: ${text.substring(0, 100)}` };
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return { data: null, error: `Expected array but got ${typeof data}` };
    }

    return { data };
  } catch (err) {
    return { data: null, error: `Fetch error: ${String(err)}` };
  }
}

async function fetchSummaryFile(filename: string): Promise<{ data: EvaluationSummary | null; error?: string }> {
  const { data: urlData } = supabase.storage
    .from(EVALUATION_BUCKET)
    .getPublicUrl(filename);

  try {
    const response = await fetch(urlData.publicUrl);
    if (!response.ok) {
      return { data: null, error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return { data: null };
    }

    const data = await response.json();
    return { data };
  } catch {
    return { data: null };
  }
}

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

    // Fetch evaluation file from Supabase Storage
    const evaluationFilename = `fmp-evaluation-${date}.json`;
    const summaryFilename = `fmp-summary-${date}.json`;

    const evaluationResult = await fetchEvaluationFile(evaluationFilename);
    if (!evaluationResult.data) {
      return NextResponse.json(
        {
          error: `Evaluation file not found or invalid for ${date}`,
          details: evaluationResult.error || "Unknown error",
          hint: "Make sure the file exists in Supabase Storage and is valid JSON"
        },
        { status: 404 }
      );
    }

    const evaluationData = evaluationResult.data;
    const summaryResult = await fetchSummaryFile(summaryFilename);
    const summaryData = summaryResult.data;

    const scanDate = new Date(date);
    scanDate.setHours(0, 0, 0, 0);

    // Filter valid stocks
    const validStocks = evaluationData.filter(
      (stock) => stock.symbol && stock.name && stock.exchange
    );
    const skippedCount = evaluationData.length - validStocks.length;

    // Step 1: Get all existing stocks in one query
    const symbols = validStocks.map((s) => s.symbol);
    const existingStocks = await prisma.trackedStock.findMany({
      where: { symbol: { in: symbols } },
      select: { id: true, symbol: true },
    });
    const existingStockMap = new Map(existingStocks.map((s) => [s.symbol, s.id]));

    // Step 2: Identify stocks to create
    const stocksToCreate = validStocks.filter((s) => !existingStockMap.has(s.symbol));

    // Step 3: Batch create new stocks
    let stocksCreated = 0;
    if (stocksToCreate.length > 0) {
      await prisma.trackedStock.createMany({
        data: stocksToCreate.map((stock) => ({
          symbol: stock.symbol,
          name: stock.name,
          exchange: stock.exchange,
          sector: stock.sector || null,
          industry: stock.industry || null,
          isOTC: stock.exchange === "OTC",
        })),
        skipDuplicates: true,
      });
      stocksCreated = stocksToCreate.length;

      // Fetch the newly created stocks to get their IDs
      const newStocks = await prisma.trackedStock.findMany({
        where: { symbol: { in: stocksToCreate.map((s) => s.symbol) } },
        select: { id: true, symbol: true },
      });
      newStocks.forEach((s) => existingStockMap.set(s.symbol, s.id));
    }

    // Step 4: Check which snapshots already exist for this date
    const stockIds = Array.from(existingStockMap.values());
    const existingSnapshots = await prisma.stockDailySnapshot.findMany({
      where: {
        stockId: { in: stockIds },
        scanDate,
      },
      select: { stockId: true },
    });
    const existingSnapshotSet = new Set(existingSnapshots.map((s) => s.stockId));

    // Step 5: Prepare snapshots to create (only for stocks without existing snapshots)
    const snapshotsToCreate = validStocks
      .filter((stock) => {
        const stockId = existingStockMap.get(stock.symbol);
        return stockId && !existingSnapshotSet.has(stockId);
      })
      .map((stock) => {
        const stockId = existingStockMap.get(stock.symbol)!;
        let evaluatedAt: Date;
        try {
          evaluatedAt = stock.evaluatedAt ? new Date(stock.evaluatedAt) : scanDate;
          if (isNaN(evaluatedAt.getTime())) evaluatedAt = scanDate;
        } catch {
          evaluatedAt = scanDate;
        }

        return {
          stockId,
          scanDate,
          riskLevel: stock.riskLevel || "UNKNOWN",
          totalScore: stock.totalScore || 0,
          isLegitimate: stock.isLegitimate ?? true,
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
          evaluatedAt,
        };
      });

    // Step 6: Batch create snapshots
    let snapshotsCreated = 0;
    if (snapshotsToCreate.length > 0) {
      await prisma.stockDailySnapshot.createMany({
        data: snapshotsToCreate,
        skipDuplicates: true,
      });
      snapshotsCreated = snapshotsToCreate.length;
    }

    // Step 7: Create alerts for HIGH risk stocks (simplified - skip comparison for speed)
    const highRiskStocks = validStocks.filter((s) => s.riskLevel === "HIGH");
    let alertsCreated = 0;

    if (highRiskStocks.length > 0) {
      // Check which high-risk stocks already have alerts for this date
      const highRiskStockIds = highRiskStocks
        .map((s) => existingStockMap.get(s.symbol))
        .filter((id): id is string => !!id);

      const existingAlerts = await prisma.stockRiskAlert.findMany({
        where: {
          stockId: { in: highRiskStockIds },
          alertDate: scanDate,
        },
        select: { stockId: true },
      });
      const existingAlertSet = new Set(existingAlerts.map((a) => a.stockId));

      const alertsToCreate = highRiskStocks
        .filter((stock) => {
          const stockId = existingStockMap.get(stock.symbol);
          return stockId && !existingAlertSet.has(stockId);
        })
        .map((stock) => ({
          stockId: existingStockMap.get(stock.symbol)!,
          alertDate: scanDate,
          alertType: "NEW_HIGH_RISK",
          newRiskLevel: stock.riskLevel,
          newScore: stock.totalScore || 0,
          priceAtAlert: stock.lastPrice || null,
          volumeAtAlert: stock.volume || null,
          triggeringSignals: stock.signalSummary || null,
        }));

      if (alertsToCreate.length > 0) {
        await prisma.stockRiskAlert.createMany({
          data: alertsToCreate,
          skipDuplicates: true,
        });
        alertsCreated = alertsToCreate.length;
      }
    }

    // Step 8: Create daily summary
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
      stocksUpdated: validStocks.length - stocksCreated,
      snapshotsCreated,
      alertsCreated,
      totalProcessed: validStocks.length,
      skipped: skippedCount,
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

    // List files in Supabase Storage bucket
    // Requires RLS policy: CREATE POLICY "Allow public read access to evaluation-data" ON storage.objects FOR SELECT USING (bucket_id = 'evaluation-data');
    const { data: files, error: storageError } = await supabase.storage
      .from(EVALUATION_BUCKET)
      .list("", {
        limit: 100,
        sortBy: { column: "name", order: "desc" },
      });

    if (storageError) {
      console.error("Supabase storage error:", storageError);
      return NextResponse.json(
        {
          error: "Storage listing error - RLS policy may be missing",
          details: storageError.message,
          hint: "Run this SQL in Supabase: CREATE POLICY \"Allow public read access to evaluation-data\" ON storage.objects FOR SELECT USING (bucket_id = 'evaluation-data');"
        },
        { status: 500 }
      );
    }

    // Extract dates from evaluation files (format: fmp-evaluation-YYYY-MM-DD.json)
    const evaluationFiles = (files || [])
      .filter((f) => f.name.startsWith("fmp-evaluation-") && f.name.endsWith(".json"))
      .map((f) => ({
        filename: f.name,
        date: f.name.replace("fmp-evaluation-", "").replace(".json", ""),
      }));

    // Extract dates from summary files (format: fmp-summary-YYYY-MM-DD.json)
    const summaryFiles = (files || [])
      .filter((f) => f.name.startsWith("fmp-summary-") && f.name.endsWith(".json"))
      .map((f) => ({
        filename: f.name,
        date: f.name.replace("fmp-summary-", "").replace(".json", ""),
      }));

    // Get unique dates from evaluation files (required for ingestion)
    const evaluationDates = evaluationFiles.map((f) => f.date);
    const summaryDates = new Set(summaryFiles.map((f) => f.date));

    // Build available dates with file status
    const availableDates = evaluationDates
      .map((date) => ({
        date,
        hasEvaluation: true,
        hasSummary: summaryDates.has(date),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Get already ingested dates from DailyScanSummary
    const ingestedSummaries = await prisma.dailyScanSummary.findMany({
      select: { scanDate: true },
      orderBy: { scanDate: "desc" },
    });
    const ingestedDates = ingestedSummaries.map((s) => s.scanDate.toISOString().split("T")[0]);

    return NextResponse.json({
      availableDates: availableDates.map((d) => d.date),
      ingestedDates,
      pendingDates: availableDates
        .filter((d) => !ingestedDates.includes(d.date))
        .map((d) => d.date),
      fileStatus: availableDates,
      debug: {
        filesFound: files?.length || 0,
        evaluationFiles: evaluationFiles.length,
        summaryFiles: summaryFiles.length,
        allFileNames: files?.map(f => f.name) || [],
      },
    });
  } catch (error) {
    console.error("List evaluations error:", error);
    return NextResponse.json({
      error: "Failed to list evaluations",
      details: String(error)
    }, { status: 500 });
  }
}
