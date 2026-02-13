/**
 * Shared types for the Social Media Scanning System
 */

// Input: what we're scanning for
export interface ScanTarget {
  ticker: string;
  name: string;
  riskScore: number;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  signals: string[];
}

// A single mention found on social media
export interface SocialMention {
  platform: 'Reddit' | 'YouTube' | 'Discord' | 'StockTwits' | 'Twitter' | 'TikTok' | 'Web' | 'Forum';
  source: string;           // e.g., "r/wallstreetbets", "YouTube: StockGuru", "Google CSE"
  discoveredVia: string;    // Which scanner found it: "reddit_oauth", "google_cse", "perplexity", "youtube_api", "discord_bot", "stocktwits", "rss"
  title: string;
  content: string;
  url: string;
  author: string;
  postDate: string;         // ISO date
  engagement: {
    upvotes?: number;
    comments?: number;
    views?: number;
    likes?: number;
    shares?: number;
  };
  sentiment: 'bullish' | 'bearish' | 'neutral';
  isPromotional: boolean;
  promotionScore: number;   // 0-100
  redFlags: string[];
}

// Result from a single platform scanner
export interface PlatformScanResult {
  platform: string;
  scanner: string;          // e.g., "reddit_oauth", "google_cse"
  success: boolean;
  error?: string;
  mentionsFound: number;
  mentions: SocialMention[];
  activityLevel: 'high' | 'medium' | 'low' | 'none';
  promotionRisk: 'high' | 'medium' | 'low';
  scanDuration: number;     // ms
}

// Complete result for one ticker across all platforms
export interface TickerScanResult {
  ticker: string;
  name: string;
  scanDate: string;
  platforms: PlatformScanResult[];
  totalMentions: number;
  overallPromotionScore: number;  // 0-100
  riskLevel: 'high' | 'medium' | 'low';
  hasRealEvidence: boolean;
  topPromoters: Array<{
    platform: string;
    username: string;
    postCount: number;
    avgPromotionScore: number;
  }>;
  summary: string;
}

// Full scan run result
export interface ScanRunResult {
  scanId: string;
  scanDate: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';
  tickersScanned: number;
  tickersWithMentions: number;
  totalMentions: number;
  platformsUsed: string[];
  results: TickerScanResult[];
  errors: string[];
  duration: number;        // ms
}

// Scanner interface - all scanners implement this
export interface SocialScanner {
  name: string;
  platform: string;
  isConfigured(): boolean;
  scan(targets: ScanTarget[]): Promise<PlatformScanResult[]>;
}

// Promotional language patterns
export const PROMOTIONAL_PATTERNS = [
  'next gme', 'next amc', 'moon', 'to the moon', 'rocket', '🚀',
  'squeeze', 'short squeeze', 'gamma squeeze',
  '10x', '100x', '1000x', 'guaranteed', 'easy money', 'free money',
  'buy now', 'load up', 'yolo', 'all in',
  'undervalued', 'hidden gem', 'sleeping giant', 'about to explode',
  'trust me bro', 'not financial advice', 'nfa', 'dyor',
  'massive gains', 'huge potential', 'price target',
  'must buy', 'urgent', 'breaking', 'insider',
  'they dont want you to know', 'before it explodes',
  'next big thing', 'accumulate', 'breakout', 'going parabolic',
];

// Subreddits known for stock promotion
export const PROMOTION_SUBREDDITS = [
  'wallstreetbets', 'pennystocks', 'shortsqueeze', 'robinhoodpennystocks',
  'smallstreetbets', 'weedstocks', 'spacs', 'squeezeplay', 'daytrading',
  'stockmarket', 'stocks', 'investing', 'options', 'valueinvesting',
  'microcap', 'biotechplays', 'otcstocks',
];

// Helper: calculate promotion score from text
export function calculatePromotionScore(text: string, context?: {
  isPromotionSubreddit?: boolean;
  isNewAccount?: boolean;
  hasHighEngagement?: boolean;
}): { score: number; flags: string[] } {
  const lower = text.toLowerCase();
  let score = 0;
  const flags: string[] = [];

  for (const pattern of PROMOTIONAL_PATTERNS) {
    if (lower.includes(pattern)) {
      score += 10;
      if (flags.length < 5) flags.push(`Contains "${pattern}"`);
    }
  }

  if (context?.isPromotionSubreddit) {
    score += 15;
    flags.push('Posted in promotion-heavy community');
  }
  if (context?.isNewAccount) {
    score += 15;
    flags.push('New account');
  }
  if (context?.hasHighEngagement && score > 20) {
    score += 20;
    flags.push('High engagement on promotional post');
  }

  return { score: Math.min(score, 100), flags };
}
