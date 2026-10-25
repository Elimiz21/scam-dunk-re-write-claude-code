/** Compatibility endpoint: uses the same durable scan and rule contract as /api/check. */
import { NextRequest, NextResponse } from "next/server";
import { processCheckRequest } from "@/lib/check-scan";
import { SCORING_VERSION, SCORE_UNIT } from "@/lib/scoring/policy";
import type { RiskResponse } from "@/lib/types";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  const response = await processCheckRequest(request);
  if (!response.ok) return response;
  const result = await response.json() as RiskResponse;
  return NextResponse.json({
    ...result, source: "canonical_rules", ticker: result.stockSummary.ticker,
    riskScore: result.totalScore, riskProbability: null,
    models: {rfProbability: null, lstmProbability: null, anomalyScore: null, layersApplied: ["rule_signals"]},
    features: {}, explanations: result.signals.map(signal => signal.description),
    metadata: {secFlagged: result.signals.some(signal => signal.code === "ALERT_LIST_HIT"), dataAvailable: result.dataCompleteness !== "none", dataCompleteness: result.dataCompleteness, analysisTimestamp: result.assessedAt},
    notice: "Rule points summarize observed signals and are not calibrated probabilities.",
  }, {headers: {"Cache-Control": "private, no-store"}});
}
export async function GET() {
  return NextResponse.json({scoringVersion: SCORING_VERSION, scoreUnit: SCORE_UNIT, scoringMode: "canonical_rules", aiBackend: {usedForRiskCategory: false}});
}
