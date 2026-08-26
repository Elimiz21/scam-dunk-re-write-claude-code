import { buildPublicationWorkflowPlan } from "./scan-publication-workflow";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

const date = "2026-08-19";
const requiredFiles = [
  `enhanced-evaluation-${date}.json`,
  `scan-status-${date}.json`,
  "news-analysis-journal-2026-08-19-gen-1.json",
  `pipeline-validation-${date}.json`,
];

function publicationArtifacts(overrides: Record<string, unknown> = {}) {
  return {
    manifest: {
      schemaVersion: 1,
      kind: "scan-publication-manifest",
      date,
      generationId: "gen-1",
      statusFile: `scan-status-${date}.json`,
      journalFile: requiredFiles[2],
      requiredFiles,
      commitMarker: `publication-manifest-${date}.json`,
      ...overrides,
    },
    validation: { date, status: "healthy", missingFiles: [], files: requiredFiles },
    quarantineReceipt: {
      date,
      generationId: "gen-1",
      quarantinePrefix: `quarantine/${date}/gen-1`,
      success: true,
      uploadedFiles: [...requiredFiles, `publication-manifest-${date}.json`],
    },
    availableFiles: requiredFiles,
  };
}

const healthy = {
  date: "2026-08-19", pipelineStatus: "completed", completedAt: "2026-08-19T01:00:00.000Z",
  phases: Object.fromEntries(["phase0_socialEarlyWarning", "phase1_riskScoring", "phase2_sizeFiltering", "phase3_newsAnalysis", "phase4_socialMedia", "phase5_schemeTracking"].map((name) => [name, { status: "completed", details: {} }])),
  summary: { newsAnalysisMetrics: { failedModelCalls: 0, candidatesDeferred: 0, unavailableModelBatches: 0, quarantinedRows: 0, responseAnomalies: 0, unresolvedTasks: 0, replayRequested: 0, replayMissing: 0, evidenceSourceFailures: 0 } },
  recovery: { generationId: "gen-1", journalFile: "news-analysis-journal-2026-08-19-gen-1.json", unresolvedSymbols: [], unresolvedCount: 0, degraded: false },
};

describe("buildPublicationWorkflowPlan", () => {
  it("quarantines degraded generations and permits root promotion only for healthy output", () => {
    const degraded = buildPublicationWorkflowPlan({ ...healthy, pipelineStatus: "degraded", recovery: { ...healthy.recovery, degraded: true } }, "2026-08-19", "fallback");
    const good = buildPublicationWorkflowPlan(healthy, "2026-08-19", "fallback", publicationArtifacts());
    expect(degraded).toMatchObject({ classification: "degraded", quarantinePrefix: "quarantine/2026-08-19/gen-1", promoteRoot: false, sendDegradedAlert: true });
    expect(good).toMatchObject({ classification: "healthy", quarantinePrefix: "quarantine/2026-08-19/gen-1", promoteRoot: true, sendDegradedAlert: false });
  });

  it.each([
    ["missing enhanced", { requiredFiles: requiredFiles.slice(1) }],
    ["wrong journal path", { journalFile: "wrong-journal.json" }],
  ])("blocks promotion for %s", (_name, manifestOverrides) => {
    const result = buildPublicationWorkflowPlan(healthy, date, "fallback", publicationArtifacts(manifestOverrides));
    expect(result.promoteRoot).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("blocks nonhealthy validation even when the scan status is complete", () => {
    const result = buildPublicationWorkflowPlan(healthy, date, "fallback", {
      ...publicationArtifacts(),
      validation: { date, status: "degraded", missingFiles: [requiredFiles[0]] },
    });
    expect(result.promoteRoot).toBe(false);
    expect(result.reasons).toContain("validation-not-healthy");
  });
});

it("executes the workflow CLI boundary with quarantine, gate, and promotion decisions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-gate-"));
  const healthyFile = path.join(dir, "healthy.json");
  const degradedFile = path.join(dir, "degraded.json");
  fs.writeFileSync(healthyFile, JSON.stringify(healthy));
  fs.writeFileSync(degradedFile, JSON.stringify({ ...healthy, pipelineStatus: "degraded", recovery: { ...healthy.recovery, degraded: true } }));
  for (const file of requiredFiles) fs.writeFileSync(path.join(dir, file), file.includes("journal") ? "{}" : "[]");
  fs.writeFileSync(path.join(dir, `publication-manifest-${date}.json`), JSON.stringify(publicationArtifacts().manifest));
  fs.writeFileSync(path.join(dir, `pipeline-validation-${date}.json`), JSON.stringify(publicationArtifacts().validation));
  fs.writeFileSync(path.join(dir, `quarantine-upload-receipt-${date}.json`), JSON.stringify(publicationArtifacts().quarantineReceipt));
  const repositoryRoot = path.resolve(__dirname, "..");
  const tsRunner = path.join(repositoryRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const cliPath = path.join(repositoryRoot, "evaluation/scripts/scan-publication-check.ts");
  const run = (file: string) => spawnSync(tsRunner, [cliPath, file, date, "fallback"], { cwd: dir, encoding: "utf8" });
  const bad = run(degradedFile);
  const good = run(healthyFile);
  expect(bad.status).toBe(2);
  expect(JSON.parse(bad.stdout)).toMatchObject({ classification: "degraded", quarantinePrefix: "quarantine/2026-08-19/gen-1", promoteRoot: false });
  expect(good.status).toBe(0);
  expect(JSON.parse(good.stdout)).toMatchObject({ classification: "healthy", quarantinePrefix: "quarantine/2026-08-19/gen-1", promoteRoot: true });
});

it.each([
  ["enhanced", `enhanced-evaluation-${date}.json`],
  ["journal", requiredFiles[2]],
  ["receipt", `quarantine-upload-receipt-${date}.json`],
])("CLI blocks promotion when %s is missing", (_name, file) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-gate-missing-"));
  fs.writeFileSync(path.join(dir, `scan-status-${date}.json`), JSON.stringify(healthy));
  for (const required of requiredFiles) if (required !== file) fs.writeFileSync(path.join(dir, required), "{}");
  fs.writeFileSync(path.join(dir, `publication-manifest-${date}.json`), JSON.stringify(publicationArtifacts().manifest));
  fs.writeFileSync(path.join(dir, `pipeline-validation-${date}.json`), JSON.stringify(publicationArtifacts().validation));
  if (file !== `quarantine-upload-receipt-${date}.json`) fs.writeFileSync(path.join(dir, `quarantine-upload-receipt-${date}.json`), JSON.stringify(publicationArtifacts().quarantineReceipt));
  const repositoryRoot = path.resolve(__dirname, "..");
  const tsRunner = path.join(repositoryRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const result = spawnSync(tsRunner, [path.join(repositoryRoot, "evaluation/scripts/scan-publication-check.ts"), path.join(dir, `scan-status-${date}.json`), date, "fallback"], { cwd: dir, encoding: "utf8" });
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout).promoteRoot).toBe(false);
});

it("uses the pinned tsx runtime and non-cancelling concurrency", () => {
  const workflow = fs.readFileSync(path.join(path.resolve(__dirname, ".."), ".github/workflows/enhanced-daily-evaluation.yml"), "utf8");
  expect(workflow).toContain("cancel-in-progress: false");
  expect(workflow).toMatch(/concurrency:\n  group: enhanced-daily-evaluation\n/);
  expect(workflow).toContain("node_modules/.bin/tsx");
  expect(workflow).not.toContain("npx ts-node");
});
