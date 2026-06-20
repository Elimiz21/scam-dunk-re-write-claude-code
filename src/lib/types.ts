// API Request/Response Types for ScamDunk

export type Plan = "FREE" | "PAID";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT";

export type SignalCategory =
  | "STRUCTURAL"
  | "PATTERN"
  | "ALERT"
  | "BEHAVIORAL"
  | "SOCIAL";

export interface RiskSignal {
  code: string;
  category: SignalCategory;
  description: string;
  weight: number;
}

export type AssetType = "stock" | "crypto";

/**
 * Market category for a security. Distinct from `isOTC` so that crypto assets
 * are not mislabelled as OTC-traded penny stocks. Used to pick thresholds and
 * to decide whether the OTC_EXCHANGE structural signal applies.
 */
export type MarketCategory = "MAJOR" | "OTC" | "CRYPTO" | "UNKNOWN";

/**
 * Confidence in the data backing a scoring result.
 * - "full": quote + >= 30 daily price points (all signal families evaluable)
 * - "quote-only": quote present but < 30 price points (pattern/anomaly skipped)
 * - "none": no usable market data at all
 */
export type DataCompleteness = "full" | "quote-only" | "none";

/**
 * Behavioral red-flag context. All flags concrete booleans once normalized.
 * Use `normalizeBehavioralContext` to turn an optional/partial API payload into this.
 */
export interface BehavioralContext {
  unsolicited: boolean;
  promisesHighReturns: boolean;
  urgencyPressure: boolean;
  secrecyInsideInfo: boolean;
}

export interface CheckRequest {
  ticker: string;
  companyName?: string;
  assetType?: AssetType;
  pitchText?: string;
  context?: Partial<BehavioralContext>;
}

/** Fill missing behavioral flags with `false` so scoring always sees concrete booleans. */
export function normalizeBehavioralContext(
  context?: Partial<BehavioralContext>,
): BehavioralContext {
  return {
    unsolicited: context?.unsolicited ?? false,
    promisesHighReturns: context?.promisesHighReturns ?? false,
    urgencyPressure: context?.urgencyPressure ?? false,
    secrecyInsideInfo: context?.secrecyInsideInfo ?? false,
  };
}

export interface StockSummary {
  ticker: string;
  companyName?: string;
  exchange?: string;
  lastPrice?: number;
  marketCap?: number;
  avgDollarVolume30d?: number;
}

export interface UsageInfo {
  plan: Plan;
  scansUsedThisMonth: number;
  scansLimitThisMonth: number;
  limitReached: boolean;
}

export interface Narrative {
  header: string;
  stockRedFlags: string[];
  behaviorRedFlags: string[];
  suggestions: string[];
  disclaimers: string[];
}

export interface NewsVerification {
  hasLegitimateCatalyst: boolean;
  hasSecFilings: boolean;
  hasPromotionalSignals: boolean;
  catalystSummary: string;
  shouldReduceRisk: boolean;
  recommendedLevel: string;
}

export interface RiskResponse {
  riskLevel: RiskLevel;
  totalScore: number;
  signals: RiskSignal[];
  stockSummary: StockSummary;
  narrative: Narrative;
  usage: UsageInfo;
  isLegitimate?: boolean;
  newsVerification?: NewsVerification;
  /**
   * Data confidence indicator surfaced to the client so partial-data scans
   * (e.g. quote present but price history unavailable) are not mistaken for a
   * confident LOW. See DataCompleteness.
   */
  dataCompleteness?: DataCompleteness;
}

export interface LimitReachedResponse {
  error: "LIMIT_REACHED";
  usage: {
    plan: Plan;
    scansUsedThisMonth: number;
    scansLimitThisMonth: number;
  };
}

export type CheckResponse = RiskResponse | LimitReachedResponse;

// Market Data Types
export interface StockQuote {
  ticker: string;
  companyName: string;
  exchange: string;
  lastPrice: number;
  marketCap: number;
  avgVolume30d: number;
  avgDollarVolume30d: number;
}

export interface PriceHistory {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketData {
  quote: StockQuote | null;
  priceHistory: PriceHistory[];
  isOTC: boolean;
  dataAvailable: boolean;
  /**
   * Market category. When omitted, callers should derive it from `isOTC`
   * (true => "OTC", false => "MAJOR"). Crypto fetchers set this to "CRYPTO"
   * so OTC_EXCHANGE never mislabels a coin as an OTC penny stock.
   */
  category?: MarketCategory;
}

// Scoring Types
export interface ScoringInput {
  marketData: MarketData;
  pitchText: string;
  context: BehavioralContext;
  /**
   * Pre-computed regulatory/alert-list hit from the route layer. When true the
   * engine emits ALERT_LIST_HIT and forces HIGH even with no quote (e.g. a
   * trading-suspended ticker with no live price). When undefined the async
   * `computeRiskScore` performs its own alert-list lookup.
   */
  secFlagged?: boolean;
}

export interface ScoringResult {
  signals: RiskSignal[];
  totalScore: number;
  riskLevel: RiskLevel;
  isInsufficient: boolean;
  isLegitimate: boolean;
  /** How complete the underlying market data was. */
  dataCompleteness: DataCompleteness;
}
