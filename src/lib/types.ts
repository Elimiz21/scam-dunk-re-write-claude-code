// API Request/Response Types for ScamDunk

export type Plan = "FREE" | "PAID";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT";

export type SignalCategory = "STRUCTURAL" | "PATTERN" | "ALERT" | "BEHAVIORAL";

export interface RiskSignal {
  code: string;
  category: SignalCategory;
  description: string;
  weight: number;
}

export type AssetType = "stock" | "crypto";

export interface CheckRequest {
  ticker: string;
  companyName?: string;
  assetType?: AssetType;
  pitchText?: string;
  context?: {
    unsolicited?: boolean;
    promisesHighReturns?: boolean;
    urgencyPressure?: boolean;
    secrecyInsideInfo?: boolean;
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

export interface RiskResponse {
  riskLevel: RiskLevel;
  totalScore: number;
  signals: RiskSignal[];
  stockSummary: StockSummary;
  narrative: Narrative;
  usage: UsageInfo;
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
}

// Scoring Types
export interface ScoringInput {
  marketData: MarketData;
  pitchText: string;
  context: {
    unsolicited: boolean;
    promisesHighReturns: boolean;
    urgencyPressure: boolean;
    secrecyInsideInfo: boolean;
  };
}

export interface ScoringResult {
  signals: RiskSignal[];
  totalScore: number;
  riskLevel: RiskLevel;
  isInsufficient: boolean;
}
