/**
 * Standalone Scoring Module for Evaluation
 *
 * This is a self-contained version of the scoring logic that doesn't
 * depend on Next.js or database connections.
 */

// Types
export interface PriceHistory {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockQuote {
  ticker: string;
  companyName: string;
  exchange: string;
  lastPrice: number;
  marketCap: number;
  avgVolume30d: number;
  avgDollarVolume30d: number;
}

export interface MarketData {
  quote: StockQuote | null;
  priceHistory: PriceHistory[];
  isOTC: boolean;
  dataAvailable: boolean;
}

export interface RiskSignal {
  code: string;
  category: "STRUCTURAL" | "PATTERN" | "ALERT" | "BEHAVIORAL" | "SOCIAL";
  weight: number;
  description: string;
}

export interface ScoringResult {
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT";
  totalScore: number;
  signals: RiskSignal[];
  isLegitimate: boolean;
  isInsufficient: boolean;
}

// Every deterministic entry point uses the customer engine and policy.
export { SIGNAL_CODES } from "../../src/lib/scoring/engine";
import { scoreMarketData } from "../../src/lib/scoring/engine";

export function computeRiskScore(marketData: MarketData): ScoringResult {
  return scoreMarketData({ marketData, pitchText: "", context: {}, secFlagged: false });
}
