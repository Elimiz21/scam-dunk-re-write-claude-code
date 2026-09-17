import { createHash } from "crypto";
import { z } from "zod";
import type { ScanRunResult } from "./social-scan/types";

export interface FallbackPublication {
  state: "PUBLISHED" | "DEGRADED";
  scanRunId: string;
  attempts: number;
  status?: "PARTIAL" | "FAILED";
  totalMentions?: number;
  tickersWithMentions?: number;
  tickersScanned?: number;
  idempotent?: boolean;
  error?: string;
}

/** Local scanners lack attempted/searched coverage. Never infer it from mentions or success flags. */
export function buildFallbackPayload(source: ScanRunResult, submittedTickers: string[]) {
  const identity = createHash("sha256").update(JSON.stringify({ source, submittedTickers })).digest("hex");
  const normalization = { unknownDates: 0, unknownSentiments: 0, omittedEngagementValues: 0 };
  const preciseDate = z.string().datetime({ offset: true });
  const normalizeDate = (value: unknown) => {
    if (preciseDate.safeParse(value).success) {
      const parsed = new Date(value as string);
      if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
    }
    normalization.unknownDates++;
    return null;
  };
  const normalizeSentiment = (value: string) => {
    if (["bullish", "bearish", "neutral"].includes(value)) return value;
    normalization.unknownSentiments++;
    return null;
  };
  const normalizeEngagement = (values: Record<string, unknown>) => Object.fromEntries(
    Object.entries(values || {}).filter(([, value]) => {
      if (typeof value === "number" && Number.isFinite(value)) return true;
      if (value !== undefined) normalization.omittedEngagementValues++;
      return false;
    }),
  );
  return {
    scanId: `cli-fallback-${identity.slice(0, 40)}`,
    scanDate: source.scanDate,
    status: source.status === "FAILED" ? "FAILED" as const : "PARTIAL" as const,
    platformsUsed: {
      version: 2, scanners: source.platformsUsed, submittedTickers, normalization,
      coverage: [],
      // Raw local results were retained, but they contain no verified search ledger.
      readbackComplete: true,
    },
    results: source.results.map((result) => ({
      ticker: result.ticker, name: result.name,
      platforms: result.platforms.map((platform) => ({
        mentions: platform.mentions.map((mention) => ({
          platform: mention.platform, source: mention.source, discoveredVia: mention.discoveredVia,
          title: mention.title, content: mention.content, url: mention.url, author: mention.author,
          postDate: normalizeDate(mention.postDate), engagement: normalizeEngagement(mention.engagement),
          sentiment: normalizeSentiment(mention.sentiment), isPromotional: mention.isPromotional,
          promotionScore: mention.promotionScore, redFlags: mention.redFlags,
        })),
      })),
    })),
    errors: source.errors,
    duration: source.duration,
  };
}

/** No scanning here: only retain and publish existing evidence. Retry exactly the same request. */
export async function retainAndPublishSocialFallback(
  source: ScanRunResult,
  submittedTickers: string[],
  options: {
    appUrl: string;
    ingestKey: string;
    retain: (source: ScanRunResult, requestBody: string) => void | Promise<void>;
    fetcher?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<FallbackPublication> {
  const payload = buildFallbackPayload(source, submittedTickers);
  const body = JSON.stringify(payload);
  // This must succeed even on scanner early returns, before attempting publication.
  await options.retain(source, body);
  const failure = (attempts: number, error: string): FallbackPublication => ({
    state: "DEGRADED", scanRunId: payload.scanId, attempts, error,
  });
  let endpoint: string;
  try {
    const url = new URL(options.appUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
      return failure(0, "Social ingest requires an HTTPS app origin without credentials or path");
    }
    endpoint = `${url.origin}/api/admin/social-scan/ingest`;
  } catch {
    return failure(0, "Social ingest app URL unavailable");
  }
  if (!options.ingestKey) return failure(0, "Dedicated social ingest key unavailable");
  if (Buffer.byteLength(body, "utf8") > 5 * 1024 * 1024) return failure(0, "Social ingest payload exceeds 5 MiB; retained locally");

  const fetcher = options.fetcher || fetch;
  const sleep = options.sleep || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const mentionCount = payload.results.reduce((sum, result) => sum + result.platforms.reduce((n, p) => n + p.mentions.length, 0), 0);
  const tickerCount = new Set(payload.results.map((result) => result.ticker.toUpperCase())).size;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await sleep((attempt - 1) * 1000);
    try {
      const response = await fetcher(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.ingestKey}` },
        body, redirect: "error", signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if ((response.status === 429 || response.status >= 500) && attempt < 3) continue;
        return failure(attempt, `Social ingest HTTP ${response.status}; evidence retained locally`);
      }
      const receipt = await response.json();
      const counters = [receipt.totalMentions, receipt.mentionsIngested, receipt.tickersWithMentions, receipt.tickersScanned];
      if (receipt.scanRunId !== payload.scanId || !["PARTIAL", "FAILED"].includes(receipt.status)
        || counters.some((value) => !Number.isSafeInteger(value) || value < 0)
        || receipt.tickersScanned !== 0 || typeof receipt.idempotent !== "boolean"
        || receipt.totalMentions > mentionCount || receipt.mentionsIngested > receipt.totalMentions
        || receipt.tickersWithMentions > tickerCount || receipt.tickersWithMentions > receipt.totalMentions
        || (mentionCount > 0 && receipt.totalMentions === 0)
        || (receipt.status === "FAILED" && (payload.status !== "FAILED" || receipt.totalMentions !== 0))) {
        return failure(attempt, "Social ingest confirmation did not match the retained request");
      }
      return {
        state: "PUBLISHED", scanRunId: receipt.scanRunId, attempts: attempt, status: receipt.status,
        totalMentions: receipt.totalMentions, tickersWithMentions: receipt.tickersWithMentions,
        tickersScanned: receipt.tickersScanned, idempotent: receipt.idempotent,
      };
    } catch {
      // Do not log provider bodies, URLs, credentials or thrown transport details.
      if (attempt === 3) return failure(attempt, "Social ingest confirmation unavailable after bounded retries; evidence retained locally");
    }
  }
  return failure(3, "Social ingest confirmation unavailable");
}
