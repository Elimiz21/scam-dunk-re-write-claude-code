/**
 * Reddit OAuth Scanner
 *
 * Uses Reddit OAuth2 "script" app for authenticated API access.
 * Provides 60 requests/min vs 10/min for unauthenticated access.
 *
 * Setup: Register app at https://www.reddit.com/prefs/apps (script type)
 * Env: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
 */

import {
  ScanTarget, PlatformScanResult, SocialMention,
  PROMOTION_SUBREDDITS, calculatePromotionScore, SocialScanner
} from './types';

const REDDIT_AUTH_URL = 'https://www.reddit.com/api/v1/access_token';
const REDDIT_API_BASE = 'https://oauth.reddit.com';
const USER_AGENT = 'ScamDunk/1.0 (Social Media Scanner)';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;

  if (!clientId || !clientSecret || !username || !password) {
    return null;
  }

  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(REDDIT_AUTH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    });

    if (!response.ok) {
      console.error(`Reddit auth failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    };
    return cachedToken.token;
  } catch (error) {
    console.error('Reddit OAuth error:', error);
    return null;
  }
}

async function redditApiGet(endpoint: string, token: string): Promise<any> {
  const response = await fetch(`${REDDIT_API_BASE}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Reddit API ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchRedditForTicker(
  token: string,
  target: ScanTarget
): Promise<SocialMention[]> {
  const mentions: SocialMention[] = [];
  const { ticker, name } = target;

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
      const data = await redditApiGet(
        `/search?q=${encodeURIComponent(query)}&sort=new&t=week&limit=25&type=link`,
        token
      );

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

        mentions.push({
          platform: 'Reddit',
          source: `r/${d.subreddit}`,
          discoveredVia: 'reddit_oauth',
          title,
          content: (selftext || title).substring(0, 500),
          url: permalink,
          author: d.author || 'unknown',
          postDate: new Date(d.created_utc * 1000).toISOString(),
          engagement: {
            upvotes: d.score,
            comments: d.num_comments,
          },
          sentiment: score > 30 ? 'bullish' : 'neutral',
          isPromotional: score >= 30,
          promotionScore: score,
          redFlags: flags,
        });
      }

      await sleep(1100); // Stay within 60 req/min
    } catch (error) {
      console.error(`Reddit search error for "${query}":`, error);
    }
  }

  return mentions;
}

async function scanSubredditForTickers(
  token: string,
  subreddit: string,
  targets: ScanTarget[]
): Promise<SocialMention[]> {
  const mentions: SocialMention[] = [];
  const tickerSet = new Set(targets.map(t => t.ticker.toLowerCase()));
  const promotionSubreddits = new Set(PROMOTION_SUBREDDITS);

  try {
    const data = await redditApiGet(
      `/r/${subreddit}/new?limit=100`,
      token
    );

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

        mentions.push({
          platform: 'Reddit',
          source: `r/${subreddit}`,
          discoveredVia: 'reddit_oauth',
          title,
          content: (selftext || title).substring(0, 500),
          url: `https://reddit.com${d.permalink}`,
          author: d.author || 'unknown',
          postDate: new Date(d.created_utc * 1000).toISOString(),
          engagement: {
            upvotes: d.score,
            comments: d.num_comments,
          },
          sentiment: score > 30 ? 'bullish' : 'neutral',
          isPromotional: score >= 30,
          promotionScore: score,
          redFlags: flags,
        });
      }
    }
  } catch (error) {
    console.error(`Subreddit scan error for r/${subreddit}:`, error);
  }

  return mentions;
}

export class RedditOAuthScanner implements SocialScanner {
  name = 'reddit_oauth';
  platform = 'Reddit';

  isConfigured(): boolean {
    return !!(
      process.env.REDDIT_CLIENT_ID &&
      process.env.REDDIT_CLIENT_SECRET &&
      process.env.REDDIT_USERNAME &&
      process.env.REDDIT_PASSWORD
    );
  }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const results: PlatformScanResult[] = [];

    const token = await getAccessToken();
    if (!token) {
      return [{
        platform: 'Reddit',
        scanner: this.name,
        success: false,
        error: 'Reddit OAuth not configured or authentication failed',
        mentionsFound: 0,
        mentions: [],
        activityLevel: 'none',
        promotionRisk: 'low',
        scanDuration: Date.now() - startTime,
      }];
    }

    console.log(`  [Reddit OAuth] Authenticated. Scanning ${targets.length} tickers...`);

    // Strategy 1: Direct search for each ticker
    const allMentions: SocialMention[] = [];

    for (const target of targets) {
      console.log(`    Searching for ${target.ticker}...`);
      const mentions = await searchRedditForTicker(token, target);
      allMentions.push(...mentions);
      await sleep(500);
    }

    // Strategy 2: Scan top promotion subreddits for any of our tickers
    const topSubreddits = ['wallstreetbets', 'pennystocks', 'shortsqueeze', 'smallstreetbets', 'daytrading'];
    for (const sub of topSubreddits) {
      console.log(`    Monitoring r/${sub}...`);
      const subMentions = await scanSubredditForTickers(token, sub, targets);
      // Deduplicate by URL
      const existingUrls = new Set(allMentions.map(m => m.url));
      for (const mention of subMentions) {
        if (!existingUrls.has(mention.url)) {
          allMentions.push(mention);
          existingUrls.add(mention.url);
        }
      }
      await sleep(1100);
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
