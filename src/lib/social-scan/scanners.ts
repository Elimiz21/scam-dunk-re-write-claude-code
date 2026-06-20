/**
 * Social Media Scanners for server-side use in Next.js API routes.
 *
 * Each scanner implements the SocialScanner interface and searches
 * a specific platform for stock ticker mentions and promotional activity.
 */

import {
  ScanTarget,
  PlatformScanResult,
  SocialMention,
  SocialScanner,
  calculatePromotionScore,
  PROMOTION_SUBREDDITS,
  calculatePlatformSpecificScore,
  textMentionsTicker,
  buildTickerMatcher,
} from "./types";
import type { PlatformName } from "./platform-patterns";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────
// Shared fetch + budget helpers (SOC-H1, SOC-H2, SOC-C1)
// ─────────────────────────────────────────────────────────────

/** Per-request network timeout for every outbound fetch (SOC-H2). */
const FETCH_TIMEOUT_MS = 10_000;

/** Wall-clock budget each scanner gives itself so it returns BEFORE the
 * orchestrator's hard timeout kills it and discards partial results (SOC-C1). */
const SCANNER_BUDGET_MS = 100_000;

/**
 * fetch wrapper that aborts after FETCH_TIMEOUT_MS (or sooner if the caller's
 * deadline is nearer) so one hung socket can't eat the whole scanner budget.
 * clearTimeout always runs in finally.
 */
async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  deadline?: Deadline,
): Promise<Response> {
  const controller = new AbortController();
  const remaining = deadline ? deadline.remaining() : FETCH_TIMEOUT_MS;
  const timeoutMs = Math.max(1, Math.min(FETCH_TIMEOUT_MS, remaining));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Tracks a wall-clock deadline so a scanner stops making (paid) calls once
 * its time budget is exhausted, then returns whatever it has accumulated. */
class Deadline {
  private readonly end: number;
  constructor(budgetMs: number = SCANNER_BUDGET_MS) {
    this.end = Date.now() + budgetMs;
  }
  remaining(): number {
    return this.end - Date.now();
  }
  expired(): boolean {
    return Date.now() >= this.end;
  }
  /** Sleep `ms`, but never past the deadline. */
  async sleep(ms: number): Promise<void> {
    await sleep(Math.max(0, Math.min(ms, this.remaining())));
  }
}

/**
 * Compute a per-ticker delay so the cumulative throttle stays within a fraction
 * of the scanner budget regardless of how many targets we process (SOC-C1).
 * Falls back to the desired delay for small batches.
 */
function perTargetDelay(
  targetCount: number,
  desiredMs: number,
  budgetMs: number = SCANNER_BUDGET_MS,
): number {
  if (targetCount <= 0) return desiredMs;
  // Spend at most ~60% of the budget on inter-request sleeps.
  const maxTotalSleep = budgetMs * 0.6;
  const computed = Math.floor(maxTotalSleep / targetCount);
  return Math.max(0, Math.min(desiredMs, computed));
}

// ─────────────────────────────────────────────────────────────
// Reddit Public JSON Scanner (no OAuth needed)
// ─────────────────────────────────────────────────────────────

// Use a realistic browser UA — Reddit blocks identifiable bots with HTML login pages
const REDDIT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REDDIT_DELAY_MS = 2500; // 2.5s between requests — respect Reddit's ~10 req/min unauthenticated limit

async function redditGet(url: string, deadline?: Deadline): Promise<any> {
  const headers: Record<string, string> = {
    "User-Agent": REDDIT_USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
  };
  const fetchOpts: RequestInit = { headers, redirect: "follow" };

  // Try the given URL first, then old.reddit.com as fallback
  const urls = [url];
  if (url.includes("www.reddit.com")) {
    urls.push(url.replace("www.reddit.com", "old.reddit.com"));
  }

  for (const tryUrl of urls) {
    try {
      let response = await fetchWithTimeout(tryUrl, fetchOpts, deadline);

      if (response.status === 429) {
        await sleep(10000);
        response = await fetchWithTimeout(tryUrl, fetchOpts, deadline);
      }

      if (!response.ok) {
        console.warn(
          `[Reddit] ${response.status} from ${tryUrl.split("?")[0]}`,
        );
        continue; // Try fallback URL
      }

      const text = await response.text();

      // Detect HTML login/block pages that Reddit returns instead of JSON
      if (
        text.startsWith("<") ||
        text.includes("<!DOCTYPE") ||
        text.includes("<html")
      ) {
        console.warn(
          `[Reddit] Got HTML instead of JSON from ${tryUrl.split("?")[0]} (blocked or redirected to login)`,
        );
        continue; // Try fallback URL
      }

      try {
        const data = JSON.parse(text);
        if (data.error) {
          console.warn(
            `[Reddit] API error ${data.error} from ${tryUrl.split("?")[0]}: ${data.message || ""}`,
          );
          continue;
        }
        return data;
      } catch {
        console.warn(
          `[Reddit] Invalid JSON from ${tryUrl.split("?")[0]} (starts with: ${text.substring(0, 60)})`,
        );
        continue;
      }
    } catch (error: any) {
      console.warn(
        `[Reddit] Fetch error from ${tryUrl.split("?")[0]}: ${error.message}`,
      );
      continue;
    }
  }

  // All URLs failed
  return null;
}

/**
 * Reddit's public JSON endpoints are blocked from datacenter IPs (the code
 * documents the spoofed-UA + HTML-block detection), so on serverless this
 * scanner burns its whole budget for nothing. It is OFF by default and only
 * runs when ENABLE_REDDIT_DIRECT_SCAN is explicitly set (SOC-H3). Serper's
 * `site:reddit.com` query provides Reddit coverage when this is disabled.
 */
function isRedditDirectEnabled(): boolean {
  const v = (process.env.ENABLE_REDDIT_DIRECT_SCAN || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export class RedditScanner implements SocialScanner {
  name = "reddit_public";
  platform = "Reddit";

  isConfigured() {
    return isRedditDirectEnabled();
  }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const deadline = new Deadline();
    const allMentions: SocialMention[] = [];
    const promotionSubs = new Set(PROMOTION_SUBREDDITS);

    // Track fetch failures to accurately report success/failure
    let fetchAttempts = 0;
    let fetchFailures = 0;

    // Single combined query per ticker to avoid timeout with 50+ tickers
    // Serper's site:reddit.com query provides additional Reddit coverage
    const seenUrls = new Set<string>();
    const delayMs = perTargetDelay(targets.length, REDDIT_DELAY_MS);

    for (const target of targets) {
      if (deadline.expired()) break; // Return what we have instead of timing out
      try {
        const query = `${target.ticker} OR $${target.ticker}`;
        const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&t=week&limit=50`;
        fetchAttempts++;
        const data = await redditGet(url, deadline);
        if (!data) {
          fetchFailures++;
          continue;
        }

        for (const post of data?.data?.children || []) {
          const d = post.data;
          const permalink = `https://reddit.com${d.permalink}`;
          if (seenUrls.has(permalink)) continue;

          const subreddit = (d.subreddit || "").toLowerCase();
          const title = d.title || "";
          const selftext = d.selftext || "";
          const combined = `${title} ${selftext}`;

          if (!textMentionsTicker(combined, target.ticker)) continue;
          seenUrls.add(permalink);

          const accountCreatedUtc = d.author_created_utc;
          const isNewAccount = accountCreatedUtc
            ? (Date.now() / 1000 - accountCreatedUtc) / 86400 < 90
            : false;

          const { score, flags } = calculatePromotionScore(
            `${title} ${selftext}`,
            {
              isPromotionSubreddit: promotionSubs.has(subreddit),
              isNewAccount,
              hasHighEngagement: d.score > 100,
            },
          );
          const { scoreBonus: platformBonus, flags: platformFlags } =
            calculatePlatformSpecificScore(`${title} ${selftext}`, "reddit");
          flags.push(...platformFlags);
          const finalScore = Math.min(score + platformBonus, 100);

          allMentions.push({
            platform: "Reddit",
            source: `r/${d.subreddit}`,
            discoveredVia: "reddit_public",
            title,
            content: (selftext || title).substring(0, 500),
            url: permalink,
            author: d.author || "unknown",
            postDate: new Date(d.created_utc * 1000).toISOString(),
            engagement: { upvotes: d.score, comments: d.num_comments },
            sentiment: finalScore > 30 ? "bullish" : "neutral",
            isPromotional: finalScore >= 20,
            promotionScore: finalScore,
            redFlags: flags,
          });
        }
        await deadline.sleep(delayMs);
      } catch (error: any) {
        console.error(
          `[Reddit] Search error for "${target.ticker}":`,
          error.message,
        );
      }
    }

    // Scan top pump-and-dump subreddits (reduced from 5 to 3 for speed)
    const topSubs = ["wallstreetbets", "pennystocks", "shortsqueeze"];
    for (const sub of topSubs) {
      if (deadline.expired()) break;
      try {
        fetchAttempts++;
        const data = await redditGet(
          `https://www.reddit.com/r/${sub}/new.json?limit=100`,
          deadline,
        );
        if (!data) {
          fetchFailures++;
          continue;
        }
        for (const post of data?.data?.children || []) {
          const d = post.data;
          const title = d.title || "";
          const selftext = d.selftext || "";
          const combined = `${title} ${selftext}`;

          for (const target of targets) {
            if (!textMentionsTicker(combined, target.ticker)) continue;

            const permalink = `https://reddit.com${d.permalink}`;
            if (seenUrls.has(permalink)) continue;
            seenUrls.add(permalink);

            const { score, flags } = calculatePromotionScore(
              `${title} ${selftext}`,
              {
                isPromotionSubreddit: promotionSubs.has(sub),
                hasHighEngagement: d.score > 50,
              },
            );
            const { scoreBonus: subPlatformBonus, flags: subPlatformFlags } =
              calculatePlatformSpecificScore(`${title} ${selftext}`, "reddit");
            flags.push(...subPlatformFlags);
            const subFinalScore = Math.min(score + subPlatformBonus, 100);

            allMentions.push({
              platform: "Reddit",
              source: `r/${sub}`,
              discoveredVia: "reddit_public",
              title,
              content: (selftext || title).substring(0, 500),
              url: permalink,
              author: d.author || "unknown",
              postDate: new Date(d.created_utc * 1000).toISOString(),
              engagement: { upvotes: d.score, comments: d.num_comments },
              sentiment: subFinalScore > 30 ? "bullish" : "neutral",
              isPromotional: subFinalScore >= 20,
              promotionScore: subFinalScore,
              redFlags: flags,
            });
            break;
          }
        }
        await deadline.sleep(delayMs);
      } catch (error: any) {
        console.error(`[Reddit] Subreddit error for r/${sub}:`, error.message);
      }
    }

    const avgScore =
      allMentions.length > 0
        ? allMentions.reduce((s, m) => s + m.promotionScore, 0) /
          allMentions.length
        : 0;

    // Report failure if ALL fetch attempts failed (Reddit is blocking us)
    const allFailed = fetchAttempts > 0 && fetchFailures === fetchAttempts;
    if (allFailed) {
      console.error(
        `[Reddit] ALL ${fetchAttempts} fetch attempts failed — Reddit is likely blocking requests. Check User-Agent and IP.`,
      );
    }

    return [
      {
        platform: "Reddit",
        scanner: this.name,
        success: !allFailed,
        error: allFailed
          ? `All ${fetchAttempts} Reddit requests failed — blocked or rate limited`
          : fetchFailures > 0
            ? `${fetchFailures}/${fetchAttempts} requests failed`
            : undefined,
        mentionsFound: allMentions.length,
        mentions: allMentions,
        activityLevel:
          allMentions.length >= 20
            ? "high"
            : allMentions.length >= 5
              ? "medium"
              : allMentions.length > 0
                ? "low"
                : "none",
        promotionRisk:
          avgScore >= 50 ? "high" : avgScore >= 25 ? "medium" : "low",
        scanDuration: Date.now() - startTime,
      },
    ];
  }
}

// ─────────────────────────────────────────────────────────────
// YouTube Data API v3 Scanner
// ─────────────────────────────────────────────────────────────

const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

// YouTube Data API v3 daily quota is 10,000 units. A search.list costs 100
// units, videos.list costs 1. Scanning all 50 tickers (~5,050 units) burns
// half the daily quota; two runs exhaust it. Cap searches per run and only
// scan top-priority tickers (SOC-CO7).
const YT_SEARCH_COST = 100;
const YT_MAX_UNITS_PER_RUN = Number(
  process.env.YOUTUBE_MAX_UNITS_PER_RUN || 2500,
);
const YT_MAX_TICKERS = Number(process.env.YOUTUBE_MAX_TICKERS || 20);

export class YouTubeScanner implements SocialScanner {
  name = "youtube_api";
  platform = "YouTube";

  isConfigured() {
    return !!process.env.YOUTUBE_API_KEY;
  }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const deadline = new Deadline();
    const apiKey = process.env.YOUTUBE_API_KEY!;
    const allMentions: SocialMention[] = [];

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Only the top-priority tickers, bounded again by the unit budget below.
    const scanList = targets.slice(0, YT_MAX_TICKERS);
    let unitsUsed = 0;
    const delayMs = perTargetDelay(scanList.length, 200);

    for (const target of scanList) {
      if (deadline.expired()) break;
      // Quota guard: stop before the next search would exceed the run budget.
      if (unitsUsed + YT_SEARCH_COST > YT_MAX_UNITS_PER_RUN) {
        console.warn(
          `[YouTube] Quota guard hit (${unitsUsed}/${YT_MAX_UNITS_PER_RUN} units) — stopping after ${allMentions.length} mentions`,
        );
        break;
      }
      try {
        const params = new URLSearchParams({
          part: "snippet",
          q: `${target.ticker} stock`,
          type: "video",
          order: "date",
          publishedAfter: oneWeekAgo.toISOString(),
          maxResults: "25",
          key: apiKey,
        });
        const res = await fetchWithTimeout(
          `${YT_API_BASE}/search?${params}`,
          {},
          deadline,
        );
        unitsUsed += YT_SEARCH_COST;
        if (!res.ok) {
          console.error(
            `[YouTube] API ${res.status} for ${target.ticker}: ${await res.text().catch(() => "no body")}`,
          );
          continue;
        }
        const data = await res.json();
        const videos = data.items || [];

        // Get stats
        const videoIds = videos.map((v: any) => v.id?.videoId).filter(Boolean);
        const statsMap = new Map<string, any>();
        if (videoIds.length > 0) {
          const statsParams = new URLSearchParams({
            part: "statistics",
            id: videoIds.join(","),
            key: apiKey,
          });
          const statsRes = await fetchWithTimeout(
            `${YT_API_BASE}/videos?${statsParams}`,
            {},
            deadline,
          );
          unitsUsed += 1; // videos.list costs 1 unit
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            for (const item of statsData.items || [])
              statsMap.set(item.id, item.statistics);
          }
        }

        for (const video of videos) {
          const snippet = video.snippet;
          if (!snippet) continue;
          const title = snippet.title || "";
          const description = snippet.description || "";
          const combined = `${title} ${description}`;
          if (!textMentionsTicker(combined, target.ticker)) continue;

          const { score, flags } = calculatePromotionScore(
            `${title} ${description}`,
          );
          const { scoreBonus: platformBonus, flags: platformFlags } =
            calculatePlatformSpecificScore(
              `${title} ${description}`,
              "youtube",
            );
          flags.push(...platformFlags);
          if (
            title.includes("🚀") ||
            title.includes("💰") ||
            title.includes("🔥") ||
            title.includes("💎")
          )
            flags.push("Clickbait emojis in title");
          const capsRatio =
            (title.match(/[A-Z]/g) || []).length / Math.max(title.length, 1);
          if (capsRatio > 0.6) flags.push("Excessive caps in title");

          const finalScore = Math.min(
            score +
              platformBonus +
              (flags.includes("Clickbait emojis in title") ? 10 : 0) +
              (flags.includes("Excessive caps in title") ? 10 : 0),
            100,
          );
          const videoId = video.id?.videoId;
          const stats = videoId ? statsMap.get(videoId) : null;

          allMentions.push({
            platform: "YouTube",
            source: snippet.channelTitle || "Unknown Channel",
            discoveredVia: "youtube_api",
            title,
            content: description.substring(0, 500),
            url: videoId ? `https://youtube.com/watch?v=${videoId}` : "",
            author: snippet.channelTitle || "unknown",
            postDate: snippet.publishedAt || new Date().toISOString(),
            engagement: {
              views: stats ? parseInt(stats.viewCount || "0") : undefined,
              likes: stats ? parseInt(stats.likeCount || "0") : undefined,
              comments: stats ? parseInt(stats.commentCount || "0") : undefined,
            },
            sentiment: finalScore > 25 ? "bullish" : "neutral",
            isPromotional: finalScore >= 20,
            promotionScore: finalScore,
            redFlags: flags,
          });
        }
        await deadline.sleep(delayMs);
      } catch (error: any) {
        console.error(`[YouTube] Error for ${target.ticker}:`, error.message);
      }
    }

    const avgScore =
      allMentions.length > 0
        ? allMentions.reduce((s, m) => s + m.promotionScore, 0) /
          allMentions.length
        : 0;

    return [
      {
        platform: "YouTube",
        scanner: this.name,
        success: true,
        mentionsFound: allMentions.length,
        mentions: allMentions,
        activityLevel:
          allMentions.length >= 10
            ? "high"
            : allMentions.length >= 3
              ? "medium"
              : allMentions.length > 0
                ? "low"
                : "none",
        promotionRisk:
          avgScore >= 40 ? "high" : avgScore >= 20 ? "medium" : "low",
        scanDuration: Date.now() - startTime,
      },
    ];
  }
}

// ─────────────────────────────────────────────────────────────
// StockTwits Scanner (no API key needed)
// ─────────────────────────────────────────────────────────────

export class StockTwitsScanner implements SocialScanner {
  name = "stocktwits";
  platform = "StockTwits";

  isConfigured() {
    return true;
  }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const deadline = new Deadline();
    const allMentions: SocialMention[] = [];
    let hasErrors = false;
    const delayMs = perTargetDelay(targets.length, 2000);

    for (const target of targets) {
      if (deadline.expired()) break; // Return accumulated mentions on timeout
      try {
        const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(target.ticker)}.json`;
        const response = await fetchWithTimeout(
          url,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
              Accept: "application/json",
            },
          },
          deadline,
        );

        if (!response.ok) {
          hasErrors = true;
          continue;
        }
        const text = await response.text();
        if (text.startsWith("<")) {
          hasErrors = true;
          continue;
        }

        const data = JSON.parse(text);
        if (data.response?.status !== 200) continue;

        for (const msg of data.messages || []) {
          const body = msg.body || "";
          const { score, flags } = calculatePromotionScore(body);
          const { scoreBonus: platformBonus, flags: platformFlags } =
            calculatePlatformSpecificScore(body, "stocktwits");
          flags.push(...platformFlags);

          const followers = msg.user?.followers || 0;
          if (followers < 10) flags.push("Low follower account");
          if (msg.user?.join_date) {
            const daysSince =
              (Date.now() - new Date(msg.user.join_date).getTime()) / 86400000;
            if (daysSince < 30) flags.push("Account < 30 days old");
          }

          const stSentiment = msg.entities?.sentiment?.basic;
          const sentiment =
            stSentiment === "Bullish"
              ? ("bullish" as const)
              : stSentiment === "Bearish"
                ? ("bearish" as const)
                : ("neutral" as const);

          const finalScore = Math.min(
            score +
              platformBonus +
              (followers < 10 ? 10 : 0) +
              (flags.includes("Account < 30 days old") ? 15 : 0),
            100,
          );

          allMentions.push({
            platform: "StockTwits",
            source: "StockTwits Feed",
            discoveredVia: "stocktwits",
            title: "",
            content: body.substring(0, 500),
            url: msg.id
              ? `https://stocktwits.com/${msg.user?.username || "unknown"}/message/${msg.id}`
              : `https://stocktwits.com/symbol/${target.ticker}`,
            author: msg.user?.username || "unknown",
            postDate: msg.created_at || new Date().toISOString(),
            engagement: { likes: msg.likes?.total || 0 },
            sentiment,
            isPromotional: finalScore >= 20,
            promotionScore: finalScore,
            redFlags: flags,
          });
        }
        await deadline.sleep(delayMs);
      } catch (error: any) {
        console.error(
          `[StockTwits] Error for ${target.ticker}:`,
          error.message,
        );
        hasErrors = true;
      }
    }

    const avgScore =
      allMentions.length > 0
        ? allMentions.reduce((s, m) => s + m.promotionScore, 0) /
          allMentions.length
        : 0;

    return [
      {
        platform: "StockTwits",
        scanner: this.name,
        success: allMentions.length > 0 || !hasErrors,
        error: hasErrors
          ? "Some tickers failed (possibly rate limited)"
          : undefined,
        mentionsFound: allMentions.length,
        mentions: allMentions,
        activityLevel:
          allMentions.length >= 30
            ? "high"
            : allMentions.length >= 10
              ? "medium"
              : allMentions.length > 0
                ? "low"
                : "none",
        promotionRisk:
          avgScore >= 40 ? "high" : avgScore >= 20 ? "medium" : "low",
        scanDuration: Date.now() - startTime,
      },
    ];
  }
}

// ─────────────────────────────────────────────────────────────
// Serper.dev Scanner (Google Search Alternative)
// ─────────────────────────────────────────────────────────────

function detectPlatform(url: string): SocialMention["platform"] {
  const lower = url.toLowerCase();
  if (lower.includes("reddit.com")) return "Reddit";
  if (lower.includes("youtube.com") || lower.includes("youtu.be"))
    return "YouTube";
  if (lower.includes("twitter.com") || lower.includes("x.com"))
    return "Twitter";
  if (lower.includes("stocktwits.com")) return "StockTwits";
  if (lower.includes("tiktok.com")) return "TikTok";
  if (lower.includes("discord.com") || lower.includes("discord.gg"))
    return "Discord";
  return "Forum";
}

function detectSource(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("reddit.com/r/")) {
    const match = url.match(/reddit\.com\/r\/([^\/]+)/i);
    return match ? `r/${match[1]}` : "Reddit";
  }
  if (lower.includes("youtube.com")) return "YouTube";
  if (lower.includes("twitter.com") || lower.includes("x.com")) {
    const match = url.match(/(?:twitter|x)\.com\/([^\/]+)/i);
    return match ? `@${match[1]}` : "Twitter/X";
  }
  if (lower.includes("stocktwits.com")) return "StockTwits";
  if (lower.includes("tiktok.com")) {
    const match = url.match(/tiktok\.com\/@([^\/]+)/i);
    return match ? `@${match[1]}` : "TikTok";
  }
  if (lower.includes("seekingalpha.com")) return "Seeking Alpha";
  if (lower.includes("finance.yahoo.com")) return "Yahoo Finance";
  if (lower.includes("investorshub")) return "InvestorsHub";
  try {
    return new URL(url).hostname;
  } catch {
    return "Unknown";
  }
}

// Cap paid Serper queries to the top-N priority tickers (SOC-CO1).
const SERPER_MAX_TICKERS = Number(process.env.SERPER_MAX_TICKERS || 20);

export class SerperScanner implements SocialScanner {
  name = "serper_dev";
  platform = "Multi-Platform";

  isConfigured() {
    return !!process.env.SERPER_API_KEY;
  }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const deadline = new Deadline();
    const apiKey = process.env.SERPER_API_KEY!;
    const allMentions: SocialMention[] = [];
    const seenUrls = new Set<string>();

    let apiErrors = 0;
    let lastApiError = "";

    // Cap Serper to the top priority tickers — they arrive pre-sorted by the
    // risk engine (SOC-CO1). The rest are covered for free by the other
    // scanners; paid SERP credits go only to the highest-risk names.
    const scanList = targets.slice(0, SERPER_MAX_TICKERS);

    // One combined query per ticker (was two) — halves the credit count while
    // keeping both the scam-language and social-platform coverage (SOC-CO1).
    const buildQuery = (ticker: string): string =>
      `"$${ticker}" OR "${ticker}" ("buy now" OR "guaranteed" OR "alert service" OR "pump" OR "100x" OR "join our" OR "moon") (site:reddit.com OR site:stocktwits.com OR site:youtube.com OR site:twitter.com OR site:x.com)`;

    const delayMs = perTargetDelay(scanList.length, 100);

    for (const target of scanList) {
      if (deadline.expired()) break; // Return accumulated mentions on timeout
      const query = buildQuery(target.ticker);

      try {
        const res = await fetchWithTimeout(
          "https://google.serper.dev/search",
          {
            method: "POST",
            headers: {
              "X-API-KEY": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              q: query,
              num: 10, // was 15 — halves Serper credit cost (SOC-CO1)
              tbs: "qdr:w", // Past week
            }),
          },
          deadline,
        );

        if (!res.ok) {
          const body = await res.text().catch(() => "no body");
          console.error(
            `[Serper] API ${res.status} for ${target.ticker}: ${body}`,
          );
          apiErrors++;

          let parsedError = body;
          try {
            const json = JSON.parse(body);
            parsedError = json.message || json.error || body;
          } catch (e) {}
          lastApiError = `Status ${res.status}: ${parsedError}`;
          await deadline.sleep(delayMs);
          continue;
        }

        const data = await res.json();
        const results = data.organic || [];

        for (const result of results) {
          const url = result.link || "";
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          const title = result.title || "";
          const snippet = result.snippet || "";
          const combined = `${title} ${snippet}`;
          if (!textMentionsTicker(combined, target.ticker)) continue;

          const platform = detectPlatform(url);
          const source = detectSource(url);
          const { score, flags } = calculatePromotionScore(
            `${title} ${snippet}`,
          );

          // Apply platform-specific scoring based on detected platform
          const platformMap: Record<string, PlatformName> = {
            Reddit: "reddit",
            YouTube: "youtube",
            Twitter: "twitter",
            StockTwits: "stocktwits",
            Discord: "discord_telegram",
            TikTok: "tiktok",
          };
          const platformKey = platformMap[platform];
          let finalScore = score;
          if (platformKey) {
            const { scoreBonus, flags: pFlags } = calculatePlatformSpecificScore(
              `${title} ${snippet}`,
              platformKey,
            );
            flags.push(...pFlags);
            finalScore = Math.min(score + scoreBonus, 100);
          }

          let postDate = result.date || new Date().toISOString();

          allMentions.push({
            platform,
            source,
            discoveredVia: "serper_dev",
            title: title.substring(0, 300),
            content: snippet.substring(0, 500),
            url,
            author: "unknown",
            postDate,
            engagement: {},
            sentiment: finalScore > 25 ? "bullish" : "neutral",
            isPromotional: finalScore >= 20,
            promotionScore: finalScore,
            redFlags: flags,
          });
        }
      } catch (error: any) {
        console.error(`[Serper] Error for ${target.ticker}:`, error.message);
        apiErrors++;
        lastApiError = `Network error: ${error.message}`;
      }
      await deadline.sleep(delayMs); // Serper is faster, gentle throttle
    }

    const avgScore =
      allMentions.length > 0
        ? allMentions.reduce((s, m) => s + m.promotionScore, 0) /
          allMentions.length
        : 0;

    if (apiErrors > 0) {
      console.error(
        `[Serper] ${apiErrors}/${scanList.length} ticker queries failed. Check your SERPER_API_KEY. Last error: ${lastApiError}`,
      );
    }

    return [
      {
        platform: "Multi-Platform (Serper)",
        scanner: this.name,
        success: apiErrors === 0,
        error:
          apiErrors > 0
            ? `${apiErrors}/${scanList.length} API requests failed. Last error: ${lastApiError}`
            : undefined,
        mentionsFound: allMentions.length,
        mentions: allMentions,
        activityLevel:
          allMentions.length >= 20
            ? "high"
            : allMentions.length >= 5
              ? "medium"
              : allMentions.length > 0
                ? "low"
                : "none",
        promotionRisk:
          avgScore >= 40 ? "high" : avgScore >= 20 ? "medium" : "low",
        scanDuration: Date.now() - startTime,
      },
    ];
  }
}

// ─────────────────────────────────────────────────────────────
// Perplexity AI Researcher
// ─────────────────────────────────────────────────────────────

export class PerplexityScanner implements SocialScanner {
  name = "perplexity";
  platform = "Multi-Platform";

  isConfigured() {
    return !!process.env.PERPLEXITY_API_KEY;
  }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const deadline = new Deadline();
    const apiKey = process.env.PERPLEXITY_API_KEY!;
    const allMentions: SocialMention[] = [];
    let apiErrors = 0;
    let lastApiError = "";

    const batchSize = 5;
    // Max concurrent sonar calls — parallelize so the batches finish within the
    // budget instead of running serially and losing the race (SOC-CO4).
    const MAX_CONCURRENCY = 3;

    // Run one Perplexity batch. Pushes parsed mentions into `allMentions` and
    // bumps the shared error counters. Returns nothing — side-effecting so the
    // concurrency runner stays simple.
    const runBatch = async (batch: ScanTarget[]): Promise<void> => {
      const tickerList = batch
        .map((t) => `$${t.ticker} (${t.name})`)
        .join(", ");
      const signalsSummary = batch
        .map((t) => `$${t.ticker}: ${t.signals.join(", ") || "HIGH risk"}`)
        .join("; ");

      const prompt = `Investigate these HIGH-RISK stocks for signs of social media pump-and-dump schemes or coordinated scam promotion (past 7 days): ${tickerList}

These stocks were flagged by our risk engine for suspicious price/volume patterns:
${signalsSummary}

Now find the SOCIAL MEDIA SIDE of potential manipulation. Look specifically for:
- Paid alert services promoting these tickers (Discord, Telegram, StockTwits groups)
- YouTube videos with clickbait pump titles about these tickers
- Reddit posts with fake "DD" designed to lure buyers into buying
- Twitter/X accounts spamming cashtags ($${batch.map((t) => t.ticker).join(", $")}) with hype language
- TikTok "fintok" creators pushing these as "life-changing" or "next 100x" buys
- Coordinated posting patterns (multiple accounts pushing same ticker simultaneously)
- Accounts with suspicious patterns (new accounts, copy-pasted text, bot-like behavior)
- "Guru" accounts selling courses/memberships while pumping these tickers
- Posts using urgency ("buy before it's too late"), fake scarcity, or guaranteed returns language

For each SUSPICIOUS mention found, return a JSON array:
[{"ticker":"SYMBOL","platform":"Reddit|Twitter|YouTube|StockTwits|TikTok|Discord","source":"specific subreddit/channel/account","title":"post title","content":"brief summary of the suspicious content","url":"actual URL","author":"username","date":"ISO date","upvotes":null,"comments":null,"views":null,"sentiment":"bullish|bearish|neutral","suspicionLevel":"high|medium|low","suspicionReason":"why this looks like a scam or pump scheme"}]

IMPORTANT: Only REAL posts with actual URLs. Focus on content that looks MANIPULATIVE or designed to pump the stock — not legitimate stock discussion or news coverage. Return [] if nothing suspicious found. Return ONLY the JSON array.`;

      try {
        const res = await fetchWithTimeout(
          "https://api.perplexity.ai/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "sonar",
              temperature: 0.1,
              max_tokens: 2000,
              return_citations: true,
              messages: [
                {
                  role: "system",
                  content:
                    "You are a financial fraud investigator specializing in stock market pump-and-dump schemes and social media manipulation. Your job is to find SUSPICIOUS promotional activity — coordinated pumps, paid alert services, fake due diligence, boiler room language, and scam indicators. You are NOT looking for legitimate stock discussion or news. You are looking for content that appears designed to manipulate retail investors into buying a stock so the promoter can dump their shares. Respond ONLY in valid JSON format.",
                },
                { role: "user", content: prompt },
              ],
            }),
          },
          deadline,
        );

        if (!res.ok) {
          const body = await res.text().catch(() => "no body");
          console.error(`[Perplexity] API ${res.status}: ${body}`);
          apiErrors++;
          lastApiError = `Status ${res.status}: ${body.substring(0, 200)}`;
          return;
        }
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "";
        const citations: string[] = data.citations || [];

        // Parse JSON response — try multiple extraction strategies
        let parsed: any[] | null = null;

        // Strategy 1: Extract JSON array from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const result = JSON.parse(jsonMatch[0]);
            if (Array.isArray(result)) parsed = result;
          } catch {
            // Strategy 2: Try fixing common LLM JSON issues (trailing commas, unescaped quotes)
            try {
              const cleaned = jsonMatch[0]
                .replace(/,\s*]/g, "]") // trailing commas before ]
                .replace(/,\s*}/g, "}") // trailing commas before }
                .replace(/[\u201c\u201d]/g, '"'); // smart quotes
              const result = JSON.parse(cleaned);
              if (Array.isArray(result)) parsed = result;
            } catch {
              console.warn(
                `[Perplexity] JSON parse failed for batch "${tickerList}". Content starts with: ${content.substring(0, 150)}`,
              );
              apiErrors++;
              lastApiError = `JSON parse failed for batch "${tickerList}"`;
            }
          }
        } else if (content.trim().length > 0 && content.trim() !== "[]") {
          console.warn(
            `[Perplexity] No JSON array found in response for "${tickerList}". Content starts with: ${content.substring(0, 150)}`,
          );
        }

        if (parsed) {
          for (const item of parsed) {
            if (!item.url && !item.platform) continue;

            const platform = item.url
              ? detectPlatform(item.url)
              : (item.platform as SocialMention["platform"]) || "Web";

            const text = `${item.title || ""} ${item.content || item.summary || ""}`;
            const { score, flags } = calculatePromotionScore(text);

            // Apply platform-specific scoring (was missing for Perplexity)
            const platformMap: Record<string, PlatformName> = {
              Reddit: "reddit",
              YouTube: "youtube",
              Twitter: "twitter",
              StockTwits: "stocktwits",
              Discord: "discord_telegram",
              TikTok: "tiktok",
            };
            const platformKey = platformMap[platform];
            let platformBonus = 0;
            if (platformKey) {
              const { scoreBonus, flags: pFlags } =
                calculatePlatformSpecificScore(text, platformKey);
              flags.push(...pFlags);
              platformBonus = scoreBonus;
            }

            // Map Perplexity's suspicion reasoning into redFlags
            const suspicionLevel = item.suspicionLevel || "";
            const suspicionReason = item.suspicionReason || "";
            const suspicionBonus =
              suspicionLevel === "high"
                ? 25
                : suspicionLevel === "medium"
                  ? 10
                  : 0;
            if (suspicionReason) {
              flags.push(`[AI] ${suspicionReason}`);
            } else if (suspicionLevel === "high") {
              // Only add generic flag as fallback when no specific reason provided
              flags.push("[AI] High suspicion — likely pump/scam");
            }

            const finalScore = Math.min(
              score + platformBonus + suspicionBonus,
              100,
            );

            allMentions.push({
              platform,
              source:
                item.source ||
                item.subreddit ||
                item.channel ||
                String(platform),
              discoveredVia: "perplexity",
              title: item.title || "",
              content: (item.content || item.summary || "").substring(0, 500),
              url: item.url || "",
              author: item.author || item.username || "unknown",
              postDate: item.date || item.posted || new Date().toISOString(),
              engagement: {
                upvotes: item.upvotes || item.score || undefined,
                comments: item.comments || item.replies || undefined,
                views: item.views || undefined,
                likes: item.likes || undefined,
              },
              sentiment:
                finalScore > 30
                  ? "bullish"
                  : item.sentiment === "bullish" ||
                      item.sentiment === "bearish" ||
                      item.sentiment === "neutral"
                    ? item.sentiment
                    : "neutral",
              isPromotional: finalScore >= 20,
              promotionScore: finalScore,
              redFlags: flags,
            });
          }
        }

        // Add citations not already captured
        for (const citationUrl of citations) {
          if (allMentions.some((m) => m.url === citationUrl)) continue;
          const platform = detectPlatform(citationUrl);
          // Skip non-social-media citations (Forum/generic web results)
          if (platform === "Forum") continue;

          const citationText = `Stock mention found via web search at ${citationUrl}`;
          const { score: citScore, flags: citFlags } =
            calculatePromotionScore(citationText);

          allMentions.push({
            platform,
            source: String(platform),
            discoveredVia: "perplexity",
            title: `Stock mention found via web search`,
            content: `Social media mention found at: ${citationUrl}`,
            url: citationUrl,
            author: "unknown",
            postDate: new Date().toISOString(),
            engagement: {},
            sentiment: citScore > 20 ? "bullish" : "neutral",
            isPromotional: citScore >= 20,
            promotionScore: citScore,
            redFlags: citFlags,
          });
        }
      } catch (error: any) {
        console.error(`[Perplexity] Error:`, error.message);
        apiErrors++;
        lastApiError = `Network error: ${error.message}`;
      }
    };

    // Build batches, then run them MAX_CONCURRENCY at a time. Stop launching new
    // batches once the deadline passes so we return partial results instead of
    // racing past the orchestrator timeout and losing every paid call (SOC-CO4).
    const batches: ScanTarget[][] = [];
    for (let i = 0; i < targets.length; i += batchSize) {
      batches.push(targets.slice(i, i + batchSize));
    }
    const totalBatches = batches.length;

    for (let i = 0; i < batches.length; i += MAX_CONCURRENCY) {
      if (deadline.expired()) {
        console.warn(
          `[Perplexity] Budget exhausted — returning ${allMentions.length} mentions from ${i}/${totalBatches} batches`,
        );
        break;
      }
      const chunk = batches.slice(i, i + MAX_CONCURRENCY);
      await Promise.allSettled(chunk.map((b) => runBatch(b)));
    }

    if (apiErrors > 0) {
      console.error(
        `[Perplexity] ${apiErrors}/${totalBatches} batch queries failed. Last error: ${lastApiError}`,
      );
    }

    console.log(
      `[Perplexity] Raw mentions found: ${allMentions.length} (${apiErrors} batch errors). Mentions by platform: ${
        allMentions.length > 0
          ? Array.from(new Set(allMentions.map((m) => m.platform)))
              .map(
                (p) =>
                  `${p}: ${allMentions.filter((m) => m.platform === p).length}`,
              )
              .join(", ")
          : "none"
      }`,
    );

    const avgScore =
      allMentions.length > 0
        ? allMentions.reduce((s, m) => s + m.promotionScore, 0) /
          allMentions.length
        : 0;

    return [
      {
        platform: "Multi-Platform (Perplexity)",
        scanner: this.name,
        success: apiErrors === 0,
        error:
          apiErrors > 0
            ? `${apiErrors}/${totalBatches} batch requests failed. Last error: ${lastApiError}`
            : undefined,
        mentionsFound: allMentions.length,
        mentions: allMentions,
        activityLevel:
          allMentions.length >= 15
            ? "high"
            : allMentions.length >= 5
              ? "medium"
              : allMentions.length > 0
                ? "low"
                : "none",
        promotionRisk:
          avgScore >= 40 ? "high" : avgScore >= 20 ? "medium" : "low",
        scanDuration: Date.now() - startTime,
      },
    ];
  }
}

// ─────────────────────────────────────────────────────────────
// Discord Bot Scanner
// ─────────────────────────────────────────────────────────────

export class DiscordBotScanner implements SocialScanner {
  name = "discord_bot";
  platform = "Discord";

  isConfigured() {
    return !!process.env.DISCORD_BOT_TOKEN;
  }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const deadline = new Deadline();
    const token = process.env.DISCORD_BOT_TOKEN!;
    const allMentions: SocialMention[] = [];

    const discordGet = async (endpoint: string) => {
      const res = await fetchWithTimeout(
        `https://discord.com/api/v10${endpoint}`,
        {
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
        },
        deadline,
      );
      if (!res.ok) throw new Error(`Discord API ${res.status}`);
      return res.json();
    };

    try {
      const guilds = await discordGet("/users/@me/guilds");

      if (!guilds || guilds.length === 0) {
        console.warn(
          "[Discord] Bot is not in any servers. Invite it to stock-related Discord servers for scanning to work.",
        );
        return [
          {
            platform: "Discord",
            scanner: this.name,
            success: false,
            error:
              "Bot is not in any Discord servers — invite it to stock-related servers first",
            mentionsFound: 0,
            mentions: [],
            activityLevel: "none",
            promotionRisk: "low",
            scanDuration: Date.now() - startTime,
          },
        ];
      }

      console.log(
        `[Discord] Bot is in ${guilds.length} server(s): ${guilds.map((g: any) => g.name).join(", ")}`,
      );

      // Build matchers via the shared helper so ticker metacharacters are
      // escaped and short tickers require a $cashtag (SOC-L2 / SOC-R1). Invalid
      // tickers are dropped instead of throwing inside RegExp.
      const tickerPatterns = targets
        .map((t) => ({ target: t, regex: buildTickerMatcher(t.ticker) }))
        .filter(
          (p): p is { target: ScanTarget; regex: RegExp } => p.regex !== null,
        );

      for (const guild of guilds) {
        if (deadline.expired()) break;
        try {
          const channels = await discordGet(`/guilds/${guild.id}/channels`);
          const textChannels = channels
            .filter((c: any) => c.type === 0)
            .slice(0, 10);

          for (const channel of textChannels) {
            if (deadline.expired()) break;
            try {
              const messages = await discordGet(
                `/channels/${channel.id}/messages?limit=100`,
              );
              for (const msg of messages) {
                const content = msg.content || "";
                if (!content) continue;

                for (const { target, regex } of tickerPatterns) {
                  if (!regex.test(content)) continue;

                  const { score, flags } = calculatePromotionScore(content);
                  const { scoreBonus: discordBonus, flags: discordFlags } =
                    calculatePlatformSpecificScore(content, "discord_telegram");
                  flags.push(...discordFlags);
                  const memberSince = msg.member?.joined_at;
                  if (memberSince) {
                    const daysSince =
                      (Date.now() - new Date(memberSince).getTime()) / 86400000;
                    if (daysSince < 7) flags.push("Recently joined server");
                  }
                  const finalScore = Math.min(
                    score +
                      discordBonus +
                      (flags.includes("Recently joined server") ? 15 : 0),
                    100,
                  );

                  allMentions.push({
                    platform: "Discord",
                    source: `${guild.name} / #${channel.name}`,
                    discoveredVia: "discord_bot",
                    title: "",
                    content: content.substring(0, 500),
                    url: `https://discord.com/channels/${guild.id}/${channel.id}/${msg.id}`,
                    author: msg.author?.username || "unknown",
                    postDate: msg.timestamp || new Date().toISOString(),
                    engagement: {
                      likes:
                        msg.reactions?.reduce(
                          (s: number, r: any) => s + (r.count || 0),
                          0,
                        ) || 0,
                    },
                    sentiment: finalScore > 30 ? "bullish" : "neutral",
                    isPromotional: finalScore >= 20,
                    promotionScore: finalScore,
                    redFlags: flags,
                  });
                  break;
                }
              }
              await deadline.sleep(500);
            } catch {
              /* skip unreadable channels */
            }
          }
          await deadline.sleep(1000);
        } catch (error: any) {
          console.error(
            `[Discord] Guild error for ${guild.name}:`,
            error.message,
          );
        }
      }
    } catch (error: any) {
      return [
        {
          platform: "Discord",
          scanner: this.name,
          success: false,
          error: `Discord API error: ${error.message}`,
          mentionsFound: 0,
          mentions: [],
          activityLevel: "none",
          promotionRisk: "low",
          scanDuration: Date.now() - startTime,
        },
      ];
    }

    const avgScore =
      allMentions.length > 0
        ? allMentions.reduce((s, m) => s + m.promotionScore, 0) /
          allMentions.length
        : 0;

    return [
      {
        platform: "Discord",
        scanner: this.name,
        success: true,
        mentionsFound: allMentions.length,
        mentions: allMentions,
        activityLevel:
          allMentions.length >= 15
            ? "high"
            : allMentions.length >= 5
              ? "medium"
              : allMentions.length > 0
                ? "low"
                : "none",
        promotionRisk:
          avgScore >= 40 ? "high" : avgScore >= 20 ? "medium" : "low",
        scanDuration: Date.now() - startTime,
      },
    ];
  }
}

// ─────────────────────────────────────────────────────────────
// Registry: get all configured scanners
// ─────────────────────────────────────────────────────────────

function logSkipped(skipped: SocialScanner[]): void {
  if (skipped.length === 0) return;
  const envHints: Record<string, string> = {
    serper_dev: "SERPER_API_KEY",
    perplexity: "PERPLEXITY_API_KEY",
    youtube_api: "YOUTUBE_API_KEY",
    discord_bot: "DISCORD_BOT_TOKEN",
    reddit_public: "ENABLE_REDDIT_DIRECT_SCAN",
  };
  for (const s of skipped) {
    const hint = envHints[s.name] || "unknown env var";
    console.warn(
      `[Social Scan] SKIPPED ${s.name} (${s.platform}) — missing env: ${hint}`,
    );
  }
}

export function getConfiguredScanners(): SocialScanner[] {
  const all: SocialScanner[] = [
    // Layer 1: Broad sweep
    new SerperScanner(),
    new PerplexityScanner(),
    // Layer 2: Platform-specific
    new RedditScanner(),
    new YouTubeScanner(),
    new StockTwitsScanner(),
    new DiscordBotScanner(),
  ];

  const configured = all.filter((s) => s.isConfigured());
  logSkipped(all.filter((s) => !s.isConfigured()));

  console.log(
    `[Social Scan] Configured scanners (${configured.length}/${all.length}): ${configured.map((s) => s.name).join(", ")}`,
  );

  return configured;
}

/**
 * Free scanners only (everything except Perplexity). The orchestrator runs
 * these first, then decides per-ticker whether the paid Perplexity scanner is
 * worth calling (SOC-CO4 tiering).
 */
export function getConfiguredFreeScanners(): SocialScanner[] {
  const all: SocialScanner[] = [
    new SerperScanner(),
    new RedditScanner(),
    new YouTubeScanner(),
    new StockTwitsScanner(),
    new DiscordBotScanner(),
  ];
  const configured = all.filter((s) => s.isConfigured());
  logSkipped(all.filter((s) => !s.isConfigured()));
  return configured;
}

/** The Perplexity scanner if its API key is configured, else null. */
export function getPerplexityScanner(): SocialScanner | null {
  const s = new PerplexityScanner();
  return s.isConfigured() ? s : null;
}
