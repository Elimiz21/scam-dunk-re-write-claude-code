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

// ─── Weighted promotional pattern categories ───────────────
// HIGH: Clear pump/scam indicators (+20 each)
// MEDIUM: Hype and promotional language (+15 each)
// LOW: Mildly promotional or disclaimer phrases (+10 each)
//
// Patterns are based on REAL content observed in StockTwits, YouTube, Reddit
// penny stock posts — not just WSB meme culture language.

const PROMO_PATTERNS_HIGH: string[] = [
  // Classic scam language
  'guaranteed returns', 'guaranteed profit', 'guaranteed gains',
  'insider info', 'insider tip', 'insider knowledge',
  'get in now', 'get in before', 'act fast', 'act now',
  'limited time', 'last chance', 'once in a lifetime',
  'easy money', 'free money', 'quick money', 'fast money',
  'financial freedom', 'life changing', 'retire early',
  "don't miss", 'dont miss', 'must buy',
  'they dont want you to know', 'secret stock',
  'pump and dump', 'pump & dump',
  // Alert service / paid group promotion (real StockTwits patterns)
  'top alerts', 'stock alerts', 'alert service', 'signal service',
  'paid group', 'premium alerts', 'vip group', 'premium group',
  'see profile for', 'see bio for', 'check profile for', 'link in bio',
  'join our discord', 'join our telegram', 'join the discord', 'join the telegram',
  'join our group', 'join my group',
  'catch the runners', 'catch runners early',
  // Solicitation / calls to action
  'click here to get', 'sign up now', 'sign up today',
  'free trial', '4-day trial', 'day trial',
  'buying power for only',
];

const PROMO_PATTERNS_MEDIUM: string[] = [
  // WSB / meme stock language
  'to the moon', '🚀', 'rocket', 'moon shot',
  'squeeze', 'short squeeze', 'gamma squeeze',
  'next gme', 'next amc', 'next gamestop',
  '10x', '100x', '1000x',
  'hidden gem', 'sleeping giant',
  'about to explode', 'before it explodes', 'going parabolic',
  'massive gains', 'huge potential', 'enormous upside', 'explosive growth',
  'buy now', 'load up', 'back up the truck',
  'diamond hands', '💎', 'tendies', 'lambo', 'wen lambo',
  'yolo', 'all in',
  'breakout', 'explosive', 'parabolic',
  'moon', 'bag holder', 'bagholders',
  // Real-world pump language from StockTwits/YouTube
  'biggest pay day', 'biggest payday', 'biggest runner',
  'way upside', 'huge run', 'about to run', 'going to run', 'this will run',
  'remember this post', 'told you so', 'called it',
  'i am early', "i'm early", 'get in early', 'still early',
  // Money/hype emojis commonly used in pump posts
  '💰', '💵', '🤑', '🔥', '🏆',
  // Self-promotion / monetization
  'buy me a coffee', 'buymeacoffee', 'support me here',
  'subscribe for', 'follow for more', 'follow me for',
  // Automated trading signals
  'stock pick', 'stock picks', 'top pick', 'top picks',
  'my alerts', 'our alerts', 'morning alerts',
  'watchlist', 'watch list',
];

const PROMO_PATTERNS_LOW: string[] = [
  'undervalued', 'oversold', 'accumulate', 'strong buy',
  'dyor', 'nfa', 'not financial advice', 'trust me bro',
  'next big thing', 'game changer',
  'breaking', 'urgent', 'insider',
  'guaranteed', 'price target',
  'huge upside', 'massive upside', 'potential upside',
  // Disclaimer language (almost always accompanies promotional content)
  'not a financial advisor', 'personal analysis', 'own research',
  'do your own research', 'disclaimer',
  // Mild promotion signals
  'on the radar', 'on my radar', 'just saying',
  'subscribe', 'click here',
  'let\'s get this', 'let\'s go', 'lfg',
];

// Regex-based patterns for detecting structural pump signals
const REGEX_PATTERNS_MEDIUM: Array<{ regex: RegExp; flag: string; score: number }> = [
  // External alert/promotion website links
  {
    regex: /(?:alerts?|signals?|picks?|trading)\.com/gi,
    flag: 'Links to alert/signal service',
    score: 15,
  },
  // "RSI: XX, MACD: XX" automated signal bot posts
  {
    regex: /\b(?:rsi|macd)\s*:\s*-?\d/gi,
    flag: 'Automated trading signal',
    score: 15,
  },
];

// Flat export for external consumers
export const PROMOTIONAL_PATTERNS = [
  ...PROMO_PATTERNS_HIGH, ...PROMO_PATTERNS_MEDIUM, ...PROMO_PATTERNS_LOW,
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

  // ── String-based pattern matching ──
  for (const pattern of PROMO_PATTERNS_HIGH) {
    if (lower.includes(pattern)) {
      score += 20;
      if (flags.length < 10) flags.push(`Contains "${pattern}"`);
    }
  }
  for (const pattern of PROMO_PATTERNS_MEDIUM) {
    if (lower.includes(pattern)) {
      score += 15;
      if (flags.length < 10) flags.push(`Contains "${pattern}"`);
    }
  }
  for (const pattern of PROMO_PATTERNS_LOW) {
    if (lower.includes(pattern)) {
      score += 10;
      if (flags.length < 10) flags.push(`Contains "${pattern}"`);
    }
  }

  // ── Regex-based structural detection ──

  // Multi-ticker spam detection: posts listing many $TICKER symbols
  const tickerMatches = text.match(/\$[A-Z]{2,5}/g);
  if (tickerMatches) {
    const uniqueTickers = new Set(tickerMatches).size;
    if (uniqueTickers >= 6) {
      score += 30;
      if (flags.length < 10) flags.push(`Lists ${uniqueTickers} tickers (likely alert spam)`);
    } else if (uniqueTickers >= 4) {
      score += 20;
      if (flags.length < 10) flags.push(`Lists ${uniqueTickers} tickers (multi-ticker promotion)`);
    }
  }

  // Percentage gain bragging: "390%", "up 314%", etc.
  const pctMatches = text.match(/\d{3,4}%/g);
  if (pctMatches) {
    const pctScore = Math.min(pctMatches.length * 10, 30);
    score += pctScore;
    if (flags.length < 10) flags.push(`Claims ${pctMatches.length} large percentage gain(s)`);
  }

  // Automated signal detection (RSI/MACD bots)
  for (const { regex, flag, score: regexScore } of REGEX_PATTERNS_MEDIUM) {
    if (regexScore > 0 && regex.test(text)) {
      score += regexScore;
      if (flags.length < 10) flags.push(flag);
      regex.lastIndex = 0; // Reset regex state
    }
  }

  // ── Context bonuses ──
  if (context?.isPromotionSubreddit) {
    score += 15;
    flags.push('Posted in promotion-heavy community');
  }
  if (context?.isNewAccount) {
    score += 20;
    flags.push('New or recently created account');
  }
  if (context?.hasHighEngagement && score >= 10) {
    score += 20;
    flags.push('High engagement on promotional content');
  }

  return { score: Math.min(score, 100), flags };
}
