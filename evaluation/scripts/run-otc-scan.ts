/** Standalone validation uses the same acquisition/scoring as the daily pipeline.
 * It writes artifacts only; it never publishes or ingests a partial scan. */
import * as fs from "fs";
import * as path from "path";
import { OtcClient, runOtcScan } from "./otc-daily";

async function main() {
  const date = process.env.EVALUATION_DATE;
  if (!date) throw new Error("EVALUATION_DATE required");
  const output =
    process.env.OTC_OUTPUT_DIR || path.join(__dirname, "../results");
  fs.mkdirSync(output, { recursive: true });
  const client = new OtcClient(process.env.FMP_API_KEY || "");
  const limit = process.env.OTC_TEST_LIMIT
    ? Number(process.env.OTC_TEST_LIMIT)
    : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1))
    throw new Error("Invalid OTC_TEST_LIMIT");
  const result = await runOtcScan(date, client.request, {
    limit,
    checkpoint: (coverage) => {
      fs.writeFileSync(
        path.join(output, `otc-coverage-${date}.json`),
        JSON.stringify({ ...coverage, apiCalls: client.calls }, null, 2),
      );
      console.log(
        `OTC outcomes ${coverage.outcomes.length}; calls ${client.calls}; status ${coverage.status}`,
      );
    },
  });
  fs.writeFileSync(
    path.join(output, `otc-evaluation-${date}.json`),
    JSON.stringify(result.results, null, 2),
  );
  console.log(
    JSON.stringify({
      status: result.coverage.status,
      eligible: result.coverage.eligibleCount,
      evaluated: result.results.length,
      apiCalls: client.calls,
    }),
  );
  if (result.coverage.status === "failed" || result.results.length === 0)
    process.exitCode = 1;
}
main().catch(() => {
  console.error("OTC validation failed; inspect coverage artifact.");
  process.exitCode = 1;
});
