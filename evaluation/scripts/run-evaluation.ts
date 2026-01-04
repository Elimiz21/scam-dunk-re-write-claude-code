/**
 * Batch Stock Evaluation Script - With Real Price Data
 *
 * Runs the ScamDunk risk scoring model on all US stocks with REAL
 * historical price data fetched from Yahoo Finance.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

// Import standalone scoring module
import { computeRiskScore, MarketData, PriceHistory, StockQuote, ScoringResult } from './standalone-scorer';

const DATA_DIR = path.join(__dirname, '..', 'data');
const RESULTS_DIR = path.join(__dirname, '..', 'results');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// Rate limiting config
const REQUESTS_PER_SECOND = 5; // Conservative rate limit for Yahoo Finance
const DELAY_BETWEEN_REQUESTS = 1000 / REQUESTS_PER_SECOND;
const BATCH_SIZE = 50; // Save progress every N stocks
const RETRY_DELAY = 2000; // Delay on rate limit error
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
  error?: string;
  priceDataSource?: string;
}

interface EvaluationSummary {
  totalStocks: number;
  evaluated: number;
  errors: number;
  realDataCount: number;
  mockDataCount: number;
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
      timeout: 10000,
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
            // Skip if any required value is null/undefined
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
      await delay(RETRY_DELAY);
    }
  }
  return null;
}

// Create mock market data (fallback when real data unavailable)
function createMockPriceHistory(basePrice: number, volume: number): PriceHistory[] {
  const priceHistory: PriceHistory[] = [];

  for (let i = 60; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    priceHistory.push({
      date: date.toISOString().split('T')[0],
      open: basePrice * 0.998,
      high: basePrice * 1.002,
      low: basePrice * 0.995,
      close: basePrice,
      volume: volume,
    });
  }

  return priceHistory;
}

// Create market data from stock info and price history
function createMarketData(stock: StockTicker, priceHistory: PriceHistory[]): MarketData {
  // Calculate average volume from price history
  const avgVolume30d = priceHistory.slice(-30).reduce((sum, day) => sum + day.volume, 0) / Math.min(priceHistory.length, 30);
  const lastPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].close : (stock.lastPrice || 50);

  const quote: StockQuote = {
    ticker: stock.symbol,
    companyName: stock.name,
    exchange: stock.exchange,
    lastPrice: lastPrice,
    marketCap: stock.marketCap || 0,
    avgVolume30d: avgVolume30d,
    avgDollarVolume30d: avgVolume30d * lastPrice,
  };

  // Determine if OTC based on exchange name
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

// Evaluate a single stock with real price data
async function evaluateStockWithRealData(stock: StockTicker): Promise<EvaluationResult> {
  try {
    // Fetch real price data
    const priceHistory = await fetchWithRetry(stock.symbol);
    const hasRealData = priceHistory !== null;

    // Use real data or fall back to mock
    const actualPriceHistory = hasRealData
      ? priceHistory!
      : createMockPriceHistory(stock.lastPrice || 50, stock.volume || 1_000_000);

    const marketData = createMarketData(stock, actualPriceHistory);
    const result = computeRiskScore(marketData);

    return {
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      sector: stock.sector || 'Unknown',
      industry: stock.industry || 'Unknown',
      marketCap: stock.marketCap || null,
      lastPrice: marketData.quote.lastPrice,
      riskLevel: result.riskLevel,
      totalScore: result.totalScore,
      isLegitimate: result.isLegitimate,
      isInsufficient: result.isInsufficient,
      signals: result.signals.map(s => ({
        code: s.code,
        category: s.category,
        weight: s.weight,
        description: s.description,
      })),
      signalSummary: result.signals.map(s => s.code).join(', ') || 'None',
      evaluatedAt: new Date().toISOString(),
      priceDataSource: hasRealData ? 'yahoo' : 'mock',
    };
  } catch (error) {
    return {
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      sector: stock.sector || 'Unknown',
      industry: stock.industry || 'Unknown',
      marketCap: stock.marketCap || null,
      lastPrice: stock.lastPrice || null,
      riskLevel: 'ERROR',
      totalScore: 0,
      isLegitimate: false,
      isInsufficient: true,
      signals: [],
      signalSummary: 'Error',
      evaluatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      priceDataSource: 'error',
    };
  }
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
function loadCheckpoint(checkpointPath: string): EvaluationResult[] {
  if (fs.existsSync(checkpointPath)) {
    try {
      return JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
    } catch {
      return [];
    }
  }
  return [];
}

// Save checkpoint
function saveCheckpoint(results: EvaluationResult[], checkpointPath: string): void {
  fs.writeFileSync(checkpointPath, JSON.stringify(results, null, 2));
}

// Main evaluation function
async function evaluateAllStocks(
  options: {
    limit?: number;
    resume?: boolean;
  } = {}
): Promise<void> {
  const { limit, resume = true } = options;

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   ScamDunk US Stock Evaluation Suite (Real Price Data)    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

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
  const checkpointPath = path.join(RESULTS_DIR, `checkpoint-${timestamp}.json`);
  let results: EvaluationResult[] = [];
  let startIndex = 0;

  if (resume && fs.existsSync(checkpointPath)) {
    results = loadCheckpoint(checkpointPath);
    startIndex = results.length;
    if (startIndex > 0) {
      console.log(`\nResuming from checkpoint: ${startIndex} stocks already evaluated`);
    }
  }

  const startTime = Date.now();
  const totalToProcess = stocks.length - startIndex;

  console.log(`\nStarting evaluation of ${totalToProcess} stocks with real price data...`);
  console.log(`Rate limit: ${REQUESTS_PER_SECOND} requests/second`);
  console.log(`Estimated time: ${formatTimeRemaining(totalToProcess * DELAY_BETWEEN_REQUESTS / 1000)}\n`);

  let realDataCount = results.filter(r => r.priceDataSource === 'yahoo').length;
  let mockDataCount = results.filter(r => r.priceDataSource === 'mock').length;

  // Process stocks one by one with rate limiting
  for (let i = startIndex; i < stocks.length; i++) {
    const stock = stocks[i];

    // Evaluate stock with real data
    const result = await evaluateStockWithRealData(stock);
    results.push(result);

    // Track data source
    if (result.priceDataSource === 'yahoo') realDataCount++;
    else if (result.priceDataSource === 'mock') mockDataCount++;

    // Update progress
    const progress = i + 1;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (progress - startIndex) / elapsed;
    const remaining = (stocks.length - progress) / rate;

    process.stdout.write(`\r${progressBar(progress, stocks.length)} | Real: ${realDataCount} | Mock: ${mockDataCount} | ETA: ${formatTimeRemaining(remaining)} `);

    // Save checkpoint periodically
    if ((i + 1) % BATCH_SIZE === 0) {
      saveCheckpoint(results, checkpointPath);
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
  const summary = generateSummary(results, stocks.length, durationSeconds, realDataCount, mockDataCount);

  // Save results
  saveResults(results, summary);

  // Print summary
  printSummary(summary);
}

// Generate evaluation summary
function generateSummary(
  results: EvaluationResult[],
  totalStocks: number,
  durationSeconds: number,
  realDataCount: number,
  mockDataCount: number
): EvaluationSummary {
  const byRiskLevel = {
    LOW: results.filter(r => r.riskLevel === 'LOW').length,
    MEDIUM: results.filter(r => r.riskLevel === 'MEDIUM').length,
    HIGH: results.filter(r => r.riskLevel === 'HIGH').length,
    INSUFFICIENT: results.filter(r => r.riskLevel === 'INSUFFICIENT' || r.riskLevel === 'ERROR').length,
  };

  // Group by exchange
  const byExchange: Record<string, { total: number; LOW: number; MEDIUM: number; HIGH: number; INSUFFICIENT: number }> = {};
  for (const result of results) {
    if (!byExchange[result.exchange]) {
      byExchange[result.exchange] = { total: 0, LOW: 0, MEDIUM: 0, HIGH: 0, INSUFFICIENT: 0 };
    }
    byExchange[result.exchange].total++;
    const level = result.riskLevel === 'ERROR' ? 'INSUFFICIENT' : result.riskLevel;
    if (level in byExchange[result.exchange]) {
      (byExchange[result.exchange] as any)[level]++;
    }
  }

  // Group by sector
  const bySector: Record<string, { total: number; LOW: number; MEDIUM: number; HIGH: number }> = {};
  for (const result of results) {
    const sector = result.sector || 'Unknown';
    if (!bySector[sector]) {
      bySector[sector] = { total: 0, LOW: 0, MEDIUM: 0, HIGH: 0 };
    }
    bySector[sector].total++;
    if (result.riskLevel in bySector[sector]) {
      (bySector[sector] as any)[result.riskLevel]++;
    }
  }

  // Count signals
  const bySignal: Record<string, number> = {};
  for (const result of results) {
    for (const signal of result.signals) {
      bySignal[signal.code] = (bySignal[signal.code] || 0) + 1;
    }
  }

  // Get top HIGH risk stocks
  const topHighRisk = results
    .filter(r => r.riskLevel === 'HIGH')
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 100);

  return {
    totalStocks,
    evaluated: results.length,
    errors: results.filter(r => r.error).length,
    realDataCount,
    mockDataCount,
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
function saveResults(results: EvaluationResult[], summary: EvaluationSummary): void {
  const timestamp = new Date().toISOString().split('T')[0];

  // Ensure directories exist
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  // Save full results JSON
  const resultsPath = path.join(RESULTS_DIR, `evaluation-${timestamp}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Full results saved to: ${resultsPath}`);

  // Save summary JSON
  const summaryPath = path.join(RESULTS_DIR, `summary-${timestamp}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`Summary saved to: ${summaryPath}`);

  // Save results CSV
  const csvPath = path.join(RESULTS_DIR, `evaluation-${timestamp}.csv`);
  const csvHeader = 'Symbol,Name,Exchange,Sector,Industry,MarketCap,LastPrice,RiskLevel,TotalScore,IsLegitimate,DataSource,SignalSummary\n';
  const csvRows = results.map(r =>
    `"${r.symbol}","${(r.name || '').replace(/"/g, '""')}","${r.exchange}","${r.sector}","${r.industry}",` +
    `${r.marketCap || ''},${r.lastPrice || ''},"${r.riskLevel}",${r.totalScore},${r.isLegitimate},"${r.priceDataSource || 'unknown'}","${r.signalSummary}"`
  ).join('\n');
  fs.writeFileSync(csvPath, csvHeader + csvRows);
  console.log(`CSV saved to: ${csvPath}`);

  // Save HIGH risk stocks CSV
  const highRiskPath = path.join(RESULTS_DIR, `high-risk-${timestamp}.csv`);
  const highRiskStocks = results.filter(r => r.riskLevel === 'HIGH');
  const highRiskCsv = 'Symbol,Name,Exchange,Sector,MarketCap,LastPrice,TotalScore,DataSource,Signals\n' +
    highRiskStocks.map(r =>
      `"${r.symbol}","${(r.name || '').replace(/"/g, '""')}","${r.exchange}","${r.sector}",` +
      `${r.marketCap || ''},${r.lastPrice || ''},${r.totalScore},"${r.priceDataSource || 'unknown'}","${r.signalSummary}"`
    ).join('\n');
  fs.writeFileSync(highRiskPath, highRiskCsv);
  console.log(`HIGH risk stocks saved to: ${highRiskPath}`);

  // Save MEDIUM risk stocks CSV
  const mediumRiskPath = path.join(RESULTS_DIR, `medium-risk-${timestamp}.csv`);
  const mediumRiskStocks = results.filter(r => r.riskLevel === 'MEDIUM');
  const mediumRiskCsv = 'Symbol,Name,Exchange,Sector,MarketCap,LastPrice,TotalScore,DataSource,Signals\n' +
    mediumRiskStocks.map(r =>
      `"${r.symbol}","${(r.name || '').replace(/"/g, '""')}","${r.exchange}","${r.sector}",` +
      `${r.marketCap || ''},${r.lastPrice || ''},${r.totalScore},"${r.priceDataSource || 'unknown'}","${r.signalSummary}"`
    ).join('\n');
  fs.writeFileSync(mediumRiskPath, mediumRiskCsv);
  console.log(`MEDIUM risk stocks saved to: ${mediumRiskPath}`);

  // Save LOW risk stocks CSV
  const lowRiskPath = path.join(RESULTS_DIR, `low-risk-${timestamp}.csv`);
  const lowRiskStocks = results.filter(r => r.riskLevel === 'LOW');
  const lowRiskCsv = 'Symbol,Name,Exchange,Sector,MarketCap,LastPrice,TotalScore,IsLegitimate,DataSource\n' +
    lowRiskStocks.map(r =>
      `"${r.symbol}","${(r.name || '').replace(/"/g, '""')}","${r.exchange}","${r.sector}",` +
      `${r.marketCap || ''},${r.lastPrice || ''},${r.totalScore},${r.isLegitimate},"${r.priceDataSource || 'unknown'}"`
    ).join('\n');
  fs.writeFileSync(lowRiskPath, lowRiskCsv);
  console.log(`LOW risk stocks saved to: ${lowRiskPath}`);

  // Generate HTML report
  generateHTMLReport(results, summary, timestamp);
}

// Format market cap
function formatMarketCap(mc: number): string {
  if (mc >= 1_000_000_000_000) return `$${(mc / 1_000_000_000_000).toFixed(1)}T`;
  if (mc >= 1_000_000_000) return `$${(mc / 1_000_000_000).toFixed(1)}B`;
  if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(1)}M`;
  return `$${mc.toLocaleString()}`;
}

// Generate HTML report with charts
function generateHTMLReport(results: EvaluationResult[], summary: EvaluationSummary, timestamp: string): void {
  const reportPath = path.join(REPORTS_DIR, `evaluation-report-${timestamp}.html`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ScamDunk US Stock Evaluation Report - ${timestamp}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 40px; border-radius: 12px; margin-bottom: 30px; }
    header h1 { font-size: 2.5em; margin-bottom: 10px; }
    header p { opacity: 0.8; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); text-align: center; }
    .stat-card h3 { font-size: 2.5em; margin-bottom: 5px; }
    .stat-card p { color: #666; text-transform: uppercase; font-size: 0.85em; letter-spacing: 1px; }
    .stat-card.low h3 { color: #22c55e; }
    .stat-card.medium h3 { color: #f59e0b; }
    .stat-card.high h3 { color: #ef4444; }
    .stat-card.legitimate h3 { color: #3b82f6; }
    .stat-card.data h3 { color: #8b5cf6; }
    .chart-section { background: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
    .chart-section h2 { margin-bottom: 20px; color: #1a1a2e; }
    .charts-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 30px; }
    .chart-container { position: relative; height: 300px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; }
    tr:hover { background: #f8f9fa; }
    .risk-badge { padding: 4px 12px; border-radius: 20px; font-size: 0.85em; font-weight: 600; }
    .risk-low { background: #dcfce7; color: #166534; }
    .risk-medium { background: #fef3c7; color: #92400e; }
    .risk-high { background: #fee2e2; color: #991b1b; }
    .signal-list { display: flex; flex-wrap: wrap; gap: 5px; }
    .signal-tag { background: #e5e7eb; padding: 2px 8px; border-radius: 4px; font-size: 0.75em; }
    .signal-tag.pattern { background: #fef3c7; color: #92400e; }
    .signal-tag.structural { background: #dbeafe; color: #1e40af; }
    footer { text-align: center; padding: 30px; color: #666; }
    .summary-box { background: #f0fdf4; border: 2px solid #22c55e; border-radius: 12px; padding: 20px; margin-bottom: 30px; }
    .summary-box h3 { color: #166534; margin-bottom: 10px; }
    .data-quality-box { background: #f5f3ff; border: 2px solid #8b5cf6; border-radius: 12px; padding: 20px; margin-bottom: 30px; }
    .data-quality-box h3 { color: #6d28d9; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🎯 ScamDunk US Stock Evaluation Report</h1>
      <p>Evaluation Date: ${new Date(summary.evaluationDate).toLocaleString()} | Duration: ${(summary.durationSeconds / 60).toFixed(1)} min | Total Stocks: ${summary.totalStocks.toLocaleString()}</p>
    </header>

    <div class="data-quality-box">
      <h3>📡 Data Quality</h3>
      <p>Real price data from Yahoo Finance: <strong>${summary.realDataCount.toLocaleString()}</strong> stocks (${((summary.realDataCount / summary.evaluated) * 100).toFixed(1)}%)</p>
      <p>Fallback mock data (static prices): <strong>${summary.mockDataCount.toLocaleString()}</strong> stocks (${((summary.mockDataCount / summary.evaluated) * 100).toFixed(1)}%)</p>
      <p style="margin-top: 10px; font-size: 0.9em; color: #666;">Pattern signals (SPIKE_7D, VOLUME_EXPLOSION, etc.) are only detected for stocks with real price data.</p>
    </div>

    <div class="summary-box">
      <h3>📊 Key Findings</h3>
      <p>Out of <strong>${summary.totalStocks.toLocaleString()}</strong> US stocks analyzed:</p>
      <ul style="margin-top: 10px; margin-left: 20px;">
        <li><strong>${summary.byRiskLevel.HIGH.toLocaleString()}</strong> stocks (${((summary.byRiskLevel.HIGH / summary.evaluated) * 100).toFixed(1)}%) flagged as <span style="color: #ef4444;">HIGH RISK</span></li>
        <li><strong>${summary.byRiskLevel.MEDIUM.toLocaleString()}</strong> stocks (${((summary.byRiskLevel.MEDIUM / summary.evaluated) * 100).toFixed(1)}%) flagged as <span style="color: #f59e0b;">MEDIUM RISK</span></li>
        <li><strong>${summary.byRiskLevel.LOW.toLocaleString()}</strong> stocks (${((summary.byRiskLevel.LOW / summary.evaluated) * 100).toFixed(1)}%) rated as <span style="color: #22c55e;">LOW RISK</span></li>
        <li><strong>${summary.legitimateStocks.toLocaleString()}</strong> stocks identified as <span style="color: #3b82f6;">LEGITIMATE</span> (large-cap, liquid, major exchange)</li>
      </ul>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <h3>${summary.totalStocks.toLocaleString()}</h3>
        <p>Total Stocks</p>
      </div>
      <div class="stat-card low">
        <h3>${summary.byRiskLevel.LOW.toLocaleString()}</h3>
        <p>Low Risk (${((summary.byRiskLevel.LOW / summary.evaluated) * 100).toFixed(1)}%)</p>
      </div>
      <div class="stat-card medium">
        <h3>${summary.byRiskLevel.MEDIUM.toLocaleString()}</h3>
        <p>Medium Risk (${((summary.byRiskLevel.MEDIUM / summary.evaluated) * 100).toFixed(1)}%)</p>
      </div>
      <div class="stat-card high">
        <h3>${summary.byRiskLevel.HIGH.toLocaleString()}</h3>
        <p>High Risk (${((summary.byRiskLevel.HIGH / summary.evaluated) * 100).toFixed(1)}%)</p>
      </div>
      <div class="stat-card legitimate">
        <h3>${summary.legitimateStocks.toLocaleString()}</h3>
        <p>Legitimate</p>
      </div>
      <div class="stat-card data">
        <h3>${summary.realDataCount.toLocaleString()}</h3>
        <p>Real Price Data</p>
      </div>
    </div>

    <div class="chart-section">
      <h2>📊 Risk Distribution</h2>
      <div class="charts-row">
        <div class="chart-container">
          <canvas id="riskPieChart"></canvas>
        </div>
        <div class="chart-container">
          <canvas id="exchangeChart"></canvas>
        </div>
      </div>
    </div>

    <div class="chart-section">
      <h2>🔔 Most Common Risk Signals</h2>
      <div class="chart-container" style="height: 400px;">
        <canvas id="signalChart"></canvas>
      </div>
      <table style="margin-top: 30px;">
        <thead>
          <tr>
            <th>Signal Code</th>
            <th>Category</th>
            <th>Count</th>
            <th>% of Stocks</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(summary.bySignal)
            .sort((a, b) => b[1] - a[1])
            .map(([signal, count]) => `
          <tr>
            <td><strong>${signal}</strong></td>
            <td><span class="signal-tag ${getSignalCategory(signal)}">${getSignalCategory(signal).toUpperCase()}</span></td>
            <td>${count.toLocaleString()}</td>
            <td>${((count / summary.evaluated) * 100).toFixed(1)}%</td>
            <td>${getSignalDescription(signal)}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="chart-section">
      <h2>⚠️ Top HIGH Risk Stocks (Top 50)</h2>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th>Exchange</th>
            <th>Market Cap</th>
            <th>Price</th>
            <th>Score</th>
            <th>Data</th>
            <th>Risk Signals</th>
          </tr>
        </thead>
        <tbody>
          ${summary.topHighRisk.slice(0, 50).map(stock => `
          <tr>
            <td><strong>${stock.symbol}</strong></td>
            <td>${stock.name?.substring(0, 30) || 'N/A'}${stock.name && stock.name.length > 30 ? '...' : ''}</td>
            <td>${stock.exchange}</td>
            <td>${stock.marketCap ? formatMarketCap(stock.marketCap) : 'N/A'}</td>
            <td>${stock.lastPrice ? '$' + stock.lastPrice.toFixed(2) : 'N/A'}</td>
            <td><strong>${stock.totalScore}</strong></td>
            <td>${stock.priceDataSource === 'yahoo' ? '📊' : '📝'}</td>
            <td>
              <div class="signal-list">
                ${stock.signals.map(s => `<span class="signal-tag ${s.category === 'PATTERN' ? 'pattern' : 'structural'}">${s.code}</span>`).join('')}
              </div>
            </td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="chart-section">
      <h2>📈 Risk by Exchange</h2>
      <table>
        <thead>
          <tr>
            <th>Exchange</th>
            <th>Total</th>
            <th>LOW</th>
            <th>MEDIUM</th>
            <th>HIGH</th>
            <th>% HIGH</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(summary.byExchange)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([exchange, data]) => `
          <tr>
            <td><strong>${exchange}</strong></td>
            <td>${data.total.toLocaleString()}</td>
            <td><span class="risk-badge risk-low">${data.LOW.toLocaleString()}</span></td>
            <td><span class="risk-badge risk-medium">${data.MEDIUM.toLocaleString()}</span></td>
            <td><span class="risk-badge risk-high">${data.HIGH.toLocaleString()}</span></td>
            <td>${((data.HIGH / data.total) * 100).toFixed(1)}%</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <footer>
      <p>Generated by ScamDunk AI Risk Evaluation Suite | ${new Date().toLocaleDateString()}</p>
      <p style="margin-top: 10px; font-size: 0.9em; color: #999;">
        This evaluation uses real historical price data from Yahoo Finance to detect volume and price pattern anomalies,
        in addition to structural risk factors (market cap, price, liquidity, exchange type).
      </p>
    </footer>
  </div>

  <script>
    // Risk Level Pie Chart
    new Chart(document.getElementById('riskPieChart'), {
      type: 'doughnut',
      data: {
        labels: ['LOW', 'MEDIUM', 'HIGH', 'INSUFFICIENT'],
        datasets: [{
          data: [${summary.byRiskLevel.LOW}, ${summary.byRiskLevel.MEDIUM}, ${summary.byRiskLevel.HIGH}, ${summary.byRiskLevel.INSUFFICIENT}],
          backgroundColor: ['#22c55e', '#f59e0b', '#ef4444', '#94a3b8'],
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          title: { display: true, text: 'Risk Level Distribution' }
        }
      }
    });

    // Exchange Chart
    new Chart(document.getElementById('exchangeChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(Object.keys(summary.byExchange))},
        datasets: [
          { label: 'LOW', data: ${JSON.stringify(Object.values(summary.byExchange).map(e => e.LOW))}, backgroundColor: '#22c55e' },
          { label: 'MEDIUM', data: ${JSON.stringify(Object.values(summary.byExchange).map(e => e.MEDIUM))}, backgroundColor: '#f59e0b' },
          { label: 'HIGH', data: ${JSON.stringify(Object.values(summary.byExchange).map(e => e.HIGH))}, backgroundColor: '#ef4444' },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          title: { display: true, text: 'Risk by Exchange' }
        },
        scales: { x: { stacked: true }, y: { stacked: true } }
      }
    });

    // Signal Chart
    const signalData = ${JSON.stringify(Object.entries(summary.bySignal).sort((a, b) => b[1] - a[1]))};
    new Chart(document.getElementById('signalChart'), {
      type: 'bar',
      data: {
        labels: signalData.map(d => d[0]),
        datasets: [{
          label: 'Occurrences',
          data: signalData.map(d => d[1]),
          backgroundColor: signalData.map(d => {
            const signal = d[0];
            if (['SPIKE_7D', 'VOLUME_EXPLOSION', 'SPIKE_THEN_DROP', 'OVERBOUGHT_RSI', 'HIGH_VOLATILITY'].includes(signal)) {
              return '#f59e0b'; // Pattern signals
            }
            return '#6366f1'; // Structural signals
          }),
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Most Common Risk Signals (Purple=Structural, Yellow=Pattern)' }
        }
      }
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(reportPath, html);
  console.log(`HTML report saved to: ${reportPath}`);
}

function getSignalCategory(code: string): string {
  const patternSignals = ['SPIKE_7D', 'VOLUME_EXPLOSION', 'SPIKE_THEN_DROP', 'OVERBOUGHT_RSI', 'HIGH_VOLATILITY'];
  return patternSignals.includes(code) ? 'pattern' : 'structural';
}

function getSignalDescription(code: string): string {
  const descriptions: Record<string, string> = {
    'MICROCAP_PRICE': 'Stock price below $5 (penny stock territory)',
    'SMALL_MARKET_CAP': 'Market cap below $300M - higher manipulation risk',
    'MICRO_LIQUIDITY': 'Very low daily trading volume',
    'OTC_EXCHANGE': 'Traded on OTC/Pink Sheets - less regulated',
    'SPIKE_7D': 'Significant price movement in 7 days',
    'VOLUME_EXPLOSION': 'Elevated trading volume compared to average',
    'SPIKE_THEN_DROP': 'Pump-and-dump pattern detected',
    'OVERBOUGHT_RSI': 'RSI indicates overbought conditions',
    'HIGH_VOLATILITY': 'High price volatility',
  };
  return descriptions[code] || code;
}

// Print summary to console
function printSummary(summary: EvaluationSummary): void {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    EVALUATION SUMMARY                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Total Stocks Evaluated: ${summary.evaluated.toLocaleString()}`);
  console.log(`Real Price Data: ${summary.realDataCount.toLocaleString()} (${((summary.realDataCount / summary.evaluated) * 100).toFixed(1)}%)`);
  console.log(`Mock Data Fallback: ${summary.mockDataCount.toLocaleString()} (${((summary.mockDataCount / summary.evaluated) * 100).toFixed(1)}%)`);
  console.log(`Legitimate Stocks: ${summary.legitimateStocks.toLocaleString()}`);
  console.log(`Errors: ${summary.errors}`);
  console.log(`Duration: ${(summary.durationSeconds / 60).toFixed(1)} minutes\n`);

  console.log('Risk Level Distribution:');
  console.log(`  🟢 LOW:     ${summary.byRiskLevel.LOW.toLocaleString().padStart(6)} (${((summary.byRiskLevel.LOW / summary.evaluated) * 100).toFixed(1)}%)`);
  console.log(`  🟡 MEDIUM:  ${summary.byRiskLevel.MEDIUM.toLocaleString().padStart(6)} (${((summary.byRiskLevel.MEDIUM / summary.evaluated) * 100).toFixed(1)}%)`);
  console.log(`  🔴 HIGH:    ${summary.byRiskLevel.HIGH.toLocaleString().padStart(6)} (${((summary.byRiskLevel.HIGH / summary.evaluated) * 100).toFixed(1)}%)`);
  console.log(`  ⚪ OTHER:   ${summary.byRiskLevel.INSUFFICIENT.toLocaleString().padStart(6)} (${((summary.byRiskLevel.INSUFFICIENT / summary.evaluated) * 100).toFixed(1)}%)`);

  console.log('\nRisk Signals Summary:');
  Object.entries(summary.bySignal)
    .sort((a, b) => b[1] - a[1])
    .forEach(([signal, count]) => {
      const category = getSignalCategory(signal);
      const icon = category === 'pattern' ? '📈' : '🏢';
      console.log(`  ${icon} ${signal.padEnd(25)} ${count.toLocaleString().padStart(6)} (${((count / summary.evaluated) * 100).toFixed(1)}%)`);
    });

  console.log('\nTop 10 HIGH Risk Stocks:');
  summary.topHighRisk.slice(0, 10).forEach((stock, i) => {
    const dataIcon = stock.priceDataSource === 'yahoo' ? '📊' : '📝';
    console.log(`  ${(i + 1).toString().padStart(2)}. ${stock.symbol.padEnd(6)} ${dataIcon} (Score: ${stock.totalScore}) - ${stock.signalSummary}`);
  });

  console.log('\n');
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
