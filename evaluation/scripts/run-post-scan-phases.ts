import { createNewsReview } from "./news-review";
import { retrievalComplete, type SourceEvidence } from "./news-evidence";
import { hasIndependentWarning, type NewsTriage } from "../../src/lib/news-triage";
/**
 * Post-Scan Processing Pipeline
 *
 * Runs phases 2-5 of the enhanced pipeline on EXISTING risk-scored data:
 * - Phase 2: Filter by market cap and volume
 * - Phase 3: News legitimacy analysis (OpenAI)
 * - Phase 4: Social media scanning
 * - Phase 5: Scheme tracking
 *
 * Usage:
 *   EVALUATION_DATE=2026-02-03 npx ts-node scripts/run-post-scan-phases.ts
 *
 * Required env vars:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY (server-side only)
 *   - FMP_API_KEY (for news/filings)
 *   - OPENAI_API_KEY (for news analysis)
 *   - EVALUATION_DATE (defaults to today)
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "..", "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

import * as fs from "fs";
import { execSync } from "child_process";
import { createClient } from "@supabase/supabase-js";
import { loadPostScanHighRiskSource } from "./post-scan-artifact-source";

// Import social scanner
import {
  performRealSocialScan,
  ComprehensiveScanResult,
} from "./real-social-scanner";

const RESULTS_DIR = path.join(__dirname, "..", "results");
const SCHEME_DB_DIR = path.join(__dirname, "..", "scheme-database");

// Ensure directories exist
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
if (!fs.existsSync(SCHEME_DB_DIR))
  fs.mkdirSync(SCHEME_DB_DIR, { recursive: true });

// Configuration
const FMP_API_KEY = process.env.FMP_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
// Note: Legacy v3 endpoints deprecated Aug 31, 2025 - now using stable API
const FMP_BASE_URL = "https://financialmodelingprep.com/stable";

// Thresholds for filtering
const MARKET_CAP_THRESHOLD = 10_000_000_000; // $10B
const VOLUME_THRESHOLD = 10_000_000; // $10M daily volume

// Supabase setup
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing server-side Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(url, key);
}

// Types
interface HighRiskStock {
  symbol: string;
  name: string;
  exchange: string;
  sector?: string;
  industry?: string;
  marketCap: number | null;
  lastPrice: number | null;
  avgDailyVolume?: number | null;
  avgDollarVolume?: number | null;
  riskLevel: string;
  totalScore: number;
  signals: Array<{
    code: string;
    category: string;
    weight: number;
    description: string;
  }>;
  evaluatedAt: string;
}

interface ProcessedStock extends HighRiskStock {
  isFiltered: boolean;
  filterReason: string | null;
  hasLegitimateNews: boolean;
  newsAnalysis: string | null;
  recentNews: Array<{
    title: string;
    date: string;
    source: string;
    url: string;
  }>;
  secFilings: Array<{ type: string; date: string; url: string }>;
  socialMediaScanned: boolean;
  socialMediaFindings?: ComprehensiveScanResult | null;
  schemeId: string | null;
  schemeStatus: string | null;
  newsTriage?: NewsTriage;
  newsEvidence?: { sources: SourceEvidence[]; citedEvidenceIds?: string[] };
}

// Utility functions
function curlFetch(url: string): string | null {
  try {
    const result = execSync(
      `curl -s --max-time 15 -H "User-Agent: Mozilla/5.0" "${url}"`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
    );
    return result;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getEvaluationDate(): string {
  return process.env.EVALUATION_DATE || new Date().toISOString().split("T")[0];
}

// Read only the hash-verified immutable artifacts selected by the authoritative
// publication head. Database snapshot rows may be replaced concurrently and
// cannot safely establish the parent revision for provider work.
async function fetchHighRiskStocksFromStorage(
  date: string,
): Promise<HighRiskStock[]> {
  console.log(`Trying to fetch from Supabase Storage for ${date}...`);

  const bucket = getSupabaseClient().storage.from("evaluation-data");
  const { data: head, error: headError } = await getSupabaseClient()
    .from("EvaluationArtifactPublicationHead")
    .select("revisionHash")
    .eq("scanDate", `${date}T00:00:00.000Z`)
    .maybeSingle();
  if (headError) throw new Error(`Failed to read authoritative publication head: ${headError.message}`);
  if (!head?.revisionHash) {
    throw new Error(`No authoritative publication head exists for ${date}`);
  }
  const { data: revision, error: revisionError } = await getSupabaseClient()
    .from("EvaluationArtifactRevision")
    .select("status")
    .eq("revisionHash", head.revisionHash)
    .maybeSingle();
  if (revisionError || revision?.status !== "PUBLISHED") {
    throw new Error(`Authoritative revision ${head.revisionHash} is not published`);
  }
  const source = await loadPostScanHighRiskSource<HighRiskStock>(
    date,
    async (objectPath) => {
      const { data, error } = await bucket.download(objectPath);
      if (error || !data) {
        if (/not.?found|404/i.test(error?.message ?? "")) return null;
        throw new Error(`Failed to read ${objectPath}: ${error?.message ?? "no data"}`);
      }
      return Buffer.from(await data.arrayBuffer());
    },
    head.revisionHash,
    "all",
  );
  process.env.POST_SCAN_PARENT_REVISION_HASH = source.parentRevisionHash ?? "";
  return source.stocks;
}

// Filter by market cap and volume
function shouldFilterBySize(stock: HighRiskStock): {
  filtered: boolean;
  reason: string | null;
} {
  if (stock.marketCap && stock.marketCap > MARKET_CAP_THRESHOLD) {
    return {
      filtered: true,
      reason: `Large market cap ($${(stock.marketCap / 1_000_000_000).toFixed(1)}B) - not susceptible to pump-and-dump`,
    };
  }

  if (stock.avgDollarVolume && stock.avgDollarVolume > VOLUME_THRESHOLD) {
    return {
      filtered: true,
      reason: `High daily volume ($${(stock.avgDollarVolume / 1_000_000).toFixed(1)}M) - highly liquid, hard to manipulate`,
    };
  }

  return { filtered: false, reason: null };
}

// News legitimacy analysis using OpenAI
function generateSchemeId(symbol: string, date: string): string {
  const timestamp = Date.now().toString(36);
  return `SCHEME-${symbol}-${date.replace(/-/g, "")}-${timestamp}`.toUpperCase();
}

// Main processing function
async function runPostScanPhases(): Promise<void> {
  const startTime = Date.now();
  const evaluationDate = getEvaluationDate();

  console.log("=".repeat(80));
  console.log("POST-SCAN PROCESSING PIPELINE");
  console.log(`Date: ${evaluationDate}`);
  console.log("=".repeat(80));

  // Check required env vars
  console.log("\nEnvironment check:");
  console.log(`  FMP_API_KEY: ${FMP_API_KEY ? "✓ Set" : "✗ Missing"}`);
  console.log(`  OPENAI_API_KEY: ${OPENAI_API_KEY ? "✓ Set" : "✗ Missing"}`);
  console.log(
    `  Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? "✓ Set" : "✗ Missing"}`,
  );

  if (!FMP_API_KEY) {
    console.error("\nERROR: FMP_API_KEY is required for news/filings fetch");
    process.exit(1);
  }

  // Phase 1: Load HIGH risk stocks
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 1: Loading all supported scored instruments");
  console.log("-".repeat(50));

  const highRiskStocks = await fetchHighRiskStocksFromStorage(evaluationDate);
  console.log(`Loaded ${highRiskStocks.length} HIGH risk stocks`);

  if (highRiskStocks.length === 0) {
    console.log("No HIGH risk stocks to process. Exiting.");
    process.exit(0);
  }

  // Initialize processed results
  const processedStocks: ProcessedStock[] = [];
  const suspiciousStocks: ProcessedStock[] = [];

  // Counters
  let filteredByMarketCap = 0;
  let filteredByVolume = 0;
  let filteredByNews = 0;

  // Phase 2: Filter by market cap and volume
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 2: Filtering by Market Cap & Volume");
  console.log("-".repeat(50));

  const afterSizeFilter: ProcessedStock[] = [];

  for (const stock of highRiskStocks) {
    const processed: ProcessedStock = {
      ...stock,
      isFiltered: false,
      filterReason: null,
      hasLegitimateNews: false,
      newsAnalysis: null,
      recentNews: [],
      secFilings: [],
      socialMediaScanned: false,
      socialMediaFindings: null,
      schemeId: null,
      schemeStatus: null,
    };

    const sizeFilter = shouldFilterBySize(stock);

    if (stock.riskLevel === "HIGH" && sizeFilter.filtered && !hasIndependentWarning(stock)) {
      processed.isFiltered = true;
      processed.filterReason = sizeFilter.reason;

      if (sizeFilter.reason?.includes("market cap")) {
        filteredByMarketCap++;
      } else {
        filteredByVolume++;
      }
    } else if (stock.riskLevel === "HIGH") {
      afterSizeFilter.push(processed);
    }

    processedStocks.push(processed);
  }

  console.log(`  Filtered by market cap (>$10B): ${filteredByMarketCap}`);
  console.log(`  Filtered by volume (>$10M): ${filteredByVolume}`);
  console.log(`  Remaining for news check: ${afterSizeFilter.length}`);

  // Phase 3: News & SEC Filing Analysis
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 3: News & SEC Filing Analysis");
  console.log("-".repeat(50));

  const afterNewsFilter: ProcessedStock[] = [];
  let newsFilterSkipped = 0;

  const reviewer = createNewsReview({date: evaluationDate, fmpKey: FMP_API_KEY, openaiKey: OPENAI_API_KEY, resultsDir: RESULTS_DIR});
  const eligible = processedStocks.filter(stock => stock.riskLevel !== "INSUFFICIENT");
  let chargedCostUsd = 0;
  for (let offset = 0; offset < eligible.length; offset += 10) {
    const batch = eligible.slice(offset, offset + 10);
    const evidence = await Promise.all(batch.map(async stock => {
      const sources = process.env.SKIP_NEWS === "true" ? [] : await Promise.all([
        reviewer.fetchStockNews(stock.symbol), reviewer.fetchSECFilings(stock.symbol), reviewer.fetchPressReleases(stock.symbol),
      ]);
      stock.newsEvidence = { sources };
      const rows = (source: SourceEvidence | undefined) => source?.items.filter(item => item.eligible).map(item => item.raw) ?? [];
      return {key: stock.symbol, result: stock, sources, news: rows(sources[0]), secFilings: rows(sources[1]), pressReleases: rows(sources[2])};
    }));
    const withEvidence = evidence.filter(item => retrievalComplete(item.sources) && item.sources.some(source => source.items.some(item => item.eligible)));
    const analysis = withEvidence.length ? await reviewer.analyzeNewsLegitimacyBatch(withEvidence, Math.max(0,25-chargedCostUsd)) : null;
    chargedCostUsd += analysis?.chargedUpperBoundUsd ?? 0;
    for (const item of evidence) {
      const stock = item.result;
      const verdict = analysis?.results.get(item.key);
      if (!retrievalComplete(item.sources)) {
        stock.newsTriage = item.sources.some(source => source.status === "ERROR") ? "ERROR" : "UNAVAILABLE";
        stock.newsAnalysis = "Source retrieval incomplete; no clearance is possible.";
      } else if (!item.sources.some(source => source.items.some(item => item.eligible))) {
        stock.newsTriage = "NO_EVIDENCE";
        stock.newsAnalysis = "Successful searches found no eligible dated evidence in the scan window.";
      } else if (!verdict || verdict.skipped) {
        stock.newsTriage = /^DEFERRED:/.test(verdict?.analysis ?? "") ? "DEFERRED" : analysis?.unavailable ? "UNAVAILABLE" : "ERROR";
        stock.newsAnalysis = verdict?.analysis ?? "Model review incomplete.";
      } else {
        stock.hasLegitimateNews = verdict.hasLegitimateNews && !hasIndependentWarning(stock);
        stock.newsTriage = stock.hasLegitimateNews ? "CLEARED" : "RETAINED";
        stock.newsAnalysis = verdict.analysis;
        stock.newsEvidence!.citedEvidenceIds = verdict.evidenceIds;
      }
      if (["ERROR","UNAVAILABLE","DEFERRED"].includes(stock.newsTriage!)) newsFilterSkipped++;
      if (afterSizeFilter.includes(stock)) {
        if (stock.newsTriage === "CLEARED") { stock.isFiltered = true; stock.filterReason = stock.newsAnalysis; filteredByNews++; }
        else afterNewsFilter.push(stock);
      }
    }
  }

  if (newsFilterSkipped > 0) {
    console.error(
      `\n  ❌ NEWS FILTER BROKEN: ${newsFilterSkipped} stocks skipped due to missing OPENAI_API_KEY`,
    );
    console.error(
      `  ⚠ filteredByNews=0 is NOT accurate — news analysis was not performed`,
    );
  }
  console.log(`\n  Filtered by legitimate news: ${filteredByNews}`);
  console.log(`  Remaining suspicious stocks: ${afterNewsFilter.length}`);

  // Phase 4: Social Media Scanning
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 4: Social Media Scanning");
  console.log("-".repeat(50));

  for (let i = 0; i < Math.min(afterNewsFilter.length, 50); i++) {
    const stock = afterNewsFilter[i];
    console.log(
      `[${i + 1}/${afterNewsFilter.length}] Scanning social media for ${stock.symbol}...`,
    );

    try {
      if (process.env.SKIP_SOCIAL === "true") continue;
      const socialFindings = await performRealSocialScan(
        stock.symbol,
        stock.name,
        stock.marketCap || 0,
      );

      stock.socialMediaScanned = true;
      stock.socialMediaFindings = socialFindings;

      if (socialFindings && socialFindings.overallPromotionScore >= 60) {
        console.log(
          `  🔴 HIGH promotion score: ${socialFindings.overallPromotionScore}/100`,
        );
      } else if (socialFindings && socialFindings.overallPromotionScore >= 40) {
        console.log(
          `  🟡 MEDIUM promotion score: ${socialFindings.overallPromotionScore}/100`,
        );
      } else if (socialFindings) {
        console.log(
          `  🟢 LOW promotion score: ${socialFindings.overallPromotionScore}/100`,
        );
      }
    } catch (error: any) {
      console.log(
        `  ⚠ Error scanning social media: ${error?.message || error}`,
      );
      stock.socialMediaScanned = false;
      stock.socialMediaFindings = null;
    }

    suspiciousStocks.push(stock);
    await sleep(1000);
  }

  // Phase 5: Assign Scheme IDs
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 5: Scheme Assignment");
  console.log("-".repeat(50));

  let newSchemes = 0;

  for (const stock of suspiciousStocks) {
    if (
      stock.socialMediaFindings &&
      stock.socialMediaFindings.overallPromotionScore >= 50
    ) {
      stock.schemeId = generateSchemeId(stock.symbol, evaluationDate);
      stock.schemeStatus = "NEW";
      newSchemes++;
      console.log(`  🆕 New scheme: ${stock.schemeId} (${stock.symbol})`);
    }
  }

  console.log(`\n  New schemes detected: ${newSchemes}`);
  console.log(`  Total suspicious stocks: ${suspiciousStocks.length}`);

  // Save results
  const endTime = Date.now();
  const durationMinutes = Math.round((endTime - startTime) / 60000);

  const report = {
    date: evaluationDate,
    processingType: "post-scan",
    parentRevisionHash: process.env.POST_SCAN_PARENT_REVISION_HASH || null,
    totalHighRiskInput: highRiskStocks.length,
    filteredByMarketCap,
    filteredByVolume,
    filteredByNews,
    remainingSuspicious: suspiciousStocks.length,
    newSchemes,
    processingTimeMinutes: durationMinutes,
    newsCoverage: { eligible: eligible.length, incomplete: newsFilterSkipped, sourceRequests: reviewer.calls, modelChargedOrReservedUpperBoundUsd: reviewer.modelCostBoundUsd },
    socialTargetCap: 50,
  };

  // Preserve triage on the full immutable evaluation, which ingestion actually reads.
  fs.writeFileSync(path.join(RESULTS_DIR, `enhanced-evaluation-${evaluationDate}.json`), JSON.stringify(processedStocks, null, 2));
  // Save files
  const suspiciousPath = path.join(
    RESULTS_DIR,
    `suspicious-stocks-${evaluationDate}.json`,
  );
  fs.writeFileSync(suspiciousPath, JSON.stringify(suspiciousStocks, null, 2));

  const reportPath = path.join(
    RESULTS_DIR,
    `post-scan-report-${evaluationDate}.json`,
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const allProcessedPath = path.join(
    RESULTS_DIR,
    `filtered-high-risk-${evaluationDate}.json`,
  );
  fs.writeFileSync(allProcessedPath, JSON.stringify(processedStocks, null, 2));

  // Print summary
  console.log("\n" + "=".repeat(80));
  console.log("PROCESSING COMPLETE");
  console.log("=".repeat(80));
  console.log(`\nSummary:`);
  console.log(`  Input HIGH risk stocks: ${highRiskStocks.length}`);
  console.log(`  Filtered by market cap: ${filteredByMarketCap}`);
  console.log(`  Filtered by volume: ${filteredByVolume}`);
  console.log(`  Filtered by news: ${filteredByNews}`);
  console.log(`  Remaining suspicious: ${suspiciousStocks.length}`);
  console.log(`  New schemes: ${newSchemes}`);
  console.log(`  Duration: ${durationMinutes} minutes`);
  console.log(`\nOutput Files:`);
  console.log(`  Suspicious stocks: ${suspiciousPath}`);
  console.log(`  Processing report: ${reportPath}`);
  console.log(`  All processed: ${allProcessedPath}`);

  // Print top suspicious stocks
  if (suspiciousStocks.length > 0) {
    console.log("\n" + "=".repeat(80));
    console.log("TOP SUSPICIOUS STOCKS");
    console.log("=".repeat(80));

    const sorted = [...suspiciousStocks].sort((a, b) => {
      // Rank by the declared signal-point unit; social scores remain separate.
      return b.totalScore - a.totalScore || a.symbol.localeCompare(b.symbol);
    });

    sorted.slice(0, 10).forEach((s, i) => {
      const promoScore = s.socialMediaFindings?.overallPromotionScore || 0;
      console.log(`\n${i + 1}. ${s.symbol} (${s.name})`);
      console.log(
        `   Risk Score: ${s.totalScore} | Promotion Score: ${promoScore}`,
      );
      console.log(`   Signals: ${s.signals.map((sig) => sig.code).join(", ")}`);
      if (s.schemeId) {
        console.log(`   Scheme ID: ${s.schemeId}`);
      }
    });
  }
}

// Run
runPostScanPhases()
  .then(() => {
    console.log("\n✅ Post-scan processing completed successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Processing failed:", error);
    process.exit(1);
  });
