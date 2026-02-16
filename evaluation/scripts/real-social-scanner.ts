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
import * as fs from 'fs';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });

import { execSync } from 'child_process';

// API Keys
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

// YouTube quota tracking: 10,000 units/day, each search = 100 units = max 100 searches
const YOUTUBE_QUOTA_FILE = path.join(__dirname, '..', '.youtube-quota.json');
const YOUTUBE_MAX_DAILY_SEARCHES = 80; // Reserve 20 for manual testing

function getYouTubeQuotaUsed(): { date: string; searches: number } {
    try {
        const today = new Date().toISOString().split('T')[0];
        if (fs.existsSync(YOUTUBE_QUOTA_FILE)) {
            const data = JSON.parse(fs.readFileSync(YOUTUBE_QUOTA_FILE, 'utf-8'));
            if (data.date === today) return data;
        }
        return { date: today, searches: 0 };
    } catch {
        return { date: new Date().toISOString().split('T')[0], searches: 0 };
    }
}

function recordYouTubeSearch(): void {
    const quota = getYouTubeQuotaUsed();
    quota.searches++;
    try {
        fs.writeFileSync(YOUTUBE_QUOTA_FILE, JSON.stringify(quota));
    } catch { /* best effort */ }
}

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
// Strategy: Search globally + scan key promotion subreddits directly
// Rate limit: ~10 requests/min unauthenticated, so we throttle to 6s between
// ==========================================

// Stock promotion subreddits (red flags if posted here)
const PROMOTION_SUBREDDITS = new Set([
    'wallstreetbets', 'pennystocks', 'shortsqueeze', 'robinhoodpennystocks',
    'smallstreetbets', 'weedstocks', 'spacs', 'squeezeplay', 'daytrading',
    'stockmarket', 'stocks', 'investing', 'options', 'microcap',
    'biotechplays', 'otcstocks'
]);

// Promotional patterns - tiered by severity
const REDDIT_PROMO_TIER1 = [ // Strong promotion signals (+15 each)
    'next gme', 'next amc', '🚀', 'to the moon', 'short squeeze', 'gamma squeeze',
    '10x', '100x', '1000x', 'guaranteed', 'easy money', 'free money',
    'about to explode', 'sleeping giant', 'going parabolic'
];
const REDDIT_PROMO_TIER2 = [ // Moderate promotion signals (+8 each)
    'moon', 'rocket', 'squeeze', 'hidden gem', 'undervalued', 'load up',
    'buy now', 'yolo', 'huge potential', 'massive gains', 'must buy',
    'trust me bro', 'accumulate', 'before it explodes'
];
const REDDIT_PROMO_TIER3 = [ // Mild bullish signals (+3 each)
    'not financial advice', 'nfa', 'dyor', 'breakout', 'breaking out'
];

function tryParseRedditResponse(response: string | null, label: string): any | null {
    if (!response) {
        console.log(`      [Reddit] ${label}: no response (timeout or connection failure)`);
        return null;
    }
    if (response.startsWith('<') || response.includes('<!DOCTYPE')) {
        console.log(`      [Reddit] ${label}: got HTML instead of JSON (blocked or redirected to login)`);
        return null;
    }
    try {
        const data = JSON.parse(response);
        if (data.error) {
            console.log(`      [Reddit] ${label}: API error ${data.error} - ${data.message || ''}`);
            return null;
        }
        return data;
    } catch {
        console.log(`      [Reddit] ${label}: failed to parse JSON (response starts with: ${response.substring(0, 80)})`);
        return null;
    }
}

function scoreRedditPost(combinedText: string, subreddit: string, postData: any): { promotionScore: number; redFlags: string[] } {
    let promotionScore = 0;
    const redFlags: string[] = [];

    // Red flag: Posted in known promotion subreddit
    if (PROMOTION_SUBREDDITS.has(subreddit)) {
        promotionScore += 20;
        redFlags.push(`Posted in r/${subreddit}`);
    }

    // Tiered promotional language detection
    for (const pattern of REDDIT_PROMO_TIER1) {
        if (combinedText.includes(pattern)) {
            promotionScore += 15;
            if (redFlags.length < 5) redFlags.push(`Strong promo: "${pattern}"`);
        }
    }
    for (const pattern of REDDIT_PROMO_TIER2) {
        if (combinedText.includes(pattern)) {
            promotionScore += 8;
            if (redFlags.length < 5) redFlags.push(`Moderate promo: "${pattern}"`);
        }
    }
    for (const pattern of REDDIT_PROMO_TIER3) {
        if (combinedText.includes(pattern)) {
            promotionScore += 3;
            if (redFlags.length < 5) redFlags.push(`Mild promo: "${pattern}"`);
        }
    }

    // Red flag: New account (if available)
    const accountAgeSeconds = postData.author_fullname_created_utc || postData.author_created_utc;
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

    return { promotionScore: Math.min(promotionScore, 100), redFlags };
}

function parseRedditPostToMention(postData: any, symbol: string): RealSocialMention | null {
    const subreddit = (postData.subreddit || '').toLowerCase();
    const title = postData.title || '';
    const selftext = postData.selftext || '';
    const combinedText = (title + ' ' + selftext).toLowerCase();

    // Check if symbol is actually mentioned (not just a false positive)
    const symbolLower = symbol.toLowerCase();
    if (!combinedText.includes(symbolLower) && !combinedText.includes('$' + symbolLower)) {
        return null;
    }

    const { promotionScore, redFlags } = scoreRedditPost(combinedText, subreddit, postData);

    return {
        platform: 'Reddit',
        source: `r/${postData.subreddit}`,
        title,
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
        promotionScore,
        redFlags
    };
}

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

    const seenUrls = new Set<string>();

    function addMention(mention: RealSocialMention | null) {
        if (mention && !seenUrls.has(mention.url)) {
            seenUrls.add(mention.url);
            result.mentions.push(mention);
        }
    }

    try {
        // Strategy 1: Global search with multiple queries for coverage
        const queries = [symbol, `$${symbol}`, `${symbol} stock`];
        for (const query of queries) {
            // Try www.reddit.com first, fall back to old.reddit.com
            const urls = [
                `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&t=week&limit=25`,
                `https://old.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&t=week&limit=25`,
            ];

            let data: any = null;
            for (const url of urls) {
                const response = curlFetch(url);
                data = tryParseRedditResponse(response, `search "${query}"`);
                if (data) break;
            }

            if (data) {
                const posts = data?.data?.children || [];
                for (const post of posts) {
                    addMention(parseRedditPostToMention(post.data, symbol));
                }
            }

            await sleep(6500); // Stay under 10 req/min unauthenticated limit
        }

        // Strategy 2: Scan key promotion subreddits directly for this symbol
        const topSubreddits = ['wallstreetbets', 'pennystocks', 'shortsqueeze', 'smallstreetbets'];
        for (const sub of topSubreddits) {
            const subSearchUrl = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(symbol)}&restrict_sr=1&sort=new&t=week&limit=25`;
            const response = curlFetch(subSearchUrl);
            const data = tryParseRedditResponse(response, `r/${sub} search`);

            if (data) {
                const posts = data?.data?.children || [];
                for (const post of posts) {
                    addMention(parseRedditPostToMention(post.data, symbol));
                }
            }

            await sleep(6500);
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
// Now fetches 2 pages for velocity analysis and uses tiered keyword scoring
// ==========================================

// StockTwits promotional patterns - tiered to reduce false positives
const ST_PROMO_TIER1 = [ // Strong pump signals (+15 each)
    'moon', '🚀', 'rocket', 'squeeze', 'explosion', '10x', '100x',
    'to the moon', 'going parabolic', 'about to explode', 'massive gains'
];
const ST_PROMO_TIER2 = [ // Moderate promotion (+8 each)
    'undervalued', 'hidden gem', 'load up', 'accumulate', 'huge upside',
    'cheap', 'discount', 'sleeping giant', 'next big thing'
];
const ST_PROMO_TIER3 = [ // Mild bullish - normal trading talk (+3 each)
    'buy', 'bullish', 'long', 'breakout', 'breaking out', 'target', 'price target'
];

interface StockTwitsMetadata {
    watchlistCount: number;
    messagesPerDay: number;  // velocity metric
    totalMessages: number;
}

function parseStockTwitsResponse(response: string | null): { data: any; error?: string } {
    if (!response) {
        return { data: null, error: 'Failed to fetch from StockTwits' };
    }
    if (response.startsWith('<') || response.includes('<html')) {
        return { data: null, error: 'StockTwits blocked request or symbol not found' };
    }
    try {
        const data = JSON.parse(response);
        if (data.response?.status !== 200) {
            return { data: null, error: data.errors?.[0]?.message || 'Symbol not found on StockTwits' };
        }
        return { data };
    } catch {
        return { data: null, error: 'Invalid JSON response from StockTwits' };
    }
}

function scoreStockTwitsMessage(bodyLower: string, msg: any): { promotionScore: number; redFlags: string[] } {
    let promotionScore = 0;
    const redFlags: string[] = [];

    // Tiered promotional language detection
    for (const pattern of ST_PROMO_TIER1) {
        if (bodyLower.includes(pattern)) {
            promotionScore += 15;
            if (redFlags.length < 3) redFlags.push(`Strong promo: "${pattern}"`);
        }
    }
    for (const pattern of ST_PROMO_TIER2) {
        if (bodyLower.includes(pattern)) {
            promotionScore += 8;
            if (redFlags.length < 3) redFlags.push(`Moderate promo: "${pattern}"`);
        }
    }
    for (const pattern of ST_PROMO_TIER3) {
        if (bodyLower.includes(pattern)) {
            promotionScore += 3;
            if (redFlags.length < 3) redFlags.push(`Mild: "${pattern}"`);
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

    return { promotionScore: Math.min(promotionScore, 100), redFlags };
}

async function scanStockTwits(symbol: string): Promise<PlatformScanResult & { metadata?: StockTwitsMetadata }> {
    const result: PlatformScanResult & { metadata?: StockTwitsMetadata } = {
        platform: 'StockTwits',
        success: false,
        dataSource: 'real',
        mentionsFound: 0,
        mentions: [],
        overallActivityLevel: 'none',
        promotionRisk: 'low'
    };

    try {
        // Page 1
        const url1 = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json`;
        const response1 = curlFetch(url1);
        const { data: data1, error: error1 } = parseStockTwitsResponse(response1);

        if (!data1) {
            result.error = error1;
            return result;
        }

        const allMessages = [...(data1.messages || [])];

        // Extract watchlist count from symbol metadata
        const watchlistCount = data1.symbol?.watchlist_count || 0;

        // Page 2: Use cursor for velocity analysis
        const cursor = data1.cursor;
        if (cursor?.max) {
            await sleep(2000); // Rate limit courtesy
            const url2 = `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json?max=${cursor.max}`;
            const response2 = curlFetch(url2);
            const { data: data2 } = parseStockTwitsResponse(response2);
            if (data2?.messages) {
                allMessages.push(...data2.messages);
            }
        }

        // Calculate velocity: messages per day across the full fetch window
        let messagesPerDay = 0;
        if (allMessages.length >= 2) {
            const newest = new Date(allMessages[0].created_at).getTime();
            const oldest = new Date(allMessages[allMessages.length - 1].created_at).getTime();
            const timeSpanDays = Math.max((newest - oldest) / (1000 * 60 * 60 * 24), 0.01);
            messagesPerDay = allMessages.length / timeSpanDays;
        }

        result.metadata = {
            watchlistCount,
            messagesPerDay: Math.round(messagesPerDay * 10) / 10,
            totalMessages: allMessages.length
        };

        console.log(`      [StockTwits] ${symbol}: ${allMessages.length} msgs, ${result.metadata.messagesPerDay} msgs/day, ${watchlistCount} watchers`);

        // Process all messages with tiered scoring
        for (const msg of allMessages) {
            const body = msg.body || '';
            const bodyLower = body.toLowerCase();
            const { promotionScore, redFlags } = scoreStockTwitsMessage(bodyLower, msg);

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
                isPromotional: promotionScore >= 30,
                promotionScore,
                redFlags
            };

            result.mentions.push(mention);
        }

        result.success = true;
        result.mentionsFound = result.mentions.length;

        const avgScore = result.mentions.length > 0
            ? result.mentions.reduce((sum, m) => sum + m.promotionScore, 0) / result.mentions.length
            : 0;

        // Activity level considers velocity, not just raw count
        // >100 msgs/day = high, >20 msgs/day = medium (for a small-cap stock)
        if (messagesPerDay > 100 || result.mentionsFound >= 40) {
            result.overallActivityLevel = 'high';
        } else if (messagesPerDay > 20 || result.mentionsFound >= 10) {
            result.overallActivityLevel = 'medium';
        } else if (result.mentionsFound > 0) {
            result.overallActivityLevel = 'low';
        } else {
            result.overallActivityLevel = 'none';
        }

        result.promotionRisk = avgScore >= 40 ? 'high'
            : avgScore >= 20 ? 'medium' : 'low';

    } catch (error: any) {
        result.error = error?.message || 'StockTwits scan failed';
    }

    return result;
}

// ==========================================
// YOUTUBE SCANNER (FREE - YouTube Data API v3)
// 10,000 units/day free, search costs 100 units = max ~100 searches/day
// Quota-managed: skips search if daily budget exhausted
// ==========================================
async function scanYouTube(symbol: string, name: string, skipQuotaCheck: boolean = false): Promise<PlatformScanResult> {
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

    // Check quota before searching
    if (!skipQuotaCheck) {
        const quota = getYouTubeQuotaUsed();
        if (quota.searches >= YOUTUBE_MAX_DAILY_SEARCHES) {
            result.error = `YouTube daily quota exhausted (${quota.searches}/${YOUTUBE_MAX_DAILY_SEARCHES} searches used today)`;
            console.log(`      [YouTube] Quota exhausted for today (${quota.searches} searches used)`);
            // Mark as success with 0 mentions rather than failure — quota isn't a scan error
            result.success = true;
            return result;
        }
    }

    try {
        // Search YouTube for stock-related videos
        const searchQuery = `${symbol} stock`;
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&order=date&publishedAfter=${getOneWeekAgo()}&maxResults=10&key=${YOUTUBE_API_KEY}`;

        const response = curlFetch(searchUrl);
        recordYouTubeSearch(); // Track quota usage regardless of result

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
            const errMsg = data.error.message || 'YouTube API error';
            // Check for quota exceeded from YouTube itself
            if (data.error.code === 403 && errMsg.includes('quota')) {
                result.error = 'YouTube API quota exceeded';
                result.success = true; // Not a scan failure
            } else {
                result.error = errMsg;
            }
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

    // ============================================
    // COMPOSITE SCORING (replaces broken categorical average)
    //
    // Old formula: avg of (high=80, medium=50, low=20) per platform
    //   - Always returned 20 when all platforms report "low"
    //   - Could not distinguish "30 active StockTwits messages" from "nothing"
    //
    // New formula: weighted composite of 4 signals (0-100):
    //   1. Mention volume score (0-30): based on total mentions
    //   2. Promotional content score (0-30): % of mentions flagged as promotional
    //   3. Velocity score (0-20): StockTwits messages/day (if available)
    //   4. Cross-platform score (0-20): mentions on multiple platforms
    // ============================================

    const successfulScans = platforms.filter(p => p.success);
    const totalMentions = successfulScans.reduce((sum, p) => sum + p.mentionsFound, 0);
    const allMentions = successfulScans.flatMap(p => p.mentions);
    const promotionalMentions = allMentions.filter(m => m.isPromotional);

    // 1. Mention volume score (0-30)
    // 0 mentions = 0, 1-5 = 5, 6-15 = 10, 16-30 = 20, 30+ = 30
    const volumeScore = totalMentions === 0 ? 0
        : totalMentions <= 5 ? 5
        : totalMentions <= 15 ? 10
        : totalMentions <= 30 ? 20
        : 30;

    // 2. Promotional content score (0-30)
    // Based on % of mentions flagged as promotional AND their average score
    const promoRatio = allMentions.length > 0
        ? promotionalMentions.length / allMentions.length
        : 0;
    const avgPromoScore = promotionalMentions.length > 0
        ? promotionalMentions.reduce((sum, m) => sum + m.promotionScore, 0) / promotionalMentions.length
        : 0;
    // Combine: weight ratio (how many are promotional) and intensity (how promotional they are)
    const promoContentScore = Math.min(30, Math.round(
        (promoRatio * 20) + (avgPromoScore / 100 * 10)
    ));

    // 3. Velocity score (0-20) - from StockTwits metadata if available
    const stResult = platforms.find(p => p.platform === 'StockTwits') as any;
    const messagesPerDay = stResult?.metadata?.messagesPerDay || 0;
    // >200 msgs/day = 20, >50 = 15, >20 = 10, >5 = 5, else 0
    const velocityScore = messagesPerDay > 200 ? 20
        : messagesPerDay > 50 ? 15
        : messagesPerDay > 20 ? 10
        : messagesPerDay > 5 ? 5
        : 0;

    // 4. Cross-platform score (0-20)
    // Activity on multiple platforms is more suspicious than one
    const platformsWithMentions = successfulScans.filter(p => p.mentionsFound > 0).length;
    const crossPlatformScore = platformsWithMentions >= 3 ? 20
        : platformsWithMentions >= 2 ? 12
        : platformsWithMentions >= 1 ? 5
        : 0;

    const compositeScore = volumeScore + promoContentScore + velocityScore + crossPlatformScore;

    console.log(`    [Scoring] ${symbol}: volume=${volumeScore} promo=${promoContentScore} velocity=${velocityScore} cross=${crossPlatformScore} => ${compositeScore}`);

    // Find potential promoters (real accounts)
    const potentialPromoters: ComprehensiveScanResult['potentialPromoters'] = [];
    for (const platform of platforms) {
        const platformPromoMentions = platform.mentions.filter(m => m.isPromotional);
        const authorCounts = new Map<string, number>();

        for (const mention of platformPromoMentions) {
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

    // Determine overall risk level based on composite score
    const riskLevel = compositeScore >= 50 ? 'high'
        : compositeScore >= 25 ? 'medium' : 'low';

    // Has real evidence: needs both promotional mentions AND meaningful volume
    const hasRealSocialEvidence = promotionalMentions.length >= 3 && compositeScore >= 40;

    // Generate summary
    let summary = '';
    if (hasRealSocialEvidence) {
        const activePlatformNames = successfulScans
            .filter(p => p.mentionsFound > 0 && p.promotionRisk !== 'low')
            .map(p => p.platform);
        summary = `REAL promotional activity detected on: ${activePlatformNames.join(', ') || 'multiple platforms'}. ` +
            `${totalMentions} total mentions (${promotionalMentions.length} promotional). ` +
            `Composite score: ${compositeScore}/100.`;
    } else if (totalMentions > 0) {
        summary = `Activity found (${totalMentions} mentions, ${promotionalMentions.length} promotional) ` +
            `but below evidence threshold. Composite score: ${compositeScore}/100.`;
    } else {
        summary = `No significant social media activity found for ${symbol}.`;
    }

    return {
        symbol,
        name,
        scanDate: new Date().toISOString(),
        platforms,
        overallPromotionScore: Math.round(compositeScore),
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
