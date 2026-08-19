import * as fs from "fs";
import * as path from "path";
import { buildPublicationWorkflowPlan } from "../../shared/scan-publication-workflow";

const [statusFile, expectedDate, fallbackGeneration = "invalid-generation", manifestArg, receiptArg, validationArg] = process.argv.slice(2);
if (!statusFile || !expectedDate) {
  console.error("Usage: scan-publication-check.ts <scan-status.json> <YYYY-MM-DD> [generation]");
  process.exitCode = 64;
} else {
  const baseDir = path.dirname(statusFile);
  const readJson = (file: string): unknown => {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (error: any) { console.error(`Unable to read ${file}: ${error?.message || error}`); return null; }
  };
  const manifestFile = manifestArg || path.join(baseDir, `publication-manifest-${expectedDate}.json`);
  const receiptFile = receiptArg || path.join(baseDir, `quarantine-upload-receipt-${expectedDate}.json`);
  const validationFile = validationArg || path.join(baseDir, `pipeline-validation-${expectedDate}.json`);
  const status = readJson(statusFile);
  const result = buildPublicationWorkflowPlan(status, expectedDate, fallbackGeneration, {
    manifest: readJson(manifestFile),
    quarantineReceipt: readJson(receiptFile),
    validation: readJson(validationFile),
    availableFiles: fs.existsSync(baseDir) ? fs.readdirSync(baseDir) : [],
  });
  console.log(JSON.stringify(result));
  process.exitCode = result.publishable ? 0 : 2;
}
