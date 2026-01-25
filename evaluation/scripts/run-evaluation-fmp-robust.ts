/**
 * FMP Stock Evaluation Script - ROBUST Version (v2)
 *
 * Fixes from original:
 * 1. Streams results to JSONL file - prevents memory buildup that caused OOM at ~93%
 * 2. Lightweight checkpoint (only symbol list + counts, not full result objects)
 * 3. Uses original fast curlFetch + async sleep pattern (proven to work for 6000+ stocks)
 * 4. Does NOT delete checkpoint on completion
 * 5. Adds try/catch around each curl call to prevent crashes
 *
 * Usage:
 *   npx tsx run-evaluation-fmp-robust.ts --date 2026-01-16
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { computeRiskScore, MarketData, PriceHistory, StockQuote } from './standalone-scorer';

const DATA_DIR = path.join(__dirname, '..', 'data');
const RESULTS_DIR = path.join(__dirname, '..', 'results');

// FMP API settings
const FMP_API_KEY = process.env.FMP_API_KEY || '';
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';
const FMP_DELAY_MS = 210;
const FMP_BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 15000;

// Parse command line arguments
const args = process.argv.slice(2);
const dateIndex = args.indexOf('--date');
const TARGET_DATE = dateIndex !== -1 ? args[dateIndex + 1] : null;

if (!TARGET_DATE) {
  console.error('ERROR: --date argument required');
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(TARGET_DATE)) {
  console.error('ERROR: Date must be in YYYY-MM-DD format');
  process.exit(1);
}

console.log(`\n=== Running evaluation for date: ${TARGET_DATE} ===\n`);

// Types
interface StockTicker {
  symbol: string;
  name: string;
  exchange: string;
  isOTC: boolean;
}

interface EvaluationResult {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  marketCap: number | null;
  lastPrice: number | null;
  riskLevel: string;
  totalScore: number;
  isLegitimate: boolean;
  isInsufficient: boolean;
  signals: { code: string; category: string; weight: number; description: string }[];
  signalSummary: string;
  evaluatedAt: string;
  asOfDate: string;
  priceDataSource: string;
}

interface LightCheckpoint {
  processedSymbols: string[];
  targetDate: string;
  counts: {
    evaluated: number;
    skippedNoData: number;
    apiCallsMade: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
    INSUFFICIENT: number;
  };
  byExchange: Record<string, { total: number; LOW: number; MEDIUM: number; HIGH: number }>;
  startTime: string;
}

// Utility functions
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function curlFetch(url: string): string | null {
  try {
    const result = execSync(
      `curl -s --max-time ${REQUEST_TIMEOUT_MS / 1000} -H "User-Agent: Mozilla/5.0" "${url}"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    return result;
  } catch {
    return null;
  }
}

// Fetch FMP profile
function fetchFMPProfile(symbol: string): { sector: string; industry: string; companyName: string; exchange: string } | null {
  const url = `${FMP_BASE_URL}/profile?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_API_KEY}`;
  const response = curlFetch(url);
  if (!response) return null;

  try {
    const data = JSON.parse(response);
    if (!data || data.length === 0 || data['Error Message']) return null;
    return {
      sector: data[0].sector || 'Unknown',
      industry: data[0].industry || 'Unknown',
      companyName: data[0].companyName || symbol,
      exchange: data[0].exchange || 'Unknown',
    };
  } catch {
    return null;
  }
}

// Fetch and filter historical price data
function fetchFMPHistoryFiltered(symbol: string, targetDate: string): PriceHistory[] {
  const url = `${FMP_BASE_URL}/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_API_KEY}`;
  const response = curlFetch(url);
  if (!response) return [];

  try {
    const data = JSON.parse(response);
    if (!data || data.length === 0 || data['Error Message']) return [];

    const filtered = data.filter((day: any) => day.date <= targetDate);
    return filtered
      .slice(0, 100)
      .reverse()
      .map((day: any) => ({
        date: day.date,
        open: day.open,
        high: day.high,
        low: day.low,
        close: day.close,
        volume: day.volume,
      }));
  } catch {
    return [];
  }
}

// Build market data for a specific date
async function fetchStockDataForDate(symbol: string, targetDate: string): Promise<{ marketData: MarketData; profile: any } | null> {
  const profile = fetchFMPProfile(symbol);
  if (!profile) return null;

  await sleep(FMP_DELAY_MS);

  const priceHistory = fetchFMPHistoryFiltered(symbol, targetDate);
  if (priceHistory.length === 0) return null;

  const lastDay = priceHistory[priceHistory.length - 1];
  const last30Days = priceHistory.slice(-30);
  const avgVolume30d = last30Days.reduce((sum, day) => sum + day.volume, 0) / Math.max(last30Days.length, 1);

  const quote: StockQuote & { sector?: string; industry?: string } = {
    ticker: symbol.toUpperCase(),
    companyName: profile.companyName,
    exchange: profile.exchange,
    lastPrice: lastDay.close,
    marketCap: 0,
    avgVolume30d,
    avgDollarVolume30d: avgVolume30d * lastDay.close,
    sector: profile.sector,
    industry: profile.industry,
  };

  const otcExchanges = ['OTC', 'OTCQX', 'OTCQB', 'PINK', 'OTC Markets'];
  const isOTC = otcExchanges.some(exc => profile.exchange.toUpperCase().includes(exc.toUpperCase()));

  return {
    marketData: { quote, priceHistory, isOTC, dataAvailable: true },
    profile,
  };
}

// File paths
function getCheckpointPath(): string {
  return path.join(RESULTS_DIR, `fmp-checkpoint-${TARGET_DATE}.json`);
}

function getJSONLPath(): string {
  return path.join(RESULTS_DIR, `fmp-results-${TARGET_DATE}.jsonl`);
}

// Checkpoint management
function loadCheckpoint(): LightCheckpoint | null {
  const cp = getCheckpointPath();
  if (!fs.existsSync(cp)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(cp, 'utf-8'));
    if (data.targetDate !== TARGET_DATE) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCheckpoint(checkpoint: LightCheckpoint): void {
  const tmp = getCheckpointPath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(checkpoint));
  fs.renameSync(tmp, getCheckpointPath());
}

function appendResult(result: EvaluationResult): void {
  fs.appendFileSync(getJSONLPath(), JSON.stringify(result) + '\n');
}

// Stock list loading
function loadStockList(): StockTicker[] {
  const stockListPath = path.join(DATA_DIR, 'us-stocks.json');
  if (!fs.existsSync(stockListPath)) {
    console.error('Stock list not found.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(stockListPath, 'utf-8'));
}

// Main evaluation
async function runEvaluation(): Promise<void> {
  console.log('='.repeat(70));
  console.log(`FMP Stock Risk Evaluation - As of ${TARGET_DATE}`);
  console.log('='.repeat(70));

  if (!FMP_API_KEY) {
    console.error('ERROR: FMP_API_KEY not set');
    process.exit(1);
  }

  const stocks = loadStockList();
  console.log(`Loaded ${stocks.length} stocks from list`);

  // Load checkpoint
  let checkpoint = loadCheckpoint();
  const processedSet = new Set<string>();

  if (checkpoint) {
    checkpoint.processedSymbols.forEach(s => processedSet.add(s));
    console.log(`\nResuming from checkpoint: ${processedSet.size} stocks already processed`);
    console.log(`  HIGH: ${checkpoint.counts.HIGH}, MEDIUM: ${checkpoint.counts.MEDIUM}, LOW: ${checkpoint.counts.LOW}`);
  } else {
    checkpoint = {
      processedSymbols: [],
      targetDate: TARGET_DATE!,
      counts: { evaluated: 0, skippedNoData: 0, apiCallsMade: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INSUFFICIENT: 0 },
      byExchange: {},
      startTime: new Date().toISOString(),
    };
  }

  const startTime = Date.now();
  let batchCount = 0;

  const remaining = stocks.length - processedSet.size;
  const estimatedMinutes = Math.ceil((remaining * FMP_DELAY_MS * 2) / 60000);
  console.log(`\nEstimated time remaining: ${estimatedMinutes} minutes (~${(estimatedMinutes / 60).toFixed(1)} hours)`);
  console.log(`Rate: ~${Math.floor(60000 / (FMP_DELAY_MS * 2))} stocks/minute\n`);

  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i];
    if (processedSet.has(stock.symbol)) continue;

    const progress = ((processedSet.size + 1) / stocks.length * 100).toFixed(1);
    const elapsed = (Date.now() - startTime) / 60000;
    const processed = processedSet.size - (checkpoint.processedSymbols?.length || 0) + 1;
    const rate = processed / Math.max(elapsed, 0.01);
    const eta = (stocks.length - processedSet.size) / Math.max(rate, 0.1);

    process.stdout.write(
      `\r[${progress}%] ${processedSet.size + 1}/${stocks.length} | ${stock.symbol.padEnd(6)} | ` +
      `${checkpoint.counts.HIGH} HIGH | ETA: ${eta.toFixed(0)}min    `
    );

    try {
      const result = await fetchStockDataForDate(stock.symbol, TARGET_DATE!);
      checkpoint.counts.apiCallsMade += 2;

      if (!result) {
        checkpoint.counts.skippedNoData++;
        processedSet.add(stock.symbol);
        batchCount++;
      } else {
        const { marketData, profile } = result;
        const scoringResult = computeRiskScore(marketData);

        const evalResult: EvaluationResult = {
          symbol: stock.symbol,
          name: profile.companyName || stock.name,
          exchange: profile.exchange || stock.exchange,
          sector: profile.sector || 'Unknown',
          industry: profile.industry || 'Unknown',
          marketCap: marketData.quote?.marketCap || null,
          lastPrice: marketData.quote?.lastPrice || null,
          riskLevel: scoringResult.riskLevel,
          totalScore: scoringResult.totalScore,
          isLegitimate: scoringResult.isLegitimate,
          isInsufficient: scoringResult.isInsufficient,
          signals: scoringResult.signals,
          signalSummary: scoringResult.signals.map(s => s.code).join(', '),
          evaluatedAt: new Date().toISOString(),
          asOfDate: TARGET_DATE!,
          priceDataSource: 'FMP-Historical',
        };

        // Stream to JSONL - don't accumulate in memory
        appendResult(evalResult);

        checkpoint.counts.evaluated++;
        const rl = scoringResult.riskLevel as keyof typeof checkpoint.counts;
        if (rl in checkpoint.counts) checkpoint.counts[rl]++;

        const exchange = evalResult.exchange;
        if (!checkpoint.byExchange[exchange]) {
          checkpoint.byExchange[exchange] = { total: 0, LOW: 0, MEDIUM: 0, HIGH: 0 };
        }
        checkpoint.byExchange[exchange].total++;
        if (scoringResult.riskLevel !== 'INSUFFICIENT') {
          checkpoint.byExchange[exchange][scoringResult.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH']++;
        }

        processedSet.add(stock.symbol);
        batchCount++;
      }

      // Save lightweight checkpoint every batch
      if (batchCount >= FMP_BATCH_SIZE) {
        checkpoint.processedSymbols = Array.from(processedSet);
        saveCheckpoint(checkpoint);
        batchCount = 0;
      }

      await sleep(FMP_DELAY_MS);

    } catch (error: any) {
      // Never crash on individual stock errors
      console.error(`\n  Error on ${stock.symbol}: ${error.message || error}`);
      processedSet.add(stock.symbol);
      checkpoint.counts.skippedNoData++;
      batchCount++;
    }
  }

  // Final checkpoint save
  checkpoint.processedSymbols = Array.from(processedSet);
  saveCheckpoint(checkpoint);

  // Build final output files from JSONL
  console.log('\n\nBuilding final output files...');
  const jsonlPath = getJSONLPath();
  const allResults: EvaluationResult[] = [];

  if (fs.existsSync(jsonlPath)) {
    const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try { allResults.push(JSON.parse(line)); } catch {}
    }
  }

  // Deduplicate
  const deduped = new Map<string, EvaluationResult>();
  for (const r of allResults) deduped.set(r.symbol, r);
  const finalResults = Array.from(deduped.values());

  // Write final files
  const resultsPath = path.join(RESULTS_DIR, `fmp-evaluation-${TARGET_DATE}.json`);
  const summaryPath = path.join(RESULTS_DIR, `fmp-summary-${TARGET_DATE}.json`);
  const highRiskPath = path.join(RESULTS_DIR, `fmp-high-risk-${TARGET_DATE}.json`);

  fs.writeFileSync(resultsPath, JSON.stringify(finalResults, null, 2));

  const highRisk = finalResults
    .filter(r => r.riskLevel === 'HIGH')
    .sort((a, b) => b.totalScore - a.totalScore);
  fs.writeFileSync(highRiskPath, JSON.stringify(highRisk, null, 2));

  const summary = {
    totalStocks: stocks.length,
    evaluated: checkpoint.counts.evaluated,
    skippedNoData: checkpoint.counts.skippedNoData,
    fmpSuccessCount: checkpoint.counts.evaluated,
    asOfDate: TARGET_DATE,
    byRiskLevel: {
      LOW: checkpoint.counts.LOW,
      MEDIUM: checkpoint.counts.MEDIUM,
      HIGH: checkpoint.counts.HIGH,
      INSUFFICIENT: checkpoint.counts.INSUFFICIENT,
    },
    byExchange: checkpoint.byExchange,
    startTime: checkpoint.startTime,
    apiCallsMade: checkpoint.counts.apiCallsMade,
    endTime: new Date().toISOString(),
    durationMinutes: Math.round((Date.now() - startTime) / 60000),
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log(`EVALUATION COMPLETE - As of ${TARGET_DATE}`);
  console.log('='.repeat(70));
  console.log(`Total evaluated: ${checkpoint.counts.evaluated}`);
  console.log(`Skipped: ${checkpoint.counts.skippedNoData}`);
  console.log(`HIGH: ${checkpoint.counts.HIGH} | MEDIUM: ${checkpoint.counts.MEDIUM} | LOW: ${checkpoint.counts.LOW}`);

  // Clean up JSONL
  if (fs.existsSync(jsonlPath)) fs.unlinkSync(jsonlPath);
}

runEvaluation().catch(err => {
  console.error('\nFATAL ERROR:', err);
  process.exit(1);
});
