/**
 * FMP Stock Evaluation Script - Historical Date Analysis
 *
 * Runs the ScamDunk risk scoring model using historical data
 * filtered to a specific date. This allows analyzing what
 * risk scores would have been on any past date.
 *
 * Usage:
 *   npx tsx run-evaluation-fmp-dated.ts --date 2026-01-15
 *   npx tsx run-evaluation-fmp-dated.ts --date 2026-01-16
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

import { computeRiskScore, MarketData, PriceHistory, StockQuote, ScoringResult } from './standalone-scorer';

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
  console.error('Usage: npx tsx run-evaluation-fmp-dated.ts --date 2026-01-15');
  process.exit(1);
}

// Validate date format
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
  marketCap?: number;
  sector?: string;
  industry?: string;
  lastPrice?: number;
  volume?: number;
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
  signals: {
    code: string;
    category: string;
    weight: number;
    description: string;
  }[];
  signalSummary: string;
  evaluatedAt: string;
  asOfDate: string;
  priceDataSource: string;
}

interface EvaluationSummary {
  totalStocks: number;
  evaluated: number;
  skippedNoData: number;
  fmpSuccessCount: number;
  asOfDate: string;
  byRiskLevel: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    INSUFFICIENT: number;
  };
  byExchange: Record<string, {
    total: number;
    LOW: number;
    MEDIUM: number;
    HIGH: number;
  }>;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  apiCallsMade: number;
}

interface CheckpointData {
  processedSymbols: Set<string>;
  results: EvaluationResult[];
  summary: Partial<EvaluationSummary>;
  lastProcessedIndex: number;
  targetDate: string;
}

interface ExtendedQuote extends StockQuote {
  sector?: string;
  industry?: string;
}

// Utility functions
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch FMP profile (for sector/industry info)
function fetchFMPProfile(symbol: string): { sector: string; industry: string; companyName: string; exchange: string } | null {
  const url = `${FMP_BASE_URL}/profile?symbol=${symbol}&apikey=${FMP_API_KEY}`;
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

// Fetch FMP history and filter to target date
function fetchFMPHistoryFiltered(symbol: string, targetDate: string): PriceHistory[] {
  const url = `${FMP_BASE_URL}/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_API_KEY}`;
  const response = curlFetch(url);

  if (!response) return [];

  try {
    const data = JSON.parse(response);
    if (!data || data.length === 0 || data['Error Message']) return [];

    // FMP returns newest first, filter to only dates <= targetDate
    const filtered = data.filter((day: any) => day.date <= targetDate);

    // Take last 100 days before/on target date, reverse to oldest first
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
  // Fetch profile
  const profile = fetchFMPProfile(symbol);
  if (!profile) return null;

  await sleep(FMP_DELAY_MS);

  // Fetch history filtered to target date
  const priceHistory = fetchFMPHistoryFiltered(symbol, targetDate);

  if (priceHistory.length === 0) return null;

  // Use the last day's data as "current" for the target date
  const lastDay = priceHistory[priceHistory.length - 1];

  // Calculate 30-day average volume from history
  const last30Days = priceHistory.slice(-30);
  const avgVolume30d = last30Days.reduce((sum, day) => sum + day.volume, 0) / Math.max(last30Days.length, 1);

  // Build quote from historical data
  const quote: ExtendedQuote = {
    ticker: symbol.toUpperCase(),
    companyName: profile.companyName,
    exchange: profile.exchange,
    lastPrice: lastDay.close,
    marketCap: profile.marketCap || 0,
    avgVolume30d: avgVolume30d,
    avgDollarVolume30d: avgVolume30d * lastDay.close,
    sector: profile.sector,
    industry: profile.industry,
  };

  // Determine if OTC
  const otcExchanges = ['OTC', 'OTCQX', 'OTCQB', 'PINK', 'OTC Markets'];
  const isOTC = otcExchanges.some(exc =>
    profile.exchange.toUpperCase().includes(exc.toUpperCase())
  );

  return {
    marketData: {
      quote,
      priceHistory,
      isOTC,
      dataAvailable: priceHistory.length > 0,
    },
    profile,
  };
}

// Stock list loading
function loadStockList(): StockTicker[] {
  const stockListPath = path.join(DATA_DIR, 'us-stocks.json');

  if (!fs.existsSync(stockListPath)) {
    console.error('Stock list not found. Please run fetch-us-stocks.ts first.');
    process.exit(1);
  }

  const stocks: StockTicker[] = JSON.parse(fs.readFileSync(stockListPath, 'utf-8'));
  console.log(`Loaded ${stocks.length} stocks from list`);
  return stocks;
}

// Checkpoint management
function getCheckpointPath(targetDate: string): string {
  return path.join(RESULTS_DIR, `fmp-checkpoint-${targetDate}.json`);
}

function loadCheckpoint(targetDate: string): CheckpointData | null {
  const checkpointPath = getCheckpointPath(targetDate);
  if (!fs.existsSync(checkpointPath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
    // Verify checkpoint is for same target date
    if (data.targetDate !== targetDate) return null;
    return {
      processedSymbols: new Set(data.processedSymbols),
      results: data.results,
      summary: data.summary,
      lastProcessedIndex: data.lastProcessedIndex,
      targetDate: data.targetDate,
    };
  } catch {
    return null;
  }
}

function saveCheckpoint(data: CheckpointData): void {
  const checkpointPath = getCheckpointPath(data.targetDate);
  fs.writeFileSync(checkpointPath, JSON.stringify({
    processedSymbols: Array.from(data.processedSymbols),
    results: data.results,
    summary: data.summary,
    lastProcessedIndex: data.lastProcessedIndex,
    targetDate: data.targetDate,
  }, null, 2));
}

// Main evaluation
async function runEvaluation(): Promise<void> {
  console.log('='.repeat(70));
  console.log(`FMP Stock Risk Evaluation - As of ${TARGET_DATE}`);
  console.log('='.repeat(70));

  if (!FMP_API_KEY) {
    console.error('ERROR: FMP_API_KEY environment variable not set');
    process.exit(1);
  }

  const stocks = loadStockList();

  // Load or initialize checkpoint
  let checkpoint = loadCheckpoint(TARGET_DATE!);
  if (checkpoint) {
    console.log(`\nResuming from checkpoint: ${checkpoint.results.length} stocks already processed`);
  } else {
    checkpoint = {
      processedSymbols: new Set(),
      results: [],
      summary: {
        totalStocks: stocks.length,
        evaluated: 0,
        skippedNoData: 0,
        fmpSuccessCount: 0,
        asOfDate: TARGET_DATE!,
        byRiskLevel: { LOW: 0, MEDIUM: 0, HIGH: 0, INSUFFICIENT: 0 },
        byExchange: {},
        startTime: new Date().toISOString(),
        apiCallsMade: 0,
      },
      lastProcessedIndex: 0,
      targetDate: TARGET_DATE!,
    };
  }

  const startTime = Date.now();
  let apiCallsMade = checkpoint.summary.apiCallsMade || 0;

  const remainingStocks = stocks.length - checkpoint.results.length;
  const estimatedMinutes = Math.ceil((remainingStocks * FMP_DELAY_MS * 2) / 60000);
  console.log(`\nEstimated time remaining: ${estimatedMinutes} minutes (~${(estimatedMinutes / 60).toFixed(1)} hours)`);
  console.log(`Rate: ~${Math.floor(60000 / (FMP_DELAY_MS * 2))} stocks/minute\n`);

  for (let i = checkpoint.lastProcessedIndex; i < stocks.length; i++) {
    const stock = stocks[i];

    if (checkpoint.processedSymbols.has(stock.symbol)) {
      continue;
    }

    const progress = ((i + 1) / stocks.length * 100).toFixed(1);
    const elapsed = (Date.now() - startTime) / 1000 / 60;
    const rate = (i - checkpoint.lastProcessedIndex + 1) / Math.max(elapsed, 0.1);
    const remaining = (stocks.length - i - 1) / Math.max(rate, 1);

    process.stdout.write(
      `\r[${progress}%] ${i + 1}/${stocks.length} | ${stock.symbol.padEnd(6)} | ` +
      `${checkpoint.summary.byRiskLevel?.HIGH || 0} HIGH | ` +
      `ETA: ${remaining.toFixed(0)}min    `
    );

    try {
      const result = await fetchStockDataForDate(stock.symbol, TARGET_DATE!);
      apiCallsMade += 2;

      if (!result || !result.marketData.dataAvailable) {
        checkpoint.summary.skippedNoData = (checkpoint.summary.skippedNoData || 0) + 1;
        checkpoint.processedSymbols.add(stock.symbol);
        continue;
      }

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

      checkpoint.results.push(evalResult);
      checkpoint.processedSymbols.add(stock.symbol);

      checkpoint.summary.evaluated = (checkpoint.summary.evaluated || 0) + 1;
      checkpoint.summary.fmpSuccessCount = (checkpoint.summary.fmpSuccessCount || 0) + 1;

      if (checkpoint.summary.byRiskLevel) {
        checkpoint.summary.byRiskLevel[scoringResult.riskLevel as keyof typeof checkpoint.summary.byRiskLevel]++;
      }

      const exchange = evalResult.exchange;
      if (!checkpoint.summary.byExchange) checkpoint.summary.byExchange = {};
      if (!checkpoint.summary.byExchange[exchange]) {
        checkpoint.summary.byExchange[exchange] = { total: 0, LOW: 0, MEDIUM: 0, HIGH: 0 };
      }
      checkpoint.summary.byExchange[exchange].total++;
      if (scoringResult.riskLevel !== 'INSUFFICIENT') {
        checkpoint.summary.byExchange[exchange][scoringResult.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH']++;
      }

      if ((i + 1) % FMP_BATCH_SIZE === 0) {
        checkpoint.lastProcessedIndex = i + 1;
        checkpoint.summary.apiCallsMade = apiCallsMade;
        saveCheckpoint(checkpoint);
      }

      await sleep(FMP_DELAY_MS);

    } catch (error) {
      console.error(`\nError processing ${stock.symbol}:`, error);
      checkpoint.processedSymbols.add(stock.symbol);
    }
  }

  // Final save
  const endTime = new Date();
  checkpoint.summary.endTime = endTime.toISOString();
  checkpoint.summary.durationMinutes = Math.round((Date.now() - startTime) / 60000);
  checkpoint.summary.apiCallsMade = apiCallsMade;

  const resultsPath = path.join(RESULTS_DIR, `fmp-evaluation-${TARGET_DATE}.json`);
  const summaryPath = path.join(RESULTS_DIR, `fmp-summary-${TARGET_DATE}.json`);

  fs.writeFileSync(resultsPath, JSON.stringify(checkpoint.results, null, 2));
  fs.writeFileSync(summaryPath, JSON.stringify(checkpoint.summary, null, 2));

  const highRisk = checkpoint.results
    .filter(r => r.riskLevel === 'HIGH')
    .sort((a, b) => b.totalScore - a.totalScore);

  const highRiskPath = path.join(RESULTS_DIR, `fmp-high-risk-${TARGET_DATE}.json`);
  fs.writeFileSync(highRiskPath, JSON.stringify(highRisk, null, 2));

  console.log('\n\n' + '='.repeat(70));
  console.log(`EVALUATION COMPLETE - As of ${TARGET_DATE}`);
  console.log('='.repeat(70));
  console.log(`Total stocks processed: ${checkpoint.summary.evaluated}`);
  console.log(`Skipped (no data): ${checkpoint.summary.skippedNoData}`);
  console.log(`Duration: ${checkpoint.summary.durationMinutes} minutes`);
  console.log(`API calls made: ${apiCallsMade}`);
  console.log('\nRisk Distribution:');
  console.log(`  HIGH:   ${checkpoint.summary.byRiskLevel?.HIGH || 0}`);
  console.log(`  MEDIUM: ${checkpoint.summary.byRiskLevel?.MEDIUM || 0}`);
  console.log(`  LOW:    ${checkpoint.summary.byRiskLevel?.LOW || 0}`);
  console.log(`\nResults saved to:`);
  console.log(`  Full results: ${resultsPath}`);
  console.log(`  High-risk stocks: ${highRiskPath}`);
  console.log(`  Summary: ${summaryPath}`);

  // Clean up checkpoint
  const checkpointPath = getCheckpointPath(TARGET_DATE!);
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
    console.log('\nCheckpoint file cleaned up.');
  }
}

runEvaluation().catch(console.error);
