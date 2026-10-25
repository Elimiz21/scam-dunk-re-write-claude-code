import policy from "../../../python_ai/scoring-policy.json";
import type { RiskSignal, RiskLevel } from "../types";

export const SCORING_VERSION = policy.version;
export const SCORE_UNIT = policy.scoreUnit;
/** Earlier unversioned values may contain model-derived units. Never compare them as rule points. */
export function currentSignalPoints(score: unknown, version: unknown, riskLevel?: string): number | null {
  return version === SCORING_VERSION && riskLevel !== "INSUFFICIENT" && typeof score === "number" && Number.isFinite(score) && score >= 0 ? score : null;
}
const families = Object.values(policy.families).map((codes) => new Set<string>(codes));

/** Signals remain visible; overlapping observations contribute their maximum. */
export function scoreSignals(signals: RiskSignal[]): number {
  const maximums = families.map(() => 0);
  let independent = 0;
  const distinct = new Map<string, RiskSignal>();
  for (const signal of signals) {
    if (!Number.isFinite(signal.weight) || signal.weight < 0) throw new Error("Invalid signal weight");
    const previous = distinct.get(signal.code);
    if (!previous || signal.weight > previous.weight) distinct.set(signal.code, signal);
  }
  for (const signal of Array.from(distinct.values())) {
    const family = families.findIndex((codes) => codes.has(signal.code));
    if (family < 0) independent += signal.weight;
    else maximums[family] = Math.max(maximums[family], signal.weight);
  }
  return independent + maximums.reduce((sum, weight) => sum + weight, 0);
}

export function levelFromSignals(score: number, signals: RiskSignal[]): RiskLevel {
  if (signals.some((signal) => signal.code === "ALERT_LIST_HIT")) return "HIGH";
  const hasHighEvidence = signals.some((signal) => policy.highEvidenceCodes.includes(signal.code) || policy.highEvidenceCategories.includes(signal.category));
  if (score >= policy.highThreshold && hasHighEvidence) return "HIGH";
  if (score >= policy.mediumThreshold) return "MEDIUM";
  return "LOW";
}
