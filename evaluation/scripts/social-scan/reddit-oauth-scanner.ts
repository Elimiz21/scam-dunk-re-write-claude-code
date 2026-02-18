/**
 * Reddit Public JSON Scanner
 *
 * Uses Reddit's public .json endpoints — NO OAuth or API credentials needed.
 * Rate limit: ~10 requests/min (unauthenticated). We throttle to 6s between requests.
 *
 * Reddit killed self-service API key registration in November 2025, so
 * this scanner avoids the OAuth flow entirely and reads only public data.
 *
 * Endpoints used:
 *   https://www.reddit.com/search.json?q=...
 *   https://www.reddit.com/r/{subreddit}/new.json
 */

import {
  ScanTarget, PlatformScanResult, SocialMention,
  PROMOTION_SUBREDDITS, calculatePromotionScore, calculatePlatformSpecificScore, SocialScanner
} from './types';

const USER_AGENT = 'Mozilla/5.0 (compatible; ScamDunk/1.0; Stock Research Tool)';
const REQUEST_DELAY_MS = 6500; // ~9 req/min — safely under the 10/min unauthenticated limit

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function redditPublicGet(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });

  if (response.status === 429) {
    // Rate limited — wait and retry once
    console.warn('    [Reddit] Rate limited, waiting 10s and retrying...');
    await sleep(10000);
    const retry = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    });
    if (!retry.ok) {
      throw new Error(`Reddit ${retry.status} after rate-limit retry: ${retry.statusText}`);
    }
    return retry.json();
  }

  if (!response.ok) {
    throw new Error(`Reddit ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function searchRedditForTicker(
  target: ScanTarget
): Promise<SocialMention[]> {
  const mentions: SocialMention[] = [];
  const { ticker } = target;

  // Search with multiple queries for better coverage
  const queries = [
    ticker,                    // Direct ticker match
    `$${ticker}`,             // Cashtag format
    `${ticker} stock`,        // With "stock" keyword
  ];

  const seenUrls = new Set<string>();
  const promotionSubreddits = new Set(PROMOTION_SUBREDDITS);

  for (const query of queries) {
    try {
      const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&t=week&limit=25`;
      const data = await redditPublicGet(url);

      const posts = data?.data?.children || [];

      for (const post of posts) {
        const d = post.data;
        const permalink = `https://reddit.com${d.permalink}`;
        if (seenUrls.has(permalink)) continue;

        const subreddit = (d.subreddit || '').toLowerCase();
        const title = d.title || '';
        const selftext = d.selftext || '';
        const combinedText = `${title} ${selftext}`.toLowerCase();

        // Verify the ticker is actually mentioned
        const tickerLower = ticker.toLowerCase();
        if (!combinedText.includes(tickerLower) && !combinedText.includes(`$${tickerLower}`)) {
          continue;
        }

        seenUrls.add(permalink);

        // Check account age if available
        const accountCreatedUtc = d.author_created_utc;
        let isNewAccount = false;
        if (accountCreatedUtc) {
          const ageDays = (Date.now() / 1000 - accountCreatedUtc) / (60 * 60 * 24);
          isNewAccount = ageDays < 90;
        }

        const { score, flags } = calculatePromotionScore(combinedText, {
          isPromotionSubreddit: promotionSubreddits.has(subreddit),
          isNewAccount,
          hasHighEngagement: d.score > 100,
        });

        // Layer on Reddit-specific pattern detection
        const { scoreBonus: platformBonus, flags: platformFlags } =
          calculatePlatformSpecificScore(combinedText, 'reddit');
        flags.push(...platformFlags);

        const finalScore = Math.min(score + platformBonus, 100);

        mentions.push({
          platform: 'Reddit',
          source: `r/${d.subreddit}`,
          discoveredVia: 'reddit_public',
          title,
          content: (selftext || title).substring(0, 500),
          url: permalink,
          author: d.author || 'unknown',
          postDate: new Date(d.created_utc * 1000).toISOString(),
          engagement: {
            upvotes: d.score,
            comments: d.num_comments,
          },
          sentiment: finalScore > 30 ? 'bullish' : 'neutral',
          isPromotional: finalScore >= 30,
          promotionScore: finalScore,
          redFlags: flags,
        });
      }

      await sleep(REQUEST_DELAY_MS);
    } catch (error) {
      console.error(`    [Reddit] Search error for "${query}":`, error);
    }
  }

  return mentions;
}

async function scanSubredditForTickers(
  subreddit: string,
  targets: ScanTarget[]
): Promise<SocialMention[]> {
  const mentions: SocialMention[] = [];
  const promotionSubreddits = new Set(PROMOTION_SUBREDDITS);

  try {
    const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=100`;
    const data = await redditPublicGet(url);

    const posts = data?.data?.children || [];

    for (const post of posts) {
      const d = post.data;
      const title = d.title || '';
      const selftext = d.selftext || '';
      const combinedText = `${title} ${selftext}`.toLowerCase();

      // Check if any of our target tickers are mentioned
      for (const target of targets) {
        const tickerLower = target.ticker.toLowerCase();
        if (!combinedText.includes(tickerLower) && !combinedText.includes(`$${tickerLower}`)) {
          continue;
        }

        const { score, flags } = calculatePromotionScore(combinedText, {
          isPromotionSubreddit: promotionSubreddits.has(subreddit.toLowerCase()),
          hasHighEngagement: d.score > 50,
        });

        // Layer on Reddit-specific pattern detection
        const { scoreBonus: platformBonus, flags: platformFlags } =
          calculatePlatformSpecificScore(combinedText, 'reddit');
        flags.push(...platformFlags);

        const finalScore = Math.min(score + platformBonus, 100);

        mentions.push({
          platform: 'Reddit',
          source: `r/${subreddit}`,
          discoveredVia: 'reddit_public',
          title,
          content: (selftext || title).substring(0, 500),
          url: `https://reddit.com${d.permalink}`,
          author: d.author || 'unknown',
          postDate: new Date(d.created_utc * 1000).toISOString(),
          engagement: {
            upvotes: d.score,
            comments: d.num_comments,
          },
          sentiment: finalScore > 30 ? 'bullish' : 'neutral',
          isPromotional: finalScore >= 30,
          promotionScore: finalScore,
          redFlags: flags,
        });
      }
    }
  } catch (error) {
    console.error(`    [Reddit] Subreddit scan error for r/${subreddit}:`, error);
  }

  return mentions;
}

export class RedditOAuthScanner implements SocialScanner {
  name = 'reddit_public';
  platform = 'Reddit';

  isConfigured(): boolean {
    // No credentials needed — always configured
    return true;
  }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const results: PlatformScanResult[] = [];

    console.log(`  [Reddit Public JSON] Scanning ${targets.length} tickers (no OAuth required)...`);

    // Strategy 1: Direct search for each ticker
    const allMentions: SocialMention[] = [];

    for (const target of targets) {
      console.log(`    Searching for ${target.ticker}...`);
      const mentions = await searchRedditForTicker(target);
      allMentions.push(...mentions);
      await sleep(500);
    }

    // Strategy 2: Scan top promotion subreddits for any of our tickers
    const topSubreddits = ['wallstreetbets', 'pennystocks', 'shortsqueeze', 'smallstreetbets', 'daytrading'];
    for (const sub of topSubreddits) {
      console.log(`    Monitoring r/${sub}...`);
      const subMentions = await scanSubredditForTickers(sub, targets);
      // Deduplicate by URL
      const existingUrls = new Set(allMentions.map(m => m.url));
      for (const mention of subMentions) {
        if (!existingUrls.has(mention.url)) {
          allMentions.push(mention);
          existingUrls.add(mention.url);
        }
      }
      await sleep(REQUEST_DELAY_MS);
    }

    // Group by ticker for results
    const mentionsByTicker = new Map<string, SocialMention[]>();
    for (const mention of allMentions) {
      // Find which ticker this mention belongs to
      for (const target of targets) {
        const lower = `${mention.title} ${mention.content}`.toLowerCase();
        if (lower.includes(target.ticker.toLowerCase())) {
          if (!mentionsByTicker.has(target.ticker)) {
            mentionsByTicker.set(target.ticker, []);
          }
          mentionsByTicker.get(target.ticker)!.push(mention);
          break;
        }
      }
    }

    // Build result
    const avgScore = allMentions.length > 0
      ? allMentions.reduce((sum, m) => sum + m.promotionScore, 0) / allMentions.length
      : 0;

    results.push({
      platform: 'Reddit',
      scanner: this.name,
      success: true,
      mentionsFound: allMentions.length,
      mentions: allMentions,
      activityLevel: allMentions.length >= 20 ? 'high'
        : allMentions.length >= 5 ? 'medium'
        : allMentions.length > 0 ? 'low' : 'none',
      promotionRisk: avgScore >= 50 ? 'high'
        : avgScore >= 25 ? 'medium' : 'low',
      scanDuration: Date.now() - startTime,
    });

    return results;
  }
}
