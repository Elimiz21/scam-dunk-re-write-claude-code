/**
 * Perplexity API Researcher
 *
 * Uses Perplexity's Sonar model for web-grounded search.
 * Returns real URLs and citations, not hallucinated data.
 *
 * Pricing: ~$1/1000 searches with sonar model
 * Env: PERPLEXITY_API_KEY
 */

import {
  ScanTarget, PlatformScanResult, SocialMention,
  calculatePromotionScore, SocialScanner
} from './types';

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

interface PerplexityResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  citations?: string[];
}

async function queryPerplexity(apiKey: string, prompt: string): Promise<PerplexityResponse | null> {
  try {
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a stock market social media researcher. Find REAL, CURRENT social media mentions of specific stock tickers. Only report mentions you can verify with actual URLs. Respond ONLY in valid JSON format.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        return_citations: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Perplexity API error ${response.status}: ${error}`);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('Perplexity query error:', error);
    return null;
  }
}

function parsePerplexityResponse(
  response: PerplexityResponse,
  ticker: string,
  citations: string[]
): SocialMention[] {
  const mentions: SocialMention[] = [];

  try {
    const content = response.choices[0]?.message?.content || '';

    // Try to parse as JSON
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return mentions;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return mentions;

    for (const item of parsed) {
      if (!item.url && !item.platform) continue;

      // Determine platform from URL or stated platform
      let platform: SocialMention['platform'] = 'Web';
      const url = (item.url || '').toLowerCase();
      if (url.includes('reddit.com')) platform = 'Reddit';
      else if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'YouTube';
      else if (url.includes('twitter.com') || url.includes('x.com')) platform = 'Twitter';
      else if (url.includes('stocktwits.com')) platform = 'StockTwits';
      else if (url.includes('tiktok.com')) platform = 'TikTok';
      else if (url.includes('discord.com') || url.includes('discord.gg')) platform = 'Discord';
      else if (item.platform) {
        const p = item.platform.toLowerCase();
        if (p.includes('reddit')) platform = 'Reddit';
        else if (p.includes('youtube')) platform = 'YouTube';
        else if (p.includes('twitter') || p.includes('x')) platform = 'Twitter';
        else if (p.includes('stocktwits')) platform = 'StockTwits';
        else if (p.includes('tiktok')) platform = 'TikTok';
        else if (p.includes('discord')) platform = 'Discord';
        else platform = 'Forum';
      }

      const text = `${item.title || ''} ${item.content || item.summary || ''}`;
      const { score, flags } = calculatePromotionScore(text);

      mentions.push({
        platform,
        source: item.source || item.subreddit || item.channel || platform,
        discoveredVia: 'perplexity',
        title: item.title || '',
        content: (item.content || item.summary || '').substring(0, 500),
        url: item.url || '',
        author: item.author || item.username || 'unknown',
        postDate: item.date || item.posted || new Date().toISOString(),
        engagement: {
          upvotes: item.upvotes || item.score || undefined,
          comments: item.comments || item.replies || undefined,
          views: item.views || undefined,
          likes: item.likes || undefined,
        },
        sentiment: score > 30 ? 'bullish' : item.sentiment || 'neutral',
        isPromotional: score >= 25,
        promotionScore: score,
        redFlags: flags,
      });
    }
  } catch (error) {
    console.error('Failed to parse Perplexity response:', error);
  }

  // Also create mentions from citations that weren't in the parsed JSON
  for (const citationUrl of citations) {
    const alreadyHasUrl = mentions.some(m => m.url === citationUrl);
    if (alreadyHasUrl) continue;

    let platform: SocialMention['platform'] = 'Web';
    const url = citationUrl.toLowerCase();
    if (url.includes('reddit.com')) platform = 'Reddit';
    else if (url.includes('youtube.com')) platform = 'YouTube';
    else if (url.includes('twitter.com') || url.includes('x.com')) platform = 'Twitter';
    else if (url.includes('stocktwits.com')) platform = 'StockTwits';
    else if (url.includes('tiktok.com')) platform = 'TikTok';
    else continue; // Skip non-social-media citations

    mentions.push({
      platform,
      source: platform,
      discoveredVia: 'perplexity',
      title: `${ticker} mention found via web search`,
      content: `Social media mention found at: ${citationUrl}`,
      url: citationUrl,
      author: 'unknown',
      postDate: new Date().toISOString(),
      engagement: {},
      sentiment: 'neutral',
      isPromotional: false,
      promotionScore: 0,
      redFlags: [],
    });
  }

  return mentions;
}

export class PerplexityResearcher implements SocialScanner {
  name = 'perplexity';
  platform = 'Multi-Platform';

  isConfigured(): boolean {
    return !!process.env.PERPLEXITY_API_KEY;
  }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const apiKey = process.env.PERPLEXITY_API_KEY;

    if (!apiKey) {
      return [{
        platform: 'Multi-Platform (Perplexity)',
        scanner: this.name,
        success: false,
        error: 'Perplexity API key not configured',
        mentionsFound: 0,
        mentions: [],
        activityLevel: 'none',
        promotionRisk: 'low',
        scanDuration: Date.now() - startTime,
      }];
    }

    console.log(`  [Perplexity] Researching ${targets.length} tickers across social media...`);

    const allMentions: SocialMention[] = [];

    // Batch tickers in groups of 5 to be efficient with API calls
    const batchSize = 5;
    for (let i = 0; i < targets.length; i += batchSize) {
      const batch = targets.slice(i, i + batchSize);
      const tickerList = batch.map(t => `$${t.ticker} (${t.name})`).join(', ');

      const prompt = `Search for recent social media mentions (past 7 days) of these stock tickers: ${tickerList}

Look on these platforms specifically:
- Reddit (especially r/wallstreetbets, r/pennystocks, r/shortsqueeze, r/stocks)
- Twitter/X (cashtags like $${batch.map(t => t.ticker).join(', $')})
- YouTube (stock analysis/promotion videos)
- StockTwits
- TikTok (stock tips)
- Discord (public trading servers)

For each mention found, return a JSON array with objects containing:
{
  "ticker": "SYMBOL",
  "platform": "Reddit|Twitter|YouTube|StockTwits|TikTok|Discord",
  "source": "specific subreddit, channel, or account",
  "title": "post title or first line",
  "content": "brief summary of the post",
  "url": "actual URL to the post",
  "author": "username",
  "date": "ISO date string",
  "upvotes": number or null,
  "comments": number or null,
  "views": number or null,
  "sentiment": "bullish|bearish|neutral"
}

IMPORTANT: Only include REAL mentions with actual URLs. Do not fabricate or guess. If you find no mentions, return an empty array [].

Return ONLY the JSON array, no other text.`;

      console.log(`    Batch ${Math.floor(i / batchSize) + 1}: ${batch.map(t => t.ticker).join(', ')}...`);

      const response = await queryPerplexity(apiKey, prompt);
      if (response) {
        const citations = response.citations || [];
        for (const target of batch) {
          const mentions = parsePerplexityResponse(response, target.ticker, citations);
          // Filter to only mentions relevant to this ticker
          const relevant = mentions.filter(m => {
            const text = `${m.title} ${m.content} ${m.url}`.toLowerCase();
            return text.includes(target.ticker.toLowerCase());
          });
          allMentions.push(...relevant);
        }
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 1000));
    }

    const avgScore = allMentions.length > 0
      ? allMentions.reduce((sum, m) => sum + m.promotionScore, 0) / allMentions.length
      : 0;

    return [{
      platform: 'Multi-Platform (Perplexity)',
      scanner: this.name,
      success: true,
      mentionsFound: allMentions.length,
      mentions: allMentions,
      activityLevel: allMentions.length >= 15 ? 'high'
        : allMentions.length >= 5 ? 'medium'
        : allMentions.length > 0 ? 'low' : 'none',
      promotionRisk: avgScore >= 40 ? 'high'
        : avgScore >= 20 ? 'medium' : 'low',
      scanDuration: Date.now() - startTime,
    }];
  }
}
