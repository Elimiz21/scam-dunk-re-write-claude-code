import { buildPublicationWorkflowPlan } from "./scan-publication-workflow";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

const healthy = {
  date: "2026-08-19", pipelineStatus: "completed", completedAt: "2026-08-19T01:00:00.000Z",
  phases: Object.fromEntries(["phase0_socialEarlyWarning", "phase1_riskScoring", "phase2_sizeFiltering", "phase3_newsAnalysis", "phase4_socialMedia", "phase5_schemeTracking"].map((name) => [name, { status: "completed", details: {} }])),
  summary: { newsAnalysisMetrics: { failedModelCalls: 0, candidatesDeferred: 0, unavailableModelBatches: 0, quarantinedRows: 0, responseAnomalies: 0, unresolvedTasks: 0, replayRequested: 0, replayMissing: 0, evidenceSourceFailures: 0 } },
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

it("executes the workflow CLI boundary with quarantine, gate, and promotion decisions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-gate-"));
  const healthyFile = path.join(dir, "healthy.json");
  const degradedFile = path.join(dir, "degraded.json");
  fs.writeFileSync(healthyFile, JSON.stringify(healthy));
  fs.writeFileSync(degradedFile, JSON.stringify({ ...healthy, pipelineStatus: "degraded", recovery: { ...healthy.recovery, degraded: true } }));
  const repositoryRoot = path.resolve(__dirname, "..");
  const tsRunner = path.join(repositoryRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const run = (file: string) => spawnSync(tsRunner, ["evaluation/scripts/scan-publication-check.ts", file, "2026-08-19", "fallback"], { cwd: repositoryRoot, encoding: "utf8" });
  const bad = run(degradedFile);
  const good = run(healthyFile);
  expect(bad.status).toBe(2);
  expect(JSON.parse(bad.stdout)).toMatchObject({ classification: "degraded", quarantinePrefix: "quarantine/2026-08-19/gen-1", promoteRoot: false });
  expect(good.status).toBe(0);
  expect(JSON.parse(good.stdout)).toMatchObject({ classification: "healthy", quarantinePrefix: "quarantine/2026-08-19/gen-1", promoteRoot: true });
});
