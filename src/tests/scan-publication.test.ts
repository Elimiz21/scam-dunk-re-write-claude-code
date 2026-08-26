import { evaluateScanPublication } from "../../shared/scan-publication";

function completeStatus(overrides: Record<string, unknown> = {}) {
  const phase = { status: "completed", completedAt: "2026-08-19T01:00:00.000Z", details: {} };
  return {
    date: "2026-08-19",
    pipelineStatus: "completed",
    completedAt: "2026-08-19T01:00:00.000Z",
    phases: {
      phase0_socialEarlyWarning: phase,
      phase1_riskScoring: phase,
      phase2_sizeFiltering: phase,
      phase3_newsAnalysis: phase,
      phase4_socialMedia: phase,
      phase5_schemeTracking: phase,
    },
    summary: { newsAnalysisMetrics: { failedModelCalls: 0, candidatesDeferred: 0, unavailableModelBatches: 0, quarantinedRows: 0, responseAnomalies: 0, unresolvedTasks: 0, replayRequested: 0, replayMissing: 0, evidenceSourceFailures: 0 } },
    recovery: { unresolvedCount: 0, unresolvedSymbols: [], generationId: "gen-1", journalFile: "journal.json", degraded: false },
    ...overrides,
  };
}

describe("evaluateScanPublication", () => {
  it("publishes only a complete status with matching date and no recovery work", () => {
    expect(evaluateScanPublication(completeStatus(), "2026-08-19")).toEqual({ publishable: true, reasons: [] });
  });

  it("rejects missing, malformed, incomplete, degraded, and unresolved statuses", () => {
    const cases = [
      [null, "missing-status"],
      [{ ...completeStatus(), date: "2026-08-18" }, "date-mismatch"],
      [{ ...completeStatus(), pipelineStatus: "degraded" }, "pipeline-not-completed"],
      [{ ...completeStatus(), completedAt: null }, "missing-completion-time"],
      [{ ...completeStatus(), phases: { ...completeStatus().phases, phase3_newsAnalysis: { status: "failed" } } }, "phase-not-completed"],
      [{ ...completeStatus(), summary: { newsAnalysisMetrics: { failedModelCalls: 1, candidatesDeferred: 0, unavailableModelBatches: 0 } } }, "analysis-failures"],
      [{ ...completeStatus(), summary: { newsAnalysisMetrics: { failedModelCalls: 0, candidatesDeferred: 1, unavailableModelBatches: 0 } } }, "analysis-deferrals"],
      [{ ...completeStatus(), recovery: { unresolvedCount: 2 } }, "unresolved-recovery"],
      [{ ...completeStatus(), phases: { ...completeStatus().phases, phase3_newsAnalysis: { status: "completed", completedAt: "2026-08-19T01:00:00.000Z", details: { newsFilterSkipped: 1 } } } }, "analysis-deferrals"],
      [{ ...completeStatus(), summary: { newsAnalysisMetrics: { failedModelCalls: "0", candidatesDeferred: 0, unavailableModelBatches: 0 } } }, "malformed-analysis-counter"],
      [{ ...completeStatus(), summary: { newsAnalysisMetrics: { failedModelCalls: Number.NaN, candidatesDeferred: 0, unavailableModelBatches: 0 } } }, "malformed-analysis-counter"],
      [{ ...completeStatus(), summary: { newsAnalysisMetrics: { failedModelCalls: -1, candidatesDeferred: 0, unavailableModelBatches: 0 } } }, "malformed-analysis-counter"],
      [{ ...completeStatus(), recovery: undefined }, "malformed-recovery"],
      [{ ...completeStatus(), recovery: { unresolvedCount: "0" } }, "malformed-recovery"],
      [{ ...completeStatus(), recovery: { unresolvedCount: Number.NaN } }, "malformed-recovery"],
      [{ ...completeStatus(), recovery: { unresolvedCount: -1 } }, "malformed-recovery"],
      [{ ...completeStatus(), recovery: { unresolvedCount: 0, degraded: true } }, "degraded-recovery"],
    ] as const;
    for (const [status, reason] of cases) {
      const result = evaluateScanPublication(status, "2026-08-19");
      expect(result.publishable).toBe(false);
      expect(result.reasons).toContain(reason);
    }
  });

  it("fails closed when any resilience counter or recovery provenance is absent", () => {
    const status = completeStatus();
    delete (status.summary.newsAnalysisMetrics as any).quarantinedRows;
    delete (status.summary.newsAnalysisMetrics as any).replayRequested;
    delete (status as any).recovery.generationId;
    const result = evaluateScanPublication(status, "2026-08-19");
    expect(result.publishable).toBe(false);
    expect(result.reasons).toContain("malformed-analysis-counter");
    expect(result.reasons).toContain("malformed-recovery");
  });

  it("fails closed when replay metrics are absent", () => {
    const status = completeStatus();
    delete (status.summary.newsAnalysisMetrics as any).replayMissing;
    expect(evaluateScanPublication(status, "2026-08-19").publishable).toBe(false);
  });

  it("requires normalized unique unresolved symbols to match both recovery counters", () => {
    const cases = [
      { unresolvedSymbols: ["abc"], unresolvedCount: 1, unresolvedTasks: 1, reason: "malformed-recovery" },
      { unresolvedSymbols: ["ABC", "ABC"], unresolvedCount: 2, unresolvedTasks: 2, reason: "malformed-recovery" },
      { unresolvedSymbols: ["ABC"], unresolvedCount: 2, unresolvedTasks: 2, reason: "inconsistent-unresolved-recovery" },
      { unresolvedSymbols: ["ABC"], unresolvedCount: 1, unresolvedTasks: 2, reason: "inconsistent-unresolved-recovery" },
    ];
    for (const { unresolvedSymbols, unresolvedCount, unresolvedTasks, reason } of cases) {
      const status = completeStatus({
        recovery: { ...completeStatus().recovery, unresolvedSymbols, unresolvedCount },
        summary: { newsAnalysisMetrics: { ...completeStatus().summary.newsAnalysisMetrics, unresolvedTasks } },
      });
      const result = evaluateScanPublication(status, "2026-08-19");
      expect(result.publishable).toBe(false);
      expect(result.reasons).toContain(reason);
    }
  });

  it("rejects unresolved symbols with whitespace or invalid punctuation", () => {
    for (const symbol of [" ABC", "ABC ", "AB/C"]) {
      const status = completeStatus({
        recovery: { ...completeStatus().recovery, unresolvedSymbols: [symbol], unresolvedCount: 1 },
        summary: { newsAnalysisMetrics: { ...completeStatus().summary.newsAnalysisMetrics, unresolvedTasks: 1 } },
      });
      expect(evaluateScanPublication(status, "2026-08-19").reasons).toContain("malformed-recovery");
    }
  });
});
