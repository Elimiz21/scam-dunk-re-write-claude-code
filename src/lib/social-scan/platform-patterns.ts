/**
 * Platform-Specific Promotional Patterns
 *
 * Each platform has distinct language, formatting, and promotion styles.
 * These patterns are designed to be matched case-insensitively against
 * post content from each respective platform.
 *
 * Patterns are categorized by severity:
 *   HIGH   (+20) - Strong pump/scam signals
 *   MEDIUM (+15) - Promotional hype language
 *   LOW    (+10) - Mild promotional or suspicious phrasing
 *
 * Regex patterns include structural/formatting detection that string
 * matching cannot capture.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// STOCKTWITS
// ═══════════════════════════════════════════════════════════════════════════════

export const STOCKTWITS_PATTERNS_HIGH: string[] = [
  // Alert service self-promotion (profile-driving spam)
  'see profile for more info',
  'see profile for our picks',
  'check profile for alerts',
  'check bio for results',
  'see bio for free',
  'follow for daily alerts',
  'follow for free picks',
  'join us for real-time alerts',
  // Paid group funneling
  'premium members got this at',
  'our premium members are up',
  'vip members alerted at',
  'premium chat alerted',
  'alerted in our chat room',
  'alerted this morning in our',
  'members were alerted at',
  // Past performance bragging / track record spam
  'top alerts this month',
  'top alerts this week',
  'alerts track record',
  'winning streak continues',
  'another winner from our alerts',
  'called this one last week',
  // Ticker list spam (alert service broadcast)
  'morning watch list',
  'pre-market watch list',
  'gap scanner results',
  'top movers to watch',
  'our scanners found',
  'scanner alert',
];

export const STOCKTWITS_PATTERNS_MEDIUM: string[] = [
  // Automated signal bot formats
  'signal: buy',
  'signal: strong buy',
  'signal: sell',
  'signal: hold',
  'indicator: bullish',
  'indicator: bearish',
  'buy signal triggered',
  'sell signal triggered',
  // Technical analysis bot language
  'macd crossover',
  'rsi oversold bounce',
  'golden cross forming',
  'breaking above resistance',
  'volume breakout confirmed',
  // Hype language specific to StockTwits
  'trust the process',
  'loading the boat',
  'adding more shares',
  'backing up the truck',
  'this is just the beginning',
  'float is tiny',
  'tiny float',
  'low float runner',
  'shorts are trapped',
  'shorts will cover',
  'squeeze is coming',
  'heavily shorted',
];

export const STOCKTWITS_PATTERNS_LOW: string[] = [
  // Sentiment-baiting phrases
  'who else is holding',
  'who is still in',
  'are you guys buying',
  'thoughts on this',
  'what do you think',
  'bulls make money',
  'patience pays off',
  'just getting started',
  'mark my words',
  'screenshot this',
  'bookmark this post',
  'come back to this post',
];

export const STOCKTWITS_REGEX_PATTERNS: Array<{ regex: RegExp; flag: string; score: number }> = [
  // "RSI: 28.4 | MACD: -0.12 | Signal: BUY" automated bot format
  {
    regex: /(?:rsi|macd|ema|sma|vwap)\s*:\s*-?\d+\.?\d*\s*\|/gi,
    flag: 'Automated technical indicator bot post',
    score: 20,
  },
  // Percentage gain bragging: "up 340% on $XXXX!"
  {
    regex: /up\s+\d{2,4}%\s+on\s+\$/gi,
    flag: 'Percentage gain bragging on specific ticker',
    score: 15,
  },
  // Multi-line watchlist spam: "$XXXX $YYYY $ZZZZ $AAAA $BBBB"
  {
    regex: /(\$[A-Z]{2,5}\s+){4,}/g,
    flag: 'Multi-ticker watchlist spam',
    score: 20,
  },
  // Profile link / URL in post (self-promo)
  {
    regex: /(?:bit\.ly|linktr\.ee|beacons\.ai|t\.co|goo\.gl)\/\S+/gi,
    flag: 'Shortened URL (likely self-promotion link)',
    score: 15,
  },
  // Emoji-heavy hype: 3+ fire/rocket/money emojis in one post
  {
    regex: /(?:[🚀🔥💰💵💎🤑🏆]\s*){3,}/g,
    flag: 'Excessive hype emojis',
    score: 10,
  },
];


// ═══════════════════════════════════════════════════════════════════════════════
// YOUTUBE
// ═══════════════════════════════════════════════════════════════════════════════

export const YOUTUBE_PATTERNS_HIGH: string[] = [
  // Clickbait title patterns
  'urgent: buy this stock now',
  'must watch before market open',
  'must watch before monday',
  'this penny stock will explode',
  'this stock will 10x',
  'this stock will 100x',
  'the next gamestop',
  'next short squeeze target',
  'best stock to buy right now',
  'best penny stock to buy now',
  'i found the next',
  'wall street doesn\'t want you to know',
  'the stock they\'re hiding from you',
  // Course / mentorship upsell
  'enroll in my course',
  'join my mentorship',
  'link to my course',
  'trading course below',
  'learn my strategy for',
  'use code for discount',
  'use my referral link',
  'use my code for',
  'sign up with my link',
  // Fake authority / guru framing
  'i predicted this crash',
  'i called this rally',
  'my subscribers made',
  'my students made',
  'students are making money',
];

export const YOUTUBE_PATTERNS_MEDIUM: string[] = [
  // Title formatting patterns
  'you need to see this',
  'watch this before you buy',
  'why i\'m buying this stock',
  'why this stock will moon',
  'top 5 stocks to buy',
  'top 10 stocks for',
  'stocks to buy in',
  'stocks to buy before',
  'penny stocks to buy now',
  'stocks that will make you rich',
  'millionaire maker stock',
  'retire off this stock',
  'life changing opportunity',
  // Description upsells
  'like and subscribe for more',
  'smash the like button',
  'hit the notification bell',
  'turn on notifications',
  'join the patreon',
  'join the membership',
  'webull free stocks',
  'moomoo free stocks',
  'robinhood free stock',
  // Disclaimer bait (paired with promotional content)
  'this is not financial advice',
  'i am not a financial advisor',
  'for entertainment purposes only',
  'do your own due diligence',
];

export const YOUTUBE_PATTERNS_LOW: string[] = [
  // Generic stock video language
  'technical analysis',
  'stock analysis',
  'price prediction',
  'price target update',
  'earnings preview',
  'chart breakdown',
  'my portfolio update',
  'how i make money trading',
  'day trading live',
  'stock market today',
  'pre market analysis',
  'after hours update',
];

export const YOUTUBE_REGEX_PATTERNS: Array<{ regex: RegExp; flag: string; score: number }> = [
  // ALL CAPS title (more than 70% uppercase letters)
  {
    regex: /^[A-Z\s!?$%0-9🚀🔥💰]{20,}$/gm,
    flag: 'ALL CAPS clickbait title',
    score: 15,
  },
  // "GET X FREE STOCKS" affiliate promotion
  {
    regex: /get\s+\d+\s+free\s+stocks?/gi,
    flag: 'Brokerage affiliate promotion',
    score: 15,
  },
  // Price target claims: "$XXXX to $XX by [date]"
  {
    regex: /\$[A-Z]{2,5}\s+to\s+\$\d+\.?\d*\s+by/gi,
    flag: 'Specific price target with deadline',
    score: 15,
  },
  // "XX,XXX% GAIN" large gain claim in title
  {
    regex: /\d{1,3},?\d{3}%\s*gain/gi,
    flag: 'Extreme percentage gain claim',
    score: 20,
  },
  // Affiliate link patterns in description
  {
    regex: /(?:webull|moomoo|robinhood|coinbase)\.com\/\S*(?:ref|invite|promo)/gi,
    flag: 'Brokerage referral link',
    score: 10,
  },
];


// ═══════════════════════════════════════════════════════════════════════════════
// REDDIT (r/pennystocks, r/wallstreetbets, r/shortsqueeze, etc.)
// ═══════════════════════════════════════════════════════════════════════════════

export const REDDIT_PATTERNS_HIGH: string[] = [
  // Fake DD that is actually promotion
  'dd: why this stock will',
  'dd inside: this is the next',
  'my dd on why you should buy',
  'did my dd and this is a',
  'this is not financial advice but buy',
  'this is going to be the next gme',
  'this is the next amc',
  // Short squeeze thesis pushing
  'short interest is over 100%',
  'shorts have not covered',
  'shorts haven\'t covered',
  'they haven\'t covered',
  'utilization is at 100%',
  'cost to borrow is insane',
  'cost to borrow through the roof',
  'this squeeze will be epic',
  'squeeze has not squoze',
  'squeeze hasn\'t squoze',
  'the squeeze has not been squoze',
  // Coordinated buying calls
  'if we all buy and hold',
  'everyone needs to buy this',
  'coordinated buy at market open',
  'let\'s all buy at',
  'apes together strong',
  'hold the line',
  'don\'t let the hedgies win',
  'hedgies are shaking',
  'hedgies r fuk',
];

export const REDDIT_PATTERNS_MEDIUM: string[] = [
  // "Conviction" language that serves as social pressure
  'i\'m not selling a single share',
  'not selling until',
  'diamond handing this',
  'holding until we moon',
  'never selling this stock',
  'i will die on this hill',
  'avg down and hold',
  'buying the dip again',
  'bought more today',
  'added another thousand shares',
  'position: xxxx shares',
  // Moon/rocket language variants
  'this is going to the moon',
  'moon mission loading',
  'fueling up for launch',
  'countdown to launch',
  'we are going interstellar',
  'see you on the moon',
  'we ride at dawn',
  // DD language that is veiled promotion
  'catalyst list',
  'upcoming catalysts',
  'catalyst coming soon',
  'institutional buying detected',
  'dark pool activity',
  'unusual options activity',
  'the float is only',
  'insiders are buying',
  'insider bought shares',
];

export const REDDIT_PATTERNS_LOW: string[] = [
  // Engagement farming
  'upvote if you\'re holding',
  'upvote for visibility',
  'this needs more attention',
  'why is nobody talking about this',
  'am i the only one who sees this',
  'am i crazy or is this',
  'this deserves more eyes',
  'mods please don\'t delete this',
  'reposting because it got buried',
  // Mild hype
  'bullish af',
  'lfg',
  'let\'s gooo',
  'buckle up',
  'fasten your seatbelts',
  'this is the way',
  'tendies incoming',
  'wen lambo',
  'wife\'s boyfriend',
];

export const REDDIT_REGEX_PATTERNS: Array<{ regex: RegExp; flag: string; score: number }> = [
  // Position posting: "5,000 shares @ $0.42"
  {
    regex: /\d{1,3},?\d{3}\s+shares?\s+@\s*\$?\d+\.?\d*/gi,
    flag: 'Position disclosure (social proof for pump)',
    score: 10,
  },
  // "SI is XX%" short interest claim
  {
    regex: /\b(?:si|short\s+interest)\s+(?:is|at|over|above)\s+\d{2,3}%/gi,
    flag: 'Short interest percentage claim',
    score: 15,
  },
  // "XX% of float shorted"
  {
    regex: /\d{2,3}%\s+(?:of\s+)?(?:float|shares?)\s+(?:shorted|short)/gi,
    flag: 'Float short percentage claim',
    score: 15,
  },
  // Multiple rocket emojis (3+)
  {
    regex: /(?:🚀\s*){3,}/g,
    flag: 'Rocket emoji spam',
    score: 10,
  },
  // YOLO post format: "YOLO $XXXX $XX,XXX"
  {
    regex: /yolo\s+\$[A-Z]{2,5}\s+\$?\d{1,3},?\d{3}/gi,
    flag: 'YOLO position post (social proof)',
    score: 10,
  },
];


// ═══════════════════════════════════════════════════════════════════════════════
// DISCORD / TELEGRAM
// ═══════════════════════════════════════════════════════════════════════════════

export const DISCORD_TELEGRAM_PATTERNS_HIGH: string[] = [
  // Signal service format
  'entry price:',
  'entry zone:',
  'take profit 1:',
  'take profit 2:',
  'take profit 3:',
  'stop loss:',
  'tp1:',
  'tp2:',
  'tp3:',
  'sl:',
  'risk/reward:',
  'r/r:',
  // Pump group coordination language
  '@everyone new alert',
  '@everyone buy now',
  '@here new pick',
  '@here buy alert',
  'pump starts in',
  'pump at',
  'buy at market open',
  'dump at',
  'sell at',
  'target hit! sell now',
  'take profits now',
  'exit all positions',
  'close your position',
  // Authority / urgency framing
  'admin pick:',
  'owner pick:',
  'vip signal:',
  'premium signal:',
  'exclusive alert:',
];

export const DISCORD_TELEGRAM_PATTERNS_MEDIUM: string[] = [
  // Entry/exit tracking language
  'entry confirmed',
  'entry filled',
  'position opened',
  'target 1 hit',
  'target 2 hit',
  'target 3 hit',
  'first target reached',
  'second target reached',
  'stop loss hit',
  'stopped out',
  'partial profits taken',
  'moved stop to breakeven',
  'trailing stop activated',
  // Signal tracking / scoreboard
  'win rate:',
  'win/loss:',
  'streak:',
  'monthly performance:',
  'weekly performance:',
  'signals this week:',
  'success rate:',
  'profits this month:',
  // Group promotion / upsell
  'upgrade to premium',
  'upgrade to vip',
  'free trial ending',
  'trial expires',
  'premium members got this early',
  'vip got this first',
  'dm me for access',
  'dm for vip link',
];

export const DISCORD_TELEGRAM_PATTERNS_LOW: string[] = [
  // General trading chat
  'what\'s your position size',
  'what\'s your avg',
  'where did you enter',
  'nice entry',
  'great call',
  'good call admin',
  'thanks for the alert',
  'another banger',
  'let\'s eat',
  'money printer',
  'free money glitch',
  'easy trade',
  'rinse and repeat',
  'same setup as yesterday',
];

export const DISCORD_TELEGRAM_REGEX_PATTERNS: Array<{ regex: RegExp; flag: string; score: number }> = [
  // Formal signal format: "BUY $XXXX at $X.XX | TP: $X.XX | SL: $X.XX"
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
  // Profit claims: "+$4,500 profit today"
  {
    regex: /\+\$\d{1,3},?\d{3}\s+(?:profit|gain|made)/gi,
    flag: 'Dollar profit claim',
    score: 15,
  },
  // @everyone / @here ping (coordination)
  {
    regex: /@(?:everyone|here)/gi,
    flag: 'Mass ping alert',
    score: 10,
  },
  // Countdown language: "Pump in 5 minutes"
  {
    regex: /(?:pump|buy|alert)\s+in\s+\d+\s+(?:min|minute|hour|sec)/gi,
    flag: 'Coordinated action countdown',
    score: 25,
  },
];


// ═══════════════════════════════════════════════════════════════════════════════
// TWITTER / X
// ═══════════════════════════════════════════════════════════════════════════════

export const TWITTER_PATTERNS_HIGH: string[] = [
  // Cashtag spam patterns
  'alert: $',
  'breaking: $',
  'huge news for $',
  'massive catalyst for $',
  'this will be the biggest runner',
  'biggest runner of the year',
  'monster alert',
  'monster runner incoming',
  // Fintwit pump language
  'load before the news drops',
  'load before pr',
  'accumulate before news',
  'something big is coming for',
  'news coming soon for',
  'pr coming any day',
  'announcement imminent',
  'huge announcement coming',
  // Thread promotional DD
  'thread on why i\'m all in',
  'thread: why you need to own',
  'mega thread on',
  'here\'s why this stock will',
  'let me tell you why',
  // Paid promotion
  'paid advertisement',
  'sponsored post',
  'ad: ',
  'promoted by',
];

export const TWITTER_PATTERNS_MEDIUM: string[] = [
  // Engagement bait / RT farming
  'rt if you\'re holding',
  'retweet if you own',
  'rt if you\'re buying',
  'like if you\'re bullish',
  'like and rt for',
  'quote tweet with your position',
  'drop your avg in the replies',
  'comment your entry price',
  // Fintwit hype language
  'about to go parabolic',
  'chart looks incredible',
  'chart is screaming buy',
  'technicals are perfect',
  'setup looks beautiful',
  'textbook breakout pattern',
  'golden cross confirmed',
  'flag pattern breakout',
  'cup and handle forming',
  // Conviction signaling
  'adding on every dip',
  'not selling a share',
  'my biggest position',
  'i keep adding',
  'been accumulating for weeks',
  'this is my highest conviction play',
  'highest conviction pick',
  // CT (Crypto Twitter) crossover language used in stock pumps
  'this is a generational buy',
  'generational wealth opportunity',
  'asymmetric risk reward',
];

export const TWITTER_PATTERNS_LOW: string[] = [
  // General fintwit language
  'nfa but',
  'nfa dyor',
  'just my opinion',
  'not a recommendation',
  'on my watchlist',
  'watching this closely',
  'keeping an eye on',
  'interesting setup on',
  'worth a look',
  'putting this on the radar',
  'flagging this for the timeline',
  'sharing for educational purposes',
];

export const TWITTER_REGEX_PATTERNS: Array<{ regex: RegExp; flag: string; score: number }> = [
  // Cashtag spam: 4+ cashtags in one tweet
  {
    regex: /(\$[A-Z]{2,5}\s+){3,}/g,
    flag: 'Multi-cashtag spam',
    score: 20,
  },
  // "Thread" emoji pattern for promotional DD threads
  {
    regex: /(?:thread|🧵)\s*(?:👇|⬇️|↓)/gi,
    flag: 'Promotional thread indicator',
    score: 10,
  },
  // Price target with timeline: "$XXXX $XX by Q2"
  {
    regex: /\$[A-Z]{2,5}\s+\$\d+\.?\d*\s+by\s+(?:Q[1-4]|eoy|end\s+of\s+year|summer|fall|spring|winter|\d{4})/gi,
    flag: 'Price target with timeline',
    score: 15,
  },
  // "I called $XXXX at $X.XX, now $XX.XX" track record bragging
  {
    regex: /(?:called|alerted|bought)\s+\$[A-Z]{2,5}\s+(?:at|@)\s*\$?\d+\.?\d*.*(?:now|currently)\s+\$?\d+\.?\d*/gi,
    flag: 'Track record bragging',
    score: 15,
  },
  // Hashtag stacking: #stocks #trading #pennystocks #invest (4+)
  {
    regex: /(#\w+\s+){3,}/g,
    flag: 'Hashtag spam for visibility',
    score: 10,
  },
];


// ═══════════════════════════════════════════════════════════════════════════════
// TIKTOK
// ═══════════════════════════════════════════════════════════════════════════════

export const TIKTOK_PATTERNS_HIGH: string[] = [
  // "Fintok" promotional language
  'this stock will change your life',
  'buy this stock before it\'s too late',
  'you need to buy this stock right now',
  'i found the next amazon',
  'i found the next tesla',
  'i found the next apple',
  'this could be the next 100 bagger',
  'millionaire maker stock',
  'this stock made me rich',
  'quit my job because of this stock',
  'retired at 25 from trading',
  // Affiliate / referral promotion
  'link in bio for free stocks',
  'get free stocks with my link',
  'use my referral code',
  'use my code for free',
  'link in bio for my course',
  'check my bio for the app',
  // Fear of missing out framing
  'you\'re going to regret not buying this',
  'don\'t be the one who missed out',
  'imagine not buying this stock',
  'in 5 years you\'ll wish you bought',
  'people will wish they bought at this price',
];

export const TIKTOK_PATTERNS_MEDIUM: string[] = [
  // Video hook patterns
  'if you have $100 to invest',
  'if you have $500 to invest',
  'if you have $1000 to invest',
  'if i could only buy one stock',
  'the one stock i\'d buy',
  'the only stock you need',
  'my top stock pick for',
  'three stocks to buy before',
  'stocks gen z should buy',
  'stocks you need in your portfolio',
  'stock that will make you money',
  // Lifestyle flex / social proof
  'how i turned $100 into',
  'how i turned $1000 into',
  'turned $500 into $5000',
  'my portfolio is up',
  'look at my gains',
  'showing my portfolio',
  'my robinhood account',
  'my webull portfolio',
  // Simple framing for younger audience
  'stocks for beginners',
  'investing for beginners',
  'how to get rich with stocks',
  'passive income from stocks',
  'make money while you sleep',
];

export const TIKTOK_PATTERNS_LOW: string[] = [
  // Generic fintok language
  'fintok',
  'stocktok',
  'investing tip',
  'money tip',
  'trading tip',
  'financial tip',
  'stock market explained',
  'investing 101',
  'how the stock market works',
  'what is a stock',
  // Hashtag patterns
  '#investing',
  '#stockmarket',
  '#pennystocks',
  '#daytrading',
  '#fintok',
  '#stocktok',
  '#moneytok',
  '#tradinglife',
];

export const TIKTOK_REGEX_PATTERNS: Array<{ regex: RegExp; flag: string; score: number }> = [
  // "Turned $X into $XX,XXX" gain porn
  {
    regex: /turned?\s+\$\d{1,3},?\d{0,3}\s+into\s+\$\d{1,3},?\d{3}/gi,
    flag: 'Gain claim (turned X into Y)',
    score: 20,
  },
  // "XX,XXX% return" extreme return claims
  {
    regex: /\d{1,3},?\d{3}%\s*(?:return|gain|profit|up)/gi,
    flag: 'Extreme return claim',
    score: 20,
  },
  // Bio link / referral pattern
  {
    regex: /(?:link\s+in\s+bio|linkinbio|linktr\.ee|beacons\.ai)/gi,
    flag: 'Bio link promotion',
    score: 15,
  },
  // Emoji-heavy caption (5+ finance emojis)
  {
    regex: /(?:[💰💵🤑📈🚀💎🔥💸]\s*){5,}/g,
    flag: 'Heavy finance emoji usage',
    score: 10,
  },
];


// ═══════════════════════════════════════════════════════════════════════════════
// AGGREGATED PLATFORM MAP (for use by scanners)
// ═══════════════════════════════════════════════════════════════════════════════

export type PlatformName = 'stocktwits' | 'youtube' | 'reddit' | 'discord_telegram' | 'twitter' | 'tiktok';

export interface PlatformPatternSet {
  high: string[];
  medium: string[];
  low: string[];
  regex: Array<{ regex: RegExp; flag: string; score: number }>;
}

export const PLATFORM_PATTERNS: Record<PlatformName, PlatformPatternSet> = {
  stocktwits: {
    high: STOCKTWITS_PATTERNS_HIGH,
    medium: STOCKTWITS_PATTERNS_MEDIUM,
    low: STOCKTWITS_PATTERNS_LOW,
    regex: STOCKTWITS_REGEX_PATTERNS,
  },
  youtube: {
    high: YOUTUBE_PATTERNS_HIGH,
    medium: YOUTUBE_PATTERNS_MEDIUM,
    low: YOUTUBE_PATTERNS_LOW,
    regex: YOUTUBE_REGEX_PATTERNS,
  },
  reddit: {
    high: REDDIT_PATTERNS_HIGH,
    medium: REDDIT_PATTERNS_MEDIUM,
    low: REDDIT_PATTERNS_LOW,
    regex: REDDIT_REGEX_PATTERNS,
  },
  discord_telegram: {
    high: DISCORD_TELEGRAM_PATTERNS_HIGH,
    medium: DISCORD_TELEGRAM_PATTERNS_MEDIUM,
    low: DISCORD_TELEGRAM_PATTERNS_LOW,
    regex: DISCORD_TELEGRAM_REGEX_PATTERNS,
  },
  twitter: {
    high: TWITTER_PATTERNS_HIGH,
    medium: TWITTER_PATTERNS_MEDIUM,
    low: TWITTER_PATTERNS_LOW,
    regex: TWITTER_REGEX_PATTERNS,
  },
  tiktok: {
    high: TIKTOK_PATTERNS_HIGH,
    medium: TIKTOK_PATTERNS_MEDIUM,
    low: TIKTOK_PATTERNS_LOW,
    regex: TIKTOK_REGEX_PATTERNS,
  },
};

/**
 * Calculate a platform-specific promotion score.
 *
 * This supplements the generic `calculatePromotionScore` in types.ts by
 * layering on platform-specific pattern matching.  The caller should run
 * BOTH the generic scorer and this platform scorer, then combine the results.
 *
 * @param text      - The post/video/message content to score.
 * @param platform  - Which platform the content came from.
 * @returns Combined score bonus and flags from platform-specific patterns.
 */
export function calculatePlatformSpecificScore(
  text: string,
  platform: PlatformName,
): { scoreBonus: number; flags: string[] } {
  const patterns = PLATFORM_PATTERNS[platform];
  if (!patterns) return { scoreBonus: 0, flags: [] };

  const lower = text.toLowerCase();
  let scoreBonus = 0;
  const flags: string[] = [];

  // String-based pattern matching
  for (const pattern of patterns.high) {
    if (lower.includes(pattern)) {
      scoreBonus += 20;
      if (flags.length < 15) flags.push(`[${platform}] Contains "${pattern}"`);
    }
  }
  for (const pattern of patterns.medium) {
    if (lower.includes(pattern)) {
      scoreBonus += 15;
      if (flags.length < 15) flags.push(`[${platform}] Contains "${pattern}"`);
    }
  }
  for (const pattern of patterns.low) {
    if (lower.includes(pattern)) {
      scoreBonus += 10;
      if (flags.length < 15) flags.push(`[${platform}] Contains "${pattern}"`);
    }
  }

  // Regex-based structural detection
  for (const { regex, flag, score } of patterns.regex) {
    if (regex.test(text)) {
      scoreBonus += score;
      if (flags.length < 15) flags.push(`[${platform}] ${flag}`);
      regex.lastIndex = 0; // Reset global regex state
    }
  }

  return { scoreBonus: Math.min(scoreBonus, 100), flags };
}

/**
 * Get all platform-specific patterns as a flat array (useful for exports/tests).
 */
export function getAllPlatformPatterns(platform: PlatformName): string[] {
  const patterns = PLATFORM_PATTERNS[platform];
  if (!patterns) return [];
  return [...patterns.high, ...patterns.medium, ...patterns.low];
}

/**
 * Count summary: how many patterns per platform per severity.
 */
export function getPatternCounts(): Record<PlatformName, { high: number; medium: number; low: number; regex: number; total: number }> {
  const result: Record<string, { high: number; medium: number; low: number; regex: number; total: number }> = {};
  for (const [name, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    result[name] = {
      high: patterns.high.length,
      medium: patterns.medium.length,
      low: patterns.low.length,
      regex: patterns.regex.length,
      total: patterns.high.length + patterns.medium.length + patterns.low.length + patterns.regex.length,
    };
  }
  return result as Record<PlatformName, { high: number; medium: number; low: number; regex: number; total: number }>;
}
