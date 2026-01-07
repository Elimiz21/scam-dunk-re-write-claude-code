/**
 * Live Stock Evaluation Script - Real Data Only
 *
 * Runs the ScamDunk risk scoring model on all US stocks with ONLY real
 * historical price data. Uses Yahoo Finance as primary source with
 * Alpha Vantage as fallback. No mock data.
 *
 * Features:
 * - Longer delays to avoid rate limiting (2-3 seconds between requests)
 * - Alpha Vantage fallback for stocks that fail Yahoo Finance
 * - Automatic rate limit detection and exponential backoff
 * - Checkpoint/resume support for long-running evaluations
 * - Comparison report against January 1st baseline
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

// Import standalone scoring module
import { computeRiskScore, MarketData, PriceHistory, StockQuote, ScoringResult } from './standalone-scorer';

const DATA_DIR = path.join(__dirname, '..', 'data');
const RESULTS_DIR = path.join(__dirname, '..', 'results');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// ============================================================================
// CONFIGURATION - Adjust these for rate limiting
// ============================================================================

// Yahoo Finance settings - conservative to avoid rate limits
const YAHOO_DELAY_MS = 2500; // 2.5 seconds between requests (was 333ms)
const YAHOO_RETRY_DELAY_MS = 5000; // 5 seconds on first retry
const YAHOO_MAX_RETRIES = 2; // Reduced retries to fail faster to Alpha Vantage
const YAHOO_RATE_LIMIT_BACKOFF_MS = 60000; // 1 minute backoff on rate limit

// Alpha Vantage settings (free tier: 25 requests/day, 5/minute)
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';
const ALPHA_VANTAGE_DELAY_MS = 12500; // 12.5 seconds = ~5 requests/minute
const ALPHA_VANTAGE_DAILY_LIMIT = 25;
let alphaVantageCallsToday = 0;

// General settings
const BATCH_SIZE = 25; // Save checkpoint more frequently
const REQUEST_TIMEOUT_MS = 20000;

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
  yahooSuccessCount: number;
  alphaVantageSuccessCount: number;
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
    INSUFFICIENT: number;
  }>;
  bySector: Record<string, {
    total: number;
    LOW: number;
    MEDIUM: number;
    HIGH: number;
  }>;
  bySignal: Record<string, number>;
  topHighRisk: EvaluationResult[];
  legitimateStocks: number;
  evaluationDate: string;
  durationSeconds: number;
}

interface ComparisonResult {
  symbol: string;
  name: string;
  exchange: string;
  previousRisk: string;
  currentRisk: string;
  previousScore: number;
  currentScore: number;
  changeType: 'UPGRADED' | 'DOWNGRADED' | 'UNCHANGED' | 'NEW';
  previousSignals: string;
  currentSignals: string;
}

interface FetchResult {
  data: PriceHistory[] | null;
  source: 'yahoo' | 'alphavantage' | 'none';
  rateLimited: boolean;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function progressBar(current: number, total: number, width: number = 40): string {
  const percent = current / total;
  const filled = Math.round(width * percent);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${(percent * 100).toFixed(1)}% (${current}/${total})`;
}

function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// ============================================================================
// YAHOO FINANCE DATA FETCHER
// ============================================================================

async function fetchYahooFinanceData(symbol: string, days: number = 60): Promise<{ data: PriceHistory[] | null; rateLimited: boolean }> {
  return new Promise((resolve) => {
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - (days * 24 * 60 * 60);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${startDate}&period2=${endDate}&interval=1d&events=history`;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      timeout: REQUEST_TIMEOUT_MS,
    };

    const req = https.get(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          // Check for rate limiting
          if (res.statusCode === 429 || data.includes('Too Many Requests')) {
            resolve({ data: null, rateLimited: true });
            return;
          }

          if (res.statusCode !== 200) {
            resolve({ data: null, rateLimited: false });
            return;
          }

          const json = JSON.parse(data);
          const result = json.chart?.result?.[0];

          if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
            resolve({ data: null, rateLimited: false });
            return;
          }

          const timestamps = result.timestamp;
          const quote = result.indicators.quote[0];
          const priceHistory: PriceHistory[] = [];

          for (let i = 0; i < timestamps.length; i++) {
            if (quote.open?.[i] == null || quote.high?.[i] == null ||
                quote.low?.[i] == null || quote.close?.[i] == null ||
                quote.volume?.[i] == null) {
              continue;
            }

            const date = new Date(timestamps[i] * 1000);
            priceHistory.push({
              date: date.toISOString().split('T')[0],
              open: quote.open[i],
              high: quote.high[i],
              low: quote.low[i],
              close: quote.close[i],
              volume: quote.volume[i],
            });
          }

          if (priceHistory.length < 7) {
            resolve({ data: null, rateLimited: false });
            return;
          }

          resolve({ data: priceHistory, rateLimited: false });
        } catch {
          resolve({ data: null, rateLimited: false });
        }
      });
    });

    req.on('error', () => {
      resolve({ data: null, rateLimited: false });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ data: null, rateLimited: false });
    });
  });
}

// ============================================================================
// ALPHA VANTAGE DATA FETCHER (Fallback)
// ============================================================================

async function fetchAlphaVantageData(symbol: string): Promise<PriceHistory[] | null> {
  if (!ALPHA_VANTAGE_API_KEY) {
    return null;
  }

  if (alphaVantageCallsToday >= ALPHA_VANTAGE_DAILY_LIMIT) {
    return null;
  }

  return new Promise((resolve) => {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${ALPHA_VANTAGE_API_KEY}`;

    const req = https.get(url, { timeout: REQUEST_TIMEOUT_MS }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          alphaVantageCallsToday++;

          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }

          const json = JSON.parse(data);

          // Check for API limit message
          if (json['Note'] || json['Information']) {
            console.log('\n⚠️  Alpha Vantage API limit reached');
            alphaVantageCallsToday = ALPHA_VANTAGE_DAILY_LIMIT; // Stop further calls
            resolve(null);
            return;
          }

          const timeSeries = json['Time Series (Daily)'];
          if (!timeSeries) {
            resolve(null);
            return;
          }

          const priceHistory: PriceHistory[] = [];
          const dates = Object.keys(timeSeries).sort().slice(-60); // Last 60 days

          for (const date of dates) {
            const day = timeSeries[date];
            priceHistory.push({
              date,
              open: parseFloat(day['1. open']),
              high: parseFloat(day['2. high']),
              low: parseFloat(day['3. low']),
              close: parseFloat(day['4. close']),
              volume: parseInt(day['5. volume']),
            });
          }

          if (priceHistory.length < 7) {
            resolve(null);
            return;
          }

          resolve(priceHistory);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => {
      resolve(null);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

// ============================================================================
// COMBINED DATA FETCHER WITH FALLBACK
// ============================================================================

async function fetchPriceData(symbol: string): Promise<FetchResult> {
  // Try Yahoo Finance first
  for (let attempt = 0; attempt < YAHOO_MAX_RETRIES; attempt++) {
    const result = await fetchYahooFinanceData(symbol);

    if (result.rateLimited) {
      console.log(`\n⚠️  Yahoo Finance rate limit detected. Backing off for ${YAHOO_RATE_LIMIT_BACKOFF_MS / 1000}s...`);
      await delay(YAHOO_RATE_LIMIT_BACKOFF_MS);
      continue;
    }

    if (result.data !== null) {
      return { data: result.data, source: 'yahoo', rateLimited: false };
    }

    if (attempt < YAHOO_MAX_RETRIES - 1) {
      await delay(YAHOO_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  // Try Alpha Vantage as fallback
  if (ALPHA_VANTAGE_API_KEY && alphaVantageCallsToday < ALPHA_VANTAGE_DAILY_LIMIT) {
    await delay(ALPHA_VANTAGE_DELAY_MS); // Respect rate limit
    const avData = await fetchAlphaVantageData(symbol);
    if (avData !== null) {
      return { data: avData, source: 'alphavantage', rateLimited: false };
    }
  }

  return { data: null, source: 'none', rateLimited: false };
}

// ============================================================================
// MARKET DATA CREATION
// ============================================================================

function createMarketData(stock: StockTicker, priceHistory: PriceHistory[]): MarketData {
  const avgVolume30d = priceHistory.slice(-30).reduce((sum, day) => sum + day.volume, 0) / Math.min(priceHistory.length, 30);
  const lastPrice = priceHistory[priceHistory.length - 1].close;

  const quote: StockQuote = {
    ticker: stock.symbol,
    companyName: stock.name,
    exchange: stock.exchange,
    lastPrice: lastPrice,
    marketCap: stock.marketCap || 0,
    avgVolume30d: avgVolume30d,
    avgDollarVolume30d: avgVolume30d * lastPrice,
  };

  const isOTC = stock.isOTC ||
    ['OTC', 'OTCQX', 'OTCQB', 'PINK', 'GREY'].some(ex =>
      stock.exchange.toUpperCase().includes(ex)
    );

  return {
    quote,
    priceHistory,
    isOTC,
    dataAvailable: true,
  };
}

// ============================================================================
// CHECKPOINT MANAGEMENT
// ============================================================================

interface Checkpoint {
  results: EvaluationResult[];
  skipped: string[];
  yahooCount: number;
  alphaVantageCount: number;
  alphaVantageCallsToday: number;
}

function loadCheckpoint(checkpointPath: string): Checkpoint {
  if (fs.existsSync(checkpointPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
      return {
        results: data.results || [],
        skipped: data.skipped || [],
        yahooCount: data.yahooCount || 0,
        alphaVantageCount: data.alphaVantageCount || 0,
        alphaVantageCallsToday: data.alphaVantageCallsToday || 0,
      };
    } catch {
      return { results: [], skipped: [], yahooCount: 0, alphaVantageCount: 0, alphaVantageCallsToday: 0 };
    }
  }
  return { results: [], skipped: [], yahooCount: 0, alphaVantageCount: 0, alphaVantageCallsToday: 0 };
}

function saveCheckpoint(checkpoint: Checkpoint, checkpointPath: string): void {
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

// ============================================================================
// MAIN EVALUATION FUNCTION
// ============================================================================

async function evaluateAllStocks(options: { limit?: number; resume?: boolean } = {}): Promise<void> {
  const { limit, resume = true } = options;

  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   ScamDunk US Stock Evaluation - LIVE DATA (Yahoo + Alpha Vantage)       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  // Check Alpha Vantage API key
  if (ALPHA_VANTAGE_API_KEY) {
    console.log('✓ Alpha Vantage API key configured (fallback enabled)');
    console.log(`  Daily limit: ${ALPHA_VANTAGE_DAILY_LIMIT} requests\n`);
  } else {
    console.log('⚠ Alpha Vantage API key not set (set ALPHA_VANTAGE_API_KEY env var for fallback)');
    console.log('  Using Yahoo Finance only\n');
  }

  // Load stock list
  const stocksPath = path.join(DATA_DIR, 'us-stocks.json');
  if (!fs.existsSync(stocksPath)) {
    console.error('Stock list not found. Run fetch-us-stocks.ts first.');
    process.exit(1);
  }

  let stocks: StockTicker[] = JSON.parse(fs.readFileSync(stocksPath, 'utf-8'));
  console.log(`Loaded ${stocks.length} stocks from ${stocksPath}`);

  if (limit) {
    stocks = stocks.slice(0, limit);
    console.log(`Limited to first ${limit} stocks for testing`);
  }

  // Ensure directories exist
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  // Check for checkpoint
  const timestamp = new Date().toISOString().split('T')[0];
  const checkpointPath = path.join(RESULTS_DIR, `checkpoint-live-${timestamp}.json`);
  let checkpoint: Checkpoint = { results: [], skipped: [], yahooCount: 0, alphaVantageCount: 0, alphaVantageCallsToday: 0 };
  let startIndex = 0;

  if (resume && fs.existsSync(checkpointPath)) {
    checkpoint = loadCheckpoint(checkpointPath);
    alphaVantageCallsToday = checkpoint.alphaVantageCallsToday;
    startIndex = checkpoint.results.length + checkpoint.skipped.length;
    if (startIndex > 0) {
      console.log(`\n📂 Resuming from checkpoint:`);
      console.log(`   Evaluated: ${checkpoint.results.length} | Skipped: ${checkpoint.skipped.length}`);
      console.log(`   Yahoo: ${checkpoint.yahooCount} | Alpha Vantage: ${checkpoint.alphaVantageCount}`);
    }
  }

  const startTime = Date.now();
  const totalToProcess = stocks.length - startIndex;
  const estimatedTimePerStock = YAHOO_DELAY_MS / 1000;

  console.log(`\n📊 Starting evaluation of ${totalToProcess} remaining stocks...`);
  console.log(`   Delay between requests: ${YAHOO_DELAY_MS / 1000}s (Yahoo) / ${ALPHA_VANTAGE_DELAY_MS / 1000}s (Alpha Vantage)`);
  console.log(`   Estimated time: ${formatTimeRemaining(totalToProcess * estimatedTimePerStock)}\n`);

  let results = checkpoint.results;
  let skippedSymbols = checkpoint.skipped;
  let yahooCount = checkpoint.yahooCount;
  let avCount = checkpoint.alphaVantageCount;

  // Process stocks one by one
  for (let i = startIndex; i < stocks.length; i++) {
    const stock = stocks[i];

    // Fetch price data with fallback
    const fetchResult = await fetchPriceData(stock.symbol);

    if (fetchResult.data === null) {
      skippedSymbols.push(stock.symbol);
    } else {
      if (fetchResult.source === 'yahoo') yahooCount++;
      if (fetchResult.source === 'alphavantage') avCount++;

      const marketData = createMarketData(stock, fetchResult.data);
      const scoringResult = computeRiskScore(marketData);

      const result: EvaluationResult = {
        symbol: stock.symbol,
        name: stock.name,
        exchange: stock.exchange,
        sector: stock.sector || 'Unknown',
        industry: stock.industry || 'Unknown',
        marketCap: stock.marketCap || null,
        lastPrice: marketData.quote.lastPrice,
        riskLevel: scoringResult.riskLevel,
        totalScore: scoringResult.totalScore,
        isLegitimate: scoringResult.isLegitimate,
        isInsufficient: scoringResult.isInsufficient,
        signals: scoringResult.signals.map(s => ({
          code: s.code,
          category: s.category,
          weight: s.weight,
          description: s.description,
        })),
        signalSummary: scoringResult.signals.map(s => s.code).join(', ') || 'None',
        evaluatedAt: new Date().toISOString(),
        priceDataSource: fetchResult.source,
      };

      results.push(result);
    }

    // Update progress
    const progress = i + 1;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (progress - startIndex) / elapsed;
    const remaining = rate > 0 ? (stocks.length - progress) / rate : 0;

    const srcIndicator = fetchResult.source === 'yahoo' ? 'Y' : fetchResult.source === 'alphavantage' ? 'A' : '-';
    process.stdout.write(`\r${progressBar(progress, stocks.length)} [${srcIndicator}] Y:${yahooCount} A:${avCount} Skip:${skippedSymbols.length} ETA:${formatTimeRemaining(remaining)} `);

    // Save checkpoint periodically
    if ((i + 1) % BATCH_SIZE === 0) {
      saveCheckpoint({
        results,
        skipped: skippedSymbols,
        yahooCount,
        alphaVantageCount: avCount,
        alphaVantageCallsToday
      }, checkpointPath);
    }

    // Delay between requests
    if (i < stocks.length - 1) {
      await delay(YAHOO_DELAY_MS);
    }
  }

  console.log('\n\n✅ Evaluation complete!\n');

  // Clean up checkpoint
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
  }

  const endTime = Date.now();
  const durationSeconds = (endTime - startTime) / 1000;

  // Generate summary
  const summary = generateSummary(results, stocks.length, skippedSymbols.length, yahooCount, avCount, durationSeconds);

  // Save results
  saveResults(results, summary, skippedSymbols);

  // Generate comparison with January 1st
  generateComparison(results, timestamp);

  // Print summary
  printSummary(summary);
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

function generateSummary(
  results: EvaluationResult[],
  totalStocks: number,
  skippedNoData: number,
  yahooSuccessCount: number,
  alphaVantageSuccessCount: number,
  durationSeconds: number
): EvaluationSummary {
  const byRiskLevel = {
    LOW: results.filter(r => r.riskLevel === 'LOW').length,
    MEDIUM: results.filter(r => r.riskLevel === 'MEDIUM').length,
    HIGH: results.filter(r => r.riskLevel === 'HIGH').length,
    INSUFFICIENT: results.filter(r => r.riskLevel === 'INSUFFICIENT').length,
  };

  const byExchange: Record<string, { total: number; LOW: number; MEDIUM: number; HIGH: number; INSUFFICIENT: number }> = {};
  for (const result of results) {
    if (!byExchange[result.exchange]) {
      byExchange[result.exchange] = { total: 0, LOW: 0, MEDIUM: 0, HIGH: 0, INSUFFICIENT: 0 };
    }
    byExchange[result.exchange].total++;
    const level = result.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH' | 'INSUFFICIENT';
    if (level in byExchange[result.exchange]) {
      byExchange[result.exchange][level]++;
    }
  }

  const bySector: Record<string, { total: number; LOW: number; MEDIUM: number; HIGH: number }> = {};
  for (const result of results) {
    const sector = result.sector || 'Unknown';
    if (!bySector[sector]) {
      bySector[sector] = { total: 0, LOW: 0, MEDIUM: 0, HIGH: 0 };
    }
    bySector[sector].total++;
    const level = result.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH';
    if (level in bySector[sector]) {
      bySector[sector][level]++;
    }
  }

  const bySignal: Record<string, number> = {};
  for (const result of results) {
    for (const signal of result.signals) {
      bySignal[signal.code] = (bySignal[signal.code] || 0) + 1;
    }
  }

  const topHighRisk = results
    .filter(r => r.riskLevel === 'HIGH')
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 100);

  return {
    totalStocks,
    evaluated: results.length,
    skippedNoData,
    yahooSuccessCount,
    alphaVantageSuccessCount,
    byRiskLevel,
    byExchange,
    bySector,
    bySignal,
    topHighRisk,
    legitimateStocks: results.filter(r => r.isLegitimate).length,
    evaluationDate: new Date().toISOString(),
    durationSeconds,
  };
}

// ============================================================================
// SAVE RESULTS
// ============================================================================

function saveResults(results: EvaluationResult[], summary: EvaluationSummary, skippedSymbols: string[]): void {
  const timestamp = new Date().toISOString().split('T')[0];

  // Save full results JSON
  const resultsPath = path.join(RESULTS_DIR, `evaluation-live-${timestamp}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`📄 Full results: ${resultsPath}`);

  // Save summary JSON
  const summaryPath = path.join(RESULTS_DIR, `summary-live-${timestamp}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`📊 Summary: ${summaryPath}`);

  // Save skipped stocks
  const skippedPath = path.join(RESULTS_DIR, `skipped-no-data-${timestamp}.json`);
  fs.writeFileSync(skippedPath, JSON.stringify(skippedSymbols, null, 2));
  console.log(`⏭️  Skipped stocks: ${skippedPath}`);

  // Save HIGH risk CSV
  const highRiskPath = path.join(RESULTS_DIR, `high-risk-live-${timestamp}.csv`);
  const highRiskStocks = results.filter(r => r.riskLevel === 'HIGH');
  const highRiskCsv = 'Symbol,Name,Exchange,Sector,MarketCap,LastPrice,TotalScore,DataSource,Signals\n' +
    highRiskStocks.map(r =>
      `"${r.symbol}","${(r.name || '').replace(/"/g, '""')}","${r.exchange}","${r.sector}",` +
      `${r.marketCap || ''},${r.lastPrice || ''},${r.totalScore},"${r.priceDataSource}","${r.signalSummary}"`
    ).join('\n');
  fs.writeFileSync(highRiskPath, highRiskCsv);
  console.log(`🔴 HIGH risk: ${highRiskPath}`);

  // Save MEDIUM risk CSV
  const mediumRiskPath = path.join(RESULTS_DIR, `medium-risk-live-${timestamp}.csv`);
  const mediumRiskStocks = results.filter(r => r.riskLevel === 'MEDIUM');
  const mediumRiskCsv = 'Symbol,Name,Exchange,Sector,MarketCap,LastPrice,TotalScore,DataSource,Signals\n' +
    mediumRiskStocks.map(r =>
      `"${r.symbol}","${(r.name || '').replace(/"/g, '""')}","${r.exchange}","${r.sector}",` +
      `${r.marketCap || ''},${r.lastPrice || ''},${r.totalScore},"${r.priceDataSource}","${r.signalSummary}"`
    ).join('\n');
  fs.writeFileSync(mediumRiskPath, mediumRiskCsv);
  console.log(`🟡 MEDIUM risk: ${mediumRiskPath}`);

  // Save LOW risk CSV
  const lowRiskPath = path.join(RESULTS_DIR, `low-risk-live-${timestamp}.csv`);
  const lowRiskStocks = results.filter(r => r.riskLevel === 'LOW');
  const lowRiskCsv = 'Symbol,Name,Exchange,Sector,MarketCap,LastPrice,TotalScore,IsLegitimate,DataSource\n' +
    lowRiskStocks.map(r =>
      `"${r.symbol}","${(r.name || '').replace(/"/g, '""')}","${r.exchange}","${r.sector}",` +
      `${r.marketCap || ''},${r.lastPrice || ''},${r.totalScore},${r.isLegitimate},"${r.priceDataSource}"`
    ).join('\n');
  fs.writeFileSync(lowRiskPath, lowRiskCsv);
  console.log(`🟢 LOW risk: ${lowRiskPath}`);
}

// ============================================================================
// COMPARISON WITH JANUARY 1ST
// ============================================================================

function generateComparison(currentResults: EvaluationResult[], timestamp: string): void {
  const jan1ResultsPath = path.join(RESULTS_DIR, 'evaluation-2026-01-01.json');

  if (!fs.existsSync(jan1ResultsPath)) {
    console.log('\n⚠️  No January 1st results found for comparison.');
    return;
  }

  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    COMPARISON: January 1st vs Today                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  const jan1Results: EvaluationResult[] = JSON.parse(fs.readFileSync(jan1ResultsPath, 'utf-8'));

  const jan1Map = new Map<string, EvaluationResult>();
  for (const r of jan1Results) {
    jan1Map.set(r.symbol, r);
  }

  const upgrades: ComparisonResult[] = [];
  const downgrades: ComparisonResult[] = [];
  const newHighRisk: ComparisonResult[] = [];
  const noLongerHighRisk: ComparisonResult[] = [];

  const riskOrder = { 'LOW': 0, 'MEDIUM': 1, 'HIGH': 2, 'INSUFFICIENT': -1 };

  for (const current of currentResults) {
    const prev = jan1Map.get(current.symbol);
    if (prev && prev.priceDataSource === 'yahoo') {
      const prevRisk = riskOrder[prev.riskLevel as keyof typeof riskOrder] ?? -1;
      const currRisk = riskOrder[current.riskLevel as keyof typeof riskOrder] ?? -1;

      if (currRisk > prevRisk && prevRisk >= 0) {
        const comparison: ComparisonResult = {
          symbol: current.symbol,
          name: current.name,
          exchange: current.exchange,
          previousRisk: prev.riskLevel,
          currentRisk: current.riskLevel,
          previousScore: prev.totalScore,
          currentScore: current.totalScore,
          changeType: 'DOWNGRADED',
          previousSignals: prev.signalSummary,
          currentSignals: current.signalSummary,
        };
        downgrades.push(comparison);
        if (current.riskLevel === 'HIGH' && prev.riskLevel !== 'HIGH') {
          newHighRisk.push(comparison);
        }
      } else if (currRisk < prevRisk && currRisk >= 0) {
        const comparison: ComparisonResult = {
          symbol: current.symbol,
          name: current.name,
          exchange: current.exchange,
          previousRisk: prev.riskLevel,
          currentRisk: current.riskLevel,
          previousScore: prev.totalScore,
          currentScore: current.totalScore,
          changeType: 'UPGRADED',
          previousSignals: prev.signalSummary,
          currentSignals: current.signalSummary,
        };
        upgrades.push(comparison);
        if (prev.riskLevel === 'HIGH' && current.riskLevel !== 'HIGH') {
          noLongerHighRisk.push(comparison);
        }
      }
    }
  }

  const jan1Stats = {
    total: jan1Results.filter(r => r.priceDataSource === 'yahoo').length,
    low: jan1Results.filter(r => r.riskLevel === 'LOW' && r.priceDataSource === 'yahoo').length,
    medium: jan1Results.filter(r => r.riskLevel === 'MEDIUM' && r.priceDataSource === 'yahoo').length,
    high: jan1Results.filter(r => r.riskLevel === 'HIGH' && r.priceDataSource === 'yahoo').length,
  };

  const currentStats = {
    total: currentResults.length,
    low: currentResults.filter(r => r.riskLevel === 'LOW').length,
    medium: currentResults.filter(r => r.riskLevel === 'MEDIUM').length,
    high: currentResults.filter(r => r.riskLevel === 'HIGH').length,
  };

  console.log('RISK LEVEL DISTRIBUTION:');
  console.log('─'.repeat(65));
  console.log(`                      Jan 1st        Today          Change`);
  console.log(`LOW Risk:             ${jan1Stats.low.toString().padStart(6)}        ${currentStats.low.toString().padStart(6)}        ${(currentStats.low - jan1Stats.low >= 0 ? '+' : '') + (currentStats.low - jan1Stats.low)}`);
  console.log(`MEDIUM Risk:          ${jan1Stats.medium.toString().padStart(6)}        ${currentStats.medium.toString().padStart(6)}        ${(currentStats.medium - jan1Stats.medium >= 0 ? '+' : '') + (currentStats.medium - jan1Stats.medium)}`);
  console.log(`HIGH Risk:            ${jan1Stats.high.toString().padStart(6)}        ${currentStats.high.toString().padStart(6)}        ${(currentStats.high - jan1Stats.high >= 0 ? '+' : '') + (currentStats.high - jan1Stats.high)}`);

  console.log('\n\nRISK CHANGES:');
  console.log('─'.repeat(65));
  console.log(`🔺 Stocks with INCREASED risk:    ${downgrades.length}`);
  console.log(`🔻 Stocks with DECREASED risk:    ${upgrades.length}`);
  console.log(`🆕 NEW HIGH risk stocks:          ${newHighRisk.length}`);
  console.log(`✅ No longer HIGH risk:           ${noLongerHighRisk.length}`);

  // Save comparison report
  const comparisonReport = {
    comparisonDate: new Date().toISOString(),
    baselineDate: '2026-01-01',
    summary: { jan1Stats, currentStats, changes: { increased: downgrades.length, decreased: upgrades.length, newHighRisk: newHighRisk.length, noLongerHighRisk: noLongerHighRisk.length } },
    newHighRiskStocks: newHighRisk,
    noLongerHighRiskStocks: noLongerHighRisk,
    allUpgrades: upgrades,
    allDowngrades: downgrades,
  };

  const comparisonPath = path.join(RESULTS_DIR, `comparison-jan1-vs-${timestamp}.json`);
  fs.writeFileSync(comparisonPath, JSON.stringify(comparisonReport, null, 2));
  console.log(`\n📋 Comparison report: ${comparisonPath}`);

  if (newHighRisk.length > 0) {
    console.log('\n\n🆕 NEW HIGH RISK STOCKS:');
    console.log('─'.repeat(80));
    newHighRisk.slice(0, 15).forEach((stock, i) => {
      console.log(`${(i + 1).toString().padStart(2)}. ${stock.symbol.padEnd(8)} ${stock.previousRisk} → ${stock.currentRisk} (Score: ${stock.previousScore} → ${stock.currentScore})`);
    });
  }

  if (noLongerHighRisk.length > 0) {
    console.log('\n\n✅ NO LONGER HIGH RISK:');
    console.log('─'.repeat(80));
    noLongerHighRisk.slice(0, 15).forEach((stock, i) => {
      console.log(`${(i + 1).toString().padStart(2)}. ${stock.symbol.padEnd(8)} ${stock.previousRisk} → ${stock.currentRisk} (Score: ${stock.previousScore} → ${stock.currentScore})`);
    });
  }

  const comparisonCsvPath = path.join(RESULTS_DIR, `comparison-changes-${timestamp}.csv`);
  const allChanges = [...downgrades, ...upgrades].sort((a, b) => b.currentScore - a.currentScore);
  const comparisonCsv = 'Symbol,Name,Exchange,PreviousRisk,CurrentRisk,PreviousScore,CurrentScore,ChangeType,CurrentSignals\n' +
    allChanges.map(c =>
      `"${c.symbol}","${(c.name || '').replace(/"/g, '""')}","${c.exchange}","${c.previousRisk}","${c.currentRisk}",${c.previousScore},${c.currentScore},"${c.changeType}","${c.currentSignals}"`
    ).join('\n');
  fs.writeFileSync(comparisonCsvPath, comparisonCsv);
}

// ============================================================================
// PRINT SUMMARY
// ============================================================================

function printSummary(summary: EvaluationSummary): void {
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         EVALUATION SUMMARY                                ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`📊 Total Stocks: ${summary.totalStocks.toLocaleString()}`);
  console.log(`✅ Evaluated: ${summary.evaluated.toLocaleString()} (Yahoo: ${summary.yahooSuccessCount}, Alpha Vantage: ${summary.alphaVantageSuccessCount})`);
  console.log(`⏭️  Skipped (no data): ${summary.skippedNoData.toLocaleString()}`);
  console.log(`⏱️  Duration: ${(summary.durationSeconds / 60).toFixed(1)} minutes\n`);

  console.log('RISK DISTRIBUTION:');
  console.log(`  🟢 LOW:     ${summary.byRiskLevel.LOW.toLocaleString().padStart(6)} (${((summary.byRiskLevel.LOW / summary.evaluated) * 100).toFixed(1)}%)`);
  console.log(`  🟡 MEDIUM:  ${summary.byRiskLevel.MEDIUM.toLocaleString().padStart(6)} (${((summary.byRiskLevel.MEDIUM / summary.evaluated) * 100).toFixed(1)}%)`);
  console.log(`  🔴 HIGH:    ${summary.byRiskLevel.HIGH.toLocaleString().padStart(6)} (${((summary.byRiskLevel.HIGH / summary.evaluated) * 100).toFixed(1)}%)`);

  console.log('\nTOP RISK SIGNALS:');
  Object.entries(summary.bySignal)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([signal, count]) => {
      console.log(`  ${signal.padEnd(22)} ${count.toLocaleString().padStart(6)} (${((count / summary.evaluated) * 100).toFixed(1)}%)`);
    });

  console.log('\nTOP 10 HIGH RISK STOCKS:');
  summary.topHighRisk.slice(0, 10).forEach((stock, i) => {
    const src = stock.priceDataSource === 'yahoo' ? 'Y' : 'A';
    console.log(`  ${(i + 1).toString().padStart(2)}. ${stock.symbol.padEnd(8)} [${src}] Score:${stock.totalScore.toString().padStart(2)} - ${stock.signalSummary.substring(0, 50)}`);
  });

  console.log('\nRISK BY EXCHANGE:');
  Object.entries(summary.byExchange)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([exchange, data]) => {
      const highPct = ((data.HIGH / data.total) * 100).toFixed(1);
      console.log(`  ${exchange.padEnd(8)} Total:${data.total.toString().padStart(5)} | LOW:${data.LOW.toString().padStart(5)} | MED:${data.MEDIUM.toString().padStart(5)} | HIGH:${data.HIGH.toString().padStart(5)} (${highPct}%)`);
    });
}

// ============================================================================
// ENTRY POINT
// ============================================================================

const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const noResumeArg = args.includes('--no-resume');

evaluateAllStocks({
  limit: limitArg ? parseInt(limitArg) : undefined,
  resume: !noResumeArg,
}).catch(console.error);
