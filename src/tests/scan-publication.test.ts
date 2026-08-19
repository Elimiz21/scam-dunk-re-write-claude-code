import { evaluateScanPublication } from "../lib/scan-publication";

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
    summary: { newsAnalysisMetrics: { failedModelCalls: 0, candidatesDeferred: 0, unavailableModelBatches: 0 } },
    recovery: { unresolvedCount: 0 },
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
    ] as const;
    for (const [status, reason] of cases) {
      const result = evaluateScanPublication(status, "2026-08-19");
      expect(result.publishable).toBe(false);
      expect(result.reasons).toContain(reason);
    }
  });
});
