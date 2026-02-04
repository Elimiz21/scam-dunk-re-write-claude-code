/**
 * Real Social Media Scanner
 * 
 * This module ONLY uses real API data - NO AI predictions or simulations.
 * 
 * Platforms with Real APIs:
 * - Reddit (free public JSON API)
 * - StockTwits (free public API)
 * - YouTube (YouTube Data API v3 - FREE, 10,000 units/day)
 * 
 * Platforms WITHOUT viable free APIs (excluded):
 * - Twitter/X ($100/mo minimum for search)
 * - Discord (no public API for server search)
 * - Telegram (no public API for channel search)
 * - TikTok (requires developer approval process)
 * - Facebook/Instagram (Meta API requires business account)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });

import { execSync } from 'child_process';

// API Keys
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

// Types
export interface RealSocialMention {
    platform: 'Reddit' | 'StockTwits' | 'YouTube';
    source: string;
    title: string;
    content: string;
    url: string;
    author: string;
    date: string;
    engagement: {
        upvotes?: number;
        comments?: number;
        views?: number;
        likes?: number;
    };
    sentiment: 'bullish' | 'bearish' | 'neutral';
    isPromotional: boolean;
    promotionScore: number;  // 0-100
    redFlags: string[];
}

export interface PlatformScanResult {
    platform: string;
    success: boolean;
    dataSource: 'real' | 'unavailable';  // Always 'real' for successful scans
    mentionsFound: number;
    mentions: RealSocialMention[];
    overallActivityLevel: 'high' | 'medium' | 'low' | 'none';
    promotionRisk: 'high' | 'medium' | 'low';
    error?: string;
}

export interface ComprehensiveScanResult {
    symbol: string;
    name: string;
    scanDate: string;
    platforms: PlatformScanResult[];
    overallPromotionScore: number;
    riskLevel: 'high' | 'medium' | 'low';
    hasRealSocialEvidence: boolean;
    potentialPromoters: Array<{
        platform: string;
        username: string;
        postCount: number;
        confidence: 'high' | 'medium' | 'low';
    }>;
    summary: string;
}

// Utility function for HTTP requests using curl
function curlFetch(url: string, customHeaders: Record<string, string> = {}): string | null {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            ...customHeaders
        };

        let headerArgs = '';
        for (const [key, value] of Object.entries(headers)) {
            headerArgs += ` -H "${key}: ${value}"`;
        }

        // Add -L to follow redirects
        const cmd = `curl -s -L --max-time 15${headerArgs} "${url}"`;
        return execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    } catch {
        return null;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// REDDIT SCANNER (FREE - Public JSON API)
// Rate limit: 100 requests/min with OAuth, 10/min without
// ==========================================
async function scanReddit(symbol: string, name: string): Promise<PlatformScanResult> {
    const result: PlatformScanResult = {
        platform: 'Reddit',
        success: false,
        dataSource: 'real',
        mentionsFound: 0,
        mentions: [],
        overallActivityLevel: 'none',
        promotionRisk: 'low'
    };

    try {
        // Search Reddit for the stock symbol
        const searchUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(symbol)}&sort=new&t=week&limit=25`;
        const response = curlFetch(searchUrl);

        if (!response) {
            result.error = 'Failed to fetch from Reddit';
            return result;
        }

        let data;
        try {
            data = JSON.parse(response);
        } catch (e) {
            result.error = 'Invalid JSON response from Reddit';
            return result;
        }

        const posts = data?.data?.children || [];

        // Stock promotion subreddits (red flags if posted here)
        const promotionSubreddits = new Set([
            'wallstreetbets', 'pennystocks', 'shortsqueeze', 'robinhoodpennystocks',
            'smallstreetbets', 'weedstocks', 'spacs', 'squeezeplay', 'daytrading',
            'stockmarket', 'stocks', 'investing', 'options'
        ]);

        // Promotional patterns to look for
        const promotionalPatterns = [
            'next gme', 'next amc', 'moon', 'rocket', '🚀', 'to the moon',
            'squeeze', 'short squeeze', 'gamma squeeze', '10x', '100x', '1000x',
            'guaranteed', 'easy money', 'free money', 'buy now', 'load up', 'yolo',
            'undervalued', 'hidden gem', 'sleeping giant', 'about to explode',
            'trust me bro', 'not financial advice', 'nfa', 'dyor'
        ];

        for (const post of posts) {
            const postData = post.data;
            const subreddit = (postData.subreddit || '').toLowerCase();
            const title = postData.title || '';
            const selftext = postData.selftext || '';
            const combinedText = (title + ' ' + selftext).toLowerCase();

            // Check if symbol is actually mentioned (not just a false positive)
            const symbolMentioned = combinedText.includes(symbol.toLowerCase()) ||
                combinedText.includes('$' + symbol.toLowerCase());

            if (!symbolMentioned) continue;

            // Calculate promotion score
            let promotionScore = 0;
            const redFlags: string[] = [];

            // Red flag: Posted in known promotion subreddit
            if (promotionSubreddits.has(subreddit)) {
                promotionScore += 20;
                redFlags.push(`Posted in r/${subreddit}`);
            }

            // Red flag: Contains promotional language
            for (const pattern of promotionalPatterns) {
                if (combinedText.includes(pattern)) {
                    promotionScore += 10;
                    if (redFlags.length < 5) redFlags.push(`Contains "${pattern}"`);
                }
            }

            // Red flag: New account (if available)
            const accountAgeSeconds = postData.author_fullname_created_utc;
            if (accountAgeSeconds) {
                const accountAgeDays = (Date.now() / 1000 - accountAgeSeconds) / (60 * 60 * 24);
                if (accountAgeDays < 90) {
                    promotionScore += 15;
                    redFlags.push('New account (<90 days)');
                }
            }

            // Red flag: High engagement on suspicious post
            if (postData.score > 100 && promotionScore > 20) {
                promotionScore += 20;
                redFlags.push('High engagement on promotional post');
            }

            const mention: RealSocialMention = {
                platform: 'Reddit',
                source: `r/${postData.subreddit}`,
                title: title,
                content: (selftext || title).substring(0, 300),
                url: `https://reddit.com${postData.permalink}`,
                author: postData.author || 'unknown',
                date: new Date(postData.created_utc * 1000).toISOString(),
                engagement: {
                    upvotes: postData.score,
                    comments: postData.num_comments
                },
                sentiment: promotionScore > 30 ? 'bullish' : 'neutral',
                isPromotional: promotionScore >= 30,
                promotionScore: Math.min(promotionScore, 100),
                redFlags
            };

            result.mentions.push(mention);
        }

        result.success = true;
        result.mentionsFound = result.mentions.length;

        // Calculate overall metrics
        const avgScore = result.mentions.length > 0
            ? result.mentions.reduce((sum, m) => sum + m.promotionScore, 0) / result.mentions.length
            : 0;

        result.overallActivityLevel = result.mentionsFound >= 10 ? 'high'
            : result.mentionsFound >= 3 ? 'medium'
                : result.mentionsFound > 0 ? 'low' : 'none';

        result.promotionRisk = avgScore >= 50 ? 'high'
            : avgScore >= 25 ? 'medium' : 'low';

    } catch (error: any) {
        result.error = error?.message || 'Reddit scan failed';
    }

    return result;
}

// ==========================================
// STOCKTWITS SCANNER (FREE - Public API)
// No rate limit documentation, use conservatively
// ==========================================
async function scanStockTwits(symbol: string): Promise<PlatformScanResult> {
    const result: PlatformScanResult = {
        platform: 'StockTwits',
        success: false,
        dataSource: 'real',
        mentionsFound: 0,
        mentions: [],
        overallActivityLevel: 'none',
        promotionRisk: 'low'
    };

    try {
        const url = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json`;
        const response = curlFetch(url);

        if (!response) {
            result.error = 'Failed to fetch from StockTwits';
            return result;
        }

        let data;
        try {
            data = JSON.parse(response);
        } catch (e) {
            // StockTwits commonly returns 404 HTML for missing symbols or blocked requests
            if (response.includes('<html')) {
                result.error = 'StockTwits blocked request or symbol not found';
                return result;
            }
            result.error = 'Invalid JSON response from StockTwits';
            return result;
        }

        // Check if API returned an error
        if (data.response?.status !== 200) {
            if (data.errors) {
                result.error = data.errors[0]?.message || 'StockTwits API error';
            } else {
                result.error = 'Symbol not found on StockTwits';
            }
            return result;
        }

        const messages = data.messages || [];

        // Promotional patterns for stock pumping
        const promotionalPatterns = [
            'buy', 'bullish', 'long', 'moon', '🚀', 'rocket',
            'load up', 'accumulate', 'target', 'price target',
            'breaking out', 'breakout', 'squeeze', 'explosion',
            'undervalued', 'cheap', 'discount', 'huge upside'
        ];

        for (const msg of messages) {
            const body = msg.body || '';
            const bodyLower = body.toLowerCase();

            let promotionScore = 0;
            const redFlags: string[] = [];

            // Check for promotional patterns
            for (const pattern of promotionalPatterns) {
                if (bodyLower.includes(pattern)) {
                    promotionScore += 8;
                    if (redFlags.length < 3) redFlags.push(`Contains "${pattern}"`);
                }
            }

            // Red flag: Low follower account
            const followers = msg.user?.followers || 0;
            if (followers < 10) {
                promotionScore += 10;
                redFlags.push('Low follower account');
            }

            // Red flag: New account
            if (msg.user?.join_date) {
                const joinDate = new Date(msg.user.join_date);
                const daysSince = (Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSince < 30) {
                    promotionScore += 15;
                    redFlags.push('Account < 30 days old');
                }
            }

            // Get sentiment from StockTwits
            const stSentiment = msg.entities?.sentiment?.basic;
            const sentiment = stSentiment === 'Bullish' ? 'bullish'
                : stSentiment === 'Bearish' ? 'bearish' : 'neutral';

            const mention: RealSocialMention = {
                platform: 'StockTwits',
                source: 'StockTwits Feed',
                title: '',
                content: body.substring(0, 300),
                url: `https://stocktwits.com/symbol/${symbol}`,
                author: msg.user?.username || 'unknown',
                date: msg.created_at,
                engagement: {
                    likes: msg.likes?.total || 0
                },
                sentiment,
                isPromotional: promotionScore >= 25,
                promotionScore: Math.min(promotionScore, 100),
                redFlags
            };

            result.mentions.push(mention);
        }

        result.success = true;
        result.mentionsFound = result.mentions.length;

        const avgScore = result.mentions.length > 0
            ? result.mentions.reduce((sum, m) => sum + m.promotionScore, 0) / result.mentions.length
            : 0;

        result.overallActivityLevel = result.mentionsFound >= 20 ? 'high'
            : result.mentionsFound >= 5 ? 'medium'
                : result.mentionsFound > 0 ? 'low' : 'none';

        result.promotionRisk = avgScore >= 40 ? 'high'
            : avgScore >= 20 ? 'medium' : 'low';

    } catch (error: any) {
        result.error = error?.message || 'StockTwits scan failed';
    }

    return result;
}

// ==========================================
// YOUTUBE SCANNER (FREE - YouTube Data API v3)
// 10,000 units/day free, search costs 100 units = 100 searches/day
// ==========================================
async function scanYouTube(symbol: string, name: string): Promise<PlatformScanResult> {
    const result: PlatformScanResult = {
        platform: 'YouTube',
        success: false,
        dataSource: 'real',
        mentionsFound: 0,
        mentions: [],
        overallActivityLevel: 'none',
        promotionRisk: 'low'
    };

    if (!YOUTUBE_API_KEY) {
        result.error = 'YouTube API key not configured';
        result.dataSource = 'unavailable';
        return result;
    }

    try {
        // Search YouTube for stock-related videos
        const searchQuery = `${symbol} stock`;
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&order=date&publishedAfter=${getOneWeekAgo()}&maxResults=10&key=${YOUTUBE_API_KEY}`;

        const response = curlFetch(searchUrl);

        if (!response) {
            result.error = 'Failed to fetch from YouTube API';
            return result;
        }

        let data;
        try {
            data = JSON.parse(response);
        } catch (e) {
            result.error = 'Invalid JSON response from YouTube';
            return result;
        }

        if (data.error) {
            result.error = data.error.message || 'YouTube API error';
            return result;
        }


        const videos = data.items || [];

        // Promotional patterns in video titles
        const promotionalPatterns = [
            'next 10x', 'going to moon', 'about to explode', 'buy now',
            'hidden gem', 'undervalued', 'huge potential', 'massive gains',
            'short squeeze', 'gamma squeeze', 'price target', 'must buy',
            'urgent', 'breaking', 'insider', 'they dont want you to know'
        ];

        for (const video of videos) {
            const snippet = video.snippet;
            const title = snippet?.title || '';
            const description = snippet?.description || '';
            const combined = (title + ' ' + description).toLowerCase();

            let promotionScore = 0;
            const redFlags: string[] = [];

            // Check for promotional patterns
            for (const pattern of promotionalPatterns) {
                if (combined.includes(pattern)) {
                    promotionScore += 15;
                    if (redFlags.length < 3) redFlags.push(`Contains "${pattern}"`);
                }
            }

            // Red flag: Clickbait indicators
            if (title.includes('🚀') || title.includes('💰') || title.includes('🔥')) {
                promotionScore += 10;
                redFlags.push('Clickbait emojis');
            }

            // Red flag: ALL CAPS
            const capsRatio = (title.match(/[A-Z]/g) || []).length / title.length;
            if (capsRatio > 0.5) {
                promotionScore += 10;
                redFlags.push('Excessive caps');
            }

            const mention: RealSocialMention = {
                platform: 'YouTube',
                source: snippet?.channelTitle || 'Unknown Channel',
                title: title,
                content: description.substring(0, 300),
                url: `https://youtube.com/watch?v=${video.id.videoId}`,
                author: snippet?.channelTitle || 'unknown',
                date: snippet?.publishedAt || new Date().toISOString(),
                engagement: {},  // Would need another API call to get view counts
                sentiment: promotionScore > 20 ? 'bullish' : 'neutral',
                isPromotional: promotionScore >= 25,
                promotionScore: Math.min(promotionScore, 100),
                redFlags
            };

            result.mentions.push(mention);
        }

        result.success = true;
        result.mentionsFound = result.mentions.length;

        const avgScore = result.mentions.length > 0
            ? result.mentions.reduce((sum, m) => sum + m.promotionScore, 0) / result.mentions.length
            : 0;

        result.overallActivityLevel = result.mentionsFound >= 5 ? 'high'
            : result.mentionsFound >= 2 ? 'medium'
                : result.mentionsFound > 0 ? 'low' : 'none';

        result.promotionRisk = avgScore >= 40 ? 'high'
            : avgScore >= 20 ? 'medium' : 'low';

    } catch (error: any) {
        result.error = error?.message || 'YouTube scan failed';
    }

    return result;
}

function getOneWeekAgo(): string {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString();
}

// ==========================================
// MAIN SCAN FUNCTION
// ==========================================
export async function performRealSocialScan(
    symbol: string,
    name: string,
    _marketCap: number = 0  // Unused but kept for API compatibility
): Promise<ComprehensiveScanResult> {
    console.log(`  📡 Real social media scan for ${symbol}...`);

    const platforms: PlatformScanResult[] = [];

    // Scan Reddit (FREE)
    console.log('    → Reddit (real API)...');
    const redditResult = await scanReddit(symbol, name);
    platforms.push(redditResult);
    await sleep(300);

    // Scan StockTwits (FREE)
    console.log('    → StockTwits (real API)...');
    const stocktwitsResult = await scanStockTwits(symbol);
    platforms.push(stocktwitsResult);
    await sleep(300);

    // Scan YouTube (FREE with API key)
    console.log('    → YouTube (real API)...');
    const youtubeResult = await scanYouTube(symbol, name);
    platforms.push(youtubeResult);

    // Calculate overall score (only from real data)
    const successfulScans = platforms.filter(p => p.success);
    const totalMentions = successfulScans.reduce((sum, p) => sum + p.mentionsFound, 0);
    const avgPromotionScore = successfulScans.length > 0
        ? successfulScans.reduce((sum, p) => {
            const platformScore = p.promotionRisk === 'high' ? 80
                : p.promotionRisk === 'medium' ? 50 : 20;
            return sum + platformScore;
        }, 0) / successfulScans.length
        : 0;

    // Find potential promoters (real accounts)
    const potentialPromoters: ComprehensiveScanResult['potentialPromoters'] = [];
    for (const platform of platforms) {
        const promotionalMentions = platform.mentions.filter(m => m.isPromotional);
        const authorCounts = new Map<string, number>();

        for (const mention of promotionalMentions) {
            const count = authorCounts.get(mention.author) || 0;
            authorCounts.set(mention.author, count + 1);
        }

        for (const [username, count] of Array.from(authorCounts.entries())) {
            if (count >= 1) {
                potentialPromoters.push({
                    platform: platform.platform,
                    username,
                    postCount: count,
                    confidence: count >= 3 ? 'high' : count >= 2 ? 'medium' : 'low'
                });
            }
        }
    }

    // Determine overall risk level
    const highRiskPlatforms = platforms.filter(p => p.promotionRisk === 'high').length;
    const riskLevel = highRiskPlatforms >= 2 ? 'high'
        : highRiskPlatforms >= 1 ? 'medium' : 'low';

    // Has real evidence?
    const hasRealSocialEvidence = platforms.some(p =>
        p.success && p.promotionRisk === 'high' && p.mentionsFound > 0
    );

    // Generate summary
    let summary = '';
    if (hasRealSocialEvidence) {
        const activePlatforms = platforms.filter(p => p.promotionRisk === 'high').map(p => p.platform);
        summary = `REAL promotional activity detected on: ${activePlatforms.join(', ')}. ${totalMentions} total mentions found.`;
    } else if (totalMentions > 0) {
        summary = `Low-level activity found (${totalMentions} mentions) but no significant promotional patterns detected.`;
    } else {
        summary = `No significant social media activity found for ${symbol}.`;
    }

    return {
        symbol,
        name,
        scanDate: new Date().toISOString(),
        platforms,
        overallPromotionScore: Math.round(avgPromotionScore),
        riskLevel,
        hasRealSocialEvidence,
        potentialPromoters,
        summary
    };
}

// CLI for testing
if (require.main === module) {
    const symbol = process.argv[2] || 'AAPL';
    const name = process.argv[3] || 'Apple Inc.';

    console.log('='.repeat(60));
    console.log('REAL SOCIAL MEDIA SCANNER (No AI Predictions)');
    console.log('='.repeat(60));
    console.log(`Symbol: ${symbol}`);
    console.log(`Name: ${name}`);
    console.log('='.repeat(60));

    performRealSocialScan(symbol, name)
        .then(result => {
            console.log('\n' + '='.repeat(60));
            console.log('SCAN RESULTS');
            console.log('='.repeat(60));
            console.log(JSON.stringify(result, null, 2));
        })
        .catch(console.error);
}
