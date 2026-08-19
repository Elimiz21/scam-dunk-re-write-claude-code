/**
 * Core ingestion logic for daily evaluation files.
 * Shared between the admin manual ingest route and the cron auto-ingest route.
 */

import { prisma } from "@/lib/db";
import { supabase, EVALUATION_BUCKET } from "@/lib/supabase";
import { fetchDailyCloses } from "@/lib/promoted-stocks/tracker";
import { evaluateScanPublication } from "../../../shared/scan-publication";
import { validatePublicationManifest } from "../../../shared/scan-publication-workflow";

// Batch size for createMany operations to avoid overwhelming the DB
const BATCH_SIZE = 1000;

// A promoted-stock flag is only real if the instrument actually traded
// recently. Stale "expert market" quotes on dead tickers previously produced
// flags dated AFTER the instrument's last trade (130 such rows found in the
// Aug 2026 delisting audit). A last trade within this many days of the scan
// date is required when the price feed covers the symbol at all.
const PROMOTED_MAX_QUOTE_AGE_DAYS = 10;

export interface IngestResult {
  success: boolean;
  date: string;
  stocksCreated: number;
  stocksUpdated: number;
  snapshotsCreated: number;
  alertsCreated: number;
  promotedStocksCreated: number;
  promotedStocksSkippedStale: number;
  totalProcessed: number;
  skipped: number;
  durationMs: number;
  error?: string;
}

/**
 * True when the symbol should NOT be flagged because the price feed shows it
 * stopped trading before the scan date. Fail-open: if FMP has no coverage at
 * all (thin OTC tiers, warrants) or errors out, the flag is allowed and the
 * outcome tracker sorts it out later.
 */
async function isStaleQuoteSymbol(
  symbol: string,
  scanDate: Date,
): Promise<boolean> {
  const from = new Date(scanDate.getTime() - 45 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const closes = await fetchDailyCloses(symbol, from);
  if (closes.length === 0) return false; // no coverage ≠ dead — let it through
  const lastTrade = new Date(closes[closes.length - 1].date + "T00:00:00Z");
  return (
    scanDate.getTime() - lastTrade.getTime() >
    PROMOTED_MAX_QUOTE_AGE_DAYS * 86_400_000
  );
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

async function fetchScanStatusFile(filename: string): Promise<{
  data: unknown | null;
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

    const text = await response.text();
    try {
      return { data: JSON.parse(text) };
    } catch (error) {
      return {
        data: null,
        errorType: "BAD_JSON",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } catch (error) {
    return {
      data: null,
      errorType: "FETCH_ERROR",
      error: `Fetch error: ${String(error)}`,
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
  // Supabase Storage caps a list request at 500 objects. Walk every page so
  // recent pipeline files remain discoverable after the bucket grows beyond
  // that cap.
  const files: { name: string }[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error: storageError } = await supabase.storage
      .from(EVALUATION_BUCKET)
      .list("", {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

    if (storageError || !data) {
      throw new Error(
        `Failed to list storage files: ${storageError?.message ?? "No data returned"}`,
      );
    }

    files.push(...data);
    if (data.length < pageSize) break;
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
    const statusFilename = `scan-status-${date}.json`;
    const legacyEvalFilename = `fmp-evaluation-${date}.json`;
    const summaryFilename = `fmp-summary-${date}.json`;
    const promotedFilename = `promoted-stocks-${date}.json`;

    // Try enhanced format first. A true 404 means no enhanced file exists and
    // preserves the legacy backfill path; every other enhanced outcome is
    // treated as present and must not silently fall back to legacy data.
    let evaluationResult = await fetchEvaluationFile(enhancedEvalFilename);
    const enhancedFileMissing = evaluationResult.errorType === "MISSING_FILE";

    if (!evaluationResult.data && !enhancedFileMissing) {
      return {
        success: false,
        date,
        stocksCreated: 0,
        stocksUpdated: 0,
        snapshotsCreated: 0,
        alertsCreated: 0,
        promotedStocksCreated: 0,
        promotedStocksSkippedStale: 0,
        totalProcessed: 0,
        skipped: 0,
        durationMs: Date.now() - startTime,
        error: `publication blocked: enhanced evaluation is unreadable or unavailable for ${date}: ${evaluationResult.error ?? "unknown error"}`,
      };
    }

    if (enhancedFileMissing) {
      console.log(
        `[ingest-core] Enhanced file not found for ${date}, trying legacy format...`,
      );
      evaluationResult = await fetchEvaluationFile(legacyEvalFilename);
    }

    if (!enhancedFileMissing && evaluationResult.data) {
      const rootStatusResult = await fetchScanStatusFile(statusFilename);
      if (!rootStatusResult.data) {
        return {
          success: false,
          date,
          stocksCreated: 0,
          stocksUpdated: 0,
          snapshotsCreated: 0,
          alertsCreated: 0,
          promotedStocksCreated: 0,
          promotedStocksSkippedStale: 0,
          totalProcessed: 0,
          skipped: 0,
          durationMs: Date.now() - startTime,
          error: `publication blocked: matching root scan status is missing or unreadable for ${date}: ${rootStatusResult.error ?? "missing status"}`,
        };
      }
      const pointerResult = await fetchScanStatusFile(
        `scan-current-generation-${date}.json`,
      );
      if (!pointerResult.data) {
        return {
          success: false,
          date,
          stocksCreated: 0,
          stocksUpdated: 0,
          snapshotsCreated: 0,
          alertsCreated: 0,
          promotedStocksCreated: 0,
          promotedStocksSkippedStale: 0,
          totalProcessed: 0,
          skipped: 0,
          durationMs: Date.now() - startTime,
          error: `publication blocked: current generation pointer is missing or unreadable for ${date}: ${pointerResult.error ?? "missing pointer"}`,
        };
      }
      if (
        typeof pointerResult.data !== "object" ||
        pointerResult.data === null ||
        Array.isArray(pointerResult.data)
      ) {
        return {
          success: false,
          date,
          stocksCreated: 0,
          stocksUpdated: 0,
          snapshotsCreated: 0,
          alertsCreated: 0,
          promotedStocksCreated: 0,
          promotedStocksSkippedStale: 0,
          totalProcessed: 0,
          skipped: 0,
          durationMs: Date.now() - startTime,
          error: `publication blocked: current generation pointer is malformed for ${date}`,
        };
      }
      const pointer = pointerResult.data as Record<string, unknown>;
      const generation = pointer.generationId;
      const expectedPrefix = `quarantine/${date}/${generation}`;
      const expectedManifestPath = `${expectedPrefix}/publication-manifest-${date}.json`;
      if (
        pointer.date !== date ||
        typeof generation !== "string" ||
        !generation.trim() ||
        !/^[A-Za-z0-9._-]+$/.test(generation) ||
        pointer.manifestPath !== expectedManifestPath ||
        pointer.manifestFile !== `publication-manifest-${date}.json`
      ) {
        return {
          success: false,
          date,
          stocksCreated: 0,
          stocksUpdated: 0,
          snapshotsCreated: 0,
          alertsCreated: 0,
          promotedStocksCreated: 0,
          promotedStocksSkippedStale: 0,
          totalProcessed: 0,
          skipped: 0,
          durationMs: Date.now() - startTime,
          error: `publication blocked: current generation pointer is invalid for ${date}`,
        };
      }
      const exactEvaluationResult = await fetchEvaluationFile(
        `${expectedPrefix}/${enhancedEvalFilename}`,
      );
      if (!exactEvaluationResult.data) {
        return {
          success: false,
          date,
          stocksCreated: 0,
          stocksUpdated: 0,
          snapshotsCreated: 0,
          alertsCreated: 0,
          promotedStocksCreated: 0,
          promotedStocksSkippedStale: 0,
          totalProcessed: 0,
          skipped: 0,
          durationMs: Date.now() - startTime,
          error: `publication blocked: generation-scoped enhanced evaluation is missing or unreadable for ${date}: ${exactEvaluationResult.error ?? "missing file"}`,
        };
      }
      evaluationResult = exactEvaluationResult;
      const statusResult = await fetchScanStatusFile(
        `${expectedPrefix}/${statusFilename}`,
      );
      if (!statusResult.data) {
        return {
          success: false,
          date,
          stocksCreated: 0,
          stocksUpdated: 0,
          snapshotsCreated: 0,
          alertsCreated: 0,
          promotedStocksCreated: 0,
          promotedStocksSkippedStale: 0,
          totalProcessed: 0,
          skipped: 0,
          durationMs: Date.now() - startTime,
          error: `publication blocked: scan status is missing or unreadable for ${date}: ${statusResult.error ?? "missing status"}`,
        };
      }

      const rootStatus = rootStatusResult.data as Record<string, any>;
      const exactStatus = statusResult.data as Record<string, any>;
      if (
        rootStatus.date !== date ||
        rootStatus.recovery?.generationId !== generation ||
        rootStatus.recovery?.journalFile !== exactStatus.recovery?.journalFile
      ) {
        return {
          success: false,
          date,
          stocksCreated: 0,
          stocksUpdated: 0,
          snapshotsCreated: 0,
          alertsCreated: 0,
          promotedStocksCreated: 0,
          promotedStocksSkippedStale: 0,
          totalProcessed: 0,
          skipped: 0,
          durationMs: Date.now() - startTime,
          error: `publication blocked: root scan status does not match current generation for ${date}`,
        };
      }

      const journalFile =
        typeof (statusResult.data as Record<string, any>)?.recovery?.journalFile === "string"
          ? (statusResult.data as Record<string, any>).recovery.journalFile
          : "";
      const journalResult = journalFile
        ? await fetchScanStatusFile(`${expectedPrefix}/${journalFile}`)
        : { data: null, error: "missing journal path" };
      if (!journalResult.data) {
        return {
          success: false,
          date,
          stocksCreated: 0,
          stocksUpdated: 0,
          snapshotsCreated: 0,
          alertsCreated: 0,
          promotedStocksCreated: 0,
          promotedStocksSkippedStale: 0,
          totalProcessed: 0,
          skipped: 0,
          durationMs: Date.now() - startTime,
          error: `publication blocked: generation-scoped journal is missing or unreadable for ${date}: ${journalResult.error ?? "missing journal"}`,
        };
      }

      const manifestResult = await fetchScanStatusFile(expectedManifestPath);
      const manifestReasons = validatePublicationManifest(
        statusResult.data,
        date,
        manifestResult.data,
        [
          enhancedEvalFilename,
          statusFilename,
          typeof (statusResult.data as Record<string, unknown>)?.recovery === "object" &&
          (statusResult.data as Record<string, any>).recovery &&
          typeof (statusResult.data as Record<string, any>).recovery.journalFile === "string"
            ? (statusResult.data as Record<string, any>).recovery.journalFile
            : "",
        ],
      );
      if (manifestReasons.length > 0) {
        return {
          success: false,
          date,
          stocksCreated: 0,
          stocksUpdated: 0,
          snapshotsCreated: 0,
          alertsCreated: 0,
          promotedStocksCreated: 0,
          promotedStocksSkippedStale: 0,
          totalProcessed: 0,
          skipped: 0,
          durationMs: Date.now() - startTime,
          error: `publication blocked for ${date}: ${manifestReasons.join(", ")}`,
        };
      }

      const publication = evaluateScanPublication(statusResult.data, date);
      if (!publication.publishable) {
        return {
          success: false,
          date,
          stocksCreated: 0,
          stocksUpdated: 0,
          snapshotsCreated: 0,
          alertsCreated: 0,
          promotedStocksCreated: 0,
          promotedStocksSkippedStale: 0,
          totalProcessed: 0,
          skipped: 0,
          durationMs: Date.now() - startTime,
          error: `publication blocked for ${date}: ${publication.reasons.join(", ")}`,
        };
      }
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
        promotedStocksSkippedStale: 0,
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
    let promotedStocksSkippedStale = 0;
    if (promotedData && promotedData.promotedStocks?.length > 0) {
      // One staleness verdict per distinct symbol (a handful of FMP calls
      // per day) — flags on instruments that stopped trading before the
      // scan date are dropped instead of polluting the outcome ledger.
      const staleBySymbol = new Map<string, boolean>();
      for (const promoted of promotedData.promotedStocks) {
        if (!staleBySymbol.has(promoted.symbol)) {
          try {
            staleBySymbol.set(
              promoted.symbol,
              await isStaleQuoteSymbol(promoted.symbol, scanDate),
            );
          } catch {
            staleBySymbol.set(promoted.symbol, false); // fail-open
          }
        }
      }

      for (const promoted of promotedData.promotedStocks) {
        if (staleBySymbol.get(promoted.symbol)) {
          promotedStocksSkippedStale++;
          console.warn(
            `[ingest-core] Skipping promoted stock ${promoted.symbol}: last trade predates scan date by >${PROMOTED_MAX_QUOTE_AGE_DAYS}d (stale/expert-market quote)`,
          );
          continue;
        }
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
      promotedStocksSkippedStale,
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
      promotedStocksSkippedStale: 0,
      totalProcessed: 0,
      skipped: 0,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
