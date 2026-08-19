import * as fs from "fs";
import { buildPublicationWorkflowPlan } from "../../shared/scan-publication-workflow";

const [statusFile, expectedDate, fallbackGeneration = "invalid-generation"] = process.argv.slice(2);
if (!statusFile || !expectedDate) {
  console.error("Usage: scan-publication-check.ts <scan-status.json> <YYYY-MM-DD>");
  process.exitCode = 64;
} else {
  let status: unknown = null;
  try { status = JSON.parse(fs.readFileSync(statusFile, "utf8")); }
  catch (error: any) { console.error(`Unable to read status: ${error?.message || error}`); }
  const result = buildPublicationWorkflowPlan(status, expectedDate, fallbackGeneration);
  console.log(JSON.stringify(result));
  process.exitCode = result.publishable ? 0 : 2;
}
