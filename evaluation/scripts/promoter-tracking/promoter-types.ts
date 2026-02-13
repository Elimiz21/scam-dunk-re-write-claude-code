/**
 * Types for the Promoter Matrix System
 *
 * Tracks promoters across stocks, detects repeat offenders,
 * and identifies coordinated promotion networks.
 */

// ─── Promoter Identity ──────────────────────────────────────────────────────

export interface Promoter {
  id: string;
  displayName: string;        // Primary known name
  firstSeen: string;          // ISO date
  lastSeen: string;           // ISO date

  // Cross-platform identities
  identities: PromoterIdentity[];

  // Track record
  totalStocksPromoted: number;
  confirmedDumps: number;
  repeatOffenderScore: number; // 0-100
  avgVictimLoss: number;       // Average % loss (negative number, e.g., -79)

  // Network membership
  networkId?: string;

  // Status
  isActive: boolean;           // Currently promoting something?
  riskLevel: PromoterRiskLevel;
  notes: string;
}

export type PromoterRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'SERIAL_OFFENDER';

export interface PromoterIdentity {
  id: string;
  promoterId: string;
  platform: string;            // "Twitter", "Reddit", "Discord", "Instagram", etc.
  username: string;            // "@StockGuru2026", "PennyKing99"
  profileUrl?: string;         // "https://twitter.com/StockGuru2026"
  firstSeen: string;
  lastSeen: string;
  isVerified: boolean;         // Admin confirmed this is the right person

  // Metadata (if extractable)
  followerCount?: number;
  accountAge?: string;         // ISO date of account creation
}

// ─── Stock-Promoter Link ─────────────────────────────────────────────────────

export interface PromoterStockLink {
  id: string;
  promoterId: string;
  schemeId: string;            // e.g., "SCH-ACME-20260210"
  ticker: string;

  // Activity
  firstPromotionDate: string;
  lastPromotionDate: string;
  totalPosts: number;
  platforms: string[];         // Which platforms they promoted on
  avgPromotionScore: number;   // 0-100

  // Evidence
  evidenceLinks: string[];     // URLs to specific posts
  screenshotUrls: string[];    // URLs in Supabase Storage

  // Outcome (filled after scheme resolves)
  priceAtFirstPromotion?: number;
  peakPrice?: number;
  priceAfterDump?: number;
  gainForPromoter?: number;    // % gain if sold at peak
  lossForVictims?: number;     // % loss from peak to post-dump
}

// ─── Promoter Network ────────────────────────────────────────────────────────

export interface PromoterNetwork {
  id: string;
  name: string;                // Auto-generated or admin-assigned

  // Members
  memberIds: string[];         // Promoter IDs

  // Detection metrics
  coPromotionCount: number;    // How many stocks co-promoted
  avgTimingGapHours: number;   // Average hours between their posts on same stock
  confidenceScore: number;     // 0-100

  // Track record
  totalSchemes: number;
  confirmedDumps: number;
  dumpRate: number;            // 0-100 percentage

  firstDetected: string;
  lastActive: string;
  isActive: boolean;
}

// ─── Repeat Offender Score Components ────────────────────────────────────────

export interface RepeatOffenderScoreBreakdown {
  trackRecordScore: number;    // (confirmedDumps / totalStocks) * 40
  volumeScore: number;         // totalStocksPromoted * 10, capped at 40
  intensityScore: number;      // avgPromotionScore * 0.3
  networkBonus: number;        // +10 if in a network
  newAccountBonus: number;     // +10 if account < 6 months old
  totalScore: number;          // Capped at 100
  riskLevel: PromoterRiskLevel;
}

export function calculateRepeatOffenderScore(params: {
  totalStocksPromoted: number;
  confirmedDumps: number;
  avgPromotionScore: number;
  isInNetwork: boolean;
  accountAgeMonths?: number;
}): RepeatOffenderScoreBreakdown {
  const { totalStocksPromoted, confirmedDumps, avgPromotionScore, isInNetwork, accountAgeMonths } = params;

  const trackRecordScore = totalStocksPromoted > 0
    ? (confirmedDumps / totalStocksPromoted) * 40
    : 0;

  const volumeScore = Math.min(totalStocksPromoted * 10, 40);
  const intensityScore = avgPromotionScore * 0.3;
  const networkBonus = isInNetwork ? 10 : 0;
  const newAccountBonus = (accountAgeMonths !== undefined && accountAgeMonths < 6) ? 10 : 0;

  const totalScore = Math.min(
    Math.round(trackRecordScore + volumeScore + intensityScore + networkBonus + newAccountBonus),
    100
  );

  let riskLevel: PromoterRiskLevel;
  if (totalScore >= 76) riskLevel = 'SERIAL_OFFENDER';
  else if (totalScore >= 51) riskLevel = 'HIGH';
  else if (totalScore >= 26) riskLevel = 'MEDIUM';
  else riskLevel = 'LOW';

  return {
    trackRecordScore: Math.round(trackRecordScore),
    volumeScore,
    intensityScore: Math.round(intensityScore),
    networkBonus,
    newAccountBonus,
    totalScore,
    riskLevel,
  };
}

// ─── Network Detection ───────────────────────────────────────────────────────

export interface CoPromotionPair {
  promoterA: string;           // Promoter ID
  promoterB: string;           // Promoter ID
  sharedTickers: string[];     // Tickers they both promoted
  avgTimingGapHours: number;
  confidenceScore: number;
}

export function calculateNetworkConfidence(params: {
  sharedTickerCount: number;
  avgTimingGapHours: number;
  platformDiversity: number;   // How many different platforms involved
  allDumped: boolean;
}): number {
  let score = 0;

  // More co-promoted stocks = higher confidence
  score += Math.min(params.sharedTickerCount * 20, 40);

  // Timing proximity (closer = more suspicious)
  if (params.avgTimingGapHours < 6) score += 25;
  else if (params.avgTimingGapHours < 24) score += 15;
  else if (params.avgTimingGapHours < 48) score += 10;

  // Platform diversity (same stock promoted on different platforms)
  score += Math.min(params.platformDiversity * 5, 15);

  // All stocks dumped = very suspicious
  if (params.allDumped) score += 20;

  return Math.min(score, 100);
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export type PromoterAlertType =
  | 'REPEAT_OFFENDER_ACTIVE'    // Known repeat offender is promoting a stock
  | 'NETWORK_ACTIVE'            // Known coordinated network is active
  | 'NEW_SERIAL_OFFENDER'       // Someone just crossed the SERIAL_OFFENDER threshold
  | 'NETWORK_DETECTED'          // New coordination pattern found
  | 'HIGH_RISK_PROMOTER_NEW'    // New promoter with suspicious characteristics
  ;

export interface PromoterAlert {
  type: PromoterAlertType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  ticker: string;
  message: string;
  promoterId?: string;
  promoterName?: string;
  networkId?: string;
  networkName?: string;
  repeatOffenderScore?: number;
  priorDumps?: number;
  timestamp: string;
}
