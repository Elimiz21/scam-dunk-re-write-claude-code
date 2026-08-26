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

function isCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Shared fail-closed policy for workflow and ingestion publication. */
export function evaluateScanPublication(status: unknown, expectedDate: string): PublicationEvaluation {
  const reasons: string[] = [];
  if (!isRecord(status)) return { publishable: false, reasons: ["missing-status"] };
  if (typeof status.date !== "string" || status.date !== expectedDate) reasons.push("date-mismatch");
  if (status.pipelineStatus !== "completed") reasons.push("pipeline-not-completed");
  if (typeof status.completedAt !== "string" || !status.completedAt.trim()) reasons.push("missing-completion-time");
  else if (Number.isNaN(Date.parse(status.completedAt))) reasons.push("malformed-completion-time");
  if (!isRecord(status.phases)) reasons.push("phase-status-missing");
  else for (const name of phaseNames) {
    const phase = status.phases[name];
    if (!isRecord(phase) || phase.status !== "completed") {
      if (!reasons.includes("phase-not-completed")) reasons.push("phase-not-completed");
      reasons.push(`phase-not-completed:${name}`);
    }
  }
  const metrics = isRecord(status.summary) && isRecord(status.summary.newsAnalysisMetrics) ? status.summary.newsAnalysisMetrics : null;
  const counters = ["failedModelCalls", "candidatesDeferred", "unavailableModelBatches", "quarantinedRows", "responseAnomalies", "unresolvedTasks", "replayRequested", "replayMissing", "evidenceSourceFailures"];
  if (!metrics) reasons.push("analysis-status-missing");
  else {
    for (const name of counters) if (!isCounter(metrics[name]) && !reasons.includes("malformed-analysis-counter")) reasons.push("malformed-analysis-counter");
    if (isCounter(metrics.failedModelCalls) && metrics.failedModelCalls > 0) reasons.push("analysis-failures");
    if (isCounter(metrics.candidatesDeferred) && metrics.candidatesDeferred > 0) reasons.push("analysis-deferrals");
    if (isCounter(metrics.unavailableModelBatches) && metrics.unavailableModelBatches > 0) reasons.push("analysis-unavailable-batches");
    if (isCounter(metrics.quarantinedRows) && metrics.quarantinedRows > 0) reasons.push("analysis-quarantined");
    if (isCounter(metrics.responseAnomalies) && metrics.responseAnomalies > 0) reasons.push("analysis-response-anomalies");
    if (isCounter(metrics.unresolvedTasks) && metrics.unresolvedTasks > 0) reasons.push("unresolved-recovery");
    if (isCounter(metrics.replayMissing) && metrics.replayMissing > 0) reasons.push("analysis-replay-missing");
    if (isCounter(metrics.evidenceSourceFailures) && metrics.evidenceSourceFailures > 0) reasons.push("analysis-evidence-unavailable");
    for (const name of ["deferred", "deferredBatches"]) {
      if (metrics[name] !== undefined && !isCounter(metrics[name])) reasons.push("malformed-analysis-counter");
      else if (isCounter(metrics[name]) && metrics[name] > 0) reasons.push("analysis-deferrals");
    }
    for (const name of ["unavailable", "unavailableBatches"]) {
      if (metrics[name] !== undefined && !isCounter(metrics[name])) reasons.push("malformed-analysis-counter");
      else if (isCounter(metrics[name]) && metrics[name] > 0) reasons.push("analysis-unavailable-batches");
    }
  }
  const newsDetails = isRecord(status.phases) && isRecord(status.phases.phase3_newsAnalysis) && isRecord(status.phases.phase3_newsAnalysis.details)
    ? status.phases.phase3_newsAnalysis.details : null;
  if (newsDetails) for (const name of ["newsFilterSkipped", "deferred", "deferredBatches"]) {
    if (newsDetails[name] !== undefined && !isCounter(newsDetails[name])) reasons.push("malformed-analysis-counter");
    else if (isCounter(newsDetails[name]) && newsDetails[name] > 0) reasons.push("analysis-deferrals");
  }
  const recovery = status.recovery;
  const unresolvedSymbols = isRecord(recovery) ? recovery.unresolvedSymbols : undefined;
  const normalizedUnresolved = Array.isArray(unresolvedSymbols) && unresolvedSymbols.every((symbol) => typeof symbol === "string" && symbol.trim() === symbol.toUpperCase() && /^[A-Z0-9.-]+$/.test(symbol))
    ? unresolvedSymbols : null;
  if (!isRecord(recovery) || !isCounter(recovery.unresolvedCount) || typeof recovery.generationId !== "string" || !recovery.generationId.trim() || typeof recovery.journalFile !== "string" || !recovery.journalFile.trim() || typeof recovery.degraded !== "boolean" || !normalizedUnresolved || new Set(normalizedUnresolved).size !== normalizedUnresolved.length) reasons.push("malformed-recovery");
  if (isRecord(recovery) && isCounter(recovery.unresolvedCount) && recovery.unresolvedCount > 0) reasons.push("unresolved-recovery");
  if (normalizedUnresolved && isRecord(recovery) && (normalizedUnresolved.length !== recovery.unresolvedCount || (metrics && isCounter(metrics.unresolvedTasks) && normalizedUnresolved.length !== metrics.unresolvedTasks))) reasons.push("inconsistent-unresolved-recovery");
  if (isRecord(recovery) && recovery.degraded === true) reasons.push("degraded-recovery");
  if (isRecord(recovery) && recovery.degraded !== undefined && typeof recovery.degraded !== "boolean") reasons.push("malformed-recovery");
  return { publishable: reasons.length === 0, reasons };
}
