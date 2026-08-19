export interface PublicationEvaluation {
  publishable: boolean;
  reasons: string[];
}

const phaseNames = [
  "phase0_socialEarlyWarning",
  "phase1_riskScoring",
  "phase2_sizeFiltering",
  "phase3_newsAnalysis",
  "phase4_socialMedia",
  "phase5_schemeTracking",
];

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function evaluateScanPublication(status: unknown, expectedDate: string): PublicationEvaluation {
  const reasons: string[] = [];
  if (!isRecord(status)) return { publishable: false, reasons: ["missing-status"] };
  if (typeof status.date !== "string" || status.date !== expectedDate) reasons.push("date-mismatch");
  if (status.pipelineStatus !== "completed") reasons.push("pipeline-not-completed");
  if (typeof status.completedAt !== "string" || !status.completedAt.trim()) reasons.push("missing-completion-time");
  else if (Number.isNaN(Date.parse(status.completedAt))) reasons.push("malformed-completion-time");
  if (!isRecord(status.phases)) {
    reasons.push("phase-status-missing");
  } else {
    for (const name of phaseNames) {
      const phase = status.phases[name];
      if (!isRecord(phase) || phase.status !== "completed") {
        if (!reasons.includes("phase-not-completed")) reasons.push("phase-not-completed");
        reasons.push(`phase-not-completed:${name}`);
      }
    }
  }
  const metrics = isRecord(status.summary) && isRecord(status.summary.newsAnalysisMetrics) ? status.summary.newsAnalysisMetrics : null;
  if (!metrics) reasons.push("analysis-status-missing");
  else {
    if (Number(metrics.failedModelCalls || 0) > 0) reasons.push("analysis-failures");
    if (Number(metrics.candidatesDeferred || 0) > 0) reasons.push("analysis-deferrals");
    if (Number(metrics.unavailableModelBatches || 0) > 0) reasons.push("analysis-unavailable-batches");
    if (Number(metrics.deferred || metrics.deferredBatches || 0) > 0) reasons.push("analysis-deferrals");
    if (Number(metrics.unavailable || metrics.unavailableBatches || 0) > 0) reasons.push("analysis-unavailable-batches");
  }
  const newsDetails = isRecord(status.phases) && isRecord(status.phases.phase3_newsAnalysis) && isRecord(status.phases.phase3_newsAnalysis.details)
    ? status.phases.phase3_newsAnalysis.details
    : null;
  if (newsDetails && Number(newsDetails.newsFilterSkipped || newsDetails.deferred || newsDetails.deferredBatches || 0) > 0) reasons.push("analysis-deferrals");
  const recovery = isRecord(status.recovery) ? status.recovery : {};
  if (Number(recovery.unresolvedCount || 0) > 0) reasons.push("unresolved-recovery");
  return { publishable: reasons.length === 0, reasons };
}
