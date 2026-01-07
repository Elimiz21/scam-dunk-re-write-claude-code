/**
 * Live Stock Evaluation Script - Real Data Only
 *
 * Runs the ScamDunk risk scoring model on all US stocks with ONLY real
 * historical price data from Yahoo Finance. No mock data fallback.
 * Generates comparison report against January 1st baseline.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

// Import standalone scoring module
import { computeRiskScore, MarketData, PriceHistory, StockQuote, ScoringResult } from './standalone-scorer';

const DATA_DIR = path.join(__dirname, '..', 'data');
const RESULTS_DIR = path.join(__dirname, '..', 'results');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// Rate limiting config - more conservative for reliability
const REQUESTS_PER_SECOND = 3;
const DELAY_BETWEEN_REQUESTS = 1000 / REQUESTS_PER_SECOND;
const BATCH_SIZE = 50;
const RETRY_DELAY = 3000;
const MAX_RETRIES = 3;

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

// Simple delay function
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch historical price data from Yahoo Finance
async function fetchYahooFinanceData(symbol: string, days: number = 60): Promise<PriceHistory[] | null> {
  return new Promise((resolve) => {
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - (days * 24 * 60 * 60);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${startDate}&period2=${endDate}&interval=1d&events=history`;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 15000,
    };

    const req = https.get(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }

          const json = JSON.parse(data);
          const result = json.chart?.result?.[0];

          if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
            resolve(null);
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

          // Require minimum 7 days of data for pattern detection
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

// Fetch with retry logic
async function fetchWithRetry(symbol: string, retries: number = MAX_RETRIES): Promise<PriceHistory[] | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const result = await fetchYahooFinanceData(symbol);
    if (result !== null) {
      return result;
    }
    if (attempt < retries - 1) {
      await delay(RETRY_DELAY * (attempt + 1)); // Exponential backoff
    }
  }
  return null;
}

// Create market data from stock info and price history
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

// Progress bar helper
function progressBar(current: number, total: number, width: number = 40): string {
  const percent = current / total;
  const filled = Math.round(width * percent);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${(percent * 100).toFixed(1)}% (${current}/${total})`;
}

// Format time remaining
function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// Load checkpoint if exists
function loadCheckpoint(checkpointPath: string): { results: EvaluationResult[], skipped: string[] } {
  if (fs.existsSync(checkpointPath)) {
    try {
      return JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
    } catch {
      return { results: [], skipped: [] };
    }
  }
  return { results: [], skipped: [] };
}

// Save checkpoint
function saveCheckpoint(results: EvaluationResult[], skipped: string[], checkpointPath: string): void {
  fs.writeFileSync(checkpointPath, JSON.stringify({ results, skipped }, null, 2));
}

// Main evaluation function
async function evaluateAllStocks(options: { limit?: number; resume?: boolean } = {}): Promise<void> {
  const { limit, resume = true } = options;

  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║   ScamDunk US Stock Evaluation - LIVE DATA ONLY (No Mock Data)    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

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
  let results: EvaluationResult[] = [];
  let skippedSymbols: string[] = [];
  let startIndex = 0;

  if (resume && fs.existsSync(checkpointPath)) {
    const checkpoint = loadCheckpoint(checkpointPath);
    results = checkpoint.results;
    skippedSymbols = checkpoint.skipped;
    startIndex = results.length + skippedSymbols.length;
    if (startIndex > 0) {
      console.log(`\nResuming from checkpoint: ${results.length} evaluated, ${skippedSymbols.length} skipped`);
    }
  }

  const startTime = Date.now();
  const totalToProcess = stocks.length - startIndex;

  console.log(`\nStarting evaluation of ${totalToProcess} stocks with REAL price data only...`);
  console.log(`Stocks without real data will be EXCLUDED from results.`);
  console.log(`Rate limit: ${REQUESTS_PER_SECOND} requests/second`);
  console.log(`Estimated time: ${formatTimeRemaining(totalToProcess * DELAY_BETWEEN_REQUESTS / 1000)}\n`);

  let successCount = results.length;
  let skipCount = skippedSymbols.length;

  // Process stocks one by one with rate limiting
  for (let i = startIndex; i < stocks.length; i++) {
    const stock = stocks[i];

    // Fetch real price data
    const priceHistory = await fetchWithRetry(stock.symbol);

    if (priceHistory === null) {
      // Skip this stock - no real data available
      skippedSymbols.push(stock.symbol);
      skipCount++;
    } else {
      // Evaluate with real data
      const marketData = createMarketData(stock, priceHistory);
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
        priceDataSource: 'yahoo',
      };

      results.push(result);
      successCount++;
    }

    // Update progress
    const progress = i + 1;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (progress - startIndex) / elapsed;
    const remaining = (stocks.length - progress) / rate;

    process.stdout.write(`\r${progressBar(progress, stocks.length)} | Success: ${successCount} | Skipped: ${skipCount} | ETA: ${formatTimeRemaining(remaining)} `);

    // Save checkpoint periodically
    if ((i + 1) % BATCH_SIZE === 0) {
      saveCheckpoint(results, skippedSymbols, checkpointPath);
    }

    // Rate limiting delay
    if (i < stocks.length - 1) {
      await delay(DELAY_BETWEEN_REQUESTS);
    }
  }

  console.log('\n\nEvaluation complete!\n');

  // Clean up checkpoint
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
  }

  const endTime = Date.now();
  const durationSeconds = (endTime - startTime) / 1000;

  // Generate summary
  const summary = generateSummary(results, stocks.length, skippedSymbols.length, durationSeconds);

  // Save results
  saveResults(results, summary, skippedSymbols);

  // Generate comparison with January 1st
  generateComparison(results, timestamp);

  // Print summary
  printSummary(summary);
}

// Generate evaluation summary
function generateSummary(
  results: EvaluationResult[],
  totalStocks: number,
  skippedNoData: number,
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

// Save results to files
function saveResults(results: EvaluationResult[], summary: EvaluationSummary, skippedSymbols: string[]): void {
  const timestamp = new Date().toISOString().split('T')[0];

  // Save full results JSON
  const resultsPath = path.join(RESULTS_DIR, `evaluation-live-${timestamp}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Full results saved to: ${resultsPath}`);

  // Save summary JSON
  const summaryPath = path.join(RESULTS_DIR, `summary-live-${timestamp}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`Summary saved to: ${summaryPath}`);

  // Save skipped stocks list
  const skippedPath = path.join(RESULTS_DIR, `skipped-no-data-${timestamp}.json`);
  fs.writeFileSync(skippedPath, JSON.stringify(skippedSymbols, null, 2));
  console.log(`Skipped stocks saved to: ${skippedPath}`);

  // Save HIGH risk stocks CSV
  const highRiskPath = path.join(RESULTS_DIR, `high-risk-live-${timestamp}.csv`);
  const highRiskStocks = results.filter(r => r.riskLevel === 'HIGH');
  const highRiskCsv = 'Symbol,Name,Exchange,Sector,MarketCap,LastPrice,TotalScore,Signals\n' +
    highRiskStocks.map(r =>
      `"${r.symbol}","${(r.name || '').replace(/"/g, '""')}","${r.exchange}","${r.sector}",` +
      `${r.marketCap || ''},${r.lastPrice || ''},${r.totalScore},"${r.signalSummary}"`
    ).join('\n');
  fs.writeFileSync(highRiskPath, highRiskCsv);
  console.log(`HIGH risk stocks saved to: ${highRiskPath}`);

  // Save MEDIUM risk stocks CSV
  const mediumRiskPath = path.join(RESULTS_DIR, `medium-risk-live-${timestamp}.csv`);
  const mediumRiskStocks = results.filter(r => r.riskLevel === 'MEDIUM');
  const mediumRiskCsv = 'Symbol,Name,Exchange,Sector,MarketCap,LastPrice,TotalScore,Signals\n' +
    mediumRiskStocks.map(r =>
      `"${r.symbol}","${(r.name || '').replace(/"/g, '""')}","${r.exchange}","${r.sector}",` +
      `${r.marketCap || ''},${r.lastPrice || ''},${r.totalScore},"${r.signalSummary}"`
    ).join('\n');
  fs.writeFileSync(mediumRiskPath, mediumRiskCsv);
  console.log(`MEDIUM risk stocks saved to: ${mediumRiskPath}`);

  // Save LOW risk stocks CSV
  const lowRiskPath = path.join(RESULTS_DIR, `low-risk-live-${timestamp}.csv`);
  const lowRiskStocks = results.filter(r => r.riskLevel === 'LOW');
  const lowRiskCsv = 'Symbol,Name,Exchange,Sector,MarketCap,LastPrice,TotalScore,IsLegitimate\n' +
    lowRiskStocks.map(r =>
      `"${r.symbol}","${(r.name || '').replace(/"/g, '""')}","${r.exchange}","${r.sector}",` +
      `${r.marketCap || ''},${r.lastPrice || ''},${r.totalScore},${r.isLegitimate}`
    ).join('\n');
  fs.writeFileSync(lowRiskPath, lowRiskCsv);
  console.log(`LOW risk stocks saved to: ${lowRiskPath}`);
}

// Generate comparison with January 1st data
function generateComparison(currentResults: EvaluationResult[], timestamp: string): void {
  const jan1ResultsPath = path.join(RESULTS_DIR, 'evaluation-2026-01-01.json');

  if (!fs.existsSync(jan1ResultsPath)) {
    console.log('\nNo January 1st results found for comparison.');
    return;
  }

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║              COMPARISON: January 1st vs Today                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const jan1Results: EvaluationResult[] = JSON.parse(fs.readFileSync(jan1ResultsPath, 'utf-8'));

  // Create lookup maps
  const jan1Map = new Map<string, EvaluationResult>();
  for (const r of jan1Results) {
    jan1Map.set(r.symbol, r);
  }

  const currentMap = new Map<string, EvaluationResult>();
  for (const r of currentResults) {
    currentMap.set(r.symbol, r);
  }

  // Find changes
  const upgrades: ComparisonResult[] = []; // Risk decreased (better)
  const downgrades: ComparisonResult[] = []; // Risk increased (worse)
  const newHighRisk: ComparisonResult[] = [];
  const noLongerHighRisk: ComparisonResult[] = [];

  const riskOrder = { 'LOW': 0, 'MEDIUM': 1, 'HIGH': 2, 'INSUFFICIENT': -1 };

  for (const current of currentResults) {
    const prev = jan1Map.get(current.symbol);
    if (prev && prev.priceDataSource === 'yahoo') { // Only compare stocks that had real data before
      const prevRisk = riskOrder[prev.riskLevel as keyof typeof riskOrder] ?? -1;
      const currRisk = riskOrder[current.riskLevel as keyof typeof riskOrder] ?? -1;

      if (currRisk > prevRisk && prevRisk >= 0) {
        // Risk increased (worse)
        downgrades.push({
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
        });

        if (current.riskLevel === 'HIGH' && prev.riskLevel !== 'HIGH') {
          newHighRisk.push(downgrades[downgrades.length - 1]);
        }
      } else if (currRisk < prevRisk && currRisk >= 0) {
        // Risk decreased (better)
        upgrades.push({
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
        });

        if (prev.riskLevel === 'HIGH' && current.riskLevel !== 'HIGH') {
          noLongerHighRisk.push(upgrades[upgrades.length - 1]);
        }
      }
    }
  }

  // Calculate summary stats
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

  // Print comparison summary
  console.log('RISK LEVEL DISTRIBUTION COMPARISON:');
  console.log('─'.repeat(60));
  console.log(`                      Jan 1st        Today          Change`);
  console.log(`LOW Risk:             ${jan1Stats.low.toString().padStart(6)}        ${currentStats.low.toString().padStart(6)}        ${(currentStats.low - jan1Stats.low >= 0 ? '+' : '') + (currentStats.low - jan1Stats.low)}`);
  console.log(`MEDIUM Risk:          ${jan1Stats.medium.toString().padStart(6)}        ${currentStats.medium.toString().padStart(6)}        ${(currentStats.medium - jan1Stats.medium >= 0 ? '+' : '') + (currentStats.medium - jan1Stats.medium)}`);
  console.log(`HIGH Risk:            ${jan1Stats.high.toString().padStart(6)}        ${currentStats.high.toString().padStart(6)}        ${(currentStats.high - jan1Stats.high >= 0 ? '+' : '') + (currentStats.high - jan1Stats.high)}`);
  console.log(`Total (real data):    ${jan1Stats.total.toString().padStart(6)}        ${currentStats.total.toString().padStart(6)}`);

  console.log('\n\nRISK CHANGES:');
  console.log('─'.repeat(60));
  console.log(`Stocks with INCREASED risk (worse):    ${downgrades.length}`);
  console.log(`Stocks with DECREASED risk (better):   ${upgrades.length}`);
  console.log(`NEW HIGH risk stocks:                  ${newHighRisk.length}`);
  console.log(`No longer HIGH risk:                   ${noLongerHighRisk.length}`);

  // Save comparison report
  const comparisonReport = {
    comparisonDate: new Date().toISOString(),
    baselineDate: '2026-01-01',
    summary: {
      jan1Stats,
      currentStats,
      changes: {
        increased: downgrades.length,
        decreased: upgrades.length,
        newHighRisk: newHighRisk.length,
        noLongerHighRisk: noLongerHighRisk.length,
      }
    },
    newHighRiskStocks: newHighRisk,
    noLongerHighRiskStocks: noLongerHighRisk,
    allUpgrades: upgrades,
    allDowngrades: downgrades,
  };

  const comparisonPath = path.join(RESULTS_DIR, `comparison-jan1-vs-${timestamp}.json`);
  fs.writeFileSync(comparisonPath, JSON.stringify(comparisonReport, null, 2));
  console.log(`\nComparison report saved to: ${comparisonPath}`);

  // Print top changes
  if (newHighRisk.length > 0) {
    console.log('\n\nTOP NEW HIGH RISK STOCKS (not HIGH on Jan 1st):');
    console.log('─'.repeat(80));
    newHighRisk.slice(0, 20).forEach((stock, i) => {
      console.log(`${(i + 1).toString().padStart(2)}. ${stock.symbol.padEnd(8)} ${stock.previousRisk.padEnd(8)} → ${stock.currentRisk.padEnd(8)} Score: ${stock.previousScore} → ${stock.currentScore}`);
      console.log(`    Signals: ${stock.currentSignals}`);
    });
  }

  if (noLongerHighRisk.length > 0) {
    console.log('\n\nSTOCKS NO LONGER HIGH RISK (improved since Jan 1st):');
    console.log('─'.repeat(80));
    noLongerHighRisk.slice(0, 20).forEach((stock, i) => {
      console.log(`${(i + 1).toString().padStart(2)}. ${stock.symbol.padEnd(8)} ${stock.previousRisk.padEnd(8)} → ${stock.currentRisk.padEnd(8)} Score: ${stock.previousScore} → ${stock.currentScore}`);
    });
  }

  // Generate comparison CSV
  const comparisonCsvPath = path.join(RESULTS_DIR, `comparison-changes-${timestamp}.csv`);
  const allChanges = [...downgrades, ...upgrades].sort((a, b) => b.currentScore - a.currentScore);
  const comparisonCsv = 'Symbol,Name,Exchange,PreviousRisk,CurrentRisk,PreviousScore,CurrentScore,ChangeType,CurrentSignals\n' +
    allChanges.map(c =>
      `"${c.symbol}","${(c.name || '').replace(/"/g, '""')}","${c.exchange}","${c.previousRisk}","${c.currentRisk}",${c.previousScore},${c.currentScore},"${c.changeType}","${c.currentSignals}"`
    ).join('\n');
  fs.writeFileSync(comparisonCsvPath, comparisonCsv);
  console.log(`\nComparison CSV saved to: ${comparisonCsvPath}`);
}

// Print summary to console
function printSummary(summary: EvaluationSummary): void {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                    EVALUATION SUMMARY                              ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log(`Total Stocks in List: ${summary.totalStocks.toLocaleString()}`);
  console.log(`Evaluated (real data): ${summary.evaluated.toLocaleString()}`);
  console.log(`Skipped (no data): ${summary.skippedNoData.toLocaleString()}`);
  console.log(`Legitimate Stocks: ${summary.legitimateStocks.toLocaleString()}`);
  console.log(`Duration: ${(summary.durationSeconds / 60).toFixed(1)} minutes\n`);

  console.log('Risk Level Distribution:');
  console.log(`  🟢 LOW:     ${summary.byRiskLevel.LOW.toLocaleString().padStart(6)} (${((summary.byRiskLevel.LOW / summary.evaluated) * 100).toFixed(1)}%)`);
  console.log(`  🟡 MEDIUM:  ${summary.byRiskLevel.MEDIUM.toLocaleString().padStart(6)} (${((summary.byRiskLevel.MEDIUM / summary.evaluated) * 100).toFixed(1)}%)`);
  console.log(`  🔴 HIGH:    ${summary.byRiskLevel.HIGH.toLocaleString().padStart(6)} (${((summary.byRiskLevel.HIGH / summary.evaluated) * 100).toFixed(1)}%)`);

  console.log('\nRisk Signals Summary:');
  Object.entries(summary.bySignal)
    .sort((a, b) => b[1] - a[1])
    .forEach(([signal, count]) => {
      console.log(`  ${signal.padEnd(25)} ${count.toLocaleString().padStart(6)} (${((count / summary.evaluated) * 100).toFixed(1)}%)`);
    });

  console.log('\nTop 10 HIGH Risk Stocks:');
  summary.topHighRisk.slice(0, 10).forEach((stock, i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. ${stock.symbol.padEnd(8)} (Score: ${stock.totalScore}) - ${stock.signalSummary}`);
  });

  console.log('\nRisk by Exchange:');
  Object.entries(summary.byExchange)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([exchange, data]) => {
      console.log(`  ${exchange.padEnd(10)} Total: ${data.total.toString().padStart(5)} | LOW: ${data.LOW.toString().padStart(5)} | MED: ${data.MEDIUM.toString().padStart(5)} | HIGH: ${data.HIGH.toString().padStart(5)} (${((data.HIGH / data.total) * 100).toFixed(1)}%)`);
    });
}

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const noResumeArg = args.includes('--no-resume');

// Run evaluation
evaluateAllStocks({
  limit: limitArg ? parseInt(limitArg) : undefined,
  resume: !noResumeArg,
}).catch(console.error);
