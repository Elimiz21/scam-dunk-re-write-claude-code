/**
 * Shared types for the Social Media Scanning System (server-side)
 */

export interface ScanTarget {
  ticker: string;
  name: string;
  riskScore: number;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  signals: string[];
}

export interface SocialMention {
  platform: 'Reddit' | 'YouTube' | 'Discord' | 'StockTwits' | 'Twitter' | 'TikTok' | 'Web' | 'Forum';
  source: string;
  discoveredVia: string;
  title: string;
  content: string;
  url: string;
  author: string;
  postDate: string;
  engagement: {
    upvotes?: number;
    comments?: number;
    views?: number;
    likes?: number;
    shares?: number;
  };
  sentiment: 'bullish' | 'bearish' | 'neutral';
  isPromotional: boolean;
  promotionScore: number;
  redFlags: string[];
}

export interface PlatformScanResult {
  platform: string;
  scanner: string;
  success: boolean;
  error?: string;
  mentionsFound: number;
  mentions: SocialMention[];
  activityLevel: 'high' | 'medium' | 'low' | 'none';
  promotionRisk: 'high' | 'medium' | 'low';
  scanDuration: number;
}

export interface TickerScanResult {
  ticker: string;
  name: string;
  scanDate: string;
  platforms: PlatformScanResult[];
  totalMentions: number;
  overallPromotionScore: number;
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
  duration: number;
}

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

const PROMO_PATTERNS_HIGH: string[] = [
  'guaranteed returns', 'guaranteed profit', 'guaranteed gains',
  'insider info', 'insider tip', 'insider knowledge',
  'get in now', 'get in before', 'act fast', 'act now',
  'limited time', 'last chance', 'once in a lifetime',
  'easy money', 'free money', 'quick money', 'fast money',
  'financial freedom', 'life changing', 'retire early',
  "don't miss", 'dont miss', 'must buy',
  'they dont want you to know', 'secret stock',
  'pump and dump', 'pump & dump',
];

const PROMO_PATTERNS_MEDIUM: string[] = [
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
];

const PROMO_PATTERNS_LOW: string[] = [
  'undervalued', 'oversold', 'accumulate', 'strong buy',
  'dyor', 'nfa', 'not financial advice', 'trust me bro',
  'next big thing', 'game changer',
  'breaking', 'urgent', 'insider',
  'guaranteed', 'price target',
  'huge upside', 'massive upside', 'potential upside',
];

// Flat export for external consumers
export const PROMOTIONAL_PATTERNS = [
  ...PROMO_PATTERNS_HIGH, ...PROMO_PATTERNS_MEDIUM, ...PROMO_PATTERNS_LOW,
];

export const PROMOTION_SUBREDDITS = [
  'wallstreetbets', 'pennystocks', 'shortsqueeze', 'robinhoodpennystocks',
  'smallstreetbets', 'weedstocks', 'spacs', 'squeezeplay', 'daytrading',
  'stockmarket', 'stocks', 'investing', 'options', 'valueinvesting',
  'microcap', 'biotechplays', 'otcstocks',
];

export function calculatePromotionScore(text: string, context?: {
  isPromotionSubreddit?: boolean;
  isNewAccount?: boolean;
  hasHighEngagement?: boolean;
}): { score: number; flags: string[] } {
  const lower = text.toLowerCase();
  let score = 0;
  const flags: string[] = [];

  // Weighted pattern matching
  for (const pattern of PROMO_PATTERNS_HIGH) {
    if (lower.includes(pattern)) {
      score += 20;
      if (flags.length < 8) flags.push(`Contains "${pattern}"`);
    }
  }
  for (const pattern of PROMO_PATTERNS_MEDIUM) {
    if (lower.includes(pattern)) {
      score += 15;
      if (flags.length < 8) flags.push(`Contains "${pattern}"`);
    }
  }
  for (const pattern of PROMO_PATTERNS_LOW) {
    if (lower.includes(pattern)) {
      score += 10;
      if (flags.length < 8) flags.push(`Contains "${pattern}"`);
    }
  }

  // Context bonuses
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
