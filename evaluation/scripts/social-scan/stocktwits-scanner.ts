/**
 * StockTwits Scanner
 *
 * Uses StockTwits public API to find stock mentions and sentiment.
 * Free API, no authentication required (but may be rate limited).
 *
 * No env vars needed.
 */

import {
  ScanTarget, PlatformScanResult, SocialMention,
  calculatePromotionScore, calculatePlatformSpecificScore, SocialScanner
} from './types';

const STOCKTWITS_API = 'https://api.stocktwits.com/api/2';

export class StockTwitsScanner implements SocialScanner {
  name = 'stocktwits';
  platform = 'StockTwits';

  isConfigured(): boolean {
    return true; // No API key needed
  }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const allMentions: SocialMention[] = [];
    let hasErrors = false;

    console.log(`  [StockTwits] Scanning ${targets.length} tickers...`);

    for (const target of targets) {
      try {
        console.log(`    Fetching ${target.ticker} stream...`);
        const url = `${STOCKTWITS_API}/streams/symbol/${encodeURIComponent(target.ticker)}.json`;

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          console.error(`    StockTwits ${response.status} for ${target.ticker}`);
          hasErrors = true;
          continue;
        }

        const text = await response.text();
        // StockTwits sometimes returns HTML (Cloudflare block)
        if (text.startsWith('<')) {
          console.error(`    StockTwits returned HTML for ${target.ticker} (likely blocked)`);
          hasErrors = true;
          continue;
        }

        const data = JSON.parse(text);
        if (data.response?.status !== 200) {
          continue;
        }

        const messages = data.messages || [];

        for (const msg of messages) {
          const body = msg.body || '';
          const { score, flags } = calculatePromotionScore(body);

          // Layer on StockTwits-specific pattern detection
          const { scoreBonus: platformBonus, flags: platformFlags } =
            calculatePlatformSpecificScore(body, 'stocktwits');
          flags.push(...platformFlags);

          // Additional StockTwits-specific scoring
          const followers = msg.user?.followers || 0;
          if (followers < 10) {
            flags.push('Low follower account');
          }

          if (msg.user?.join_date) {
            const joinDate = new Date(msg.user.join_date);
            const daysSince = (Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince < 30) {
              flags.push('Account < 30 days old');
            }
          }

          const stSentiment = msg.entities?.sentiment?.basic;
          const sentiment = stSentiment === 'Bullish' ? 'bullish'
            : stSentiment === 'Bearish' ? 'bearish' : 'neutral';

          const finalScore = Math.min(
            score +
            platformBonus +
            (followers < 10 ? 10 : 0) +
            (flags.includes('Account < 30 days old') ? 15 : 0),
            100
          );

          allMentions.push({
            platform: 'StockTwits',
            source: 'StockTwits Feed',
            discoveredVia: 'stocktwits',
            title: '',
            content: body.substring(0, 500),
            url: `https://stocktwits.com/symbol/${target.ticker}`,
            author: msg.user?.username || 'unknown',
            postDate: msg.created_at || new Date().toISOString(),
            engagement: {
              likes: msg.likes?.total || 0,
            },
            sentiment,
            isPromotional: finalScore >= 30,
            promotionScore: finalScore,
            redFlags: flags,
          });
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 2000));
      } catch (error: any) {
        console.error(`    StockTwits error for ${target.ticker}:`, error.message);
        hasErrors = true;
      }
    }

    const avgScore = allMentions.length > 0
      ? allMentions.reduce((sum, m) => sum + m.promotionScore, 0) / allMentions.length
      : 0;

    return [{
      platform: 'StockTwits',
      scanner: this.name,
      success: allMentions.length > 0 || !hasErrors,
      error: hasErrors ? 'Some tickers failed (possibly rate limited or blocked)' : undefined,
      mentionsFound: allMentions.length,
      mentions: allMentions,
      activityLevel: allMentions.length >= 30 ? 'high'
        : allMentions.length >= 10 ? 'medium'
        : allMentions.length > 0 ? 'low' : 'none',
      promotionRisk: avgScore >= 40 ? 'high'
        : avgScore >= 20 ? 'medium' : 'low',
      scanDuration: Date.now() - startTime,
    }];
  }
}
