/**
 * Social Scan Orchestrator (server-side)
 *
 * Runs all configured scanners, aggregates results per ticker,
 * and stores everything in the database.
 *
 * Durability model (SOC-C2): each scanner's mentions are attributed to tickers
 * and written to the DB INCREMENTALLY (createMany + skipDuplicates) the moment
 * the scanner finishes, with a heartbeat (updatedAt bump). A function that is
 * killed mid-run therefore keeps whatever partial progress already landed
 * instead of losing everything at a single end-of-run write.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  getConfiguredFreeScanners,
  getPerplexityScanner,
} from "./scanners";
import { getScanTargetsFromLatestDailyScan } from "./get-scan-targets";
import {
  ScanTarget,
  SocialMention,
  PlatformScanResult,
  TickerScanResult,
  ScanRunResult,
  textMentionsTicker,
} from "./types";
import { screenMentionsWithAI } from "./ai-screener";
import {
  persistRowsBounded,
  sanitizeAndTruncateUnicode,
  type PersistenceResult,
} from "./persistence";
import {
  getTickerCoverage,
  type PlatformCoverage,
  type SocialRunMetadata,
} from "./coverage";

/** Per-scanner hard timeout. Scanners own an internal budget (~100s) and
 * return partial results before this fires; this is a safety net only. */
const SCANNER_HARD_TIMEOUT = 115_000;

/** AI screening timeout — partial results are kept if it overruns. */
const AI_SCREEN_TIMEOUT = 120_000;

/** Minimum free-scanner promotional mentions a ticker needs before we spend a
 * (paid) Perplexity call on it (SOC-CO4). */
const PERPLEXITY_MIN_FLAGGED = 2;

/** Leave enough of Vercel's 300-second ceiling to reconcile counts and write a
 * terminal run state even when scanners or persistence are degraded. */
const RUN_TOTAL_BUDGET_MS = 285_000;
const FINALIZATION_RESERVE_MS = 15_000;
const PERSISTENCE_CHUNK_SIZE = 50;
const PERSISTENCE_TRANSIENT_RETRIES = 2;

/**
 * Content hash used for in-run dedup. Mirrors the DB unique key
 * `@@unique([scanRunId, ticker, contentHash])`: sha256(url || title || content).
 */
function computeContentHash(m: {
  url?: string | null;
  title?: string | null;
  content?: string | null;
}): string {
  const basis = m.url || m.title || m.content || "";
  return createHash("sha256").update(basis).digest("hex");
}

function computeStoredContentHash(mention: SocialMention): string {
  return computeContentHash({
    url: sanitizeAndTruncateUnicode(mention.url || "", 2000) || null,
    title: sanitizeAndTruncateUnicode(mention.title || "", 500) || null,
    content: sanitizeAndTruncateUnicode(mention.content || "", 2000) || null,
  });
}

/**
 * Attribute scanner mentions to the scan targets using word-boundary / cashtag
 * matching (SOC-R1) and return a map of ticker -> mentions. A single post that
 * mentions several tickers is attributed to each, but remains the same object
 * so global dedup by contentHash still screens it once (SOC-CO3).
 */
function attributeMentions(
  targets: ScanTarget[],
  mentions: SocialMention[],
): Map<string, SocialMention[]> {
  const byTicker = new Map<string, SocialMention[]>();
  for (const target of targets) byTicker.set(target.ticker, []);

  for (const mention of mentions) {
    const haystack = `${mention.title} ${mention.content} ${mention.url}`;
    for (const target of targets) {
      if (textMentionsTicker(haystack, target.ticker)) {
        byTicker.get(target.ticker)!.push(mention);
      }
    }
  }
  return byTicker;
}

function parsePostDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  // Handle relative dates from Serper ("2 days ago", "1 hour ago", etc.)
  const rel = dateStr.match(
    /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i,
  );
  if (rel) {
    const n = parseInt(rel[1]);
    const unit = rel[2].toLowerCase();
    const now = new Date();
    if (unit === "second") now.setSeconds(now.getSeconds() - n);
    else if (unit === "minute") now.setMinutes(now.getMinutes() - n);
    else if (unit === "hour") now.setHours(now.getHours() - n);
    else if (unit === "day") now.setDate(now.getDate() - n);
    else if (unit === "week") now.setDate(now.getDate() - n * 7);
    else if (unit === "month") now.setMonth(now.getMonth() - n);
    else if (unit === "year") now.setFullYear(now.getFullYear() - n);
    return now;
  }
  return null;
}

/** Build a DB row from an attributed mention. */
function buildMentionRow(
  scanRunId: string,
  ticker: string,
  stockName: string | null,
  mention: SocialMention,
) {
  const title = sanitizeAndTruncateUnicode(mention.title || "", 500) || null;
  const content =
    sanitizeAndTruncateUnicode(mention.content || "", 2000) || null;
  const url = sanitizeAndTruncateUnicode(mention.url || "", 2000) || null;
  return {
    scanRunId,
    ticker,
    stockName,
    platform: sanitizeAndTruncateUnicode(mention.platform, 100),
    source: sanitizeAndTruncateUnicode(mention.source, 500),
    discoveredVia: sanitizeAndTruncateUnicode(mention.discoveredVia, 100),
    title,
    content,
    url,
    author: sanitizeAndTruncateUnicode(mention.author || "", 500) || null,
    postDate: parsePostDate(mention.postDate),
    engagement: sanitizeAndTruncateUnicode(
      JSON.stringify(mention.engagement || {}),
      5000,
    ),
    sentiment:
      sanitizeAndTruncateUnicode(mention.sentiment || "", 50) || null,
    isPromotional: mention.isPromotional || false,
    promotionScore: mention.promotionScore || 0,
    redFlags: sanitizeAndTruncateUnicode(
      JSON.stringify(mention.redFlags || []),
      10_000,
    ),
    contentHash: computeContentHash({ url, title, content }),
  };
}

/**
 * Write a batch of mentions for the tickers attributed to one scanner's output,
 * deduping in-run via createMany({ skipDuplicates }). Bumps the run heartbeat.
 * Returns the number of rows actually inserted.
 */
async function persistMentionsIncrementally(
  scanRunId: string,
  rows: ReturnType<typeof buildMentionRow>[],
  options: {
    deadlineAt: number;
    onProgress?: (progress: PersistenceResult) => Promise<void>;
  },
): Promise<PersistenceResult> {
  if (rows.length === 0) {
    await bumpHeartbeat(scanRunId);
    return {
      submitted: 0,
      inserted: 0,
      duplicates: 0,
      rejected: 0,
      unprocessed: 0,
      timedOut: false,
      transientRetries: 0,
      rejectedRows: [],
    };
  }
  const result = await persistRowsBounded(rows, {
    createMany: async (data) =>
      prisma.socialMention.createMany({ data, skipDuplicates: true }),
    chunkSize: PERSISTENCE_CHUNK_SIZE,
    maxTransientRetries: PERSISTENCE_TRANSIENT_RETRIES,
    deadlineAt: options.deadlineAt,
    onProgress: options.onProgress,
  });
  await bumpHeartbeat(scanRunId);
  return result;
}

/** Touch the run so dashboards / stale-run cleanup see forward progress. */
async function bumpHeartbeat(scanRunId: string): Promise<void> {
  try {
    await prisma.socialScanRun.update({
      where: { id: scanRunId },
      data: { updatedAt: new Date() },
    });
  } catch {
    /* heartbeat is best-effort */
  }
}

/** Run a scanner with a hard-timeout safety net. The scanner internally returns
 * partial results before this fires; on the rare timeout we lose only that one
 * scanner's output, not the whole run. */
async function runScannerSafely(
  scanner: { name: string; scan(t: ScanTarget[]): Promise<PlatformScanResult[]> },
  targets: ScanTarget[],
  deadlineAt: number,
): Promise<PlatformScanResult[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) {
    throw new Error(`${scanner.name} skipped because the run deadline was reached`);
  }
  try {
    return await Promise.race([
      scanner.scan(targets),
      new Promise<PlatformScanResult[]>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${scanner.name} exceeded its bounded execution window`,
              ),
            ),
          Math.max(1, Math.min(SCANNER_HARD_TIMEOUT, remaining)),
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function aggregateResults(
  targets: ScanTarget[],
  attributions: Map<string, SocialMention[]>,
): TickerScanResult[] {
  const results: TickerScanResult[] = [];

  for (const target of targets) {
    const tickerMentions = attributions.get(target.ticker) || [];

    // Deduplicate by URL — when multiple scanners find the same URL,
    // keep the version with the higher score and merge redFlags from all sources.
    // This preserves AI reasoning from Perplexity even when Serper found the URL first.
    const urlMentionMap = new Map<string, SocialMention>();
    const noUrlMentions: SocialMention[] = [];
    for (const m of tickerMentions) {
      if (!m.url) {
        noUrlMentions.push(m); // Keep all mentions without URLs (e.g. StockTwits)
        continue;
      }
      const existing = urlMentionMap.get(m.url);
      if (!existing) {
        urlMentionMap.set(m.url, m);
      } else {
        // Merge: keep the higher-scoring version, combine redFlags
        const winner =
          m.promotionScore > existing.promotionScore ? m : existing;
        const loser = winner === m ? existing : m;
        const mergedFlags = Array.from(
          new Set([...winner.redFlags, ...loser.redFlags]),
        );
        urlMentionMap.set(m.url, {
          ...winner,
          redFlags: mergedFlags,
          promotionScore: Math.max(winner.promotionScore, loser.promotionScore),
          isPromotional: winner.isPromotional || loser.isPromotional,
        });
      }
    }
    const uniqueMentions = [
      ...Array.from(urlMentionMap.values()),
      ...noUrlMentions,
    ];

    const overallPromotionScore =
      uniqueMentions.length > 0
        ? Math.round(
            uniqueMentions.reduce((sum, m) => sum + m.promotionScore, 0) /
              uniqueMentions.length,
          )
        : 0;

    // Find top promoters — exclude anonymous/unknown authors (SOC-R5): Serper
    // hardcodes author "unknown", which would otherwise dominate the ranking.
    const authorMap = new Map<
      string,
      { platform: string; count: number; totalScore: number }
    >();
    for (const mention of uniqueMentions.filter((m) => m.isPromotional)) {
      const author = (mention.author || "").trim();
      if (!author || author.toLowerCase() === "unknown") continue;
      const key = `${author}@${mention.platform}`;
      const existing = authorMap.get(key) || {
        platform: mention.platform,
        count: 0,
        totalScore: 0,
      };
      existing.count++;
      existing.totalScore += mention.promotionScore;
      authorMap.set(key, existing);
    }
    const topPromoters = Array.from(authorMap.entries())
      .map(([key, data]) => ({
        platform: data.platform,
        username: key.split("@")[0],
        postCount: data.count,
        avgPromotionScore: Math.round(data.totalScore / data.count),
      }))
      .sort(
        (a, b) =>
          b.postCount - a.postCount ||
          b.avgPromotionScore - a.avgPromotionScore,
      )
      .slice(0, 10);

    const platformsWithMentionsSet = new Set(
      uniqueMentions.map((m) => m.platform),
    );
    const platformsWithMentions = Array.from(platformsWithMentionsSet);
    const highRiskPlatforms = platformsWithMentions.filter((p) => {
      const pMentions = uniqueMentions.filter((m) => m.platform === p);
      const avgScore =
        pMentions.reduce((s, m) => s + m.promotionScore, 0) / pMentions.length;
      return avgScore >= 25;
    });

    const riskLevel =
      highRiskPlatforms.length >= 2
        ? "high"
        : highRiskPlatforms.length >= 1 || overallPromotionScore >= 30
          ? "medium"
          : "low";

    let summary = "";
    if (uniqueMentions.length === 0) {
      summary = `No social media mentions found for ${target.ticker}.`;
    } else if (overallPromotionScore >= 50) {
      summary = `HIGH promotional activity for ${target.ticker}: ${uniqueMentions.length} mentions across ${platformsWithMentions.length} platform(s) (${platformsWithMentions.join(", ")}). Avg promotion score: ${overallPromotionScore}/100.`;
    } else {
      summary = `${uniqueMentions.length} mention(s) found for ${target.ticker} on ${platformsWithMentions.join(", ")}. Promotion score: ${overallPromotionScore}/100.`;
    }

    // Group mentions by platform
    const platformBreakdown: PlatformScanResult[] = [];
    for (const platformName of platformsWithMentions) {
      const pMentions = uniqueMentions.filter(
        (m) => m.platform === platformName,
      );
      const pAvg =
        pMentions.reduce((s, m) => s + m.promotionScore, 0) / pMentions.length;
      platformBreakdown.push({
        platform: platformName,
        scanner: pMentions[0]?.discoveredVia || "unknown",
        success: true,
        mentionsFound: pMentions.length,
        mentions: pMentions,
        activityLevel:
          pMentions.length >= 10
            ? "high"
            : pMentions.length >= 3
              ? "medium"
              : "low",
        promotionRisk: pAvg >= 50 ? "high" : pAvg >= 25 ? "medium" : "low",
        scanDuration: 0,
      });
    }

    results.push({
      ticker: target.ticker,
      name: target.name,
      scanDate: new Date().toISOString(),
      platforms: platformBreakdown,
      totalMentions: uniqueMentions.length,
      overallPromotionScore,
      riskLevel,
      hasRealEvidence: uniqueMentions.some((m) => m.isPromotional && m.url),
      topPromoters,
      summary,
    });
  }

  return results.sort(
    (a, b) => b.overallPromotionScore - a.overallPromotionScore,
  );
}

/**
 * Run a full social media scan and store results in the database.
 *
 * @param scanRunId - existing SocialScanRun record ID to update
 * @param triggeredBy - admin user ID who triggered the scan
 * @param manualTickers - optional manual ticker list (overrides DB query)
 */
export async function runSocialScanAndStore(options: {
  scanRunId: string;
  triggeredBy: string;
  manualTickers?: ScanTarget[];
}): Promise<ScanRunResult> {
  const startTime = Date.now();
  const workDeadlineAt =
    startTime + RUN_TOTAL_BUDGET_MS - FINALIZATION_RESERVE_MS;
  const { scanRunId, manualTickers } = options;

  // Step 1: Get targets (from DB or manual list)
  let targets: ScanTarget[];
  let scanDateStr: string;

  if (manualTickers && manualTickers.length > 0) {
    targets = manualTickers;
    scanDateStr = new Date().toISOString().split("T")[0];
  } else {
    const { targets: dbTargets, scanDate } =
      await getScanTargetsFromLatestDailyScan(50);
    targets = dbTargets;
    scanDateStr = scanDate || new Date().toISOString().split("T")[0];
  }

  if (targets.length === 0) {
    await prisma.socialScanRun.update({
      where: { id: scanRunId },
      data: {
        status: "COMPLETED",
        tickersScanned: 0,
        errors: JSON.stringify([
          "No high-risk tickers found in the latest daily scan to scan for social media promotion.",
        ]),
        duration: Date.now() - startTime,
      },
    });

    return {
      scanId: scanRunId,
      scanDate: scanDateStr,
      status: "COMPLETED",
      tickersScanned: 0,
      tickersWithMentions: 0,
      totalMentions: 0,
      platformsUsed: [],
      results: [],
      errors: ["No high-risk tickers found in the latest daily scan"],
      duration: Date.now() - startTime,
    };
  }

  // Step 2: Update scan run with target count
  await prisma.socialScanRun.update({
    where: { id: scanRunId },
    data: { tickersScanned: targets.length },
  });

  // Step 3: Get configured scanners (free scanners first; Perplexity is tiered)
  const freeScanners = getConfiguredFreeScanners();
  const perplexity = getPerplexityScanner();
  if (freeScanners.length === 0 && !perplexity) {
    await prisma.socialScanRun.update({
      where: { id: scanRunId },
      data: {
        status: "FAILED",
        errors: JSON.stringify([
          "No scanners configured. Set up API keys for YouTube, Serper, Perplexity, or Discord Bot.",
        ]),
        duration: Date.now() - startTime,
      },
    });

    return {
      scanId: scanRunId,
      scanDate: scanDateStr,
      status: "FAILED",
      tickersScanned: targets.length,
      tickersWithMentions: 0,
      totalMentions: 0,
      platformsUsed: [],
      results: [],
      errors: ["No scanners configured"],
      duration: Date.now() - startTime,
    };
  }

  console.log(
    `[Social Scan] Starting scan of ${targets.length} tickers with ${freeScanners.length} free scanner(s)${perplexity ? " + tiered Perplexity" : ""}: ${freeScanners.map((s) => s.name).join(", ")}`,
  );

  const errors: string[] = [];
  const platformsUsed: string[] = [];
  const coverage: PlatformCoverage[] = [];
  const submittedTickers = targets.map((target) => target.ticker.toUpperCase());
  const persistence = {
    submitted: 0,
    inserted: 0,
    duplicates: 0,
    rejected: 0,
    unprocessed: 0,
    timedOut: false,
    transientRetries: 0,
  };
  const scannerStats: Record<
    string,
    { mentions: number; success: boolean; error?: string }
  > = {};

  // Attribution accumulator across every scanner (used for aggregation later).
  const attributions = new Map<string, SocialMention[]>();
  for (const t of targets) attributions.set(t.ticker, []);
  // Best-effort fallback count of rows written; the authoritative total comes
  // from a DB count() at the end, so concurrent updates here don't matter.
  let mentionsStored = 0;

  const buildMetadata = (): SocialRunMetadata => ({
    version: 2,
    scanners: Array.from(new Set(platformsUsed)),
    stats: scannerStats,
    submittedTickers,
    persistence: { ...persistence },
    coverage: [...coverage],
  });
  let progressWrite = Promise.resolve();
  const queueProgressUpdate = (): Promise<void> => {
    progressWrite = progressWrite
      .then(async () => {
        await prisma.socialScanRun.update({
          where: { id: scanRunId },
          data: {
            status: "RUNNING",
            tickersScanned: targets.length,
            totalMentions: mentionsStored,
            platformsUsed: JSON.stringify(buildMetadata()),
            errors: JSON.stringify(errors),
          },
        });
      })
      .catch((error) => {
        console.error("[Social Scan] Progress update failed:", error);
      });
    return progressWrite;
  };

  const mergePersistenceProgress = (
    current: PersistenceResult,
    previous: PersistenceResult,
  ) => {
    persistence.submitted += current.submitted - previous.submitted;
    persistence.inserted += current.inserted - previous.inserted;
    persistence.duplicates += current.duplicates - previous.duplicates;
    persistence.rejected += current.rejected - previous.rejected;
    persistence.unprocessed += current.unprocessed - previous.unprocessed;
    persistence.transientRetries +=
      current.transientRetries - previous.transientRetries;
    persistence.timedOut = persistence.timedOut || current.timedOut;
    mentionsStored = persistence.inserted;
  };

  const mergeAttribution = (perScanner: Map<string, SocialMention[]>) => {
    for (const [ticker, list] of Array.from(perScanner.entries())) {
      const target = attributions.get(ticker);
      if (target) target.push(...list);
    }
  };

  // Step 4: Run free scanners in parallel; write each one's mentions as soon as
  // it resolves so partial progress is durable (SOC-C2).
  const stockNameByTicker = new Map(targets.map((t) => [t.ticker, t.name]));
  const writeScannerOutput = async (
    scannerName: string,
    platformResults: PlatformScanResult[],
    scannerTargets: ScanTarget[],
  ): Promise<void> => {
    platformsUsed.push(scannerName);
    let scannerMentions = 0;
    let anyError: string | undefined;
    let allSuccess = true;
    for (const r of platformResults) {
      scannerMentions += r.mentionsFound;
      const resultCoverage = r.coverage || {
        scanner: scannerName,
        platform: r.platform,
        status: "PARTIAL" as const,
        submittedTickers: scannerTargets.map((target) => target.ticker),
        attemptedTickers: [],
        searchedTickers: [],
        failedTickers: [],
        rateLimitedTickers: [],
        skippedTickers: scannerTargets.map((target) => target.ticker),
        error: "Scanner did not report ticker-level coverage",
      };
      coverage.push(resultCoverage);
      if (!r.coverage) {
        errors.push(`${scannerName}: ${resultCoverage.error}`);
      }
      if (!r.success) {
        allSuccess = false;
        if (r.error) {
          errors.push(`${scannerName}: ${r.error}`);
          anyError = r.error;
        }
      }
    }
    scannerStats[scannerName] = {
      mentions: scannerMentions,
      success: allSuccess,
      error: anyError,
    };

    const scannerMentionList = platformResults.flatMap((p) => p.mentions);
    const perScanner = attributeMentions(targets, scannerMentionList);
    mergeAttribution(perScanner);

    const rows = [] as ReturnType<typeof buildMentionRow>[];
    for (const [ticker, list] of Array.from(perScanner.entries())) {
      const stockName = stockNameByTicker.get(ticker) || null;
      for (const m of list)
        rows.push(buildMentionRow(scanRunId, ticker, stockName, m));
    }
    let previousProgress: PersistenceResult = {
      submitted: 0,
      inserted: 0,
      duplicates: 0,
      rejected: 0,
      unprocessed: 0,
      timedOut: false,
      transientRetries: 0,
      rejectedRows: [],
    };
    const persistenceResult = await persistMentionsIncrementally(
      scanRunId,
      rows,
      {
        deadlineAt: workDeadlineAt,
        onProgress: async (current) => {
          mergePersistenceProgress(current, previousProgress);
          previousProgress = current;
          await queueProgressUpdate();
        },
      },
    );
    if (persistenceResult.rejected > 0) {
      errors.push(
        `${scannerName}: ${persistenceResult.rejected} mention row rejected during bounded persistence`,
      );
    }
    if (persistenceResult.unprocessed > 0) {
      errors.push(
        `${scannerName}: ${persistenceResult.unprocessed} mention rows left unprocessed at the persistence deadline`,
      );
    }
    await queueProgressUpdate();
    console.log(
      `[Social Scan] ${scannerName}: ${scannerMentions} mentions found, ${persistenceResult.inserted} inserted, ${persistenceResult.duplicates} duplicate, ${persistenceResult.rejected} rejected`,
    );
  };

  const freeSettled = await Promise.allSettled(
    freeScanners.map(async (scanner) => {
      const platformResults = await runScannerSafely(
        scanner,
        targets,
        workDeadlineAt,
      );
      await writeScannerOutput(scanner.name, platformResults, targets);
    }),
  );
  for (let i = 0; i < freeSettled.length; i++) {
    const outcome = freeSettled[i];
    if (outcome.status === "rejected") {
      const msg = `Scanner failed: ${freeScanners[i].name}: ${outcome.reason?.message || outcome.reason}`;
      console.error(`[Social Scan] ${msg}`);
      errors.push(msg);
      coverage.push({
        scanner: freeScanners[i].name,
        platform: freeScanners[i].platform,
        status: "FAILED",
        submittedTickers,
        attemptedTickers: [],
        searchedTickers: [],
        failedTickers: submittedTickers,
        rateLimitedTickers: [],
        skippedTickers: [],
        error: outcome.reason?.message || String(outcome.reason),
      });
    }
  }

  // Step 4b: Tier Perplexity (SOC-CO4) — only call it for tickers that already
  // have >= PERPLEXITY_MIN_FLAGGED promotional mentions from the free scanners.
  if (perplexity) {
    const perplexityTargets = targets.filter((t) => {
      const flagged = (attributions.get(t.ticker) || []).filter(
        (m) => m.isPromotional,
      ).length;
      return flagged >= PERPLEXITY_MIN_FLAGGED;
    });

    if (perplexityTargets.length === 0) {
      console.log(
        `[Social Scan] Perplexity skipped — no ticker reached ${PERPLEXITY_MIN_FLAGGED} flagged free-scanner mentions`,
      );
    } else {
      console.log(
        `[Social Scan] Perplexity tiering: ${perplexityTargets.length}/${targets.length} tickers qualify`,
      );
      try {
        const platformResults = await runScannerSafely(
          perplexity,
          perplexityTargets,
          workDeadlineAt,
        );
        await writeScannerOutput(
          perplexity.name,
          platformResults,
          perplexityTargets,
        );
      } catch (error: any) {
        const msg = `Scanner failed: ${perplexity.name}: ${error?.message || error}`;
        console.error(`[Social Scan] ${msg}`);
        errors.push(msg);
        coverage.push({
          scanner: perplexity.name,
          platform: perplexity.platform,
          status: "FAILED",
          submittedTickers: perplexityTargets.map((target) => target.ticker),
          attemptedTickers: [],
          searchedTickers: [],
          failedTickers: perplexityTargets.map((target) => target.ticker),
          rateLimitedTickers: [],
          skippedTickers: [],
          error: error?.message || String(error),
        });
      }
    }
  }

  console.log(
    `[Social Scan] Pre-aggregation scanner breakdown:`,
    JSON.stringify(scannerStats),
  );

  // Step 5: Aggregate results per ticker from all attributions
  const tickerResults = aggregateResults(targets, attributions);
  const currentMetadata = buildMetadata();
  for (const tickerResult of tickerResults) {
    const tickerCoverage = getTickerCoverage(
      currentMetadata,
      tickerResult.ticker,
    );
    tickerResult.coverage = tickerCoverage;
    if (tickerResult.totalMentions === 0) {
      tickerResult.summary =
        tickerCoverage.status === "COMPLETE"
          ? `No social media mentions were found for ${tickerResult.ticker} across the completed configured platform searches.`
          : `No mentions were retained for ${tickerResult.ticker}. Coverage is incomplete, so this does not establish that promotion was absent.`;
    }
  }

  // Step 5b: AI Screening — classify high-scoring mentions as scam vs legitimate.
  // Dedupe GLOBALLY by contentHash first (SOC-CO3) so a post matching several
  // tickers is screened once, then propagate the verdict to every attribution.
  try {
    const uniqueByHash = new Map<string, SocialMention>();
    for (const tr of tickerResults) {
      for (const platform of tr.platforms) {
        for (const m of platform.mentions) {
          const hash = computeContentHash(m);
          if (!uniqueByHash.has(hash)) uniqueByHash.set(hash, m);
        }
      }
    }
    const uniqueMentions = Array.from(uniqueByHash.values());

    const aiBudgetMs = Math.min(
      AI_SCREEN_TIMEOUT,
      workDeadlineAt - Date.now(),
    );
    if (uniqueMentions.length > 0 && aiBudgetMs > 0) {
      console.log(
        `[Social Scan] Running AI screening on ${uniqueMentions.length} unique mentions (deduped from attributions)...`,
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      let aiTimedOut = false;
      const screenedMentions = await Promise.race([
        screenMentionsWithAI(uniqueMentions),
        new Promise<SocialMention[]>((resolve) => {
          // On overrun, resolve with the un-screened set so partial work survives.
          timer = setTimeout(() => {
            aiTimedOut = true;
            console.warn("[Social Scan] AI screening timed out — keeping pattern scores");
            resolve(uniqueMentions);
          }, aiBudgetMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (aiTimedOut) {
        errors.push(
          "AI screening reached its deadline; pattern scores were retained",
        );
      }

      // Map screened results back by contentHash and apply to every attribution.
      const screenedByHash = new Map<string, SocialMention>();
      for (const m of screenedMentions) {
        screenedByHash.set(computeContentHash(m), m);
      }
      for (const tr of tickerResults) {
        for (const platform of tr.platforms) {
          for (let i = 0; i < platform.mentions.length; i++) {
            const updated = screenedByHash.get(
              computeContentHash(platform.mentions[i]),
            );
            if (updated) platform.mentions[i] = updated;
          }
        }
        const allTickerMentions = tr.platforms.flatMap((p) => p.mentions);
        tr.totalMentions = allTickerMentions.length;
        tr.overallPromotionScore =
          allTickerMentions.length > 0
            ? Math.round(
                allTickerMentions.reduce((s, m) => s + m.promotionScore, 0) /
                  allTickerMentions.length,
              )
            : 0;
      }

      // Persist the adjusted scores onto the already-written rows (best-effort).
      const skippedScoreUpdates = await applyScreenedScores(
        scanRunId,
        tickerResults,
        workDeadlineAt,
      );
      if (skippedScoreUpdates > 0) {
        errors.push(
          `${skippedScoreUpdates} AI score updates were skipped to preserve finalization time`,
        );
      }
    } else if (uniqueMentions.length > 0) {
      errors.push(
        "AI screening skipped because the run reached its reserved finalization window",
      );
    }
  } catch (error: any) {
    // AI screening is non-blocking — if it fails, we keep pattern-based scores
    console.error(`[Social Scan] AI screening failed: ${error.message}`);
    errors.push(`AI screening: ${error.message}`);
  }

  const tickersWithMentions = tickerResults.filter(
    (r) => r.totalMentions > 0,
  ).length;

  await progressWrite;
  const searchedTickers = Array.from(
    new Set(coverage.flatMap((entry) => entry.searchedTickers)),
  );
  const hasIncompleteCoverage = coverage.some(
    (entry) => entry.status !== "COMPLETED",
  );
  const hasPersistenceLoss =
    persistence.rejected > 0 ||
    persistence.unprocessed > 0 ||
    persistence.timedOut;
  const status =
    searchedTickers.length === 0 && persistence.inserted === 0
      ? "FAILED"
      : errors.length > 0 || hasIncompleteCoverage || hasPersistenceLoss
        ? "PARTIAL"
        : "COMPLETED";

  // Step 6: Final run update (mentions were written incrementally above).
  const duration = Date.now() - startTime;
  const finalCount = await prisma.socialMention
    .count({ where: { scanRunId } })
    .catch(() => mentionsStored);
  await prisma.socialScanRun.update({
    where: { id: scanRunId },
    data: {
      status: status as string,
      tickersScanned: targets.length,
      tickersWithMentions,
      totalMentions: finalCount,
      platformsUsed: JSON.stringify(buildMetadata()),
      duration,
      errors: JSON.stringify(errors),
    },
  });

  console.log(
    `[Social Scan] Complete: ${finalCount} mentions stored, ${tickersWithMentions}/${targets.length} tickers with mentions, ${status}`,
  );

  return {
    scanId: scanRunId,
    scanDate: scanDateStr,
    status: status as any,
    tickersScanned: targets.length,
    tickersWithMentions,
    totalMentions: finalCount,
    platformsUsed,
    results: tickerResults,
    errors,
    duration,
    submittedTickers,
    searchedTickers,
    coverage,
    persistence,
  };
}

/**
 * Apply AI-adjusted promotionScore / isPromotional onto the rows that were
 * already written incrementally. Keyed on the unique index
 * (scanRunId, ticker, contentHash). Best-effort: a failure here never aborts
 * the run since the pattern-based row is already durable.
 */
async function applyScreenedScores(
  scanRunId: string,
  tickerResults: TickerScanResult[],
  deadlineAt: number,
): Promise<number> {
  const updates: Array<() => Promise<unknown>> = [];
  for (const tr of tickerResults) {
    for (const platform of tr.platforms) {
      for (const m of platform.mentions) {
        const contentHash = computeStoredContentHash(m);
        updates.push(
          () => prisma.socialMention
            .updateMany({
              where: { scanRunId, ticker: tr.ticker, contentHash },
              data: {
                promotionScore: m.promotionScore || 0,
                isPromotional: m.isPromotional || false,
                redFlags: JSON.stringify(m.redFlags || []),
              },
            })
            .catch(() => undefined),
        );
      }
    }
  }
  const chunkSize = 25;
  for (let index = 0; index < updates.length; index += chunkSize) {
    if (Date.now() >= deadlineAt) return updates.length - index;
    await Promise.allSettled(
      updates.slice(index, index + chunkSize).map((update) => update()),
    );
  }
  return 0;
}
