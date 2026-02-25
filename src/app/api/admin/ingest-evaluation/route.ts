/**
 * Admin Ingest Evaluation API - Import daily evaluation data into history tables
 * Fetches data from Supabase Storage
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { supabase, EVALUATION_BUCKET } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 minutes for large imports (enhanced pipeline produces ~6,500 stocks)

// Batch size for createMany operations to avoid overwhelming the DB
const BATCH_SIZE = 1000;

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
  avgDailyVolume?: number; // Enhanced pipeline field (maps to avgVolume)
  volumeRatio?: number;
  riskLevel: string;
  totalScore: number;
  isLegitimate?: boolean;
  isInsufficient?: boolean;
  signals: Array<{ code: string; category: string; weight: number; description?: string }>;
  signalSummary?: string;
  evaluatedAt: string;
  priceDataSource?: string;
}

type IngestionErrorType = "MISSING_FILE" | "BAD_JSON" | "INVALID_SUPABASE_CONFIG" | "FETCH_ERROR";

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

interface PromotedStockData {
  symbol: string;
  name: string;
  riskScore: number;
  price: number | null;
  marketCap: string | null;
  tier: string;
  platforms: string[];
  redFlags: string[];
  sources: string[];
  assessment: string | null;
}

interface PromotedStocksReport {
  date: string;
  totalHighRiskStocks: number;
  promotedStocks: PromotedStockData[];
}

/**
 * Safely convert a number to an integer for Prisma Int fields.
 * Returns null if the value is falsy/NaN.
 */
function toInt(value: number | null | undefined): number | null {
  if (value == null || isNaN(value)) return null;
  return Math.round(value);
}

async function fetchEvaluationFile(
  filename: string
): Promise<{ data: EvaluationStock[] | null; error?: string; errorType?: IngestionErrorType }> {
  // Get public URL from Supabase Storage
  let urlData: { publicUrl: string };
  try {
    ({ data: urlData } = supabase.storage
      .from(EVALUATION_BUCKET)
      .getPublicUrl(filename));
  } catch (error) {
    return {
      data: null,
      errorType: "INVALID_SUPABASE_CONFIG",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const response = await fetch(urlData.publicUrl);
    if (!response.ok) {
      return {
        data: null,
        errorType: response.status === 404 ? "MISSING_FILE" : "FETCH_ERROR",
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // Check content type - accept both application/json and application/octet-stream
    // (Supabase may return octet-stream for some uploads)
    const contentType = response.headers.get("content-type") || "";
    const isJsonLike = contentType.includes("application/json") ||
      contentType.includes("application/octet-stream") ||
      contentType.includes("text/plain");

    if (!isJsonLike) {
      const text = await response.text();
      // Try to parse anyway - some storage backends don't set content-type correctly
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return { data: parsed as EvaluationStock[] };
        }
      } catch {
        // Not valid JSON
      }
      return {
        data: null,
        errorType: "BAD_JSON",
        error: `Expected JSON but got ${contentType}: ${text.substring(0, 100)}`,
      };
    }

    // Read as text first, then parse - more reliable for large files
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (error) {
      return {
        data: null,
        errorType: "BAD_JSON",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (!Array.isArray(data)) {
      return {
        data: null,
        errorType: "BAD_JSON",
        error: `Expected array but got ${typeof data}`,
      };
    }

    return { data: data as EvaluationStock[] };
  } catch (err) {
    return {
      data: null,
      errorType: "FETCH_ERROR",
      error: `Fetch error: ${String(err)}`,
    };
  }
}

async function fetchSummaryFile(
  filename: string
): Promise<{ data: EvaluationSummary | null; error?: string; errorType?: IngestionErrorType }> {
  let urlData: { publicUrl: string };
  try {
    ({ data: urlData } = supabase.storage
      .from(EVALUATION_BUCKET)
      .getPublicUrl(filename));
  } catch (error) {
    return {
      data: null,
      errorType: "INVALID_SUPABASE_CONFIG",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const response = await fetch(urlData.publicUrl);
    if (!response.ok) {
      return { data: null, error: `HTTP ${response.status}` };
    }

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return { data };
    } catch {
      return { data: null, errorType: "BAD_JSON", error: "Invalid JSON in summary file" };
    }
  } catch (error) {
    return { data: null, errorType: "BAD_JSON", error: String(error) };
  }
}

async function fetchPromotedStocksFile(
  filename: string
): Promise<{ data: PromotedStocksReport | null; error?: string; errorType?: IngestionErrorType }> {
  let urlData: { publicUrl: string };
  try {
    ({ data: urlData } = supabase.storage
      .from(EVALUATION_BUCKET)
      .getPublicUrl(filename));
  } catch (error) {
    return {
      data: null,
      errorType: "INVALID_SUPABASE_CONFIG",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const response = await fetch(urlData.publicUrl);
    if (!response.ok) {
      return { data: null, error: `HTTP ${response.status}` };
    }

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return { data };
    } catch {
      return { data: null, errorType: "BAD_JSON", error: "Invalid JSON in promoted stocks file" };
    }
  } catch (error) {
    return { data: null, errorType: "BAD_JSON", error: String(error) };
  }
}

/**
 * Process createMany in batches to avoid overwhelming the database
 */
async function batchCreateMany<T>(
  createFn: (data: T[]) => Promise<{ count: number }>,
  items: T[],
): Promise<number> {
  let totalCreated = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const result = await createFn(batch);
    totalCreated += result.count;
  }
  return totalCreated;
}

export async function POST(request: Request) {
  const startTime = Date.now();
  let sessionId: string | null = null;
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    sessionId = session.id;

    const body = await request.json();
    const { date } = body; // Format: YYYY-MM-DD

    if (!date) {
      return NextResponse.json({ error: "Date required (YYYY-MM-DD)" }, { status: 400 });
    }

    console.log(`[ingest] Starting ingestion for ${date}...`);

    // Fetch evaluation file from Supabase Storage
    // Try enhanced format first (new pipeline), fall back to legacy fmp format
    const enhancedEvalFilename = `enhanced-evaluation-${date}.json`;
    const legacyEvalFilename = `fmp-evaluation-${date}.json`;
    const summaryFilename = `fmp-summary-${date}.json`;

    let evaluationResult = await fetchEvaluationFile(enhancedEvalFilename);
    if (!evaluationResult.data) {
      console.log(`[ingest] Enhanced file not found, trying legacy format...`);
      evaluationResult = await fetchEvaluationFile(legacyEvalFilename);
    }
    if (!evaluationResult.data) {
      const statusCode =
        evaluationResult.errorType === "INVALID_SUPABASE_CONFIG"
          ? 500
          : evaluationResult.errorType === "BAD_JSON"
            ? 400
            : 404;
      if (sessionId) {
        await prisma.adminAuditLog.create({
          data: {
            adminUserId: sessionId,
            action: "INGEST_EVALUATION",
            details: JSON.stringify({
              date,
              status: "FAILED",
              errorType: evaluationResult.errorType,
              error: evaluationResult.error || "Unknown error",
              durationMs: Date.now() - startTime,
            }),
          },
        });
      }
      return NextResponse.json(
        {
          error:
            evaluationResult.errorType === "INVALID_SUPABASE_CONFIG"
              ? "Invalid Supabase configuration"
              : evaluationResult.errorType === "BAD_JSON"
                ? "Evaluation file contains invalid JSON"
                : evaluationResult.errorType === "MISSING_FILE"
                  ? "Evaluation file missing"
                  : `Evaluation file not found or invalid for ${date}`,
          details: evaluationResult.error || "Unknown error",
          errorType: evaluationResult.errorType,
          hint: "Make sure the file exists in Supabase Storage and is valid JSON"
        },
        { status: statusCode }
      );
    }

    const evaluationData = evaluationResult.data;
    console.log(`[ingest] Loaded ${evaluationData.length} stocks from evaluation file`);

    const summaryResult = await fetchSummaryFile(summaryFilename);
    const summaryData = summaryResult.data;

    // Also fetch promoted stocks file if available
    const promotedFilename = `promoted-stocks-${date}.json`;
    const promotedResult = await fetchPromotedStocksFile(promotedFilename);
    const promotedData = promotedResult.data;

    const scanDate = new Date(date);
    scanDate.setHours(0, 0, 0, 0);

    // Filter valid stocks
    const validStocks = evaluationData.filter(
      (stock) => stock.symbol && stock.name && stock.exchange
    );
    const skippedCount = evaluationData.length - validStocks.length;
    console.log(`[ingest] ${validStocks.length} valid stocks (${skippedCount} skipped)`);

    // Step 1: Get all existing stocks - query in batches for large symbol lists
    const symbols = validStocks.map((s) => s.symbol);
    const existingStockMap = new Map<string, string>();

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      const existingStocks = await prisma.trackedStock.findMany({
        where: { symbol: { in: batch } },
        select: { id: true, symbol: true },
      });
      existingStocks.forEach((s) => existingStockMap.set(s.symbol, s.id));
    }
    console.log(`[ingest] Found ${existingStockMap.size} existing stocks in DB`);

    // Step 2: Identify stocks to create
    const stocksToCreate = validStocks.filter((s) => !existingStockMap.has(s.symbol));

    // Step 3: Batch create new stocks
    let stocksCreated = 0;
    if (stocksToCreate.length > 0) {
      console.log(`[ingest] Creating ${stocksToCreate.length} new stocks...`);
      stocksCreated = await batchCreateMany(
        (batch) => prisma.trackedStock.createMany({
          data: batch.map((stock) => ({
            symbol: stock.symbol,
            name: stock.name,
            exchange: stock.exchange,
            sector: stock.sector || null,
            industry: stock.industry || null,
            isOTC: stock.exchange === "OTC",
          })),
          skipDuplicates: true,
        }),
        stocksToCreate,
      );

      // Fetch the newly created stocks to get their IDs - also in batches
      const newSymbols = stocksToCreate.map((s) => s.symbol);
      for (let i = 0; i < newSymbols.length; i += BATCH_SIZE) {
        const batch = newSymbols.slice(i, i + BATCH_SIZE);
        const newStocks = await prisma.trackedStock.findMany({
          where: { symbol: { in: batch } },
          select: { id: true, symbol: true },
        });
        newStocks.forEach((s) => existingStockMap.set(s.symbol, s.id));
      }
      console.log(`[ingest] Created ${stocksCreated} new stocks`);
    }

    // Step 4: Check which snapshots already exist for this date - in batches
    const stockIds = Array.from(existingStockMap.values());
    const existingSnapshotSet = new Set<string>();

    for (let i = 0; i < stockIds.length; i += BATCH_SIZE) {
      const batch = stockIds.slice(i, i + BATCH_SIZE);
      const existingSnapshots = await prisma.stockDailySnapshot.findMany({
        where: {
          stockId: { in: batch },
          scanDate,
        },
        select: { stockId: true },
      });
      existingSnapshots.forEach((s) => existingSnapshotSet.add(s.stockId));
    }
    console.log(`[ingest] Found ${existingSnapshotSet.size} existing snapshots for ${date}`);

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

        // Use toInt() for all Int? fields to prevent Prisma float-to-int errors
        // FMP API and the enhanced pipeline may return floats for volume fields
        return {
          stockId,
          scanDate,
          riskLevel: stock.riskLevel || "UNKNOWN",
          totalScore: toInt(stock.totalScore) ?? 0,
          isLegitimate: stock.isLegitimate ?? true,
          isInsufficient: stock.isInsufficient || false,
          lastPrice: stock.lastPrice || null,
          previousClose: stock.previousClose || null,
          priceChangePct: stock.priceChangePct || null,
          volume: toInt(stock.volume),
          avgVolume: toInt(stock.avgVolume || stock.avgDailyVolume),
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
      console.log(`[ingest] Creating ${snapshotsToCreate.length} snapshots in batches of ${BATCH_SIZE}...`);
      snapshotsCreated = await batchCreateMany(
        (batch) => prisma.stockDailySnapshot.createMany({
          data: batch,
          skipDuplicates: true,
        }),
        snapshotsToCreate,
      );
      console.log(`[ingest] Created ${snapshotsCreated} snapshots`);
    }

    // Step 7: Create alerts for HIGH risk stocks (simplified - skip comparison for speed)
    const highRiskStocks = validStocks.filter((s) => s.riskLevel === "HIGH");
    let alertsCreated = 0;

    if (highRiskStocks.length > 0) {
      // Check which high-risk stocks already have alerts for this date
      const highRiskStockIds = highRiskStocks
        .map((s) => existingStockMap.get(s.symbol))
        .filter((id): id is string => !!id);

      const existingAlertSet = new Set<string>();
      for (let i = 0; i < highRiskStockIds.length; i += BATCH_SIZE) {
        const batch = highRiskStockIds.slice(i, i + BATCH_SIZE);
        const existingAlerts = await prisma.stockRiskAlert.findMany({
          where: {
            stockId: { in: batch },
            alertDate: scanDate,
          },
          select: { stockId: true },
        });
        existingAlerts.forEach((a) => existingAlertSet.add(a.stockId));
      }

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
          newScore: toInt(stock.totalScore) ?? 0,
          priceAtAlert: stock.lastPrice || null,
          volumeAtAlert: toInt(stock.volume),
          triggeringSignals: stock.signalSummary || null,
        }));

      if (alertsToCreate.length > 0) {
        console.log(`[ingest] Creating ${alertsToCreate.length} risk alerts...`);
        alertsCreated = await batchCreateMany(
          (batch) => prisma.stockRiskAlert.createMany({
            data: batch,
            skipDuplicates: true,
          }),
          alertsToCreate,
        );
        console.log(`[ingest] Created ${alertsCreated} risk alerts`);
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

    // Step 9: Ingest promoted stocks from social media scan
    let promotedStocksCreated = 0;
    if (promotedData && promotedData.promotedStocks?.length > 0) {
      for (const promoted of promotedData.promotedStocks) {
        // Parse market cap string to number
        let marketCapNum: number | null = null;
        if (promoted.marketCap) {
          const match = promoted.marketCap.match(/([\d.]+)([BMK])?/i);
          if (match) {
            marketCapNum = parseFloat(match[1]);
            if (match[2]?.toUpperCase() === 'B') marketCapNum *= 1_000_000_000;
            else if (match[2]?.toUpperCase() === 'M') marketCapNum *= 1_000_000;
            else if (match[2]?.toUpperCase() === 'K') marketCapNum *= 1_000;
          }
        }

        // Create promoted stock record (upsert to avoid duplicates)
        const platform = promoted.platforms[0] || 'Unknown';
        try {
          await prisma.promotedStock.upsert({
            where: {
              symbol_addedDate: {
                symbol: promoted.symbol,
                addedDate: scanDate,
              },
            },
            create: {
              symbol: promoted.symbol,
              addedDate: scanDate,
              promoterName: promoted.tier === 'HIGH' ? 'Social Media Alert' : 'Risk Flag',
              promotionPlatform: platform,
              promotionGroup: promoted.platforms.join(', '),
              entryPrice: promoted.price || 0,
              entryMarketCap: marketCapNum,
              entryRiskScore: promoted.riskScore || 0,
              evidenceLinks: promoted.sources.join('\n'),
              outcome: 'MONITORING',
              isActive: true,
            },
            update: {
              promotionPlatform: platform,
              promotionGroup: promoted.platforms.join(', '),
              entryPrice: promoted.price || undefined,
              entryMarketCap: marketCapNum || undefined,
              entryRiskScore: promoted.riskScore || undefined,
              evidenceLinks: promoted.sources.join('\n'),
            },
          });
          promotedStocksCreated++;
        } catch (e) {
          console.error(`Failed to create promoted stock ${promoted.symbol}:`, e);
        }
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(`[ingest] Completed in ${Math.round(durationMs / 1000)}s`);

    if (sessionId) {
      await prisma.adminAuditLog.create({
        data: {
          adminUserId: sessionId,
          action: "INGEST_EVALUATION",
          details: JSON.stringify({
            date,
            status: "SUCCESS",
            stocksCreated,
            stocksUpdated: validStocks.length - stocksCreated,
            snapshotsCreated,
            alertsCreated,
            promotedStocksCreated,
            totalProcessed: validStocks.length,
            skipped: skippedCount,
            durationMs,
          }),
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
      promotedStocksCreated,
      totalProcessed: validStocks.length,
      skipped: skippedCount,
    });
  } catch (error) {
    console.error("Ingest evaluation error:", error);
    if (sessionId) {
      try {
        await prisma.adminAuditLog.create({
          data: {
            adminUserId: sessionId,
            action: "INGEST_EVALUATION",
            details: JSON.stringify({
              status: "FAILED",
              error: error instanceof Error ? error.message : String(error),
              durationMs: Date.now() - startTime,
            }),
          },
        });
      } catch (logError) {
        console.error("Failed to log ingestion error:", logError);
      }
    }
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
    let files: { name: string }[] | null = null;
    let storageError: { message: string } | null = null;
    try {
      const storageResult = await supabase.storage
        .from(EVALUATION_BUCKET)
        .list("", {
          limit: 500,
          sortBy: { column: "name", order: "desc" },
        });
      files = storageResult.data;
      storageError = storageResult.error;
    } catch (error) {
      return NextResponse.json(
        {
          error: "Invalid Supabase configuration",
          details: error instanceof Error ? error.message : String(error),
          errorType: "INVALID_SUPABASE_CONFIG",
        },
        { status: 500 }
      );
    }

    if (storageError) {
      console.error("Supabase storage error:", storageError);
      return NextResponse.json(
        {
          error: "Storage listing error - RLS policy may be missing",
          details: storageError.message,
          errorType: "FETCH_ERROR",
          hint: "Run this SQL in Supabase: CREATE POLICY \"Allow public read access to evaluation-data\" ON storage.objects FOR SELECT USING (bucket_id = 'evaluation-data');"
        },
        { status: 500 }
      );
    }

    // Extract dates from evaluation files
    // Supports both enhanced format (enhanced-evaluation-YYYY-MM-DD.json)
    // and legacy format (fmp-evaluation-YYYY-MM-DD.json)
    const evaluationFiles = (files || [])
      .filter((f) =>
        (f.name.startsWith("fmp-evaluation-") || f.name.startsWith("enhanced-evaluation-")) &&
        f.name.endsWith(".json")
      )
      .map((f) => ({
        filename: f.name,
        date: f.name
          .replace("enhanced-evaluation-", "")
          .replace("fmp-evaluation-", "")
          .replace(".json", ""),
      }))
      // Deduplicate dates (prefer enhanced over legacy if both exist)
      .filter((f, i, arr) => arr.findIndex((x) => x.date === f.date) === i);

    // Extract dates from summary files (format: fmp-summary-YYYY-MM-DD.json)
    const summaryFiles = (files || [])
      .filter((f) => f.name.startsWith("fmp-summary-") && f.name.endsWith(".json"))
      .map((f) => ({
        filename: f.name,
        date: f.name.replace("fmp-summary-", "").replace(".json", ""),
      }));

    // Extract dates from promoted stocks files (format: promoted-stocks-YYYY-MM-DD.json)
    const promotedFiles = (files || [])
      .filter((f) => f.name.startsWith("promoted-stocks-") && f.name.endsWith(".json"))
      .map((f) => ({
        filename: f.name,
        date: f.name.replace("promoted-stocks-", "").replace(".json", ""),
      }));

    // Extract dates from comparison files (format: comparison-YYYY-MM-DD.json)
    const comparisonFiles = (files || [])
      .filter((f) => f.name.startsWith("comparison-") && f.name.endsWith(".json"))
      .map((f) => ({
        filename: f.name,
        date: f.name.replace("comparison-", "").replace(".json", ""),
      }));

    // Get unique dates from evaluation files (required for ingestion)
    const evaluationDates = evaluationFiles.map((f) => f.date);
    const summaryDates = new Set(summaryFiles.map((f) => f.date));
    const promotedDates = new Set(promotedFiles.map((f) => f.date));
    const comparisonDates = new Set(comparisonFiles.map((f) => f.date));

    // Get all unique dates across all file types
    const allDates = new Set([
      ...evaluationDates,
      ...promotedFiles.map(f => f.date),
      ...comparisonFiles.map(f => f.date),
    ]);

    // Build available dates with file status
    const availableDates = Array.from(allDates)
      .map((date) => ({
        date,
        hasEvaluation: evaluationDates.includes(date),
        hasSummary: summaryDates.has(date),
        hasPromoted: promotedDates.has(date),
        hasComparison: comparisonDates.has(date),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Get already ingested dates from DailyScanSummary
    const ingestedSummaries = await prisma.dailyScanSummary.findMany({
      select: { scanDate: true },
      orderBy: { scanDate: "desc" },
    });
    const ingestedDates = ingestedSummaries.map((s) => s.scanDate.toISOString().split("T")[0]);

    const lastIngestion = await prisma.adminAuditLog.findFirst({
      where: { action: "INGEST_EVALUATION" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, details: true },
    });

    return NextResponse.json({
      availableDates: availableDates.map((d) => d.date),
      ingestedDates,
      pendingDates: availableDates
        .filter((d) => !ingestedDates.includes(d.date))
        .map((d) => d.date),
      fileStatus: availableDates,
      lastIngestion: lastIngestion
        ? {
            createdAt: lastIngestion.createdAt,
            details: lastIngestion.details,
          }
        : null,
      debug: {
        filesFound: files?.length || 0,
        evaluationFiles: evaluationFiles.length,
        enhancedEvaluationFiles: (files || []).filter(f => f.name.startsWith("enhanced-evaluation-")).length,
        legacyEvaluationFiles: (files || []).filter(f => f.name.startsWith("fmp-evaluation-")).length,
        summaryFiles: summaryFiles.length,
        promotedFiles: promotedFiles.length,
        comparisonFiles: comparisonFiles.length,
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
