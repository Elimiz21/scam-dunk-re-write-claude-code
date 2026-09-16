import { buildHistoricalReconciliation } from "@/lib/admin/artifact-reconciliation";

describe("historical artifact reconciliation", () => {
  it("plans only retained-byte registration and never quote backfill or provider rescans", () => {
    const result = buildHistoricalReconciliation([
      "enhanced-evaluation-2026-09-14.json",
      "fmp-summary-2026-09-14.json",
      "enhanced-evaluation-2026-09-15.json",
    ]);

    expect(result).toEqual([
      {
        scanDate: "2026-09-14",
        evaluationFile: "enhanced-evaluation-2026-09-14.json",
        summaryFile: "fmp-summary-2026-09-14.json",
        action: "REGISTER_EXISTING_BYTES",
        reason: null,
      },
      {
        scanDate: "2026-09-15",
        evaluationFile: "enhanced-evaluation-2026-09-15.json",
        summaryFile: null,
        action: "BLOCKED_MISSING_ORIGINAL",
        reason: "Missing retained summary artifact",
      },
    ]);
  });
});
