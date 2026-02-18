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
//
// ~200 patterns compiled from:
// - SEC enforcement actions & DOJ indictments (Atlas Trading, Operation Spamalot, Minerco)
// - Cialdini persuasion principles (scarcity, authority, social proof, reciprocity)
// - Real content observed on StockTwits, YouTube, Reddit, Twitter, Discord, TikTok
// - Marketing expert analysis of stock promotion funnels and monetization tactics

const PROMO_PATTERNS_HIGH: string[] = [
  // ── Classic scam / boiler room language (SEC-documented) ──
  'guaranteed returns', 'guaranteed profit', 'guaranteed gains',
  'guaranteed money', 'guaranteed winner',
  'insider info', 'insider tip', 'insider knowledge',
  'get in now', 'get in before', 'act fast', 'act now',
  'limited time', 'last chance', 'once in a lifetime',
  'easy money', 'free money', 'quick money', 'fast money',
  'financial freedom', 'life changing', 'retire early',
  "don't miss", 'dont miss', 'must buy',
  'they dont want you to know', 'secret stock',
  'pump and dump', 'pump & dump',
  'no risk of loss', "can't lose", 'cant lose', 'risk free',
  'sure thing', 'sure bet',
  'ground floor', 'get in on the ground floor',
  'incredible gains', 'breakout stock pick',
  // ── Alert service / paid group promotion (real StockTwits patterns) ──
  'top alerts', 'stock alerts', 'alert service', 'signal service',
  'paid group', 'premium alerts', 'vip group', 'premium group',
  'see profile for', 'see bio for', 'check profile for', 'link in bio',
  'join our discord', 'join our telegram', 'join the discord', 'join the telegram',
  'join our group', 'join my group', 'join our chat',
  'catch the runners', 'catch runners early',
  'premium members got this at', 'vip members alerted at',
  'members were alerted at', 'alerted in our chat',
  // ── Paid funneling / private channels ──
  'dm me for details', 'dm for the play', 'dm me for access',
  'private channel', 'private discord', 'private telegram',
  'exclusive group', 'exclusive alerts', 'exclusive picks',
  'inner circle', 'vip access', 'vip membership',
  // ── Solicitation / calls to action ──
  'click here to get', 'sign up now', 'sign up today',
  'free trial', '4-day trial', 'day trial',
  'buying power for only',
  // ── Course / mentorship upsells ──
  'my trading course', 'enroll in my course', 'trading academy',
  'mentorship program', 'coaching program', '1-on-1 coaching',
  // ── Scarcity manipulation (Cialdini) ──
  'limited spots left', 'spots filling up', 'doors are closing',
  'enrollment closes', 'window is closing',
  // ── Pump coordination (Discord/Telegram) ──
  'pump starts in', '@everyone buy now', '@everyone new alert',
];

const PROMO_PATTERNS_MEDIUM: string[] = [
  // ── WSB / meme stock language ──
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
  // ── Real-world pump language from StockTwits/YouTube ──
  'biggest pay day', 'biggest payday', 'biggest runner',
  'way upside', 'huge run', 'about to run', 'going to run', 'this will run',
  'remember this post', 'told you so', 'called it',
  'i am early', "i'm early", 'get in early', 'still early',
  'ready to explode', 'this is the real deal',
  'money printer', 'printing money', 'free money glitch',
  'no brainer', 'no-brainer',
  // ── Money/hype emojis commonly used in pump posts ──
  '💰', '💵', '🤑', '🔥', '🏆',
  // ── Self-promotion / monetization ──
  'buy me a coffee', 'buymeacoffee', 'support me here',
  'subscribe for', 'follow for more', 'follow me for',
  'patreon', 'ko-fi', 'gumroad',
  'use my code', 'referral link', 'affiliate link',
  'link in description', 'link below',
  // ── Automated trading signals ──
  'stock pick', 'stock picks', 'top pick', 'top picks',
  'my alerts', 'our alerts', 'morning alerts',
  'watchlist', 'watch list',
  // ── Authority claims (Cialdini) ──
  'smart money loading', 'smart money is buying',
  'dark pool activity', 'dark pool prints',
  'whales are accumulating', 'whales loading up',
  'institutional accumulation', 'institutions are loading',
  'unusual options activity',
  // ── Social proof manipulation (Cialdini) ──
  'everyone is talking about', 'going viral',
  'volume doesn\'t lie', 'look at the volume',
  'my subscribers made', 'members are printing money',
  // ── FOMO / emotional triggers ──
  'generational wealth', 'millionaire maker',
  'the next tesla', 'the next amazon', 'the next nvidia',
  'catalyst incoming', 'announcement coming', 'something big is coming',
  'this is just the beginning', 'just getting started',
  // ── Trust me / track record claims ──
  'mark my words', 'screenshot this',
  'iykyk', 'if you know you know',
  'my track record speaks', 'check my history',
  'wagmi', "we're all going to make it",
  // ── Insider knowledge framing ──
  'my sources tell me', 'word on the street',
  'you didn\'t hear this from me', 'between us',
  'before the news drops', 'news coming soon',
  // ── Emotional manipulation ──
  'escape the matrix', 'quit your job',
  'imagine checking your portfolio',
  'you deserve financial freedom',
];

const PROMO_PATTERNS_LOW: string[] = [
  'undervalued', 'oversold', 'accumulate', 'strong buy',
  'dyor', 'nfa', 'not financial advice', 'trust me bro',
  'next big thing', 'game changer',
  'breaking', 'urgent', 'insider',
  'guaranteed', 'price target',
  'huge upside', 'massive upside', 'potential upside',
  // ── Disclaimer language (almost always accompanies promotional content) ──
  'not a financial advisor', 'personal analysis', 'own research',
  'do your own research', 'disclaimer',
  'for educational purposes only', 'for information purposes only',
  'not a recommendation', 'just my opinion',
  'invest at your own risk', 'trade at your own risk',
  // ── Mild promotion signals ──
  'on the radar', 'on my radar', 'just saying',
  'subscribe', 'click here',
  'let\'s get this', 'let\'s go', 'lfg',
  // ── Reciprocity (Cialdini) — offering "free" to build obligation ──
  'free watchlist', 'free stock picks', 'free stock report',
  'i usually charge for this', 'dropping this gem for free',
  // ── Engagement farming ──
  'why is nobody talking about this', 'this deserves more eyes',
  'tag someone who needs to see this', 'share this with a friend',
  'upvote for visibility',
  // ── Monetization signals ──
  'cancel anytime', 'money back guarantee', 'pays for itself',
  'worth a look', 'smash that like button', 'hit the bell',
];

// ── Regex-based patterns for detecting structural pump signals ──

const REGEX_PATTERNS: Array<{ regex: RegExp; flag: string; score: number }> = [
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
  // Monetization URLs (Patreon, BuyMeACoffee, Gumroad, Ko-fi, Discord.gg, t.me)
  {
    regex: /(?:patreon\.com|buymeacoffee\.com|gumroad\.com|ko-fi\.com|discord\.gg|t\.me|bit\.ly|linktr\.ee|beacons\.ai)\/\S+/gi,
    flag: 'Monetization/promotion link',
    score: 15,
  },
  // Specific return claims with timeframe: "500% in 2 weeks"
  {
    regex: /\d{2,4}\s*%\s*(?:in|within|by|over)\s+\d+\s*(?:day|week|month|hour)/gi,
    flag: 'Specific return claim with timeframe',
    score: 20,
  },
  // "I turned $X into $Y" gain claims
  {
    regex: /(?:turned|made|grew)\s*\$[\d,]+\s*(?:into|to)\s*\$[\d,]+/gi,
    flag: 'Specific dollar gain claim',
    score: 20,
  },
  // Signal format: "BUY $XXXX at $X.XX"
  {
    regex: /(?:buy|sell|long|short)\s+\$[A-Z]{2,5}\s+(?:at|@)\s*\$?\d+\.?\d*/gi,
    flag: 'Formatted trading signal',
    score: 20,
  },
  // Win rate claims: "Win rate: 87%"
  {
    regex: /win\s*rate\s*:\s*\d{2,3}%/gi,
    flag: 'Win rate claim',
    score: 15,
  },
  // "Not financial advice/advisor" disclaimer (paradoxically a strong promotional signal)
  {
    regex: /(?:not|n't)\s+(?:a\s+)?(?:financial|investment)\s+(?:advice|advisor|recommendation)/gi,
    flag: '"Not financial advice" disclaimer (common in pump content)',
    score: 5,
  },
];

// Flat export for external consumers
export const PROMOTIONAL_PATTERNS = [
  ...PROMO_PATTERNS_HIGH, ...PROMO_PATTERNS_MEDIUM, ...PROMO_PATTERNS_LOW,
];

// Re-export platform-specific patterns for scanners
export {
  PLATFORM_PATTERNS,
  calculatePlatformSpecificScore,
  getAllPlatformPatterns,
  getPatternCounts,
} from './platform-patterns';
export type { PlatformName, PlatformPatternSet } from './platform-patterns';

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
      if (flags.length < 15) flags.push(`Lists ${uniqueTickers} tickers (likely alert spam)`);
    } else if (uniqueTickers >= 4) {
      score += 20;
      if (flags.length < 15) flags.push(`Lists ${uniqueTickers} tickers (multi-ticker promotion)`);
    }
  }

  // Percentage gain bragging: "390%", "up 314%", etc.
  const pctMatches = text.match(/\d{3,4}%/g);
  if (pctMatches) {
    const pctScore = Math.min(pctMatches.length * 10, 30);
    score += pctScore;
    if (flags.length < 15) flags.push(`Claims ${pctMatches.length} large percentage gain(s)`);
  }

  // All regex-based pattern detection
  for (const { regex, flag, score: regexScore } of REGEX_PATTERNS) {
    if (regexScore > 0 && regex.test(text)) {
      score += regexScore;
      if (flags.length < 15) flags.push(flag);
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

// Re-export persuasion analysis for consumers that need Cialdini-organized detection
export {
  analyzePersuasionTechniques,
  getAllPersuasionPhrases,
  getPhraseCounts,
  PERSUASION_CATEGORIES,
  PLATFORM_SPECIFIC_PHRASES,
  PERSUASION_REGEX_PATTERNS,
  SCARCITY_PHRASES,
  AUTHORITY_PHRASES,
  SOCIAL_PROOF_PHRASES,
  RECIPROCITY_PHRASES,
  COMMITMENT_PHRASES,
  LIKING_PHRASES,
  CALL_TO_ACTION_PHRASES,
  MONETIZATION_PHRASES,
  FOMO_PHRASES,
  EMOTIONAL_MANIPULATION_PHRASES,
  TRUST_ME_PHRASES,
} from './persuasion-phrases';

export type {
  PersuasionPrinciple,
  PersuasionAnalysisResult,
  PersuasionCategory,
} from './persuasion-phrases';
