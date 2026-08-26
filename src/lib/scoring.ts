/**
 * Risk Scoring Module
 *
 * Thin async wrapper around the dependency-free scoring engine
 * (`src/lib/scoring/engine.ts`). The engine is the single source of truth for
 * all scoring math and is shared with the offline evaluation harness so that
 * production behaviour and calibration never fork (audit TS-C7).
 *
 * The only thing this module adds on top of the pure engine is the asynchronous
 * regulatory alert-list lookup (Prisma + live feeds), which cannot live in the
 * pure engine. The LLM is NOT involved in scoring - only in narrative text.
 */

import { RiskSignal, ScoringInput, ScoringResult } from "./types";
import { checkAlertList } from "./marketData";
import {
  SIGNAL_CODES,
  scoreMarketData,
  checkIsLegitimate as engineCheckIsLegitimate,
} from "./scoring/engine";

// Re-export the canonical signal codes + pure helpers so existing import sites
// (`import { SIGNAL_CODES, ... } from "@/lib/scoring"`) keep working.
export { SIGNAL_CODES };
export {
  scoreMarketData,
  dedupeSignalScore,
  calculateRiskLevel,
  checkIsLegitimate,
  getDataCompleteness,
  getMarketCategory,
} from "./scoring/engine";

/** Shared legitimacy check (also exported for the AI path in the route). */
export const computeIsLegitimate = engineCheckIsLegitimate;

/**
 * Main scoring function.
 *
 * Resolves the async alert-list hit (unless the caller already computed it and
 * passed `input.secFlagged`), then delegates all scoring math to the pure
 * engine. Running the alert-list check is independent of whether a quote
 * exists, so a trading-suspended ticker with no live price still scores HIGH
 * (audit TS-C6).
 */
export async function computeRiskScore(
  input: ScoringInput,
): Promise<ScoringResult> {
  let secFlagged = input.secFlagged ?? false;

  // If the route hasn't already resolved the alert-list status, do it here.
  // Only needs the ticker — not a quote — so suspended tickers are covered.
  if (input.secFlagged === undefined) {
    const ticker = input.marketData.quote?.ticker;
    if (ticker) {
      try {
        secFlagged = await checkAlertList(ticker);
      } catch (error) {
        console.error("Alert list check failed during scoring:", error);
        secFlagged = false;
      }
    }
  }

  return scoreMarketData({ ...input, secFlagged });
}

/**
 * Get signals by category for narrative generation.
 */
export function getSignalsByCategory(signals: RiskSignal[]): {
  structural: RiskSignal[];
  pattern: RiskSignal[];
  alert: RiskSignal[];
  behavioral: RiskSignal[];
  social: RiskSignal[];
} {
  return {
    structural: signals.filter((s) => s.category === "STRUCTURAL"),
    pattern: signals.filter((s) => s.category === "PATTERN"),
    alert: signals.filter((s) => s.category === "ALERT"),
    behavioral: signals.filter((s) => s.category === "BEHAVIORAL"),
    social: signals.filter((s) => s.category === "SOCIAL"),
  };
}
