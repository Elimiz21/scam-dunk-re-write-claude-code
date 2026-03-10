/**
 * Serper.dev Scanner
 *
 * Uses Serper to find stock mentions
 * across ALL social media platforms in a single API call.
 *
 * Setup: https://serper.dev/
 * Env: SERPER_API_KEY
 */

import {
  ScanTarget,
  PlatformScanResult,
  SocialMention,
  calculatePromotionScore,
  calculatePlatformSpecificScore,
  SocialScanner,
} from "./types";
import type { PlatformName } from "./platform-patterns";

const SERPER_URL = "https://google.serper.dev/search";

// Social media domains to target
const SOCIAL_DOMAINS = [
  "reddit.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "stocktwits.com",
  "tiktok.com",
  "discord.com",
  "facebook.com",
  "instagram.com",
  "threads.net",
  "seekingalpha.com",
  "investorshub.advfn.com",
  "finance.yahoo.com",
];

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
  if (lower.includes("facebook.com") || lower.includes("fb.com")) return "Web";
  if (lower.includes("instagram.com")) return "Web";
  if (lower.includes("threads.net")) return "Web";
  return "Forum";
}

/** Map social mention platform to our platform-specific pattern key */
function toPlatformPatternName(
  platform: SocialMention["platform"],
): PlatformName | null {
  switch (platform) {
    case "Reddit":
      return "reddit";
    case "YouTube":
      return "youtube";
    case "Twitter":
      return "twitter";
    case "StockTwits":
      return "stocktwits";
    case "TikTok":
      return "tiktok";
    case "Discord":
      return "discord_telegram";
    default:
      return null;
  }
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
  if (lower.includes("facebook.com")) {
    const match = url.match(/facebook\.com\/(?:groups\/)?([^\/]+)/i);
    return match ? `Facebook: ${match[1]}` : "Facebook";
  }
  if (lower.includes("instagram.com")) {
    const match = url.match(/instagram\.com\/([^\/]+)/i);
    return match ? `@${match[1]} (Instagram)` : "Instagram";
  }
  if (lower.includes("threads.net")) {
    const match = url.match(/threads\.net\/@([^\/]+)/i);
    return match ? `@${match[1]} (Threads)` : "Threads";
  }
  try {
    return new URL(url).hostname;
  } catch {
    return "Unknown";
  }
}

async function serperSearch(apiKey: string, query: string): Promise<any[]> {
  try {
    const response = await fetch(SERPER_URL, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 20,
        tbs: "qdr:w",
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error(
        `Serper error ${response.status}:`,
        error.message || error.error,
      );
      return [];
    }
    const data = await response.json();
    return data.organic || [];
  } catch (error) {
    console.error("Serper request failed:", error);
    return [];
  }
}

export class SerperScanner implements SocialScanner {
  name = "serper_dev";
  platform = "Multi-Platform";

  isConfigured(): boolean {
    return !!process.env.SERPER_API_KEY;
  }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const apiKey = process.env.SERPER_API_KEY;

    if (!apiKey) {
      return [
        {
          platform: "Multi-Platform (Serper)",
          scanner: this.name,
          success: false,
          error: "SERPER_API_KEY not configured",
          mentionsFound: 0,
          mentions: [],
          activityLevel: "none",
          promotionRisk: "low",
          scanDuration: Date.now() - startTime,
        },
      ];
    }

    console.log(
      `  [Serper] Searching ${targets.length} tickers across social media...`,
    );

    const allMentions: SocialMention[] = [];
    const seenUrls = new Set<string>();

    for (const target of targets) {
      console.log(`    Searching for ${target.ticker}...`);

      // Build a site-restricted query targeting social media domains
      const siteQueries = SOCIAL_DOMAINS.map((d) => `site:${d}`).join(" OR ");
      const query = `("$${target.ticker}" OR "${target.ticker} stock") (${siteQueries})`;

      try {
        const results = await serperSearch(apiKey, query);

        for (const result of results) {
          const url = result.link || "";
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          const title = result.title || "";
          const snippet = result.snippet || "";
          const combinedText = `${title} ${snippet}`;

          // Verify ticker is actually mentioned
          const lower = combinedText.toLowerCase();
          const tickerLower = target.ticker.toLowerCase();
          if (
            !lower.includes(tickerLower) &&
            !lower.includes(`$${tickerLower}`)
          ) {
            continue;
          }

          const platform = detectPlatform(url);
          const source = detectSource(url);
          const { score, flags } = calculatePromotionScore(combinedText);

          // Apply platform-specific patterns when we know the source platform
          let platformBonus = 0;
          const platformKey = toPlatformPatternName(platform);
          if (platformKey) {
            const { scoreBonus, flags: platformFlags } =
              calculatePlatformSpecificScore(combinedText, platformKey);
            platformBonus = scoreBonus;
            flags.push(...platformFlags);
          }
          const adjustedScore = Math.min(score + platformBonus, 100);

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
            sentiment: adjustedScore > 25 ? "bullish" : "neutral",
            isPromotional: adjustedScore >= 25,
            promotionScore: adjustedScore,
            redFlags: flags,
          });
        }
      } catch (error: any) {
        console.error(`Serper error for ${target.ticker}:`, error.message);
      }

      await new Promise((r) => setTimeout(r, 100)); // Serper handles more load, but gentle pause
    }

    const avgScore =
      allMentions.length > 0
        ? allMentions.reduce((sum, m) => sum + m.promotionScore, 0) /
          allMentions.length
        : 0;

    return [
      {
        platform: "Multi-Platform (Serper.dev)",
        scanner: this.name,
        success: true,
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
