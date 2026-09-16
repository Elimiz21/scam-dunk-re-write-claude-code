/**
 * Read-only historical reconciliation. It inventories retained storage bytes
 * and emits a dry-run registration plan. It never writes to Storage/Postgres,
 * calls a market-data provider, fills quotes, or starts a paid rescan.
 */
import { buildHistoricalReconciliation } from "../src/lib/admin/artifact-reconciliation";
import { listAllEvaluationFiles } from "../src/lib/admin/evaluation-storage-listing";
import { getEvaluationStorageServerClient } from "../src/lib/server/evaluation-storage";
import * as fs from "fs";
import * as path from "path";

const EVALUATION_BUCKET = "evaluation-data";

async function main(): Promise<void> {
  const filesFromIndex = process.argv.indexOf("--files-from");
  let objectNames: string[];
  let source: "RETAINED_STORAGE" | "LOCAL_RETAINED_FILES";
  if (filesFromIndex >= 0) {
    const inputPath = process.argv[filesFromIndex + 1];
    if (!inputPath) throw new Error("--files-from requires a path");
    objectNames = fs
      .readFileSync(inputPath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((name) => path.basename(name));
    source = "LOCAL_RETAINED_FILES";
  } else {
    const bucket = getEvaluationStorageServerClient().storage.from(EVALUATION_BUCKET);
    const files = await listAllEvaluationFiles((prefix, options) =>
      bucket.list(prefix, options),
    );
    objectNames = files.map((file) => file.name);
    source = "RETAINED_STORAGE";
  }
  const entries = buildHistoricalReconciliation(objectNames);
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: "scamdunk.historical-artifact-reconciliation/v1",
        generatedAt: new Date().toISOString(),
        mode: "DRY_RUN_READ_ONLY",
        source,
        providerCalls: 0,
        databaseWrites: 0,
        storageWrites: 0,
        entries,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
