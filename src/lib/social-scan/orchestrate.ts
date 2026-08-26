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

/** Per-scanner hard timeout. Scanners own an internal budget (~100s) and
 * return partial results before this fires; this is a safety net only. */
const SCANNER_HARD_TIMEOUT = 115_000;

/** AI screening timeout — partial results are kept if it overruns. */
const AI_SCREEN_TIMEOUT = 120_000;

/** Minimum free-scanner promotional mentions a ticker needs before we spend a
 * (paid) Perplexity call on it (SOC-CO4). */
const PERPLEXITY_MIN_FLAGGED = 2;

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
  const title = (mention.title || "").substring(0, 500) || null;
  const content = (mention.content || "").substring(0, 2000) || null;
  const url = (mention.url || "").substring(0, 2000) || null;
  return {
    scanRunId,
    ticker,
    stockName,
    platform: mention.platform,
    source: mention.source,
    discoveredVia: mention.discoveredVia,
    title,
    content,
    url,
    author: mention.author || null,
    postDate: parsePostDate(mention.postDate),
    engagement: JSON.stringify(mention.engagement || {}),
    sentiment: mention.sentiment || null,
    isPromotional: mention.isPromotional || false,
    promotionScore: mention.promotionScore || 0,
    redFlags: JSON.stringify(mention.redFlags || []),
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
): Promise<number> {
  if (rows.length === 0) {
    await bumpHeartbeat(scanRunId);
    return 0;
  }
  let inserted = 0;
  try {
    const result = await prisma.socialMention.createMany({
      data: rows,
      skipDuplicates: true,
    });
    inserted = result.count;
  } catch (error: any) {
    console.error(
      `[Social Scan] Incremental write failed, falling back to per-row:`,
      error.message,
    );
    for (const row of rows) {
      try {
        await prisma.socialMention.create({ data: row });
        inserted++;
      } catch {
        /* skip duplicate / failed row */
      }
    }
  }
  await bumpHeartbeat(scanRunId);
  return inserted;
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
): Promise<PlatformScanResult[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      scanner.scan(targets),
      new Promise<PlatformScanResult[]>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${scanner.name} exceeded hard timeout ${SCANNER_HARD_TIMEOUT / 1000}s`,
              ),
            ),
          SCANNER_HARD_TIMEOUT,
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
  ): Promise<void> => {
    platformsUsed.push(scannerName);
    let scannerMentions = 0;
    let anyError: string | undefined;
    let allSuccess = true;
    for (const r of platformResults) {
      scannerMentions += r.mentionsFound;
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
    mentionsStored += await persistMentionsIncrementally(scanRunId, rows);
    console.log(
      `[Social Scan] ${scannerName}: ${scannerMentions} mentions found, ${rows.length} attributed rows written`,
    );
  };

  const freeSettled = await Promise.allSettled(
    freeScanners.map(async (scanner) => {
      const platformResults = await runScannerSafely(scanner, targets);
      await writeScannerOutput(scanner.name, platformResults);
    }),
  );
  for (let i = 0; i < freeSettled.length; i++) {
    const outcome = freeSettled[i];
    if (outcome.status === "rejected") {
      const msg = `Scanner failed: ${freeScanners[i].name}: ${outcome.reason?.message || outcome.reason}`;
      console.error(`[Social Scan] ${msg}`);
      errors.push(msg);
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
        );
        await writeScannerOutput(perplexity.name, platformResults);
      } catch (error: any) {
        const msg = `Scanner failed: ${perplexity.name}: ${error?.message || error}`;
        console.error(`[Social Scan] ${msg}`);
        errors.push(msg);
      }
    }
  }

  console.log(
    `[Social Scan] Pre-aggregation scanner breakdown:`,
    JSON.stringify(scannerStats),
  );

  // Step 5: Aggregate results per ticker from all attributions
  const tickerResults = aggregateResults(targets, attributions);

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

    if (uniqueMentions.length > 0) {
      console.log(
        `[Social Scan] Running AI screening on ${uniqueMentions.length} unique mentions (deduped from attributions)...`,
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      const screenedMentions = await Promise.race([
        screenMentionsWithAI(uniqueMentions),
        new Promise<SocialMention[]>((resolve) => {
          // On overrun, resolve with the un-screened set so partial work survives.
          timer = setTimeout(() => {
            console.warn("[Social Scan] AI screening timed out — keeping pattern scores");
            resolve(uniqueMentions);
          }, AI_SCREEN_TIMEOUT);
        }),
      ]);
      if (timer) clearTimeout(timer);

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
      await applyScreenedScores(scanRunId, tickerResults);
    }
  } catch (error: any) {
    // AI screening is non-blocking — if it fails, we keep pattern-based scores
    console.error(`[Social Scan] AI screening failed: ${error.message}`);
    errors.push(`AI screening: ${error.message}`);
  }

  const tickersWithMentions = tickerResults.filter(
    (r) => r.totalMentions > 0,
  ).length;

  const status =
    errors.length > 0 && platformsUsed.length === 0
      ? "FAILED"
      : errors.length > 0
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
      platformsUsed: JSON.stringify({
        scanners: platformsUsed,
        stats: scannerStats,
      }),
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
): Promise<void> {
  const updates: Promise<unknown>[] = [];
  for (const tr of tickerResults) {
    for (const platform of tr.platforms) {
      for (const m of platform.mentions) {
        const contentHash = computeContentHash(m);
        updates.push(
          prisma.socialMention
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
  if (updates.length > 0) {
    await Promise.allSettled(updates);
  }
}
