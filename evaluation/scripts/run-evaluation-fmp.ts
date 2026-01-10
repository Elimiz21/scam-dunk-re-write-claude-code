/**
 * FMP Stock Evaluation Script - Full Pattern Analysis
 *
 * Runs the ScamDunk risk scoring model on all US stocks using
 * Financial Modeling Prep (FMP) API for reliable historical data.
 *
 * FMP Starter Plan ($29/mo):
 * - 300 requests/minute
 * - 5 years historical data
 * - No daily limits
 *
 * Features:
 * - Full pattern analysis (RSI, volume spikes, pump-and-dump detection)
 * - Checkpoint/resume support for long-running evaluations
 * - Progress tracking and time estimates
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Import standalone scoring module
import { computeRiskScore, MarketData, PriceHistory, StockQuote, ScoringResult } from './standalone-scorer';

const DATA_DIR = path.join(__dirname, '..', 'data');
const RESULTS_DIR = path.join(__dirname, '..', 'results');

// ============================================================================
// CONFIGURATION
// ============================================================================

// FMP API settings (Starter plan: 300 requests/min)
const FMP_API_KEY = process.env.FMP_API_KEY || '';
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';
const FMP_DELAY_MS = 210; // ~285 requests/min (leaving buffer)
const FMP_BATCH_SIZE = 50; // Save checkpoint every 50 stocks

// Request settings
const REQUEST_TIMEOUT_MS = 15000;

// ============================================================================
// TYPES
// ============================================================================

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
  priceDataSource: string;
}

interface EvaluationSummary {
  totalStocks: number;
  evaluated: number;
  skippedNoData: number;
  fmpSuccessCount: number;
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
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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

// ============================================================================
// FMP DATA FETCHING
// ============================================================================

function fetchFMPQuote(symbol: string): StockQuote | null {
  const url = `${FMP_BASE_URL}/profile?symbol=${symbol}&apikey=${FMP_API_KEY}`;
  const response = curlFetch(url);

  if (!response) return null;

  try {
    const data = JSON.parse(response);
    if (!data || data.length === 0 || data['Error Message']) return null;

    const profile = data[0];
    return {
      ticker: symbol.toUpperCase(),
      companyName: profile.companyName || symbol,
      exchange: profile.exchange || 'Unknown',
      lastPrice: profile.price || 0,
      marketCap: profile.marketCap || 0,
      avgVolume30d: profile.averageVolume || profile.volume || 0,
      avgDollarVolume30d: (profile.averageVolume || profile.volume || 0) * (profile.price || 0),
    };
  } catch {
    return null;
  }
}

function fetchFMPHistory(symbol: string): PriceHistory[] {
  const url = `${FMP_BASE_URL}/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_API_KEY}`;
  const response = curlFetch(url);

  if (!response) return [];

  try {
    const data = JSON.parse(response);
    if (!data || data.length === 0 || data['Error Message']) return [];

    // FMP stable API returns newest first, we need oldest first
    return data
      .slice(0, 100) // Last 100 days
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

function fetchFMPProfile(symbol: string): { sector: string; industry: string } | null {
  // Note: Profile data is already included in the quote call with stable API
  // This function is kept for compatibility but can reuse quote data
  const url = `${FMP_BASE_URL}/profile?symbol=${symbol}&apikey=${FMP_API_KEY}`;
  const response = curlFetch(url);

  if (!response) return null;

  try {
    const data = JSON.parse(response);
    if (!data || data.length === 0 || data['Error Message']) return null;

    return {
      sector: data[0].sector || 'Unknown',
      industry: data[0].industry || 'Unknown',
    };
  } catch {
    return null;
  }
}

async function fetchStockData(symbol: string): Promise<MarketData | null> {
  // Fetch quote and history
  const quote = fetchFMPQuote(symbol);
  if (!quote) return null;

  await sleep(FMP_DELAY_MS);

  const priceHistory = fetchFMPHistory(symbol);

  // Determine if OTC
  const otcExchanges = ['OTC', 'OTCQX', 'OTCQB', 'PINK', 'OTC Markets'];
  const isOTC = otcExchanges.some(exc =>
    quote.exchange.toUpperCase().includes(exc.toUpperCase())
  );

  return {
    quote,
    priceHistory,
    isOTC,
    dataAvailable: priceHistory.length > 0,
  };
}

// ============================================================================
// STOCK LIST LOADING
// ============================================================================

function loadStockList(): StockTicker[] {
  const stockListPath = path.join(DATA_DIR, 'us-stocks-list.json');

  if (!fs.existsSync(stockListPath)) {
    console.error('Stock list not found. Please run fetch-us-stocks.ts first.');
    process.exit(1);
  }

  const stocks: StockTicker[] = JSON.parse(fs.readFileSync(stockListPath, 'utf-8'));
  console.log(`Loaded ${stocks.length} stocks from list`);
  return stocks;
}

// ============================================================================
// CHECKPOINT MANAGEMENT
// ============================================================================

function getCheckpointPath(): string {
  const today = new Date().toISOString().split('T')[0];
  return path.join(RESULTS_DIR, `fmp-checkpoint-${today}.json`);
}

function loadCheckpoint(): CheckpointData | null {
  const checkpointPath = getCheckpointPath();
  if (!fs.existsSync(checkpointPath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
    return {
      processedSymbols: new Set(data.processedSymbols),
      results: data.results,
      summary: data.summary,
      lastProcessedIndex: data.lastProcessedIndex,
    };
  } catch {
    return null;
  }
}

function saveCheckpoint(data: CheckpointData): void {
  const checkpointPath = getCheckpointPath();
  fs.writeFileSync(checkpointPath, JSON.stringify({
    processedSymbols: Array.from(data.processedSymbols),
    results: data.results,
    summary: data.summary,
    lastProcessedIndex: data.lastProcessedIndex,
  }, null, 2));
}

// ============================================================================
// MAIN EVALUATION LOOP
// ============================================================================

async function runEvaluation(): Promise<void> {
  console.log('='.repeat(70));
  console.log('FMP Stock Risk Evaluation - Full Pattern Analysis');
  console.log('='.repeat(70));

  // Check API key
  if (!FMP_API_KEY) {
    console.error('ERROR: FMP_API_KEY environment variable not set');
    console.error('Please set your FMP API key in the .env file');
    process.exit(1);
  }

  // Load stock list
  const stocks = loadStockList();

  // Load or initialize checkpoint
  let checkpoint = loadCheckpoint();
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
        byRiskLevel: { LOW: 0, MEDIUM: 0, HIGH: 0, INSUFFICIENT: 0 },
        byExchange: {},
        startTime: new Date().toISOString(),
        apiCallsMade: 0,
      },
      lastProcessedIndex: 0,
    };
  }

  const startTime = Date.now();
  let apiCallsMade = checkpoint.summary.apiCallsMade || 0;

  // Calculate time estimate
  const remainingStocks = stocks.length - checkpoint.results.length;
  const estimatedMinutes = Math.ceil((remainingStocks * FMP_DELAY_MS * 2) / 60000);
  console.log(`\nEstimated time remaining: ${estimatedMinutes} minutes (~${(estimatedMinutes / 60).toFixed(1)} hours)`);
  console.log(`Rate: ~${Math.floor(60000 / (FMP_DELAY_MS * 2))} stocks/minute\n`);

  // Process stocks
  for (let i = checkpoint.lastProcessedIndex; i < stocks.length; i++) {
    const stock = stocks[i];

    // Skip already processed
    if (checkpoint.processedSymbols.has(stock.symbol)) {
      continue;
    }

    // Progress update
    const progress = ((i + 1) / stocks.length * 100).toFixed(1);
    const elapsed = (Date.now() - startTime) / 1000 / 60;
    const rate = (i - checkpoint.lastProcessedIndex + 1) / elapsed;
    const remaining = (stocks.length - i - 1) / rate;

    process.stdout.write(
      `\r[${progress}%] ${i + 1}/${stocks.length} | ${stock.symbol.padEnd(6)} | ` +
      `${checkpoint.summary.byRiskLevel?.HIGH || 0} HIGH | ` +
      `ETA: ${remaining.toFixed(0)}min    `
    );

    try {
      // Fetch data from FMP
      const marketData = await fetchStockData(stock.symbol);
      apiCallsMade += 2; // quote + history

      if (!marketData || !marketData.dataAvailable) {
        checkpoint.summary.skippedNoData = (checkpoint.summary.skippedNoData || 0) + 1;
        checkpoint.processedSymbols.add(stock.symbol);
        continue;
      }

      // Get profile for sector/industry
      await sleep(FMP_DELAY_MS);
      const profile = fetchFMPProfile(stock.symbol);
      apiCallsMade++;

      // Run scoring
      const scoringResult = computeRiskScore(marketData);

      // Build result
      const result: EvaluationResult = {
        symbol: stock.symbol,
        name: marketData.quote?.companyName || stock.name,
        exchange: marketData.quote?.exchange || stock.exchange,
        sector: profile?.sector || 'Unknown',
        industry: profile?.industry || 'Unknown',
        marketCap: marketData.quote?.marketCap || null,
        lastPrice: marketData.quote?.lastPrice || null,
        riskLevel: scoringResult.riskLevel,
        totalScore: scoringResult.totalScore,
        isLegitimate: scoringResult.isLegitimate,
        isInsufficient: scoringResult.isInsufficient,
        signals: scoringResult.signals,
        signalSummary: scoringResult.signals.map(s => s.code).join(', '),
        evaluatedAt: new Date().toISOString(),
        priceDataSource: 'FMP',
      };

      checkpoint.results.push(result);
      checkpoint.processedSymbols.add(stock.symbol);

      // Update summary
      checkpoint.summary.evaluated = (checkpoint.summary.evaluated || 0) + 1;
      checkpoint.summary.fmpSuccessCount = (checkpoint.summary.fmpSuccessCount || 0) + 1;

      if (checkpoint.summary.byRiskLevel) {
        checkpoint.summary.byRiskLevel[scoringResult.riskLevel as keyof typeof checkpoint.summary.byRiskLevel]++;
      }

      // Track by exchange
      const exchange = result.exchange;
      if (!checkpoint.summary.byExchange) checkpoint.summary.byExchange = {};
      if (!checkpoint.summary.byExchange[exchange]) {
        checkpoint.summary.byExchange[exchange] = { total: 0, LOW: 0, MEDIUM: 0, HIGH: 0 };
      }
      checkpoint.summary.byExchange[exchange].total++;
      if (scoringResult.riskLevel !== 'INSUFFICIENT') {
        checkpoint.summary.byExchange[exchange][scoringResult.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH']++;
      }

      // Save checkpoint periodically
      if ((i + 1) % FMP_BATCH_SIZE === 0) {
        checkpoint.lastProcessedIndex = i + 1;
        checkpoint.summary.apiCallsMade = apiCallsMade;
        saveCheckpoint(checkpoint);
      }

      // Rate limiting delay
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

  // Save results
  const today = endTime.toISOString().split('T')[0];
  const resultsPath = path.join(RESULTS_DIR, `fmp-evaluation-${today}.json`);
  const summaryPath = path.join(RESULTS_DIR, `fmp-summary-${today}.json`);

  fs.writeFileSync(resultsPath, JSON.stringify(checkpoint.results, null, 2));
  fs.writeFileSync(summaryPath, JSON.stringify(checkpoint.summary, null, 2));

  // Extract high-risk stocks
  const highRisk = checkpoint.results
    .filter(r => r.riskLevel === 'HIGH')
    .sort((a, b) => b.totalScore - a.totalScore);

  const highRiskPath = path.join(RESULTS_DIR, `fmp-high-risk-${today}.json`);
  fs.writeFileSync(highRiskPath, JSON.stringify(highRisk, null, 2));

  // Print summary
  console.log('\n\n' + '='.repeat(70));
  console.log('EVALUATION COMPLETE');
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
  const checkpointPath = getCheckpointPath();
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
    console.log('\nCheckpoint file cleaned up.');
  }
}

// Run
runEvaluation().catch(console.error);
