/**
 * YouTube Data API v3 Scanner
 *
 * Searches for stock-related videos promoting specific tickers.
 * Free tier: 10,000 units/day (search = 100 units = 100 searches/day)
 *
 * Env: YOUTUBE_API_KEY
 */

import {
  ScanTarget, PlatformScanResult, SocialMention,
  calculatePromotionScore, calculatePlatformSpecificScore, SocialScanner
} from './types';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

function getOneWeekAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString();
}

async function youtubeSearch(apiKey: string, query: string, maxResults: number = 10): Promise<any> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    order: 'date',
    publishedAfter: getOneWeekAgo(),
    maxResults: String(maxResults),
    key: apiKey,
  });

  const response = await fetch(`${YOUTUBE_API_BASE}/search?${params}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `YouTube API ${response.status}`);
  }
  return response.json();
}

async function getVideoStats(apiKey: string, videoIds: string[]): Promise<Map<string, any>> {
  if (videoIds.length === 0) return new Map();

  const params = new URLSearchParams({
    part: 'statistics',
    id: videoIds.join(','),
    key: apiKey,
  });

  try {
    const response = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`);
    if (!response.ok) return new Map();
    const data = await response.json();
    const statsMap = new Map();
    for (const item of (data.items || [])) {
      statsMap.set(item.id, item.statistics);
    }
    return statsMap;
  } catch {
    return new Map();
  }
}

export class YouTubeScanner implements SocialScanner {
  name = 'youtube_api';
  platform = 'YouTube';

  isConfigured(): boolean {
    return !!process.env.YOUTUBE_API_KEY;
  }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return [{
        platform: 'YouTube',
        scanner: this.name,
        success: false,
        error: 'YouTube API key not configured',
        mentionsFound: 0,
        mentions: [],
        activityLevel: 'none',
        promotionRisk: 'low',
        scanDuration: Date.now() - startTime,
      }];
    }

    console.log(`  [YouTube] Scanning ${targets.length} tickers...`);

    const allMentions: SocialMention[] = [];

    for (const target of targets) {
      try {
        console.log(`    Searching YouTube for ${target.ticker}...`);

        // Search with ticker + stock
        const data = await youtubeSearch(apiKey, `${target.ticker} stock`, 10);
        const videos = data.items || [];

        // Get video stats for engagement data
        const videoIds = videos.map((v: any) => v.id?.videoId).filter(Boolean);
        const statsMap = await getVideoStats(apiKey, videoIds);

        for (const video of videos) {
          const snippet = video.snippet;
          if (!snippet) continue;

          const title = snippet.title || '';
          const description = snippet.description || '';
          const combinedText = `${title} ${description}`;

          // Verify ticker is mentioned (not just generic stock video)
          const lower = combinedText.toLowerCase();
          const tickerLower = target.ticker.toLowerCase();
          if (!lower.includes(tickerLower)) continue;

          const { score, flags } = calculatePromotionScore(combinedText);

          // Layer on YouTube-specific pattern detection
          const { scoreBonus: platformBonus, flags: platformFlags } =
            calculatePlatformSpecificScore(combinedText, 'youtube');
          flags.push(...platformFlags);

          // Extra YouTube-specific red flags (legacy checks kept for continuity)
          if (title.includes('🚀') || title.includes('💰') || title.includes('🔥') || title.includes('💎')) {
            flags.push('Clickbait emojis in title');
          }
          const capsRatio = (title.match(/[A-Z]/g) || []).length / Math.max(title.length, 1);
          if (capsRatio > 0.6) {
            flags.push('Excessive caps in title');
          }

          const finalScore = Math.min(
            score + platformBonus +
            (flags.includes('Clickbait emojis in title') ? 10 : 0) +
            (flags.includes('Excessive caps in title') ? 10 : 0),
            100
          );

          const videoId = video.id?.videoId;
          const stats = videoId ? statsMap.get(videoId) : null;

          allMentions.push({
            platform: 'YouTube',
            source: snippet.channelTitle || 'Unknown Channel',
            discoveredVia: 'youtube_api',
            title,
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
            isPromotional: finalScore >= 30,
            promotionScore: finalScore,
            redFlags: flags,
          });
        }

        // Rate limit: search costs 100 units, video stats costs 1 unit per video
        await new Promise(r => setTimeout(r, 200));
      } catch (error: any) {
        console.error(`YouTube scan error for ${target.ticker}:`, error.message);
      }
    }

    const avgScore = allMentions.length > 0
      ? allMentions.reduce((sum, m) => sum + m.promotionScore, 0) / allMentions.length
      : 0;

    return [{
      platform: 'YouTube',
      scanner: this.name,
      success: true,
      mentionsFound: allMentions.length,
      mentions: allMentions,
      activityLevel: allMentions.length >= 10 ? 'high'
        : allMentions.length >= 3 ? 'medium'
        : allMentions.length > 0 ? 'low' : 'none',
      promotionRisk: avgScore >= 40 ? 'high'
        : avgScore >= 20 ? 'medium' : 'low',
      scanDuration: Date.now() - startTime,
    }];
  }
}
