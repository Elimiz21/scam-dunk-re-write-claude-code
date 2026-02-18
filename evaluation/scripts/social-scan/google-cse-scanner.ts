/**
 * Google Custom Search Engine Scanner
 *
 * Uses Google Programmable Search Engine to find stock mentions
 * across ALL social media platforms in a single API call.
 *
 * Free: 100 queries/day, then $5 per 1,000 queries
 * Setup: https://programmablesearchengine.google.com/
 *
 * Env: GOOGLE_CSE_API_KEY, GOOGLE_CSE_ID
 */

import {
  ScanTarget, PlatformScanResult, SocialMention,
  calculatePromotionScore, calculatePlatformSpecificScore, SocialScanner
} from './types';
import type { PlatformName } from './platform-patterns';

const GOOGLE_CSE_URL = 'https://www.googleapis.com/customsearch/v1';

// Social media domains to target
const SOCIAL_DOMAINS = [
  'reddit.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'stocktwits.com',
  'tiktok.com',
  'discord.com',
  'facebook.com',
  'instagram.com',
  'threads.net',
  'seekingalpha.com',
  'investorshub.advfn.com',
  'finance.yahoo.com',
];

function detectPlatform(url: string): SocialMention['platform'] {
  const lower = url.toLowerCase();
  if (lower.includes('reddit.com')) return 'Reddit';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'Twitter';
  if (lower.includes('stocktwits.com')) return 'StockTwits';
  if (lower.includes('tiktok.com')) return 'TikTok';
  if (lower.includes('discord.com') || lower.includes('discord.gg')) return 'Discord';
  if (lower.includes('facebook.com') || lower.includes('fb.com')) return 'Web';
  if (lower.includes('instagram.com')) return 'Web';
  if (lower.includes('threads.net')) return 'Web';
  return 'Forum';
}

/** Map social mention platform to our platform-specific pattern key */
function toPlatformPatternName(platform: SocialMention['platform']): PlatformName | null {
  switch (platform) {
    case 'Reddit': return 'reddit';
    case 'YouTube': return 'youtube';
    case 'Twitter': return 'twitter';
    case 'StockTwits': return 'stocktwits';
    case 'TikTok': return 'tiktok';
    case 'Discord': return 'discord_telegram';
    default: return null;
  }
}

function detectSource(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('reddit.com/r/')) {
    const match = url.match(/reddit\.com\/r\/([^\/]+)/i);
    return match ? `r/${match[1]}` : 'Reddit';
  }
  if (lower.includes('youtube.com')) return 'YouTube';
  if (lower.includes('twitter.com') || lower.includes('x.com')) {
    const match = url.match(/(?:twitter|x)\.com\/([^\/]+)/i);
    return match ? `@${match[1]}` : 'Twitter/X';
  }
  if (lower.includes('stocktwits.com')) return 'StockTwits';
  if (lower.includes('tiktok.com')) {
    const match = url.match(/tiktok\.com\/@([^\/]+)/i);
    return match ? `@${match[1]}` : 'TikTok';
  }
  if (lower.includes('seekingalpha.com')) return 'Seeking Alpha';
  if (lower.includes('finance.yahoo.com')) return 'Yahoo Finance';
  if (lower.includes('investorshub')) return 'InvestorsHub';
  if (lower.includes('facebook.com')) {
    const match = url.match(/facebook\.com\/(?:groups\/)?([^\/]+)/i);
    return match ? `Facebook: ${match[1]}` : 'Facebook';
  }
  if (lower.includes('instagram.com')) {
    const match = url.match(/instagram\.com\/([^\/]+)/i);
    return match ? `@${match[1]} (Instagram)` : 'Instagram';
  }
  if (lower.includes('threads.net')) {
    const match = url.match(/threads\.net\/@([^\/]+)/i);
    return match ? `@${match[1]} (Threads)` : 'Threads';
  }
  try { return new URL(url).hostname; } catch { return 'Unknown'; }
}

async function googleSearch(
  apiKey: string,
  cseId: string,
  query: string,
  siteRestrict?: string
): Promise<any[]> {
  const params = new URLSearchParams({
    key: apiKey,
    cx: cseId,
    q: query,
    num: '10',
    sort: 'date',
    dateRestrict: 'w1', // Past week
  });

  if (siteRestrict) {
    params.set('siteSearch', siteRestrict);
  }

  try {
    const response = await fetch(`${GOOGLE_CSE_URL}?${params}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error(`Google CSE error ${response.status}:`, error.error?.message);
      return [];
    }
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Google CSE request failed:', error);
    return [];
  }
}

export class GoogleCSEScanner implements SocialScanner {
  name = 'google_cse';
  platform = 'Multi-Platform';

  isConfigured(): boolean {
    return !!(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ID);
  }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const apiKey = process.env.GOOGLE_CSE_API_KEY;
    const cseId = process.env.GOOGLE_CSE_ID;

    if (!apiKey || !cseId) {
      return [{
        platform: 'Multi-Platform (Google CSE)',
        scanner: this.name,
        success: false,
        error: 'Google CSE API key or Search Engine ID not configured',
        mentionsFound: 0,
        mentions: [],
        activityLevel: 'none',
        promotionRisk: 'low',
        scanDuration: Date.now() - startTime,
      }];
    }

    console.log(`  [Google CSE] Searching ${targets.length} tickers across social media...`);

    const allMentions: SocialMention[] = [];
    const seenUrls = new Set<string>();

    for (const target of targets) {
      console.log(`    Searching for ${target.ticker}...`);

      // Build a site-restricted query targeting social media domains
      const siteQueries = SOCIAL_DOMAINS.map(d => `site:${d}`).join(' OR ');
      const query = `"${target.ticker}" stock (${siteQueries})`;

      try {
        const results = await googleSearch(apiKey, cseId, query);

        for (const result of results) {
          const url = result.link || '';
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          const title = result.title || '';
          const snippet = result.snippet || '';
          const combinedText = `${title} ${snippet}`;

          // Verify ticker is actually mentioned
          const lower = combinedText.toLowerCase();
          const tickerLower = target.ticker.toLowerCase();
          if (!lower.includes(tickerLower) && !lower.includes(`$${tickerLower}`)) {
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

          // Parse date from metadata
          let postDate = new Date().toISOString();
          if (result.pagemap?.metatags?.[0]) {
            const meta = result.pagemap.metatags[0];
            postDate = meta['article:published_time'] || meta['og:updated_time'] || postDate;
          }

          allMentions.push({
            platform,
            source,
            discoveredVia: 'google_cse',
            title: title.substring(0, 300),
            content: snippet.substring(0, 500),
            url,
            author: 'unknown', // CSE doesn't provide author info
            postDate,
            engagement: {}, // CSE doesn't provide engagement metrics
            sentiment: adjustedScore > 25 ? 'bullish' : 'neutral',
            isPromotional: adjustedScore >= 25,
            promotionScore: adjustedScore,
            redFlags: flags,
          });
        }
      } catch (error: any) {
        console.error(`Google CSE error for ${target.ticker}:`, error.message);
      }

      // Rate limit: 100 free queries/day
      await new Promise(r => setTimeout(r, 500));
    }

    const avgScore = allMentions.length > 0
      ? allMentions.reduce((sum, m) => sum + m.promotionScore, 0) / allMentions.length
      : 0;

    return [{
      platform: 'Multi-Platform (Google CSE)',
      scanner: this.name,
      success: true,
      mentionsFound: allMentions.length,
      mentions: allMentions,
      activityLevel: allMentions.length >= 20 ? 'high'
        : allMentions.length >= 5 ? 'medium'
        : allMentions.length > 0 ? 'low' : 'none',
      promotionRisk: avgScore >= 40 ? 'high'
        : avgScore >= 20 ? 'medium' : 'low',
      scanDuration: Date.now() - startTime,
    }];
  }
}
