/**
 * Upload Evaluation Results to Supabase Storage
 *
 * This script uploads evaluation results to Supabase Storage bucket
 * for ingestion via the admin dashboard.
 *
 * Usage:
 *   npx ts-node scripts/upload-to-supabase.ts [date]
 *
 * If no date is provided, uses today's date.
 *
 * Required environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (server-side only; anonymous keys are rejected)
 */

// Load environment variables from .env.local in project root
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "..", "..", ".env.local") });

import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import {
  createRevisionUploadPlan,
  executeRevisionUploadPlan,
  extractProducerExecutedAt,
  requireStoragePublisherConfig,
} from "./storage-publisher";
import {
  LoadedArtifactRevision,
  loadPublishedArtifactRevision,
} from "../../src/lib/admin/artifact-storage";

const RESULTS_DIR = path.join(__dirname, "..", "results");
const SCHEME_DB_DIR = path.join(__dirname, "..", "scheme-database");
const BUCKET_NAME = "evaluation-data";

// File patterns to upload (date-based files)
const FILE_PATTERNS = [
  { prefix: "fmp-evaluation-", type: "evaluation" },
  { prefix: "fmp-summary-", type: "summary" },
  { prefix: "fmp-high-risk-", type: "high-risk" },
  { prefix: "enhanced-evaluation-", type: "evaluation" },
  { prefix: "enhanced-high-risk-", type: "high-risk" },
  { prefix: "social-media-scan-", type: "social-media" },
  { prefix: "promoted-stocks-", type: "promoted" },
  { prefix: "daily-report-", type: "report" },
  { prefix: "suspicious-stocks-", type: "suspicious" },
  { prefix: "scheme-report-", type: "scheme-report" },
];

// Non-date-based files to always upload
const STATIC_FILES = [
  {
    path: path.join(SCHEME_DB_DIR, "scheme-database.json"),
    name: "scheme-database.json",
  },
  {
    path: path.join(SCHEME_DB_DIR, "promoter-database.json"),
    name: "promoter-database.json",
  },
];

function getSupabaseCredentials() {
  const { supabaseUrl, serviceKey } = requireStoragePublisherConfig(process.env);
  return { supabaseUrl, supabaseKey: serviceKey };
}

function getSupabaseClient() {
  const { supabaseUrl, supabaseKey } = getSupabaseCredentials();
  return createClient(supabaseUrl, supabaseKey);
}

async function uploadDateFiles(date: string) {
  console.log(`\nUploading files for ${date}...`);
  const files: Record<string, Buffer> = {};
  for (const pattern of FILE_PATTERNS) {
    // Try both .json and .md extensions
    const extensions = ["social-media", "scheme-report"].includes(pattern.type)
      ? [".md", ".json"]
      : [".json"];

    for (const ext of extensions) {
      const fileName = `${pattern.prefix}${date}${ext}`;
      const filePath = path.join(RESULTS_DIR, fileName);

      if (fs.existsSync(filePath)) {
        files[fileName] = fs.readFileSync(filePath);
      }
    }
  }

  // Always upload scheme and promoter databases
  for (const staticFile of STATIC_FILES) {
    if (fs.existsSync(staticFile.path)) {
      files[staticFile.name] = fs.readFileSync(staticFile.path);
    }
  }
  // Late phases emit additional dated files that do not have a fixed prefix.
  // Include them in the next immutable revision instead of overwriting a root key.
  for (const fileName of fs.readdirSync(RESULTS_DIR)) {
    if (
      fileName.includes(date) &&
      (fileName.endsWith(".json") || fileName.endsWith(".md"))
    ) {
      files[fileName] = fs.readFileSync(path.join(RESULTS_DIR, fileName));
    }
  }

  let previous: LoadedArtifactRevision | null = null;
  const client = getSupabaseClient();
  previous = await loadPublishedArtifactRevision(date, async (objectPath) => {
    const { data, error } = await client.storage
      .from(BUCKET_NAME)
      .download(objectPath);
    if (error) {
      if (/not.?found|404/i.test(error.message)) return null;
      throw new Error(`Failed to read ${objectPath}: ${error.message}`);
    }
    return Buffer.from(await data.arrayBuffer());
  });
  if (previous) {
    for (const [logicalName, bytes] of previous.files) {
      if (!(logicalName in files)) files[logicalName] = bytes;
    }
  }

  const evaluationName = [
    `enhanced-evaluation-${date}.json`,
    `fmp-evaluation-${date}.json`,
  ].find((name) => files[name]);
  const summaryName = `fmp-summary-${date}.json`;
  if (!evaluationName || !files[summaryName]) {
    throw new Error(
      `Publication blocked for ${date}: evaluation and summary artifacts are required`,
    );
  }
  const producerRunId =
    process.env.ARTIFACT_PRODUCER_RUN_ID ||
    (process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || "1"}`
      : "");
  if (!producerRunId) {
    throw new Error(
      "ARTIFACT_PRODUCER_RUN_ID is required outside GitHub Actions",
    );
  }
  const plan = createRevisionUploadPlan({
    scanDate: date,
    producerRunId,
    producerExecutedAt:
      extractProducerExecutedAt(files[summaryName]) ??
      previous?.manifest.producerExecutedAt ??
      null,
    files,
    required: previous?.manifest.requiredArtifacts ?? [evaluationName, summaryName],
  });
  await executeRevisionUploadPlan({
    config: requireStoragePublisherConfig(process.env),
    operations: plan.operations,
    bucket: BUCKET_NAME,
  });
  console.log(`  Published immutable revision ${plan.manifest.revisionHash}`);
  return plan.manifest.artifacts.length;
}

async function listResultsFiles() {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.log("Results directory not found");
    return [];
  }

  const files = fs.readdirSync(RESULTS_DIR);
  const dates = new Set<string>();

  // Extract unique dates from filenames
  for (const file of files) {
    const match = file.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) {
      dates.add(match[1]);
    }
  }

  return Array.from(dates).sort().reverse();
}

async function main() {
  console.log("=".repeat(60));
  console.log("SUPABASE UPLOAD UTILITY");
  console.log("=".repeat(60));

  const args = process.argv.slice(2);
  let datesToUpload: string[] = [];

  if (args[0] === "--all") {
    // Upload all available dates
    datesToUpload = await listResultsFiles();
    console.log(`Found ${datesToUpload.length} dates with evaluation files`);
  } else if (args[0]) {
    // Upload specific date
    datesToUpload = [args[0]];
  } else {
    // Upload today's date
    const today = new Date().toISOString().split("T")[0];
    datesToUpload = [today];
  }

  let totalUploaded = 0;

  for (const date of datesToUpload) {
    try {
      const count = await uploadDateFiles(date);
      totalUploaded += count;
      if (count === 0) {
        console.log(`  No files found for ${date}`);
      }
    } catch (error) {
      console.error(`  Error uploading ${date}:`, error);
      process.exitCode = 1;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Upload complete: ${totalUploaded} files uploaded`);
  console.log("=".repeat(60));
}

// Export for use in other scripts
export { uploadDateFiles, getSupabaseClient, BUCKET_NAME };

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
