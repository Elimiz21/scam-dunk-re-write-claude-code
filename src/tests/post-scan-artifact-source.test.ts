import { createRevisionUploadPlan } from "../../evaluation/scripts/storage-publisher";
import {
  assertPostScanReportParent,
  loadPostScanHighRiskSource,
} from "../../evaluation/scripts/post-scan-artifact-source";

describe("post-scan artifact source", () => {
  it("validates new enrichment but permits byte-identical carried-forward reports", () => {
    const oldReport = Buffer.from(JSON.stringify({ parentRevisionHash: "base-revision" }));
    expect(() => assertPostScanReportParent({
      scanDate: "2026-09-15",
      candidate: oldReport,
      previousBytes: oldReport,
      previousRevisionHash: "enriched-revision",
    })).not.toThrow();
    expect(() => assertPostScanReportParent({
      scanDate: "2026-09-15",
      candidate: oldReport,
      previousBytes: undefined,
      previousRevisionHash: "enriched-revision",
    })).toThrow("stale or missing");
  });

  it("reads and verifies the current revision object without touching mutable roots", async () => {
    const date = "2026-09-15";
    const highRiskName = `fmp-high-risk-${date}.json`;
    const plan = createRevisionUploadPlan({
      scanDate: date,
      producerRunId: "post-scan-parent",
      files: { [highRiskName]: Buffer.from('[{"symbol":"SAFE_PARENT","riskLevel":"HIGH"}]') },
      required: [highRiskName],
    });
    const objects = new Map(plan.operations.map((op) => [op.path, op.content]));
    const reads: string[] = [];
    const result = await loadPostScanHighRiskSource(date, async (objectPath) => {
      reads.push(objectPath);
      return objects.get(objectPath) ?? null;
    });
    expect(result.parentRevisionHash).toBe(plan.manifest.revisionHash);
    expect(result.stocks).toEqual([{ symbol: "SAFE_PARENT", riskLevel: "HIGH" }]);
    expect(reads).not.toContain(highRiskName);
  });

  it("uses mutable root objects only when no revision pointer exists", async () => {
    const date = "2026-09-15";
    const root = `fmp-high-risk-${date}.json`;
    const result = await loadPostScanHighRiskSource(date, async (objectPath) =>
      objectPath === root ? Buffer.from('[{"symbol":"LEGACY"}]') : null,
    );
    expect(result).toEqual({ stocks: [{ symbol: "LEGACY" }], parentRevisionHash: null });
  });
});
