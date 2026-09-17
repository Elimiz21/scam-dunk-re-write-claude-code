import { normalizeEntryPrice } from "@/lib/promoted-stocks/entry-price";
/**
 * Core ingestion logic for daily evaluation files.
 * Shared between the admin manual ingest route and the cron auto-ingest route.
 */

import { prisma } from "@/lib/db";
import { EVALUATION_BUCKET } from "@/lib/supabase";
import { getEvaluationStorageServerClient } from "@/lib/server/evaluation-storage";
import { fetchDailyCloses } from "@/lib/promoted-stocks/tracker";
import { normalizeMarketObservation } from "@/lib/admin/market-observation";
import { listAllEvaluationFiles } from "@/lib/admin/evaluation-storage-listing";
import {
  loadPublishedArtifactRevision,
  readArtifactPointer,
} from "@/lib/admin/artifact-storage";
import { assessPublicationQuality } from "@/lib/admin/artifact-quality";
import { PrismaIngestionStore } from "@/lib/admin/prisma-ingestion-store";

// Batch size for createMany operations to avoid overwhelming the DB
const BATCH_SIZE = 1000;

// A promoted-stock flag is only real if the instrument actually traded
// recently. Stale "expert market" quotes on dead tickers previously produced
// flags dated AFTER the instrument's last trade (130 such rows found in the
// Aug 2026 delisting audit). A last trade within this many days of the scan
// date is required when the price feed covers the symbol at all.
const PROMOTED_MAX_QUOTE_AGE_DAYS = 10;

export interface IdentityQuarantine {
  symbol: string;
  existingName: string;
  incomingName: string;
  securityIdentifier: string | null;
  reason: "OTC_ISSUER_NAME_CONFLICT";
}

export interface IngestResult {
  partial?: boolean;
  identityQuarantines?: IdentityQuarantine[];
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
  sourceObservedAt?: string;
  sourceVersion?: string;
  securityIdentifier?: string;
}

// Provider exchange codes and OTC market-tier labels describe the same market
// classification. Keep the original exchange label for reporting.
function isOTCExchange(exchange: string): boolean {
  const normalized = exchange.trim().toUpperCase();
  return (
    normalized.startsWith("OTC") ||
    [
      "OTHER OTC",
      "PNK",
      "PINK",
      "PINK SHEETS",
      "GREY",
      "GRAY",
      "GREY MARKET",
      "GRAY MARKET",
      "EXPERT",
      "EXPERT MARKET",
    ].includes(normalized)
  );
}

function normalizedIssuerName(value: string): string {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(new RegExp("[^\\p{L}\\p{N}]", "gu"), "");
}

function hasEvaluationTimestamp(value: string): boolean {
  if (typeof value !== "string") return false;
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!parts) return false;
  const [, year, month, day, hour, minute, second] = parts.map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  // Date.parse normalizes impossible dates and 24:00 into another day.
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth[month - 1] &&
    hour < 24 &&
    minute < 60 &&
    second < 60 &&
    Number.isFinite(new Date(value).getTime())
  );
}

type IngestionErrorType =
  "MISSING_FILE" | "BAD_JSON" | "INVALID_SUPABASE_CONFIG" | "FETCH_ERROR";

interface EvaluationSummary {
  totalStocks: number;
  evaluated: number;
  skippedNoData: number;
  byRiskLevel: Record<string, number>;
  byExchange: Record<
    string,
    {
      total: number;
      LOW: number;
      MEDIUM: number;
      HIGH: number;
      identityQuarantines?: IdentityQuarantine[];
    }
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
  try {
    const bytes = await readStorageObject(filename);
    if (!bytes) {
      return { data: null, errorType: "MISSING_FILE", error: "HTTP 404" };
    }
    let data: unknown;
    try {
      data = JSON.parse(bytes.toString("utf8"));
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
  try {
    const bytes = await readStorageObject(filename);
    if (!bytes) return { data: null, errorType: "MISSING_FILE", error: "HTTP 404" };
    try {
      const data = JSON.parse(bytes.toString("utf8"));
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
  try {
    const bytes = await readStorageObject(filename);
    if (!bytes) return { data: null, errorType: "MISSING_FILE", error: "HTTP 404" };
    try {
      const data = JSON.parse(bytes.toString("utf8"));
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

async function readStorageObject(path: string): Promise<Buffer | null> {
  const { data, error } = await getEvaluationStorageServerClient().storage
    .from(EVALUATION_BUCKET)
    .download(path);
  if (error) {
    if (/not.?found|404/i.test(error.message)) return null;
    throw new Error(`Failed to read ${path}: ${error.message}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

function parseArtifactJson<T>(bytes: Buffer | undefined, name: string): T | null {
  if (!bytes) return null;
  try {
    return JSON.parse(bytes.toString("utf8")) as T;
  } catch {
    throw new Error(`Invalid JSON in verified artifact ${name}`);
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
  const bucket = getEvaluationStorageServerClient().storage.from(EVALUATION_BUCKET);
  const files = await listAllEvaluationFiles((path, options) =>
    bucket.list(path, options),
  );

  const heads = await prisma.evaluationArtifactPublicationHead.findMany({
    select: { scanDate: true, revisionHash: true },
  });
  const revisionPointers = new Map<string, string>(heads.map((head) => [
    head.scanDate.toISOString().slice(0, 10), head.revisionHash,
  ]));
  if (files.some((file) => file.name === "revisions")) {
    const revisionDates = await listAllEvaluationFiles(
      (path, options) => bucket.list(path, options),
      "revisions",
    );
    for (const entry of revisionDates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) continue;
      if (revisionPointers.has(entry.name)) continue;
      const pointer = await readArtifactPointer(entry.name, readStorageObject);
      if (pointer) revisionPointers.set(entry.name, pointer.revisionHash);
    }
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
  for (const date of Array.from(revisionPointers.keys())) dateSet.add(date);

  // Get all already-ingested dates from DailyScanSummary
  const ingested = await prisma.dailyScanSummary.findMany({
    select: { scanDate: true, byExchange: true },
  });
  const ingestedDates = new Set(
    ingested
      .filter((row) => {
        if (!row.byExchange) return true;
        try {
          return !JSON.parse(row.byExchange)?.OTC?.identityQuarantines?.length;
        } catch {
          return false; // unreadable completion metadata must remain retryable
        }
      })
      .map((row) => row.scanDate.toISOString().split("T")[0]),
  );

  if (revisionPointers.size > 0) {
    const published = await prisma.evaluationArtifactRevision.findMany({
      where: {
        revisionHash: { in: Array.from(revisionPointers.values()) },
        status: "PUBLISHED",
      },
      select: { revisionHash: true },
    });
    const publishedHashes = new Set(published.map((row) => row.revisionHash));
    for (const [date, revisionHash] of Array.from(revisionPointers.entries())) {
      if (publishedHashes.has(revisionHash)) ingestedDates.add(date);
      else ingestedDates.delete(date);
    }
  }

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
  const identityQuarantines: IdentityQuarantine[] = [];
  const quarantinedSymbols = new Set<string>();
  let revisionContext: {
    store: PrismaIngestionStore;
    revisionHash: string;
    phase: string;
    leaseToken: string;
  } | null = null;

  try {
    const enhancedEvalFilename = `enhanced-evaluation-${date}.json`;
    const legacyEvalFilename = `fmp-evaluation-${date}.json`;
    const summaryFilename = `fmp-summary-${date}.json`;
    const promotedFilename = `promoted-stocks-${date}.json`;

    const authoritativeHead = await prisma.evaluationArtifactPublicationHead.findUnique({
      where: { scanDate: new Date(`${date}T00:00:00.000Z`) },
      select: { revisionHash: true },
    });
    const publishedRevision = await loadPublishedArtifactRevision(
      date,
      readStorageObject,
      authoritativeHead?.revisionHash,
    );
    let evaluationData: EvaluationStock[] | null = null;
    let summaryData: EvaluationSummary | null = null;
    let promotedData: PromotedStocksReport | null = null;
    let evaluationError: string | undefined;
    if (publishedRevision) {
      if (publishedRevision.manifest.producerKind === "DAILY_PIPELINE") {
        const qualityNames = [
          `scan-status-${date}.json`,
          `pipeline-validation-${date}.json`,
        ];
        if (!qualityNames.every((name) => publishedRevision.manifest.requiredArtifacts.includes(name))) {
          throw new Error("Daily pipeline quality artifacts must be required by the manifest");
        }
        const qualityFiles = Object.fromEntries(publishedRevision.files);
        const assessed = assessPublicationQuality(date, qualityFiles);
        if (assessed !== publishedRevision.manifest.qualityStatus) {
          throw new Error("Artifact quality status does not match verified pipeline evidence");
        }
      }
      evaluationData =
        parseArtifactJson<EvaluationStock[]>(
          publishedRevision.files.get(enhancedEvalFilename),
          enhancedEvalFilename,
        ) ??
        parseArtifactJson<EvaluationStock[]>(
          publishedRevision.files.get(legacyEvalFilename),
          legacyEvalFilename,
        );
      summaryData = parseArtifactJson<EvaluationSummary>(
        publishedRevision.files.get(summaryFilename),
        summaryFilename,
      );
      promotedData = parseArtifactJson<PromotedStocksReport>(
        publishedRevision.files.get(promotedFilename),
        promotedFilename,
      );
      if (!Array.isArray(evaluationData)) {
        throw new Error("Published revision has no valid evaluation array");
      }
      if (!summaryData) {
        throw new Error("Published revision has no required summary artifact");
      }
    } else {
      // Legacy fallback is allowed only when the canonical revision pointer is absent.
      let evaluationResult = await fetchEvaluationFile(enhancedEvalFilename);
      if (!evaluationResult.data) {
        console.log(
          `[ingest-core] Enhanced file not found for ${date}, trying legacy format...`,
        );
        evaluationResult = await fetchEvaluationFile(legacyEvalFilename);
      }
      evaluationData = evaluationResult.data;
      evaluationError = evaluationResult.error;
      summaryData = (await fetchSummaryFile(summaryFilename)).data;
      promotedData = (await fetchPromotedStocksFile(promotedFilename)).data;
    }

    if (!evaluationData) {
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
        error: evaluationError ?? "Evaluation file not found",
      };
    }
    // Validate before any legacy write or canonical phase claim. Unknown is
    // valid source evidence; invalid numeric values must not enter storage.
    for (const promoted of promotedData?.promotedStocks ?? []) {
      normalizeEntryPrice(promoted.price);
    }
    console.log(
      `[ingest-core] Loaded ${evaluationData.length} stocks for ${date}`,
    );


    const scanDate = new Date(date);
    scanDate.setHours(0, 0, 0, 0);

    if (publishedRevision) {
      const store = new PrismaIngestionStore(prisma);
      const phase = "CANONICAL_PUBLISH";
      await store.ensureRevision(publishedRevision.manifest, [phase]);
      const claim = await store.claimPhase(
        publishedRevision.manifest.revisionHash,
        phase,
        `ingest-${process.pid}`,
        10 * 60_000,
      );
      if (claim.state === "BUSY") {
        throw new Error("Artifact revision is already leased by another worker");
      }
      if (claim.state === "COMPLETE") {
        return {
          success: true,
          date,
          stocksCreated: 0,
          stocksUpdated: 0,
          snapshotsCreated: 0,
          alertsCreated: 0,
          promotedStocksCreated: 0,
          promotedStocksSkippedStale: 0,
          totalProcessed: evaluationData.length,
          skipped: 0,
          durationMs: Date.now() - startTime,
        };
      }
      revisionContext = {
        store,
        revisionHash: publishedRevision.manifest.revisionHash,
        phase,
        leaseToken: claim.leaseToken!,
      };
    }

    // Filter valid stocks
    let validStocks = evaluationData.filter(
      (stock) => stock.symbol && stock.name && stock.exchange,
    );
    // Validate OTC provenance before any writes. A scan date is not the time
    // an evaluation actually occurred, including for historical reconstructions.
    for (const stock of validStocks) {
      if (
        isOTCExchange(stock.exchange) &&
        !hasEvaluationTimestamp(stock.evaluatedAt)
      ) {
        throw new Error(
          `Invalid or missing evaluatedAt for OTC security ${stock.symbol}`,
        );
      }
    }
    const invalidStockCount = evaluationData.length - validStocks.length;
    let skippedCount = invalidStockCount;
    console.log(
      `[ingest-core] ${validStocks.length} valid stocks (${skippedCount} skipped) for ${date}`,
    );

    // Pointer-backed revisions are all-or-nothing. Resolve identity conflicts
    // before any TrackedStock, snapshot, alert, promotion, or summary mutation.
    if (publishedRevision && revisionContext) {
      const preflightSymbols = Array.from(new Set(validStocks.map((stock) => stock.symbol)));
      const incomingBySymbol = new Map<string, EvaluationStock[]>();
      for (const stock of validStocks) {
        const group = incomingBySymbol.get(stock.symbol) ?? [];
        group.push(stock);
        incomingBySymbol.set(stock.symbol, group);
      }
      for (let i = 0; i < preflightSymbols.length; i += BATCH_SIZE) {
        const existingStocks = await prisma.trackedStock.findMany({
          where: { symbol: { in: preflightSymbols.slice(i, i + BATCH_SIZE) } },
          select: { id: true, symbol: true, name: true, exchange: true, isOTC: true },
        });
        for (const existing of existingStocks) {
          const incoming = incomingBySymbol.get(existing.symbol)?.find(
            (candidate) =>
              (isOTCExchange(candidate.exchange) || existing.isOTC || isOTCExchange(existing.exchange)) &&
              normalizedIssuerName(existing.name) !== normalizedIssuerName(candidate.name),
          );
          if (!incoming || quarantinedSymbols.has(existing.symbol)) continue;
          quarantinedSymbols.add(existing.symbol);
          identityQuarantines.push({
            symbol: existing.symbol,
            existingName: existing.name,
            incomingName: incoming.name,
            securityIdentifier: incoming.securityIdentifier ?? null,
            reason: "OTC_ISSUER_NAME_CONFLICT",
          });
        }
      }
      if (identityQuarantines.length > 0) {
        const error = `${identityQuarantines.length} OTC issuer identity conflicts quarantined; canonical publication blocked`;
        await revisionContext.store.failPhase(
          revisionContext.revisionHash,
          revisionContext.phase,
          revisionContext.leaseToken,
          error,
        );
        revisionContext = null;
        return {
          success: false,
          partial: true,
          identityQuarantines,
          error,
          date,
          stocksCreated: 0,
          stocksUpdated: 0,
          snapshotsCreated: 0,
          alertsCreated: 0,
          promotedStocksCreated: 0,
          promotedStocksSkippedStale: 0,
          totalProcessed: 0,
          skipped: evaluationData.length,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // Step 1: Get all existing stocks in batches
    const symbols = Array.from(new Set(validStocks.map((s) => s.symbol)));
    const existingStockMap = new Map<string, string>();

    let stocksUpdated = 0;
    const incomingStocks = new Map(
      validStocks.map((stock) => [stock.symbol, stock]),
    );
    const trackedStockUpdates: Array<{
      id: string;
      data: { exchange: string; isOTC: boolean };
    }> = [];
    const incomingBySymbol = new Map<string, EvaluationStock[]>();
    for (const stock of validStocks) {
      const group = incomingBySymbol.get(stock.symbol) ?? [];
      group.push(stock);
      incomingBySymbol.set(stock.symbol, group);
    }
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      const existingStocks = await prisma.trackedStock.findMany({
        where: { symbol: { in: batch } },
        select: {
          id: true,
          symbol: true,
          name: true,
          exchange: true,
          isOTC: true,
        },
      });
      for (const existing of existingStocks) {
        const incoming = incomingBySymbol
          .get(existing.symbol)!
          .find(
            (candidate) =>
              (isOTCExchange(candidate.exchange) ||
                existing.isOTC ||
                isOTCExchange(existing.exchange)) &&
              normalizedIssuerName(existing.name) !==
                normalizedIssuerName(candidate.name),
          );
        if (incoming) {
          quarantinedSymbols.add(existing.symbol);
          identityQuarantines.push({
            symbol: existing.symbol,
            existingName: existing.name,
            incomingName: incoming.name,
            securityIdentifier: incoming.securityIdentifier ?? null,
            reason: "OTC_ISSUER_NAME_CONFLICT",
          });
        }
      }
      const changedStockIds = existingStocks
        .filter((existing) => {
          if (quarantinedSymbols.has(existing.symbol)) return false;
          const incoming = incomingStocks.get(existing.symbol)!;
          return (
            existing.exchange !== incoming.exchange ||
            existing.isOTC !== isOTCExchange(incoming.exchange)
          );
        })
        .map((existing) => existing.id);
      // The latest scan and latest evaluation can belong to different rows.
      // Aggregate both independently so out-of-order replays cannot weaken the guard.
      const provenance =
        changedStockIds.length > 0
          ? await prisma.stockDailySnapshot.groupBy({
              by: ["stockId"],
              where: { stockId: { in: changedStockIds } },
              _max: { scanDate: true, evaluatedAt: true },
            })
          : [];
      const latestByStock = new Map(
        provenance.map((row) => [row.stockId, row._max]),
      );
      for (const existing of existingStocks) {
        if (quarantinedSymbols.has(existing.symbol)) continue;
        existingStockMap.set(existing.symbol, existing.id);
        const incoming = incomingStocks.get(existing.symbol)!;
        const isOTC = isOTCExchange(incoming.exchange);
        // Historical artifact replays may create missing snapshots, but cannot
        // roll current security metadata back to an earlier market listing.
        const latestSnapshot = latestByStock.get(existing.id);
        const incomingEvaluationTime = hasEvaluationTimestamp(
          incoming.evaluatedAt,
        )
          ? new Date(incoming.evaluatedAt).getTime()
          : scanDate.getTime();
        // Same-day snapshots are immutable below. Do not update metadata from
        // a newer same-day observation whose provenance would not be persisted.
        const isCurrent =
          !latestSnapshot ||
          (scanDate.getTime() > (latestSnapshot.scanDate?.getTime() ?? 0) &&
            incomingEvaluationTime >=
              (latestSnapshot.evaluatedAt?.getTime() ?? 0));
        if (
          isCurrent &&
          (existing.exchange !== incoming.exchange || existing.isOTC !== isOTC)
        ) {
          if (publishedRevision) {
            trackedStockUpdates.push({
              id: existing.id,
              data: { exchange: incoming.exchange, isOTC },
            });
          } else {
            await prisma.trackedStock.update({
              where: { id: existing.id },
              data: { exchange: incoming.exchange, isOTC },
            });
            stocksUpdated++;
          }
        }
      }
    }

    validStocks = validStocks.filter(
      (stock) => !quarantinedSymbols.has(stock.symbol),
    );
    skippedCount = evaluationData.length - validStocks.length;

    // Step 2: Identify stocks to create
    const stocksToCreate = validStocks.filter(
      (s) => !existingStockMap.has(s.symbol),
    );

    // Step 3: Batch create new stocks
    let stocksCreated = 0;
    if (!publishedRevision && stocksToCreate.length > 0) {
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
              isOTC: isOTCExchange(stock.exchange),
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
        return publishedRevision !== null || (!!stockId && !existingSnapshotSet.has(stockId));
      })
      .map((stock) => {
        const stockId = existingStockMap.get(stock.symbol) ?? "";
        const observation = normalizeMarketObservation(stock);
        let evaluatedAt: Date;
        try {
          evaluatedAt = stock.evaluatedAt
            ? new Date(stock.evaluatedAt)
            : scanDate;
          if (isNaN(evaluatedAt.getTime())) evaluatedAt = scanDate;
        } catch {
          evaluatedAt = scanDate;
        }

        return {
          stockId,
          stockSymbol: stock.symbol,
          scanDate,
          riskLevel: stock.riskLevel || "UNKNOWN",
          totalScore: toInt(stock.totalScore) ?? 0,
          isLegitimate:
            stock.riskLevel === "INSUFFICIENT"
              ? null
              : observation.isLegitimate,
          isInsufficient:
            stock.riskLevel === "INSUFFICIENT"
              ? true
              : observation.isInsufficient,
          lastPrice: observation.lastPrice,
          previousClose: observation.previousClose,
          priceChangePct: observation.priceChangePct,
          volume: observation.volume,
          avgVolume: observation.avgVolume,
          volumeRatio: observation.volumeRatio,
          marketCap: stock.marketCap ?? null,
          signals: JSON.stringify(stock.signals || []),
          signalSummary: stock.signalSummary || null,
          signalCount: stock.signals?.length || 0,
          dataSource: observation.dataSource,
          sourceObservedAt: observation.sourceObservedAt,
          sourceVersion: observation.sourceVersion,
          evaluatedAt,
        };
      });

    // Step 6: Batch create snapshots
    let snapshotsCreated = 0;
    if (!publishedRevision && snapshotsToCreate.length > 0) {
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
    let alertsToCreate: Array<{
      stockId: string;
      stockSymbol?: string;
      alertDate: Date;
      alertType: string;
      newRiskLevel: string;
      newScore: number;
      priceAtAlert: number | null;
      volumeAtAlert: number | null;
      triggeringSignals: string | null;
    }> = [];

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

      alertsToCreate = highRiskStocks
        .filter((stock) => {
          const stockId = existingStockMap.get(stock.symbol);
          return (
            (publishedRevision !== null || (!!stockId && !existingAlertSet.has(stockId)))
          );
        })
        .map((stock) => ({
          stockId: existingStockMap.get(stock.symbol) ?? "",
          stockSymbol: stock.symbol,
          alertDate: scanDate,
          alertType: "NEW_HIGH_RISK",
          newRiskLevel: stock.riskLevel,
          newScore: toInt(stock.totalScore) ?? 0,
          priceAtAlert: stock.lastPrice || null,
          volumeAtAlert: toInt(stock.volume),
          triggeringSignals: stock.signalSummary || null,
        }));

      if (!publishedRevision && alertsToCreate.length > 0) {
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

    // Persist accepted counts and the explicit quarantine without a schema change.
    // Existing consumers read total/LOW/MEDIUM/HIGH; extra OTC metadata is additive.
    let effectiveSummary = summaryData;
    if (!effectiveSummary || identityQuarantines.length > 0) {
      const byExchange: EvaluationSummary["byExchange"] = {};
      const byRiskLevel: Record<string, number> = {};
      for (const stock of validStocks) {
        byRiskLevel[stock.riskLevel] = (byRiskLevel[stock.riskLevel] || 0) + 1;
        const exchange = isOTCExchange(stock.exchange) ? "OTC" : stock.exchange;
        const counts = (byExchange[exchange] ||= {
          total: 0,
          LOW: 0,
          MEDIUM: 0,
          HIGH: 0,
        });
        counts.total++;
        if (
          stock.riskLevel === "LOW" ||
          stock.riskLevel === "MEDIUM" ||
          stock.riskLevel === "HIGH"
        )
          counts[stock.riskLevel]++;
      }
      if (identityQuarantines.length > 0) {
        byExchange.OTC ||= { total: 0, LOW: 0, MEDIUM: 0, HIGH: 0 };
        byExchange.OTC.identityQuarantines = identityQuarantines;
      }
      effectiveSummary = {
        ...summaryData,
        totalStocks: summaryData?.totalStocks ?? evaluationData.length,
        evaluated: validStocks.length,
        skippedNoData: summaryData?.skippedNoData ?? invalidStockCount,
        byRiskLevel,
        byExchange,
      };
    }
    const summaryValues = {
      totalStocks: effectiveSummary.totalStocks,
      evaluated: effectiveSummary.evaluated,
      skippedNoData: effectiveSummary.skippedNoData,
      lowRiskCount: effectiveSummary.byRiskLevel?.LOW || 0,
      mediumRiskCount: effectiveSummary.byRiskLevel?.MEDIUM || 0,
      highRiskCount: effectiveSummary.byRiskLevel?.HIGH || 0,
      insufficientCount: effectiveSummary.byRiskLevel?.INSUFFICIENT || 0,
      byExchange: JSON.stringify(effectiveSummary.byExchange || {}),
      scanDurationMins: effectiveSummary.durationMinutes ?? null,
      apiCallsMade: effectiveSummary.apiCallsMade ?? null,
    };
    if (!publishedRevision) {
      await prisma.dailyScanSummary.upsert({
        where: { scanDate },
        create: { scanDate, ...summaryValues },
        update: summaryValues,
      });
    }

    // Step 9: Ingest promoted stocks
    let promotedStocksCreated = 0;
    let promotedStocksSkippedStale = 0;
    const promotedRows: Array<{
      symbol: string;
      addedDate: Date;
      promoterName: string;
      promotionPlatform: string;
      promotionGroup: string;
      entryPrice: number | null;
      entryMarketCap: number | null;
      entryRiskScore: number;
      evidenceLinks: string;
      outcome: string;
      isActive: boolean;
    }> = [];
    if (promotedData && promotedData.promotedStocks?.length > 0) {
      // One staleness verdict per distinct symbol (a handful of FMP calls
      // per day) — flags on instruments that stopped trading before the
      // scan date are dropped instead of polluting the outcome ledger.
      const staleBySymbol = new Map<string, boolean>();
      if (!publishedRevision) {
        for (const promoted of promotedData.promotedStocks) {
          if (quarantinedSymbols.has(promoted.symbol)) continue;
          if (staleBySymbol.has(promoted.symbol)) continue;
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
        if (quarantinedSymbols.has(promoted.symbol)) continue;
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
        const promotedRow = {
          symbol: promoted.symbol,
          addedDate: scanDate,
          promoterName:
            promoted.tier === "HIGH" ? "Social Media Alert" : "Risk Flag",
          promotionPlatform: platform,
          promotionGroup: promoted.platforms.join(", "),
          entryPrice: normalizeEntryPrice(promoted.price),
          entryMarketCap: marketCapNum,
          entryRiskScore: promoted.riskScore ?? 0,
          evidenceLinks: promoted.sources.join("\n"),
          outcome: "MONITORING",
          isActive: true,
        };
        if (publishedRevision) {
          promotedRows.push(promotedRow);
          continue;
        }
        try {
          await prisma.promotedStock.upsert({
            where: {
              symbol_addedDate: {
                symbol: promoted.symbol,
                addedDate: scanDate,
              },
            },
            create: {
              ...promotedRow,
            },
            update: {
              promotionPlatform: platform,
              promotionGroup: promoted.platforms.join(", "),
              entryPrice: normalizeEntryPrice(promoted.price),
              entryMarketCap: marketCapNum ?? undefined,
              entryRiskScore: promoted.riskScore ?? undefined,
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

    if (publishedRevision && revisionContext) {
      const publication = await revisionContext.store.publishEvaluationRevision({
        revisionHash: revisionContext.revisionHash,
        phase: revisionContext.phase,
        leaseToken: revisionContext.leaseToken,
        scanDate,
        newStocks: stocksToCreate.map((stock) => ({
          symbol: stock.symbol,
          name: stock.name,
          exchange: stock.exchange,
          sector: stock.sector || null,
          industry: stock.industry || null,
          isOTC: isOTCExchange(stock.exchange),
        })),
        trackedStockUpdates,
        snapshots: snapshotsToCreate,
        alerts: alertsToCreate,
        promotedStocks: promotedRows,
        summary: summaryValues,
      });
      snapshotsCreated = publication.snapshotsCreated;
      alertsCreated = publication.alertsCreated;
      promotedStocksCreated = publication.promotedStocksCreated;
      stocksCreated = publication.stocksCreated;
      stocksUpdated = trackedStockUpdates.length;
      revisionContext = null;
    }

    const durationMs = Date.now() - startTime;
    console.log(
      `[ingest-core] ${identityQuarantines.length ? "Partial ingestion" : "Completed"} ${date} in ${Math.round(durationMs / 1000)}s`,
    );

    return {
      success: identityQuarantines.length === 0,
      partial: identityQuarantines.length > 0,
      identityQuarantines,
      ...(identityQuarantines.length
        ? {
            error: `${identityQuarantines.length} OTC issuer identity conflicts quarantined; date remains pending`,
          }
        : {}),
      date,
      stocksCreated,
      stocksUpdated,
      snapshotsCreated,
      alertsCreated,
      promotedStocksCreated,
      promotedStocksSkippedStale,
      totalProcessed: validStocks.length,
      skipped: skippedCount,
      durationMs,
    };
  } catch (error) {
    if (revisionContext) {
      await revisionContext.store
        .failPhase(
          revisionContext.revisionHash,
          revisionContext.phase,
          revisionContext.leaseToken,
          error instanceof Error ? error.message : String(error),
        )
        .catch((phaseError) =>
          console.error("[ingest-core] Failed to persist phase failure", phaseError),
        );
    }
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
