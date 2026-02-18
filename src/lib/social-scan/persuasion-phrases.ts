/**
 * Persuasion & Manipulation Phrase Database for Pump-and-Dump Detection
 *
 * Organized by Cialdini's 6 Principles of Persuasion, plus additional
 * categories specific to stock promotion on social media.
 *
 * Sources: Real patterns observed on StockTwits, Twitter/X, YouTube,
 * Reddit, Discord, and TikTok stock promotion communities.
 *
 * Each phrase is lowercase for case-insensitive matching.
 * Regex patterns are provided separately for flexible/fuzzy matching.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CIALDINI PRINCIPLE 1: SCARCITY
// Creates urgency by implying limited availability or time pressure.
// Stock promoters use this to prevent targets from doing due diligence.
// ─────────────────────────────────────────────────────────────────────────────

export const SCARCITY_PHRASES: string[] = [
  // Enrollment / Access scarcity
  'limited spots left',
  'only accepting 10 more members',
  'closing enrollment',
  'spots are filling up fast',
  'only a few spots remain',
  'enrollment closes tonight',
  'doors are closing',
  'we are at capacity',
  'accepting limited members',
  'waitlist is growing',

  // Time-based scarcity
  'limited time offer',
  'offer expires',
  'today only',
  'ends tonight',
  'last chance to get in',
  'closing this offer',
  'window is closing',
  'this won\'t last',
  'before the window closes',
  'clock is ticking',
  'hours left',
  'minutes left',

  // Stock opportunity scarcity
  'once in a lifetime opportunity',
  'this only happens once',
  'you won\'t see this again',
  'rare opportunity',
  'narrow window',
  'before the catalyst hits',
  'before the announcement',
  'before the news drops',
  'still time to get in',
  'the boat is leaving',
  'train is leaving the station',
  'last call',
  'final boarding call',
  'price won\'t stay this low',
  'not going to stay at these levels',
  'accumulation phase is almost over',
  'cheap shares won\'t last',
  'this dip won\'t last long',
  'buy the dip before it\'s gone',
];

// ─────────────────────────────────────────────────────────────────────────────
// CIALDINI PRINCIPLE 2: AUTHORITY
// Leverages perceived expertise, credentials, or insider connections.
// Stock promoters invoke Wall Street, institutions, and famous investors.
// ─────────────────────────────────────────────────────────────────────────────

export const AUTHORITY_PHRASES: string[] = [
  // Institutional / Smart Money claims
  'hedge fund managers are buying',
  'institutional accumulation',
  'smart money loading',
  'smart money is buying',
  'institutions are loading',
  'dark pool activity',
  'dark pool prints',
  'unusual options activity',
  'big money flowing in',
  'whales are accumulating',
  'whales loading up',
  'insider buying',
  'insiders are accumulating',
  'institutional investors are loading',
  'wall street is watching',

  // Famous investor references
  'warren buffett strategy',
  'cathie wood is buying',
  'michael burry position',
  'elon musk mentioned',
  'congress members buying',
  'nancy pelosi portfolio',
  'following the smart money',
  'copying institutional trades',

  // Self-credential claims
  'as a former wall street trader',
  'with 20 years of experience',
  'as a financial analyst',
  'my hedge fund background',
  'i\'ve been trading for',
  'trust my analysis',
  'i have a track record',
  'my portfolio is up',
  'my subscribers know',
  'my track record speaks for itself',
  'former goldman sachs',
  'ex-wall street',
  'licensed trader',
  'certified analyst',
  'professional trader here',
  'full-time trader for',

  // Research / Data authority
  'according to my research',
  'the data shows',
  'my proprietary algorithm',
  'my proprietary scanner',
  'technical analysis confirms',
  'the charts don\'t lie',
  'fundamentals are rock solid',
  'sec filings confirm',
  'my due diligence shows',
];

// ─────────────────────────────────────────────────────────────────────────────
// CIALDINI PRINCIPLE 3: SOCIAL PROOF
// Shows that many others are already participating or interested.
// Stock promoters fabricate or exaggerate community consensus.
// ─────────────────────────────────────────────────────────────────────────────

export const SOCIAL_PROOF_PHRASES: string[] = [
  // Trending / Popularity claims
  'everyone is talking about',
  'trending #1 on stocktwits',
  'most mentioned ticker',
  'top trending stock',
  'most active on stocktwits',
  'blowing up on twitter',
  'going viral',
  'all over social media',
  'the whole market is watching',
  'everyone and their mother',
  'everybody is buying',
  'all the traders are talking about',

  // Community / Group validation
  'the community is behind this',
  'apes together strong',
  'we\'re all in this together',
  'retail army',
  'retail is winning',
  'reddit is behind this',
  'wsb is on it',
  'discord is buzzing',
  'the chat is going crazy',
  'whole discord is buying',
  'telegram group is all in',

  // Volume / Activity as proof
  'volume speaks for itself',
  'look at the volume',
  'volume is insane',
  'volume doesn\'t lie',
  'unusual volume today',
  'massive volume surge',
  'people are piling in',
  'huge order flow',
  'buying pressure is real',

  // Testimonials / Results
  'my subscribers made',
  'our members are up',
  'people in my group are banking',
  'check the testimonials',
  'look at the results',
  'members are printing money',
  'thousands of followers can\'t be wrong',
  'join the movement',
  'movement is growing',
  'this is a movement',
];

// ─────────────────────────────────────────────────────────────────────────────
// CIALDINI PRINCIPLE 4: RECIPROCITY
// Gives something "free" to create obligation.
// Stock promoters offer free reports/analysis to build trust before monetizing.
// ─────────────────────────────────────────────────────────────────────────────

export const RECIPROCITY_PHRASES: string[] = [
  // Free content offerings
  'free stock report',
  'free analysis',
  'i\'ll share my research',
  'free dd',
  'free due diligence',
  'free watchlist',
  'free stock picks',
  'free alerts',
  'free trading guide',
  'free education',
  'free webinar',
  'free masterclass',
  'free ebook',
  'free pdf',

  // Generous framing
  'i\'m giving away',
  'giving this away for free',
  'no strings attached',
  'completely free',
  'i want to help you',
  'i want to give back',
  'just helping the community',
  'sharing because i care',
  'doing this for the community',
  'here to help retail',
  'just trying to help',
  'this one\'s on me',
  'i don\'t normally share this',
  'i usually charge for this',
  'this is worth hundreds',
  'giving away my playbook',
  'dropping this gem for free',
  'free game',
  'free alpha',
];

// ─────────────────────────────────────────────────────────────────────────────
// CIALDINI PRINCIPLE 5: COMMITMENT & CONSISTENCY
// Once people commit publicly, they feel compelled to stay consistent.
// Stock promoters demonstrate their own "commitment" to encourage following.
// ─────────────────────────────────────────────────────────────────────────────

export const COMMITMENT_PHRASES: string[] = [
  // Personal position claims
  'doubled down',
  'adding more shares',
  'backing up the truck',
  'loaded the boat',
  'i\'m all in',
  'went all in',
  'put my life savings in',
  'maxed out my position',
  'averaging down',
  'buying more on the dip',
  'added to my position',
  'increased my stake',
  'not selling a single share',
  'diamond handing this',
  'holding strong',
  'never selling',
  'riding this to zero or the moon',
  'i believe in this company',

  // Public commitment demonstrations
  'i\'ve been in since',
  'been holding for months',
  'long and strong',
  'conviction play',
  'highest conviction position',
  'this is my biggest position',
  'largest position in my portfolio',
  'i quit my job for this',
  'i put my money where my mouth is',
  'proof of position',
  'showing my position',
  'here\'s my portfolio',
  'screenshot of my shares',
  'still holding',
  'not going anywhere',

  // Encouraging follower commitment
  'if you believe in this stock',
  'stay the course',
  'don\'t paper hand',
  'weak hands will sell',
  'only diamond hands survive',
  'shake out the weak hands',
  'trust the process',
  'patience will be rewarded',
  'this is a marathon not a sprint',
  'set it and forget it',
];

// ─────────────────────────────────────────────────────────────────────────────
// CIALDINI PRINCIPLE 6: LIKING
// People comply with those they like, relate to, or feel community with.
// Stock promoters create in-group identity and emotional bonds.
// ─────────────────────────────────────────────────────────────────────────────

export const LIKING_PHRASES: string[] = [
  // Community / In-group identity
  'we\'re all going to make it',
  'wagmi',
  'apes together strong',
  'we\'re in this together',
  'our community',
  'the squad',
  'fam',
  'let\'s eat',
  'let\'s get this bread',
  'we ride at dawn',
  'i got your back',
  'looking out for the little guy',
  'this is for the retail investor',
  'fighting against wall street',
  'us vs them',
  'sticking it to the hedgies',
  'power to the people',
  'power to the players',

  // Relatability / Underdog narrative
  'i was broke too',
  'i started with nothing',
  'i know what it\'s like',
  'i was in your shoes',
  'from rags to riches',
  'changed my life',
  'this changed everything for me',
  'i used to work a 9 to 5',
  'quit the rat race',
  'just a regular guy',
  'just a normal person',
  'i\'m not a financial advisor',
  'just a retail trader like you',
  'one of us',

  // Emotional bonding / Flattery
  'you deserve this',
  'you deserve financial freedom',
  'your family deserves better',
  'do it for your family',
  'generational wealth',
  'leave something for your kids',
  'imagine the look on their face',
  'life is too short',
  'you\'re smart enough to see this',
  'you\'re early',
  'you found this before the masses',
  'congratulations on being here early',
];

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL CATEGORY: CALL-TO-ACTION PHRASES
// Direct commands pushing the audience to buy, subscribe, or join.
// ─────────────────────────────────────────────────────────────────────────────

export const CALL_TO_ACTION_PHRASES: string[] = [
  // Direct buy commands
  'buy now',
  'buy the dip',
  'get in now',
  'get in before it\'s too late',
  'start buying',
  'load up',
  'load the boat',
  'back up the truck',
  'grab shares now',
  'scoop up shares',
  'don\'t sleep on this',
  'add this to your portfolio',
  'put this on your watchlist',
  'you need to own this',

  // Video/Post engagement CTAs
  'smash that like button',
  'hit subscribe',
  'turn on notifications',
  'drop a comment below',
  'share this with a friend',
  'tag someone who needs to see this',
  'retweet if you agree',
  'like and share',
  'save this post',
  'bookmark this',
  'screenshot this',

  // Group/Channel join CTAs
  'join the discord',
  'join the telegram',
  'link in bio',
  'link in description',
  'check the pinned comment',
  'click the link below',
  'dm me for details',
  'dm for the play',
  'message me for more',
  'comment below for access',
  'sign up now',
  'register today',
  'claim your spot',

  // Urgency + CTA combos
  'buy before close',
  'get in before market open',
  'add before the catalyst',
  'don\'t wait',
  'stop watching and start buying',
  'what are you waiting for',
  'the time is now',
  'this is your sign',
  'if you\'re seeing this it\'s not too late',
];

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL CATEGORY: MONETIZATION LANGUAGE
// Phrases used by stock promoters to convert followers into paying customers.
// ─────────────────────────────────────────────────────────────────────────────

export const MONETIZATION_PHRASES: string[] = [
  // Subscription / Membership services
  'join my patreon',
  'support on patreon',
  'become a member',
  'premium membership',
  'vip access',
  'vip membership',
  'gold membership',
  'platinum tier',
  'inner circle',
  'exclusive group',
  'private discord',
  'private telegram',
  'paid discord',
  'paid telegram',

  // Courses / Education products
  'my trading course',
  'enroll in my course',
  'stock market course',
  'trading academy',
  'trading bootcamp',
  'mentorship program',
  'coaching program',
  'one on one mentorship',
  '1-on-1 coaching',
  'learn how to trade',
  'learn my strategy',
  'trading education',
  'options course',
  'penny stock course',

  // Alert / Signal services
  'stock alerts service',
  'real-time alerts',
  'premium alerts',
  'signal service',
  'trade alerts',
  'swing trade alerts',
  'day trade alerts',
  'options alerts',
  'penny stock alerts',
  'crypto alerts',
  'pre-market alerts',
  'after-hours alerts',

  // Donation / Tip solicitation
  'buy me a coffee',
  'cash app',
  'venmo',
  'paypal',
  'super chat',
  'superchat',
  'tip jar',
  'donations appreciated',
  'any donation helps',
  'support the channel',
  'help keep this free',
  'if this helped you',

  // Pricing / Value anchoring
  'normally costs',
  'a steal at this price',
  'worth every penny',
  'pays for itself',
  'one winning trade covers the cost',
  'for less than a coffee a day',
  'cancel anytime',
  'money back guarantee',
  'risk-free trial',
  'free for 7 days',
  'first month free',
  'founding member price',
  'early bird pricing',
  'price goes up',
  'locking in this rate',
];

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL CATEGORY: FOMO-INDUCING LANGUAGE
// Phrases designed to trigger fear of missing out on gains.
// ─────────────────────────────────────────────────────────────────────────────

export const FOMO_PHRASES: string[] = [
  // Missing out framing
  'don\'t miss this',
  'don\'t miss out',
  'you\'ll regret not buying',
  'you\'re going to kick yourself',
  'imagine not buying at these prices',
  'future you will thank you',
  'wish you bought more',
  'you\'ll wish you got in earlier',
  'this is the one you\'ve been waiting for',
  'the one that got away',

  // Comparison to past winners
  'remember when bitcoin was',
  'remember when tesla was',
  'remember when gamestop was',
  'remember when amc was',
  'like buying amazon in 1997',
  'like buying apple in 2003',
  'like buying bitcoin at',
  'like buying tesla at',
  'the next tesla',
  'the next amazon',
  'the next nvidia',
  'bigger than bitcoin',

  // Gains you could have had
  'if you invested last week',
  'those who got in early',
  'early investors are already up',
  'people who listened are up',
  'my subscribers are up',
  'imagine turning 1k into',
  'imagine putting in 10k',
  'could have turned 1000 into',
  'you could have',
  'you should have',

  // Imminent catalyst hype
  'something big is coming',
  'catalyst incoming',
  'announcement coming soon',
  'news dropping soon',
  'about to break out',
  'breakout imminent',
  'ready to explode',
  'about to explode',
  'this is about to pop',
  'coiled spring ready to go',
  'just a matter of time',
  'any day now',
  'the run hasn\'t even started',
  'we\'re still in the first inning',
  'tip of the iceberg',
  'just getting started',
  'this is just the beginning',
  'you ain\'t seen nothing yet',
];

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL CATEGORY: EMOTIONAL MANIPULATION
// Phrases designed to exploit emotions like fear, greed, hope, and shame.
// ─────────────────────────────────────────────────────────────────────────────

export const EMOTIONAL_MANIPULATION_PHRASES: string[] = [
  // Greed triggers
  'life changing money',
  'generational wealth',
  'financial freedom',
  'retire early',
  'quit your job',
  'never work again',
  'passive income for life',
  'money printer',
  'printing money',
  'cash machine',
  'millionaire maker',
  'wealth builder',
  'get rich',
  'make bank',
  'easy money',
  'free money glitch',

  // Fear triggers
  'if you don\'t buy now',
  'you\'ll be left behind',
  'don\'t be on the sidelines',
  'while you\'re sleeping on this',
  'shorts are going to get destroyed',
  'bears are going to get wrecked',
  'the system is rigged against you',
  'inflation is eating your savings',
  'your money is losing value',
  'cash is trash',
  'the dollar is dying',

  // Hope/Dream manipulation
  'imagine waking up',
  'imagine checking your portfolio',
  'picture yourself',
  'think about what you could do',
  'think about your family',
  'what would you do with a million',
  'dream life',
  'change your life',
  'transform your finances',
  'this is your ticket out',
  'escape the matrix',
  'break free',
  'financial independence',
  'be your own boss',

  // Shame / Peer pressure
  'don\'t be a paper hand',
  'only paper hands sell',
  'paper hands will regret',
  'don\'t be that guy who sold early',
  'sellers will cry later',
  'bears always lose',
  'imagine being short right now',
  'short sellers are sweating',
  'doubters will regret',
  'haters will watch from the sidelines',
  'skeptics said the same about tesla',
  'they laughed at me',
  'who\'s laughing now',
];

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL CATEGORY: "TRUST ME" VARIANTS
// Phrases designed to manufacture trust and credibility without evidence.
// ─────────────────────────────────────────────────────────────────────────────

export const TRUST_ME_PHRASES: string[] = [
  // Direct trust appeals
  'trust me bro',
  'trust me on this',
  'trust me on this one',
  'trust the process',
  'just trust me',
  'hear me out',
  'believe me',
  'i promise you',
  'i guarantee you',
  'i\'m telling you',
  'mark my words',
  'remember this tweet',
  'remember this post',
  'screenshot this',
  'come back to this in a month',
  'save this post',
  'bookmark this',

  // Track record appeals
  'i called it',
  'i told you so',
  'told you this was coming',
  'called it again',
  'another winner',
  'that\'s 5 in a row',
  'been right every time',
  'my track record speaks',
  'check my history',
  'look at my past calls',
  'scroll through my timeline',
  'receipts are there',
  'i have the receipts',
  'proof is in the pudding',

  // "Inside knowledge" framing
  'i can\'t say too much',
  'i know something you don\'t',
  'my sources tell me',
  'a little birdie told me',
  'connected people are saying',
  'word on the street',
  'i have it on good authority',
  'from a reliable source',
  'someone in the know',
  'people close to the company',
  'you didn\'t hear this from me',
  'off the record',
  'between us',
  'keep this quiet',
  'don\'t spread this around',
  'iykyk',
  'if you know you know',
  'those who know, know',
];

// ─────────────────────────────────────────────────────────────────────────────
// ADDITIONAL CATEGORY: PLATFORM-SPECIFIC PHRASES
// Promotion language unique to specific social media platforms.
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORM_SPECIFIC_PHRASES: Record<string, string[]> = {
  stocktwits: [
    'bullish',
    'extremely bullish',
    'strong buy',
    'loading shares',
    'price target',
    'pt:',
    'next resistance',
    'support level',
    'bull flag',
    'breakout confirmed',
    'gap up incoming',
    'going to rip',
    'shorts are trapped',
    'short interest',
    'see my profile for alerts',
    'follow for more alerts',
  ],
  twitter: [
    'ct is sleeping on this',
    'crypto twitter',
    'fintwit',
    'stock twitter sleeping',
    'qrt if you\'re holding',
    'ratio this bear',
    'this ratio says it all',
    'thread incoming',
    'a thread on why',
    'here\'s why i\'m bullish',
    'unpopular opinion',
    'hot take',
    'cashtag',
    'quote tweet if you agree',
  ],
  youtube: [
    'in today\'s video',
    'welcome back to the channel',
    'best stock to buy now',
    'top stocks for',
    'stocks that will make you rich',
    'stock of the year',
    'must watch before market open',
    'pre-market analysis',
    'my number one pick',
    'don\'t forget to subscribe',
    'hit the bell icon',
    'leave a comment below',
    'check the description',
    'use code',
    'sponsored by',
    'affiliate link',
  ],
  reddit: [
    'dd inside',
    'due diligence',
    'comprehensive dd',
    'why i\'m bullish on',
    'this is not financial advice',
    'obligatory this is not financial advice',
    'nfa but',
    'dyor but',
    'to the moon',
    'diamond hands',
    'wife\'s boyfriend',
    'smooth brain',
    'wrinkle brain',
    'loss porn',
    'gain porn',
    'positions or ban',
    'yolo update',
    'ape in',
    'tendies',
  ],
  discord: [
    'check the alerts channel',
    'posted in premium',
    'vip channel drop',
    'just posted an alert',
    'new pick just dropped',
    'check #alerts',
    'check pinned messages',
    'dm me for access',
    'premium picks channel',
    'upgrade to vip',
    'free tier vs premium',
    'server boost to unlock',
    'patreon supporters only',
    'early access for members',
  ],
  tiktok: [
    'stocks to buy right now',
    'best stock for beginners',
    'how i made',
    'i made this much from stocks',
    'investing for beginners',
    'financial literacy',
    'money tips',
    'side hustle',
    'passive income',
    'day in the life of a trader',
    'how i quit my 9 to 5',
    'trading from my phone',
    'robinhood tutorial',
    'webull free stocks',
    'stitch this',
    'part 2 coming',
    'follow for part 2',
    'investing hack',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// REGEX PATTERNS FOR FLEXIBLE MATCHING
// Catch variations, typos, and obfuscated versions of key phrases.
// ─────────────────────────────────────────────────────────────────────────────

export interface PersuasionRegexPattern {
  regex: RegExp;
  principle: PersuasionPrinciple;
  flag: string;
  weight: number; // Score contribution
}

export type PersuasionPrinciple =
  | 'SCARCITY'
  | 'AUTHORITY'
  | 'SOCIAL_PROOF'
  | 'RECIPROCITY'
  | 'COMMITMENT'
  | 'LIKING'
  | 'CALL_TO_ACTION'
  | 'MONETIZATION'
  | 'FOMO'
  | 'EMOTIONAL_MANIPULATION'
  | 'TRUST_ME';

export const PERSUASION_REGEX_PATTERNS: PersuasionRegexPattern[] = [
  // Specific return claims: "500% in 2 weeks", "10x by Friday"
  {
    regex: /\d{2,4}\s*%\s*(?:in|within|by|over|before)\s+\d+\s*(?:day|week|month|hour)/gi,
    principle: 'EMOTIONAL_MANIPULATION',
    flag: 'Specific return claim with timeframe',
    weight: 25,
  },
  // Multiplier claims: "10x", "100x", "1000x potential"
  {
    regex: /\b(\d{2,4})x\s*(?:potential|gains?|returns?|from here|your money|guaranteed)/gi,
    principle: 'EMOTIONAL_MANIPULATION',
    flag: 'Multiplier gain claim',
    weight: 20,
  },
  // Price target hype: "PT $50", "price target $100"
  {
    regex: /(?:pt|price target)\s*(?:of\s*)?\$\d+/gi,
    principle: 'AUTHORITY',
    flag: 'Price target claim',
    weight: 10,
  },
  // "I turned $X into $Y" gain claims
  {
    regex: /(?:turned|made|grew)\s*\$[\d,]+\s*(?:into|to|from)\s*\$[\d,]+/gi,
    principle: 'SOCIAL_PROOF',
    flag: 'Specific dollar gain claim',
    weight: 20,
  },
  // "Up XX% today/this week" performance bragging
  {
    regex: /up\s+\d{2,4}\s*%\s*(?:today|this week|this month|already|so far)/gi,
    principle: 'SOCIAL_PROOF',
    flag: 'Performance percentage claim',
    weight: 15,
  },
  // Countdown urgency: "only X hours/days left"
  {
    regex: /only\s+\d+\s*(?:hours?|days?|minutes?|spots?|seats?)\s*(?:left|remaining)/gi,
    principle: 'SCARCITY',
    flag: 'Countdown urgency',
    weight: 20,
  },
  // Multi-emoji hype (3+ money/rocket/fire emojis in a row)
  {
    regex: /(?:[\uD83D\uDE80\uD83D\uDCB0\uD83D\uDCB5\uD83D\uDCB8\uD83D\uDD25\uD83D\uDCA5\uD83E\uDD11][\s]*){3,}/g,
    principle: 'EMOTIONAL_MANIPULATION',
    flag: 'Excessive hype emojis',
    weight: 10,
  },
  // URL patterns for monetization (Patreon, BuyMeACoffee, Gumroad, etc.)
  {
    regex: /(?:patreon\.com|buymeacoffee\.com|gumroad\.com|ko-fi\.com|discord\.gg|t\.me|bit\.ly)\/\S+/gi,
    principle: 'MONETIZATION',
    flag: 'Monetization link detected',
    weight: 15,
  },
  // "NOT financial advice" disclaimers (paradoxically a strong promotional signal)
  {
    regex: /(?:not|n't)\s*(?:a\s*)?(?:financial|investment)\s*(?:advice|advisor|recommendation)/gi,
    principle: 'TRUST_ME',
    flag: 'Contains "not financial advice" disclaimer',
    weight: 5,
  },
  // Dollar sign + ticker format spam: multiple "$XXXX" in single post
  {
    regex: /\$[A-Z]{2,5}/g,
    principle: 'CALL_TO_ACTION',
    flag: 'Multi-ticker mention (check count)',
    weight: 0, // Weight depends on count; handled in scoring logic
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMBINED INDEX: All phrases organized by Cialdini principle
// ─────────────────────────────────────────────────────────────────────────────

export interface PersuasionCategory {
  principle: PersuasionPrinciple;
  name: string;
  description: string;
  phrases: string[];
  weight: number; // Default weight for phrase matches in this category
}

export const PERSUASION_CATEGORIES: PersuasionCategory[] = [
  {
    principle: 'SCARCITY',
    name: 'Scarcity',
    description: 'Creates artificial urgency or limited availability to prevent rational decision-making',
    phrases: SCARCITY_PHRASES,
    weight: 20,
  },
  {
    principle: 'AUTHORITY',
    name: 'Authority',
    description: 'Invokes institutional investors, credentials, or expertise to manufacture credibility',
    phrases: AUTHORITY_PHRASES,
    weight: 15,
  },
  {
    principle: 'SOCIAL_PROOF',
    name: 'Social Proof',
    description: 'Claims widespread adoption or community consensus to normalize the behavior',
    phrases: SOCIAL_PROOF_PHRASES,
    weight: 15,
  },
  {
    principle: 'RECIPROCITY',
    name: 'Reciprocity',
    description: 'Offers "free" resources to create a sense of obligation',
    phrases: RECIPROCITY_PHRASES,
    weight: 10,
  },
  {
    principle: 'COMMITMENT',
    name: 'Commitment & Consistency',
    description: 'Demonstrates personal commitment to encourage followers to stay consistent',
    phrases: COMMITMENT_PHRASES,
    weight: 10,
  },
  {
    principle: 'LIKING',
    name: 'Liking',
    description: 'Builds in-group identity and emotional bonds to create trust and compliance',
    phrases: LIKING_PHRASES,
    weight: 10,
  },
  {
    principle: 'CALL_TO_ACTION',
    name: 'Call to Action',
    description: 'Direct commands to buy, subscribe, join, or engage immediately',
    phrases: CALL_TO_ACTION_PHRASES,
    weight: 15,
  },
  {
    principle: 'MONETIZATION',
    name: 'Monetization',
    description: 'Language promoting paid services, courses, subscriptions, or donations',
    phrases: MONETIZATION_PHRASES,
    weight: 20,
  },
  {
    principle: 'FOMO',
    name: 'FOMO (Fear of Missing Out)',
    description: 'Triggers fear of missing potential gains by referencing past winners or imminent catalysts',
    phrases: FOMO_PHRASES,
    weight: 20,
  },
  {
    principle: 'EMOTIONAL_MANIPULATION',
    name: 'Emotional Manipulation',
    description: 'Exploits greed, fear, hope, and shame to override rational analysis',
    phrases: EMOTIONAL_MANIPULATION_PHRASES,
    weight: 20,
  },
  {
    principle: 'TRUST_ME',
    name: '"Trust Me" Variants',
    description: 'Manufactures trust and credibility through track record claims and insider framing',
    phrases: TRUST_ME_PHRASES,
    weight: 15,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SCORING FUNCTION: Analyze text for persuasion/manipulation signals
// ─────────────────────────────────────────────────────────────────────────────

export interface PersuasionAnalysisResult {
  totalScore: number;
  principleScores: Record<PersuasionPrinciple, number>;
  matchedPhrases: Array<{
    phrase: string;
    principle: PersuasionPrinciple;
    weight: number;
  }>;
  regexMatches: Array<{
    match: string;
    principle: PersuasionPrinciple;
    flag: string;
    weight: number;
  }>;
  flags: string[];
  dominantPrinciple: PersuasionPrinciple | null;
  manipulationLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
}

/**
 * Analyze text for persuasion and manipulation phrases across all Cialdini principles.
 *
 * Returns a detailed breakdown of which principles are present, matched phrases,
 * and an overall manipulation score.
 *
 * @param text - The social media post, comment, or video transcript to analyze
 * @param platform - Optional platform name for platform-specific pattern matching
 * @returns Detailed persuasion analysis result
 */
export function analyzePersuasionTechniques(
  text: string,
  platform?: string
): PersuasionAnalysisResult {
  const lower = text.toLowerCase();
  let totalScore = 0;
  const principleScores: Record<PersuasionPrinciple, number> = {
    SCARCITY: 0,
    AUTHORITY: 0,
    SOCIAL_PROOF: 0,
    RECIPROCITY: 0,
    COMMITMENT: 0,
    LIKING: 0,
    CALL_TO_ACTION: 0,
    MONETIZATION: 0,
    FOMO: 0,
    EMOTIONAL_MANIPULATION: 0,
    TRUST_ME: 0,
  };
  const matchedPhrases: PersuasionAnalysisResult['matchedPhrases'] = [];
  const regexMatches: PersuasionAnalysisResult['regexMatches'] = [];
  const flags: string[] = [];

  // 1. Check all phrase categories
  for (const category of PERSUASION_CATEGORIES) {
    for (const phrase of category.phrases) {
      if (lower.includes(phrase)) {
        totalScore += category.weight;
        principleScores[category.principle] += category.weight;
        matchedPhrases.push({
          phrase,
          principle: category.principle,
          weight: category.weight,
        });
        if (flags.length < 20) {
          flags.push(`[${category.principle}] Contains "${phrase}"`);
        }
      }
    }
  }

  // 2. Check platform-specific phrases if platform is provided
  if (platform) {
    const platformKey = platform.toLowerCase();
    const platformPhrases = PLATFORM_SPECIFIC_PHRASES[platformKey];
    if (platformPhrases) {
      for (const phrase of platformPhrases) {
        if (lower.includes(phrase)) {
          totalScore += 10;
          // Map platform phrases to CALL_TO_ACTION as a general bucket
          principleScores['CALL_TO_ACTION'] += 10;
          matchedPhrases.push({
            phrase,
            principle: 'CALL_TO_ACTION',
            weight: 10,
          });
          if (flags.length < 20) {
            flags.push(`[PLATFORM:${platformKey}] Contains "${phrase}"`);
          }
        }
      }
    }
  }

  // 3. Check regex patterns
  for (const pattern of PERSUASION_REGEX_PATTERNS) {
    const matches = text.match(pattern.regex);
    if (matches && pattern.weight > 0) {
      for (const match of matches) {
        totalScore += pattern.weight;
        principleScores[pattern.principle] += pattern.weight;
        regexMatches.push({
          match,
          principle: pattern.principle,
          flag: pattern.flag,
          weight: pattern.weight,
        });
      }
      if (flags.length < 20) {
        flags.push(`[${pattern.principle}] ${pattern.flag}`);
      }
    }

    // Special handling: multi-ticker detection
    if (pattern.flag === 'Multi-ticker mention (check count)' && matches) {
      const uniqueTickers = new Set(matches).size;
      if (uniqueTickers >= 6) {
        totalScore += 30;
        principleScores['CALL_TO_ACTION'] += 30;
        flags.push(`[CALL_TO_ACTION] Lists ${uniqueTickers} tickers (likely alert spam)`);
      } else if (uniqueTickers >= 4) {
        totalScore += 20;
        principleScores['CALL_TO_ACTION'] += 20;
        flags.push(`[CALL_TO_ACTION] Lists ${uniqueTickers} tickers (multi-ticker promotion)`);
      }
    }

    // Reset regex state for global regexes
    pattern.regex.lastIndex = 0;
  }

  // 4. Determine dominant principle
  let dominantPrinciple: PersuasionPrinciple | null = null;
  let maxPrincipleScore = 0;
  for (const [principle, score] of Object.entries(principleScores)) {
    if (score > maxPrincipleScore) {
      maxPrincipleScore = score;
      dominantPrinciple = principle as PersuasionPrinciple;
    }
  }

  // 5. Determine manipulation level
  let manipulationLevel: PersuasionAnalysisResult['manipulationLevel'];
  const distinctPrinciplesUsed = Object.values(principleScores).filter(s => s > 0).length;

  if (totalScore === 0) {
    manipulationLevel = 'NONE';
  } else if (totalScore < 30) {
    manipulationLevel = 'LOW';
  } else if (totalScore < 80) {
    manipulationLevel = 'MEDIUM';
  } else if (totalScore < 150 || distinctPrinciplesUsed < 4) {
    manipulationLevel = 'HIGH';
  } else {
    // 150+ score OR uses 4+ distinct principles = coordinated manipulation campaign
    manipulationLevel = 'EXTREME';
  }

  // Boost level if many distinct principles are used (sign of sophisticated manipulation)
  if (distinctPrinciplesUsed >= 5 && manipulationLevel === 'MEDIUM') {
    manipulationLevel = 'HIGH';
  }
  if (distinctPrinciplesUsed >= 5 && manipulationLevel === 'HIGH') {
    manipulationLevel = 'EXTREME';
  }

  return {
    totalScore: Math.min(totalScore, 300), // Cap at 300
    principleScores,
    matchedPhrases,
    regexMatches,
    flags,
    dominantPrinciple,
    manipulationLevel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY: Get flat list of all phrases for simple matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a flat array of all persuasion phrases across all categories.
 * Useful for simple "contains any" checks.
 */
export function getAllPersuasionPhrases(): string[] {
  const all: string[] = [];
  for (const category of PERSUASION_CATEGORIES) {
    all.push(...category.phrases);
  }
  for (const phrases of Object.values(PLATFORM_SPECIFIC_PHRASES)) {
    all.push(...phrases);
  }
  return all;
}

/**
 * Returns phrase count statistics for each category.
 * Useful for logging and validation.
 */
export function getPhraseCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const category of PERSUASION_CATEGORIES) {
    counts[category.principle] = category.phrases.length;
  }
  for (const [platform, phrases] of Object.entries(PLATFORM_SPECIFIC_PHRASES)) {
    counts[`PLATFORM_${platform.toUpperCase()}`] = phrases.length;
  }
  counts['TOTAL'] = getAllPersuasionPhrases().length;
  counts['REGEX_PATTERNS'] = PERSUASION_REGEX_PATTERNS.length;
  return counts;
}
