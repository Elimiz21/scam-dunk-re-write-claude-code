/**
 * Social Media Scanners for server-side use in Next.js API routes.
 *
 * Each scanner implements the SocialScanner interface and searches
 * a specific platform for stock ticker mentions and promotional activity.
 */

import {
  ScanTarget, PlatformScanResult, SocialMention,
  SocialScanner, calculatePromotionScore, PROMOTION_SUBREDDITS,
} from './types';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────
// Reddit Public JSON Scanner (no OAuth needed)
// ─────────────────────────────────────────────────────────────

const REDDIT_USER_AGENT = 'Mozilla/5.0 (compatible; ScamDunk/1.0; Stock Research Tool)';
const REDDIT_DELAY_MS = 6500;

async function redditGet(url: string): Promise<any> {
  const headers = { 'User-Agent': REDDIT_USER_AGENT, 'Accept': 'application/json' };
  let response = await fetch(url, { headers });

  if (response.status === 429) {
    await sleep(10000);
    response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Reddit ${response.status} after retry`);
  }
  if (!response.ok) throw new Error(`Reddit ${response.status}: ${response.statusText}`);
  return response.json();
}

export class RedditScanner implements SocialScanner {
  name = 'reddit_public';
  platform = 'Reddit';

  isConfigured() { return true; }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const allMentions: SocialMention[] = [];
    const promotionSubs = new Set(PROMOTION_SUBREDDITS);

    for (const target of targets) {
      const queries = [target.ticker, `$${target.ticker}`, `${target.ticker} stock`];
      const seenUrls = new Set<string>();

      for (const query of queries) {
        try {
          const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&t=week&limit=25&type=link`;
          const data = await redditGet(url);

          for (const post of (data?.data?.children || [])) {
            const d = post.data;
            const permalink = `https://reddit.com${d.permalink}`;
            if (seenUrls.has(permalink)) continue;

            const subreddit = (d.subreddit || '').toLowerCase();
            const title = d.title || '';
            const selftext = d.selftext || '';
            const combined = `${title} ${selftext}`.toLowerCase();
            const tickerLower = target.ticker.toLowerCase();

            if (!combined.includes(tickerLower) && !combined.includes(`$${tickerLower}`)) continue;
            seenUrls.add(permalink);

            const accountCreatedUtc = d.author_created_utc;
            const isNewAccount = accountCreatedUtc
              ? (Date.now() / 1000 - accountCreatedUtc) / 86400 < 90
              : false;

            const { score, flags } = calculatePromotionScore(`${title} ${selftext}`, {
              isPromotionSubreddit: promotionSubs.has(subreddit),
              isNewAccount,
              hasHighEngagement: d.score > 100,
            });

            allMentions.push({
              platform: 'Reddit', source: `r/${d.subreddit}`, discoveredVia: 'reddit_public',
              title, content: (selftext || title).substring(0, 500), url: permalink,
              author: d.author || 'unknown',
              postDate: new Date(d.created_utc * 1000).toISOString(),
              engagement: { upvotes: d.score, comments: d.num_comments },
              sentiment: score > 30 ? 'bullish' : 'neutral',
              isPromotional: score >= 30, promotionScore: score, redFlags: flags,
            });
          }
          await sleep(REDDIT_DELAY_MS);
        } catch (error: any) {
          console.error(`[Reddit] Search error for "${query}":`, error.message);
        }
      }
    }

    // Also scan top subreddits
    const topSubs = ['wallstreetbets', 'pennystocks', 'shortsqueeze', 'smallstreetbets', 'daytrading'];
    for (const sub of topSubs) {
      try {
        const data = await redditGet(`https://www.reddit.com/r/${sub}/new.json?limit=100`);
        for (const post of (data?.data?.children || [])) {
          const d = post.data;
          const title = d.title || '';
          const selftext = d.selftext || '';
          const combined = `${title} ${selftext}`.toLowerCase();

          for (const target of targets) {
            const tickerLower = target.ticker.toLowerCase();
            if (!combined.includes(tickerLower) && !combined.includes(`$${tickerLower}`)) continue;

            const permalink = `https://reddit.com${d.permalink}`;
            if (allMentions.some(m => m.url === permalink)) continue;

            const { score, flags } = calculatePromotionScore(`${title} ${selftext}`, {
              isPromotionSubreddit: promotionSubs.has(sub),
              hasHighEngagement: d.score > 50,
            });

            allMentions.push({
              platform: 'Reddit', source: `r/${sub}`, discoveredVia: 'reddit_public',
              title, content: (selftext || title).substring(0, 500), url: permalink,
              author: d.author || 'unknown',
              postDate: new Date(d.created_utc * 1000).toISOString(),
              engagement: { upvotes: d.score, comments: d.num_comments },
              sentiment: score > 30 ? 'bullish' : 'neutral',
              isPromotional: score >= 30, promotionScore: score, redFlags: flags,
            });
            break;
          }
        }
        await sleep(REDDIT_DELAY_MS);
      } catch (error: any) {
        console.error(`[Reddit] Subreddit error for r/${sub}:`, error.message);
      }
    }

    const avgScore = allMentions.length > 0
      ? allMentions.reduce((s, m) => s + m.promotionScore, 0) / allMentions.length : 0;

    return [{
      platform: 'Reddit', scanner: this.name, success: true,
      mentionsFound: allMentions.length, mentions: allMentions,
      activityLevel: allMentions.length >= 20 ? 'high' : allMentions.length >= 5 ? 'medium' : allMentions.length > 0 ? 'low' : 'none',
      promotionRisk: avgScore >= 50 ? 'high' : avgScore >= 25 ? 'medium' : 'low',
      scanDuration: Date.now() - startTime,
    }];
  }
}

// ─────────────────────────────────────────────────────────────
// YouTube Data API v3 Scanner
// ─────────────────────────────────────────────────────────────

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

export class YouTubeScanner implements SocialScanner {
  name = 'youtube_api';
  platform = 'YouTube';

  isConfigured() { return !!process.env.YOUTUBE_API_KEY; }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const apiKey = process.env.YOUTUBE_API_KEY!;
    const allMentions: SocialMention[] = [];

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    for (const target of targets) {
      try {
        const params = new URLSearchParams({
          part: 'snippet', q: `${target.ticker} stock`, type: 'video',
          order: 'date', publishedAfter: oneWeekAgo.toISOString(),
          maxResults: '10', key: apiKey,
        });
        const res = await fetch(`${YT_API_BASE}/search?${params}`);
        if (!res.ok) continue;
        const data = await res.json();
        const videos = data.items || [];

        // Get stats
        const videoIds = videos.map((v: any) => v.id?.videoId).filter(Boolean);
        const statsMap = new Map<string, any>();
        if (videoIds.length > 0) {
          const statsParams = new URLSearchParams({
            part: 'statistics', id: videoIds.join(','), key: apiKey,
          });
          const statsRes = await fetch(`${YT_API_BASE}/videos?${statsParams}`);
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            for (const item of (statsData.items || [])) statsMap.set(item.id, item.statistics);
          }
        }

        for (const video of videos) {
          const snippet = video.snippet;
          if (!snippet) continue;
          const title = snippet.title || '';
          const description = snippet.description || '';
          const combined = `${title} ${description}`.toLowerCase();
          if (!combined.includes(target.ticker.toLowerCase())) continue;

          const { score, flags } = calculatePromotionScore(`${title} ${description}`);
          if (title.includes('🚀') || title.includes('💰') || title.includes('🔥') || title.includes('💎'))
            flags.push('Clickbait emojis in title');
          const capsRatio = (title.match(/[A-Z]/g) || []).length / Math.max(title.length, 1);
          if (capsRatio > 0.6) flags.push('Excessive caps in title');

          const finalScore = Math.min(score + (flags.includes('Clickbait emojis in title') ? 10 : 0) + (flags.includes('Excessive caps in title') ? 10 : 0), 100);
          const videoId = video.id?.videoId;
          const stats = videoId ? statsMap.get(videoId) : null;

          allMentions.push({
            platform: 'YouTube', source: snippet.channelTitle || 'Unknown Channel',
            discoveredVia: 'youtube_api', title,
            content: description.substring(0, 500),
            url: videoId ? `https://youtube.com/watch?v=${videoId}` : '',
            author: snippet.channelTitle || 'unknown',
            postDate: snippet.publishedAt || new Date().toISOString(),
            engagement: {
              views: stats ? parseInt(stats.viewCount || '0') : undefined,
              likes: stats ? parseInt(stats.likeCount || '0') : undefined,
              comments: stats ? parseInt(stats.commentCount || '0') : undefined,
            },
            sentiment: finalScore > 25 ? 'bullish' : 'neutral',
            isPromotional: finalScore >= 30, promotionScore: finalScore, redFlags: flags,
          });
        }
        await sleep(200);
      } catch (error: any) {
        console.error(`[YouTube] Error for ${target.ticker}:`, error.message);
      }
    }

    const avgScore = allMentions.length > 0
      ? allMentions.reduce((s, m) => s + m.promotionScore, 0) / allMentions.length : 0;

    return [{
      platform: 'YouTube', scanner: this.name, success: true,
      mentionsFound: allMentions.length, mentions: allMentions,
      activityLevel: allMentions.length >= 10 ? 'high' : allMentions.length >= 3 ? 'medium' : allMentions.length > 0 ? 'low' : 'none',
      promotionRisk: avgScore >= 40 ? 'high' : avgScore >= 20 ? 'medium' : 'low',
      scanDuration: Date.now() - startTime,
    }];
  }
}

// ─────────────────────────────────────────────────────────────
// StockTwits Scanner (no API key needed)
// ─────────────────────────────────────────────────────────────

export class StockTwitsScanner implements SocialScanner {
  name = 'stocktwits';
  platform = 'StockTwits';

  isConfigured() { return true; }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const allMentions: SocialMention[] = [];
    let hasErrors = false;

    for (const target of targets) {
      try {
        const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(target.ticker)}.json`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
        });

        if (!response.ok) { hasErrors = true; continue; }
        const text = await response.text();
        if (text.startsWith('<')) { hasErrors = true; continue; }

        const data = JSON.parse(text);
        if (data.response?.status !== 200) continue;

        for (const msg of (data.messages || [])) {
          const body = msg.body || '';
          const { score, flags } = calculatePromotionScore(body);

          const followers = msg.user?.followers || 0;
          if (followers < 10) flags.push('Low follower account');
          if (msg.user?.join_date) {
            const daysSince = (Date.now() - new Date(msg.user.join_date).getTime()) / 86400000;
            if (daysSince < 30) flags.push('Account < 30 days old');
          }

          const stSentiment = msg.entities?.sentiment?.basic;
          const sentiment = stSentiment === 'Bullish' ? 'bullish' as const
            : stSentiment === 'Bearish' ? 'bearish' as const : 'neutral' as const;

          const finalScore = Math.min(score + (followers < 10 ? 10 : 0) + (flags.includes('Account < 30 days old') ? 15 : 0), 100);

          allMentions.push({
            platform: 'StockTwits', source: 'StockTwits Feed', discoveredVia: 'stocktwits',
            title: '', content: body.substring(0, 500),
            url: `https://stocktwits.com/symbol/${target.ticker}`,
            author: msg.user?.username || 'unknown',
            postDate: msg.created_at || new Date().toISOString(),
            engagement: { likes: msg.likes?.total || 0 },
            sentiment, isPromotional: finalScore >= 30,
            promotionScore: finalScore, redFlags: flags,
          });
        }
        await sleep(2000);
      } catch (error: any) {
        console.error(`[StockTwits] Error for ${target.ticker}:`, error.message);
        hasErrors = true;
      }
    }

    const avgScore = allMentions.length > 0
      ? allMentions.reduce((s, m) => s + m.promotionScore, 0) / allMentions.length : 0;

    return [{
      platform: 'StockTwits', scanner: this.name,
      success: allMentions.length > 0 || !hasErrors,
      error: hasErrors ? 'Some tickers failed (possibly rate limited)' : undefined,
      mentionsFound: allMentions.length, mentions: allMentions,
      activityLevel: allMentions.length >= 30 ? 'high' : allMentions.length >= 10 ? 'medium' : allMentions.length > 0 ? 'low' : 'none',
      promotionRisk: avgScore >= 40 ? 'high' : avgScore >= 20 ? 'medium' : 'low',
      scanDuration: Date.now() - startTime,
    }];
  }
}

// ─────────────────────────────────────────────────────────────
// Google Custom Search Engine Scanner
// ─────────────────────────────────────────────────────────────

const SOCIAL_DOMAINS = [
  'reddit.com', 'twitter.com', 'x.com', 'youtube.com', 'stocktwits.com',
  'tiktok.com', 'discord.com', 'facebook.com', 'instagram.com', 'threads.net',
  'seekingalpha.com', 'investorshub.advfn.com', 'finance.yahoo.com',
];

function detectPlatform(url: string): SocialMention['platform'] {
  const lower = url.toLowerCase();
  if (lower.includes('reddit.com')) return 'Reddit';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'Twitter';
  if (lower.includes('stocktwits.com')) return 'StockTwits';
  if (lower.includes('tiktok.com')) return 'TikTok';
  if (lower.includes('discord.com') || lower.includes('discord.gg')) return 'Discord';
  return 'Forum';
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
  try { return new URL(url).hostname; } catch { return 'Unknown'; }
}

export class GoogleCSEScanner implements SocialScanner {
  name = 'google_cse';
  platform = 'Multi-Platform';

  isConfigured() { return !!(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ID); }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const apiKey = process.env.GOOGLE_CSE_API_KEY!;
    const cseId = process.env.GOOGLE_CSE_ID!;
    const allMentions: SocialMention[] = [];
    const seenUrls = new Set<string>();

    for (const target of targets) {
      const siteQueries = SOCIAL_DOMAINS.map(d => `site:${d}`).join(' OR ');
      const query = `"${target.ticker}" stock (${siteQueries})`;

      try {
        const params = new URLSearchParams({
          key: apiKey, cx: cseId, q: query, num: '10', sort: 'date', dateRestrict: 'w1',
        });
        const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
        if (!res.ok) continue;
        const data = await res.json();

        for (const result of (data.items || [])) {
          const url = result.link || '';
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          const title = result.title || '';
          const snippet = result.snippet || '';
          const combined = `${title} ${snippet}`.toLowerCase();
          const tickerLower = target.ticker.toLowerCase();
          if (!combined.includes(tickerLower) && !combined.includes(`$${tickerLower}`)) continue;

          const platform = detectPlatform(url);
          const source = detectSource(url);
          const { score, flags } = calculatePromotionScore(`${title} ${snippet}`);

          let postDate = new Date().toISOString();
          if (result.pagemap?.metatags?.[0]) {
            const meta = result.pagemap.metatags[0];
            postDate = meta['article:published_time'] || meta['og:updated_time'] || postDate;
          }

          allMentions.push({
            platform, source, discoveredVia: 'google_cse',
            title: title.substring(0, 300), content: snippet.substring(0, 500),
            url, author: 'unknown', postDate, engagement: {},
            sentiment: score > 25 ? 'bullish' : 'neutral',
            isPromotional: score >= 25, promotionScore: score, redFlags: flags,
          });
        }
      } catch (error: any) {
        console.error(`[Google CSE] Error for ${target.ticker}:`, error.message);
      }
      await sleep(500);
    }

    const avgScore = allMentions.length > 0
      ? allMentions.reduce((s, m) => s + m.promotionScore, 0) / allMentions.length : 0;

    return [{
      platform: 'Multi-Platform (Google CSE)', scanner: this.name, success: true,
      mentionsFound: allMentions.length, mentions: allMentions,
      activityLevel: allMentions.length >= 20 ? 'high' : allMentions.length >= 5 ? 'medium' : allMentions.length > 0 ? 'low' : 'none',
      promotionRisk: avgScore >= 40 ? 'high' : avgScore >= 20 ? 'medium' : 'low',
      scanDuration: Date.now() - startTime,
    }];
  }
}

// ─────────────────────────────────────────────────────────────
// Perplexity AI Researcher
// ─────────────────────────────────────────────────────────────

export class PerplexityScanner implements SocialScanner {
  name = 'perplexity';
  platform = 'Multi-Platform';

  isConfigured() { return !!process.env.PERPLEXITY_API_KEY; }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const apiKey = process.env.PERPLEXITY_API_KEY!;
    const allMentions: SocialMention[] = [];

    const batchSize = 5;
    for (let i = 0; i < targets.length; i += batchSize) {
      const batch = targets.slice(i, i + batchSize);
      const tickerList = batch.map(t => `$${t.ticker} (${t.name})`).join(', ');

      const prompt = `Search for recent social media mentions (past 7 days) of these stock tickers: ${tickerList}

Look on: Reddit (r/wallstreetbets, r/pennystocks, r/shortsqueeze, r/stocks), Twitter/X (cashtags $${batch.map(t => t.ticker).join(', $')}), YouTube, StockTwits, TikTok, Discord.

For each mention, return a JSON array: [{"ticker":"SYMBOL","platform":"Reddit|Twitter|YouTube|StockTwits|TikTok|Discord","source":"specific subreddit/channel/account","title":"post title","content":"brief summary","url":"actual URL","author":"username","date":"ISO date","upvotes":null,"comments":null,"views":null,"sentiment":"bullish|bearish|neutral"}]

IMPORTANT: Only REAL mentions with actual URLs. Return [] if none found. Return ONLY the JSON array.`;

      try {
        const res = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'sonar', temperature: 0.1, max_tokens: 2000, return_citations: true,
            messages: [
              { role: 'system', content: 'You are a stock market social media researcher. Find REAL, CURRENT social media mentions. Only report verified mentions with actual URLs. Respond ONLY in valid JSON format.' },
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (!res.ok) continue;
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        const citations: string[] = data.citations || [];

        // Parse JSON response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                if (!item.url && !item.platform) continue;

                let platform: SocialMention['platform'] = 'Web';
                const url = (item.url || '').toLowerCase();
                if (url.includes('reddit.com')) platform = 'Reddit';
                else if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'YouTube';
                else if (url.includes('twitter.com') || url.includes('x.com')) platform = 'Twitter';
                else if (url.includes('stocktwits.com')) platform = 'StockTwits';
                else if (url.includes('tiktok.com')) platform = 'TikTok';
                else if (url.includes('discord.com')) platform = 'Discord';

                const text = `${item.title || ''} ${item.content || item.summary || ''}`;
                const { score, flags } = calculatePromotionScore(text);

                allMentions.push({
                  platform, source: item.source || item.subreddit || item.channel || String(platform),
                  discoveredVia: 'perplexity', title: item.title || '',
                  content: (item.content || item.summary || '').substring(0, 500),
                  url: item.url || '', author: item.author || item.username || 'unknown',
                  postDate: item.date || item.posted || new Date().toISOString(),
                  engagement: {
                    upvotes: item.upvotes || item.score || undefined,
                    comments: item.comments || item.replies || undefined,
                    views: item.views || undefined, likes: item.likes || undefined,
                  },
                  sentiment: score > 30 ? 'bullish' : (item.sentiment as any) || 'neutral',
                  isPromotional: score >= 25, promotionScore: score, redFlags: flags,
                });
              }
            }
          } catch { /* parse error — skip */ }
        }

        // Add citations not already captured
        for (const citationUrl of citations) {
          if (allMentions.some(m => m.url === citationUrl)) continue;
          let platform: SocialMention['platform'] = 'Web';
          const url = citationUrl.toLowerCase();
          if (url.includes('reddit.com')) platform = 'Reddit';
          else if (url.includes('youtube.com')) platform = 'YouTube';
          else if (url.includes('twitter.com') || url.includes('x.com')) platform = 'Twitter';
          else if (url.includes('stocktwits.com')) platform = 'StockTwits';
          else if (url.includes('tiktok.com')) platform = 'TikTok';
          else continue;

          allMentions.push({
            platform, source: String(platform), discoveredVia: 'perplexity',
            title: `Stock mention found via web search`, content: `Social media mention found at: ${citationUrl}`,
            url: citationUrl, author: 'unknown', postDate: new Date().toISOString(),
            engagement: {}, sentiment: 'neutral',
            isPromotional: false, promotionScore: 0, redFlags: [],
          });
        }

        await sleep(1000);
      } catch (error: any) {
        console.error(`[Perplexity] Error:`, error.message);
      }
    }

    const avgScore = allMentions.length > 0
      ? allMentions.reduce((s, m) => s + m.promotionScore, 0) / allMentions.length : 0;

    return [{
      platform: 'Multi-Platform (Perplexity)', scanner: this.name, success: true,
      mentionsFound: allMentions.length, mentions: allMentions,
      activityLevel: allMentions.length >= 15 ? 'high' : allMentions.length >= 5 ? 'medium' : allMentions.length > 0 ? 'low' : 'none',
      promotionRisk: avgScore >= 40 ? 'high' : avgScore >= 20 ? 'medium' : 'low',
      scanDuration: Date.now() - startTime,
    }];
  }
}

// ─────────────────────────────────────────────────────────────
// Discord Bot Scanner
// ─────────────────────────────────────────────────────────────

export class DiscordBotScanner implements SocialScanner {
  name = 'discord_bot';
  platform = 'Discord';

  isConfigured() { return !!process.env.DISCORD_BOT_TOKEN; }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const token = process.env.DISCORD_BOT_TOKEN!;
    const allMentions: SocialMention[] = [];

    const discordGet = async (endpoint: string) => {
      const res = await fetch(`https://discord.com/api/v10${endpoint}`, {
        headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`Discord API ${res.status}`);
      return res.json();
    };

    try {
      const guilds = await discordGet('/users/@me/guilds');
      const tickerPatterns = targets.map(t => ({
        target: t, regex: new RegExp(`\\b\\$?${t.ticker}\\b`, 'i'),
      }));

      for (const guild of guilds) {
        try {
          const channels = await discordGet(`/guilds/${guild.id}/channels`);
          const textChannels = channels.filter((c: any) => c.type === 0).slice(0, 10);

          for (const channel of textChannels) {
            try {
              const messages = await discordGet(`/channels/${channel.id}/messages?limit=100`);
              for (const msg of messages) {
                const content = msg.content || '';
                if (!content) continue;

                for (const { target, regex } of tickerPatterns) {
                  if (!regex.test(content)) continue;

                  const { score, flags } = calculatePromotionScore(content);
                  const memberSince = msg.member?.joined_at;
                  if (memberSince) {
                    const daysSince = (Date.now() - new Date(memberSince).getTime()) / 86400000;
                    if (daysSince < 7) flags.push('Recently joined server');
                  }
                  const finalScore = Math.min(score + (flags.includes('Recently joined server') ? 15 : 0), 100);

                  allMentions.push({
                    platform: 'Discord', source: `${guild.name} / #${channel.name}`,
                    discoveredVia: 'discord_bot', title: '', content: content.substring(0, 500),
                    url: `https://discord.com/channels/${guild.id}/${channel.id}/${msg.id}`,
                    author: msg.author?.username || 'unknown',
                    postDate: msg.timestamp || new Date().toISOString(),
                    engagement: { likes: msg.reactions?.reduce((s: number, r: any) => s + (r.count || 0), 0) || 0 },
                    sentiment: finalScore > 30 ? 'bullish' : 'neutral',
                    isPromotional: finalScore >= 30, promotionScore: finalScore, redFlags: flags,
                  });
                  break;
                }
              }
              await sleep(500);
            } catch { /* skip unreadable channels */ }
          }
          await sleep(1000);
        } catch (error: any) {
          console.error(`[Discord] Guild error for ${guild.name}:`, error.message);
        }
      }
    } catch (error: any) {
      return [{
        platform: 'Discord', scanner: this.name, success: false,
        error: `Discord API error: ${error.message}`,
        mentionsFound: 0, mentions: [], activityLevel: 'none', promotionRisk: 'low',
        scanDuration: Date.now() - startTime,
      }];
    }

    const avgScore = allMentions.length > 0
      ? allMentions.reduce((s, m) => s + m.promotionScore, 0) / allMentions.length : 0;

    return [{
      platform: 'Discord', scanner: this.name, success: true,
      mentionsFound: allMentions.length, mentions: allMentions,
      activityLevel: allMentions.length >= 15 ? 'high' : allMentions.length >= 5 ? 'medium' : allMentions.length > 0 ? 'low' : 'none',
      promotionRisk: avgScore >= 40 ? 'high' : avgScore >= 20 ? 'medium' : 'low',
      scanDuration: Date.now() - startTime,
    }];
  }
}

// ─────────────────────────────────────────────────────────────
// Registry: get all configured scanners
// ─────────────────────────────────────────────────────────────

export function getConfiguredScanners(): SocialScanner[] {
  const all: SocialScanner[] = [
    // Layer 1: Broad sweep
    new GoogleCSEScanner(),
    new PerplexityScanner(),
    // Layer 2: Platform-specific
    new RedditScanner(),
    new YouTubeScanner(),
    new StockTwitsScanner(),
    new DiscordBotScanner(),
  ];
  return all.filter(s => s.isConfigured());
}
