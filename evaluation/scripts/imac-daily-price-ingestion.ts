#!/usr/bin/env ts-node
/**
 * iMac-only publisher for canonical daily-price scan windows.
 *
 * It reads a locally mounted, operator-configured input export. It does not
 * call FMP, does not start an HTTP server, and is never invoked by GitHub
 * Actions. A service-role key is used only when promotion is requested.
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import {
  AdjustmentBasis,
  DailyPriceBar,
  buildDailyPriceDatasetArtifacts,
} from "./daily-price-dataset";
import { publishDailyPriceDatasetToSupabase } from "./daily-price-dataset-storage";

dotenv.config({ path: process.env.SCAMDUNK_PRICE_ENV_FILE || ".env.imac-price-ingestion" });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function parseBarsFile(filePath: string): DailyPriceBar[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const bars = Array.isArray(parsed) ? parsed : parsed?.bars;
  if (!Array.isArray(bars)) throw new Error(`${filePath} must contain an array or { bars: [...] }`);
  return bars;
}

function readBars(inputPath: string): DailyPriceBar[] {
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) return parseBarsFile(inputPath);
  if (!stat.isDirectory()) throw new Error(`SCAMDUNK_PRICE_INPUT_PATH is not a file or directory: ${inputPath}`);
  const files = fs.readdirSync(inputPath)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => path.join(inputPath, name));
  if (!files.length) throw new Error(`No JSON input files found in ${inputPath}`);
  return files.flatMap(parseBarsFile);
}

function readExpectedSymbols(filePath: string): string[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("SCAMDUNK_PRICE_EXPECTED_SYMBOLS_PATH must contain an array");
  return parsed.map((row) => typeof row === "string" ? row : row?.symbol).filter(Boolean);
}

function writeLocalArtifacts(outputDir: string, artifacts: ReturnType<typeof buildDailyPriceDatasetArtifacts>): void {
  for (const [relativePath, content] of [
    [artifacts.scanWindowPath, artifacts.scanWindow],
    [artifacts.manifestPath, artifacts.manifest],
    ["v1/current.json", artifacts.currentPointer],
  ] as const) {
    const target = path.join(outputDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(content, null, 2));
  }
}

async function main(): Promise<void> {
  const inputPath = required("SCAMDUNK_PRICE_INPUT_PATH");
  const expectedSymbolsPath = required("SCAMDUNK_PRICE_EXPECTED_SYMBOLS_PATH");
  const now = new Date();
  const runId = process.env.SCAMDUNK_PRICE_INGESTION_RUN_ID || `${now.toISOString().replace(/[:.]/g, "-")}-imac`;
  const artifacts = buildDailyPriceDatasetArtifacts({
    runId,
    bars: readBars(inputPath),
    expectedSymbols: readExpectedSymbols(expectedSymbolsPath),
    vendorAsOf: required("SCAMDUNK_PRICE_VENDOR_AS_OF"),
    generatedAt: now.toISOString(),
    sourceVendor: required("SCAMDUNK_PRICE_SOURCE_VENDOR"),
    adjustmentBasis: required("SCAMDUNK_PRICE_ADJUSTMENT_BASIS") as AdjustmentBasis,
    maxAgeHours: Number.parseInt(process.env.SCAMDUNK_PRICE_MAX_AGE_HOURS || "36", 10),
  });
  if (process.env.SCAMDUNK_PRICE_OUTPUT_DIR) {
    writeLocalArtifacts(path.resolve(process.env.SCAMDUNK_PRICE_OUTPUT_DIR), artifacts);
  }
  if (process.env.SCAMDUNK_PRICE_PUBLISH === "true") {
    await publishDailyPriceDatasetToSupabase(artifacts);
    console.log(`Promoted immutable price dataset run ${artifacts.manifest.runId}`);
  } else {
    console.log(`Validated run ${artifacts.manifest.runId}; not promoted (set SCAMDUNK_PRICE_PUBLISH=true)`);
  }
}

main().catch((error) => {
  console.error(`iMac price ingestion failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
