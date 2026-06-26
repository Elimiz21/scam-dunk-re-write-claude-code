/**
 * Core ingestion logic for daily evaluation files.
 * Shared between the admin manual ingest route and the cron auto-ingest route.
 */

import { prisma } from "@/lib/db";
import { supabase, EVALUATION_BUCKET } from "@/lib/supabase";

// Batch size for createMany operations to avoid overwhelming the DB
const BATCH_SIZE = 1000;

export interface IngestResult {
  success: boolean;
  date: string;
  stocksCreated: number;
  stocksUpdated: number;
  snapshotsCreated: number;
  alertsCreated: number;
  promotedStocksCreated: number;
  totalProcessed: number;
  skipped: number;
  durationMs: number;
  error?: string;
}

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
  signals: Array<{
    code: string;
    category: string;
    weight: number;
    description?: string;
  }>;
  signalSummary?: string;
  evaluatedAt: string;
  priceDataSource?: string;
}

type IngestionErrorType =
  | "MISSING_FILE"
  | "BAD_JSON"
  | "INVALID_SUPABASE_CONFIG"
  | "FETCH_ERROR";

interface EvaluationSummary {
  totalStocks: number;
  evaluated: number;
  skippedNoData: number;
  byRiskLevel: Record<string, number>;
  byExchange: Record<
    string,
    { total: number; LOW: number; MEDIUM: number; HIGH: number }
  >;
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
export function toInt(value: number | null | undefined): number | null {
  if (value == null || isNaN(value)) return null;
  return Math.round(value);
}

/**
 * Process createMany in batches to avoid overwhelming the database.
 */
export async function batchCreateMany<T>(
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

async function fetchEvaluationFile(filename: string): Promise<{
  data: EvaluationStock[] | null;
  error?: string;
  errorType?: IngestionErrorType;
}> {
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

    const contentType = response.headers.get("content-type") || "";
    const isJsonLike =
      contentType.includes("application/json") ||
      contentType.includes("application/octet-stream") ||
      contentType.includes("text/plain");

    if (!isJsonLike) {
      const text = await response.text();
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

async function fetchSummaryFile(filename: string): Promise<{
  data: EvaluationSummary | null;
  error?: string;
  errorType?: IngestionErrorType;
}> {
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
      return {
        data: null,
        errorType: "BAD_JSON",
        error: "Invalid JSON in summary file",
      };
    }
  } catch (error) {
    return { data: null, errorType: "BAD_JSON", error: String(error) };
  }
}

async function fetchPromotedStocksFile(filename: string): Promise<{
  data: PromotedStocksReport | null;
  error?: string;
  errorType?: IngestionErrorType;
}> {
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
      return {
        data: null,
        errorType: "BAD_JSON",
        error: "Invalid JSON in promoted stocks file",
      };
    }
  } catch (error) {
    return { data: null, errorType: "BAD_JSON", error: String(error) };
  }
}

/**
 * Returns the list of dates that have evaluation files in Supabase Storage
 * but have NOT yet been ingested into DailyScanSummary, sorted oldest-first.
 */
export async function getPendingDates(): Promise<string[]> {
  // List all files in the evaluation bucket
  const { data: files, error: storageError } = await supabase.storage
    .from(EVALUATION_BUCKET)
    .list("", { limit: 500, sortBy: { column: "name", order: "asc" } });

  if (storageError || !files) {
    throw new Error(
      `Failed to list storage files: ${storageError?.message ?? "No data returned"}`,
    );
  }

  // Extract unique dates from evaluation files (enhanced and legacy formats)
  const dateSet = new Set<string>();
  for (const file of files) {
    const name = file.name;
    if (name.startsWith("enhanced-evaluation-") && name.endsWith(".json")) {
      const date = name
        .replace("enhanced-evaluation-", "")
        .replace(".json", "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dateSet.add(date);
    } else if (name.startsWith("fmp-evaluation-") && name.endsWith(".json")) {
      const date = name.replace("fmp-evaluation-", "").replace(".json", "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dateSet.add(date);
    }
  }

  // Get all already-ingested dates from DailyScanSummary
  const ingested = await prisma.dailyScanSummary.findMany({
    select: { scanDate: true },
  });
  const ingestedDates = new Set(
    ingested.map((row) => row.scanDate.toISOString().split("T")[0]),
  );

  // Return pending dates sorted oldest-first
  return Array.from(dateSet)
    .filter((date) => !ingestedDates.has(date))
    .sort();
}

/**
 * Ingest a single date's evaluation file into the database.
 * Tries enhanced-evaluation-{date}.json first, falls back to fmp-evaluation-{date}.json.
 * Also ingests fmp-summary-{date}.json and promoted-stocks-{date}.json if available.
 *
 * Does NOT write to AdminAuditLog — that stays in the admin route.
 */
export async function ingestDate(date: string): Promise<IngestResult> {
  const startTime = Date.now();

  try {
    const enhancedEvalFilename = `enhanced-evaluation-${date}.json`;
    const legacyEvalFilename = `fmp-evaluation-${date}.json`;
    const summaryFilename = `fmp-summary-${date}.json`;
    const promotedFilename = `promoted-stocks-${date}.json`;

    // Try enhanced format first, fall back to legacy
    let evaluationResult = await fetchEvaluationFile(enhancedEvalFilename);
    if (!evaluationResult.data) {
      console.log(
        `[ingest-core] Enhanced file not found for ${date}, trying legacy format...`,
      );
      evaluationResult = await fetchEvaluationFile(legacyEvalFilename);
    }

    if (!evaluationResult.data) {
      return {
        success: false,
        date,
        stocksCreated: 0,
        stocksUpdated: 0,
        snapshotsCreated: 0,
        alertsCreated: 0,
        promotedStocksCreated: 0,
        totalProcessed: 0,
        skipped: 0,
        durationMs: Date.now() - startTime,
        error: evaluationResult.error ?? "Evaluation file not found",
      };
    }

    const evaluationData = evaluationResult.data;
    console.log(
      `[ingest-core] Loaded ${evaluationData.length} stocks for ${date}`,
    );

    const summaryResult = await fetchSummaryFile(summaryFilename);
    const summaryData = summaryResult.data;

    const promotedResult = await fetchPromotedStocksFile(promotedFilename);
    const promotedData = promotedResult.data;

    const scanDate = new Date(date);
    scanDate.setHours(0, 0, 0, 0);

    // Filter valid stocks
    const validStocks = evaluationData.filter(
      (stock) => stock.symbol && stock.name && stock.exchange,
    );
    const skippedCount = evaluationData.length - validStocks.length;
    console.log(
      `[ingest-core] ${validStocks.length} valid stocks (${skippedCount} skipped) for ${date}`,
    );

    // Step 1: Get all existing stocks in batches
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

    // Step 2: Identify stocks to create
    const stocksToCreate = validStocks.filter(
      (s) => !existingStockMap.has(s.symbol),
    );

    // Step 3: Batch create new stocks
    let stocksCreated = 0;
    if (stocksToCreate.length > 0) {
      console.log(
        `[ingest-core] Creating ${stocksToCreate.length} new stocks for ${date}...`,
      );
      stocksCreated = await batchCreateMany(
        (batch) =>
          prisma.trackedStock.createMany({
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

      // Fetch newly created stocks to get their IDs
      const newSymbols = stocksToCreate.map((s) => s.symbol);
      for (let i = 0; i < newSymbols.length; i += BATCH_SIZE) {
        const batch = newSymbols.slice(i, i + BATCH_SIZE);
        const newStocks = await prisma.trackedStock.findMany({
          where: { symbol: { in: batch } },
          select: { id: true, symbol: true },
        });
        newStocks.forEach((s) => existingStockMap.set(s.symbol, s.id));
      }
      console.log(`[ingest-core] Created ${stocksCreated} new stocks`);
    }

    // Step 4: Check which snapshots already exist for this date
    const stockIds = Array.from(existingStockMap.values());
    const existingSnapshotSet = new Set<string>();

    for (let i = 0; i < stockIds.length; i += BATCH_SIZE) {
      const batch = stockIds.slice(i, i + BATCH_SIZE);
      const existingSnapshots = await prisma.stockDailySnapshot.findMany({
        where: { stockId: { in: batch }, scanDate },
        select: { stockId: true },
      });
      existingSnapshots.forEach((s) => existingSnapshotSet.add(s.stockId));
    }

    // Step 5: Prepare snapshots to create
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
      console.log(
        `[ingest-core] Creating ${snapshotsToCreate.length} snapshots for ${date}...`,
      );
      snapshotsCreated = await batchCreateMany(
        (batch) =>
          prisma.stockDailySnapshot.createMany({
            data: batch,
            skipDuplicates: true,
          }),
        snapshotsToCreate,
      );
      console.log(`[ingest-core] Created ${snapshotsCreated} snapshots`);
    }

    // Step 7: Create alerts for HIGH risk stocks
    const highRiskStocks = validStocks.filter((s) => s.riskLevel === "HIGH");
    let alertsCreated = 0;

    if (highRiskStocks.length > 0) {
      const highRiskStockIds = highRiskStocks
        .map((s) => existingStockMap.get(s.symbol))
        .filter((id): id is string => !!id);

      const existingAlertSet = new Set<string>();
      for (let i = 0; i < highRiskStockIds.length; i += BATCH_SIZE) {
        const batch = highRiskStockIds.slice(i, i + BATCH_SIZE);
        const existingAlerts = await prisma.stockRiskAlert.findMany({
          where: { stockId: { in: batch }, alertDate: scanDate },
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
        console.log(
          `[ingest-core] Creating ${alertsToCreate.length} risk alerts for ${date}...`,
        );
        alertsCreated = await batchCreateMany(
          (batch) =>
            prisma.stockRiskAlert.createMany({
              data: batch,
              skipDuplicates: true,
            }),
          alertsToCreate,
        );
        console.log(`[ingest-core] Created ${alertsCreated} risk alerts`);
      }
    }

    // Step 8: Create/update daily summary
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
    } else {
      // No summary file: upsert a minimal record so this date is marked ingested
      await prisma.dailyScanSummary.upsert({
        where: { scanDate },
        create: {
          scanDate,
          totalStocks: validStocks.length,
          evaluated: validStocks.length,
          skippedNoData: skippedCount,
          lowRiskCount: validStocks.filter((s) => s.riskLevel === "LOW").length,
          mediumRiskCount: validStocks.filter((s) => s.riskLevel === "MEDIUM").length,
          highRiskCount: validStocks.filter((s) => s.riskLevel === "HIGH").length,
          insufficientCount: validStocks.filter((s) => s.riskLevel === "INSUFFICIENT").length,
          byExchange: JSON.stringify({}),
        },
        update: {},
      });
    }

    // Step 9: Ingest promoted stocks
    let promotedStocksCreated = 0;
    if (promotedData && promotedData.promotedStocks?.length > 0) {
      for (const promoted of promotedData.promotedStocks) {
        let marketCapNum: number | null = null;
        if (promoted.marketCap) {
          const match = promoted.marketCap.match(/([\d.]+)([BMK])?/i);
          if (match) {
            marketCapNum = parseFloat(match[1]);
            if (match[2]?.toUpperCase() === "B") marketCapNum *= 1_000_000_000;
            else if (match[2]?.toUpperCase() === "M") marketCapNum *= 1_000_000;
            else if (match[2]?.toUpperCase() === "K") marketCapNum *= 1_000;
          }
        }

        const platform = promoted.platforms[0] || "Unknown";
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
              promoterName:
                promoted.tier === "HIGH" ? "Social Media Alert" : "Risk Flag",
              promotionPlatform: platform,
              promotionGroup: promoted.platforms.join(", "),
              entryPrice: promoted.price || 0,
              entryMarketCap: marketCapNum,
              entryRiskScore: promoted.riskScore || 0,
              evidenceLinks: promoted.sources.join("\n"),
              outcome: "MONITORING",
              isActive: true,
            },
            update: {
              promotionPlatform: platform,
              promotionGroup: promoted.platforms.join(", "),
              entryPrice: promoted.price || undefined,
              entryMarketCap: marketCapNum || undefined,
              entryRiskScore: promoted.riskScore || undefined,
              evidenceLinks: promoted.sources.join("\n"),
            },
          });
          promotedStocksCreated++;
        } catch (e) {
          console.error(
            `[ingest-core] Failed to upsert promoted stock ${promoted.symbol}:`,
            e,
          );
        }
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(
      `[ingest-core] Completed ${date} in ${Math.round(durationMs / 1000)}s`,
    );

    return {
      success: true,
      date,
      stocksCreated,
      stocksUpdated: validStocks.length - stocksCreated,
      snapshotsCreated,
      alertsCreated,
      promotedStocksCreated,
      totalProcessed: validStocks.length,
      skipped: skippedCount,
      durationMs,
    };
  } catch (error) {
    console.error(`[ingest-core] Error ingesting ${date}:`, error);
    return {
      success: false,
      date,
      stocksCreated: 0,
      stocksUpdated: 0,
      snapshotsCreated: 0,
      alertsCreated: 0,
      promotedStocksCreated: 0,
      totalProcessed: 0,
      skipped: 0,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
