import { buildPublicationWorkflowPlan } from "./scan-publication-workflow";

const healthy = {
  date: "2026-08-19", pipelineStatus: "completed", completedAt: "2026-08-19T01:00:00.000Z",
  phases: Object.fromEntries(["phase0_socialEarlyWarning", "phase1_riskScoring", "phase2_sizeFiltering", "phase3_newsAnalysis", "phase4_socialMedia", "phase5_schemeTracking"].map((name) => [name, { status: "completed", details: {} }])),
  summary: { newsAnalysisMetrics: { failedModelCalls: 0, candidatesDeferred: 0, unavailableModelBatches: 0, quarantinedRows: 0, responseAnomalies: 0, unresolvedTasks: 0 } },
  recovery: { generationId: "gen-1", journalFile: "journal.json", unresolvedCount: 0, degraded: false },
};

describe("buildPublicationWorkflowPlan", () => {
  it("quarantines degraded generations and permits root promotion only for healthy output", () => {
    const degraded = buildPublicationWorkflowPlan({ ...healthy, pipelineStatus: "degraded", recovery: { ...healthy.recovery, degraded: true } }, "2026-08-19", "fallback");
    const good = buildPublicationWorkflowPlan(healthy, "2026-08-19", "fallback");
    expect(degraded).toMatchObject({ classification: "degraded", quarantinePrefix: "quarantine/2026-08-19/gen-1", promoteRoot: false, sendDegradedAlert: true });
    expect(good).toMatchObject({ classification: "healthy", quarantinePrefix: "quarantine/2026-08-19/gen-1", promoteRoot: true, sendDegradedAlert: false });
  });
});
