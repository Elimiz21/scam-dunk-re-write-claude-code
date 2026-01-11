/**
 * ScamDunk US Stock Evaluation - FINNHUB API (using curl)
 *
 * Uses curl for HTTP requests to bypass Node.js DNS resolution issues
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { computeRiskScore, MarketData, PriceHistory, StockQuote } from './standalone-scorer';

// Paths
const RESULTS_DIR = path.join(__dirname, '..', 'results');
const STOCK_LIST_FILE = path.join(RESULTS_DIR, 'stock-list.json');
const CHECKPOINT_FILE = path.join(RESULTS_DIR, 'checkpoint-finnhub-curl.json');

// API Config
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const REQUESTS_PER_MINUTE = 60;
const DELAY_MS = Math.ceil(60000 / REQUESTS_PER_MINUTE) + 50; // ~1050ms

// Types
interface StockResult {
  ticker: string;
  riskLevel: string;
  totalScore: number;
  signals: any[];
  lastPrice?: number;
  marketCap?: number;
  isOTC: boolean;
  dataSource: string;
  timestamp: string;
}

interface Checkpoint {
  processedTickers: string[];
  results: StockResult[];
  lastUpdate: string;
}

// Curl-based HTTP request
function curlFetch(url: string): any {
  try {
    const result = execSync(`curl -s '${url}'`, {
      encoding: 'utf8',
      timeout: 30000
    });
    return JSON.parse(result);
  } catch (e) {
    return null;
  }
}

// Fetch quote from Finnhub
async function fetchQuote(ticker: string): Promise<StockQuote | null> {
  const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`;
  const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_API_KEY}`;

  const quote = curlFetch(url);
  if (!quote || quote.c === 0 || quote.c === null) return null;

  const profile = curlFetch(profileUrl);

  return {
    ticker,
    companyName: profile?.name || ticker,
    exchange: profile?.exchange || 'UNKNOWN',
    lastPrice: quote.c,
    marketCap: profile?.marketCapitalization ? profile.marketCapitalization * 1_000_000 : 0,
    avgVolume30d: 0, // Finnhub quote doesn't include this
    avgDollarVolume30d: 0,
  };
}

// Fetch candles from Finnhub
async function fetchCandles(ticker: string): Promise<PriceHistory[]> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - (90 * 24 * 60 * 60); // 90 days ago
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${now}&token=${FINNHUB_API_KEY}`;

  const data = curlFetch(url);
  if (!data || data.s !== 'ok' || !data.c) return [];

  const history: PriceHistory[] = [];
  for (let i = 0; i < data.c.length; i++) {
    history.push({
      date: new Date(data.t[i] * 1000).toISOString().split('T')[0],
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v[i],
    });
  }
  return history;
}

// Fetch market data for a ticker
async function fetchMarketData(ticker: string): Promise<MarketData> {
  const quote = await fetchQuote(ticker);
  if (!quote) {
    return { quote: null, priceHistory: [], isOTC: false, dataAvailable: false };
  }

  const priceHistory = await fetchCandles(ticker);

  // Calculate avgDollarVolume if we have history
  if (priceHistory.length >= 30) {
    const last30 = priceHistory.slice(-30);
    const avgVolume = last30.reduce((sum, d) => sum + d.volume, 0) / 30;
    const avgPrice = last30.reduce((sum, d) => sum + d.close, 0) / 30;
    quote.avgVolume30d = avgVolume;
    quote.avgDollarVolume30d = avgVolume * avgPrice;
  }

  const isOTC = quote.exchange.includes('OTC') || quote.exchange.includes('PINK');

  return {
    quote,
    priceHistory,
    isOTC,
    dataAvailable: priceHistory.length >= 7,
  };
}

// Load checkpoint
function loadCheckpoint(): Checkpoint {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
  }
  return { processedTickers: [], results: [], lastUpdate: new Date().toISOString() };
}

// Save checkpoint
function saveCheckpoint(checkpoint: Checkpoint): void {
  checkpoint.lastUpdate = new Date().toISOString();
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

// Progress bar
function progressBar(current: number, total: number, success: number, failed: number, eta: string): string {
  const width = 40;
  const filled = Math.round((current / total) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const percent = ((current / total) * 100).toFixed(1);
  return `[${bar}] ${percent}% ${current}/${total} | ✓${success} ✗${failed} | ETA: ${eta}`;
}

// Main
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║    ScamDunk US Stock Evaluation - FINNHUB (curl-based)                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  if (!FINNHUB_API_KEY) {
    console.error('❌ FINNHUB_API_KEY environment variable not set');
    process.exit(1);
  }
  console.log('✓ Finnhub API key configured\n');

  // Load stock list
  if (!fs.existsSync(STOCK_LIST_FILE)) {
    console.error('❌ Stock list not found at:', STOCK_LIST_FILE);
    process.exit(1);
  }
  const stockList: string[] = JSON.parse(fs.readFileSync(STOCK_LIST_FILE, 'utf8'));

  // Load checkpoint
  const checkpoint = loadCheckpoint();
  const processed = new Set(checkpoint.processedTickers);

  // Filter remaining
  const remaining = stockList.filter(t => !processed.has(t));
  const total = stockList.length;

  console.log(`📊 Total stocks: ${total}`);
  console.log(`✓ Already processed: ${processed.size}`);
  console.log(`⏳ Remaining: ${remaining.length}`);
  console.log(`⏱️  Delay: ${DELAY_MS}ms per request (${REQUESTS_PER_MINUTE}/min)\n`);

  if (remaining.length === 0) {
    console.log('✅ All stocks already processed!');
    generateSummary(checkpoint.results);
    return;
  }

  let success = checkpoint.results.filter(r => r.riskLevel !== 'INSUFFICIENT').length;
  let failed = checkpoint.results.filter(r => r.riskLevel === 'INSUFFICIENT').length;
  const startTime = Date.now();

  for (let i = 0; i < remaining.length; i++) {
    const ticker = remaining[i];
    const current = processed.size + i + 1;

    try {
      const marketData = await fetchMarketData(ticker);
      const result = computeRiskScore(marketData);

      const stockResult: StockResult = {
        ticker,
        riskLevel: result.riskLevel,
        totalScore: result.totalScore,
        signals: result.signals,
        lastPrice: marketData.quote?.lastPrice,
        marketCap: marketData.quote?.marketCap,
        isOTC: marketData.isOTC,
        dataSource: 'finnhub',
        timestamp: new Date().toISOString(),
      };

      checkpoint.results.push(stockResult);
      checkpoint.processedTickers.push(ticker);

      if (result.riskLevel !== 'INSUFFICIENT') {
        success++;
      } else {
        failed++;
      }

      // Calculate ETA
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      const remainingCount = remaining.length - i - 1;
      const etaSeconds = remainingCount / rate;
      const etaMinutes = Math.floor(etaSeconds / 60);
      const etaHours = Math.floor(etaMinutes / 60);
      const eta = etaHours > 0 ? `${etaHours}h ${etaMinutes % 60}m` : `${etaMinutes}m`;

      // Progress
      process.stdout.write(`\r${progressBar(current, total, success, failed, eta)}  `);

      // Save checkpoint every 50 stocks
      if ((i + 1) % 50 === 0) {
        saveCheckpoint(checkpoint);
      }

    } catch (e) {
      failed++;
      checkpoint.processedTickers.push(ticker);
      checkpoint.results.push({
        ticker,
        riskLevel: 'INSUFFICIENT',
        totalScore: 0,
        signals: [],
        isOTC: false,
        dataSource: 'finnhub',
        timestamp: new Date().toISOString(),
      });
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  }

  // Final save
  saveCheckpoint(checkpoint);
  console.log('\n\n✅ Processing complete!\n');

  generateSummary(checkpoint.results);
}

function generateSummary(results: StockResult[]) {
  const date = new Date().toISOString().split('T')[0];

  // Filter out insufficient data
  const validResults = results.filter(r => r.riskLevel !== 'INSUFFICIENT');

  // Risk distribution
  const distribution = {
    LOW: validResults.filter(r => r.riskLevel === 'LOW').length,
    MEDIUM: validResults.filter(r => r.riskLevel === 'MEDIUM').length,
    HIGH: validResults.filter(r => r.riskLevel === 'HIGH').length,
  };

  const summary = {
    date,
    totalStocks: results.length,
    validStocks: validResults.length,
    insufficientData: results.length - validResults.length,
    riskDistribution: distribution,
    dataSource: 'finnhub',
    results: validResults,
  };

  // Save summary
  const summaryPath = path.join(RESULTS_DIR, `summary-${date}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  // Print summary
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           ANALYSIS SUMMARY                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');
  console.log(`Date: ${date}`);
  console.log(`Total stocks analyzed: ${results.length}`);
  console.log(`Valid results: ${validResults.length}`);
  console.log(`Insufficient data: ${results.length - validResults.length}\n`);
  console.log('Risk Distribution:');
  console.log(`  LOW:    ${distribution.LOW} (${((distribution.LOW / validResults.length) * 100).toFixed(1)}%)`);
  console.log(`  MEDIUM: ${distribution.MEDIUM} (${((distribution.MEDIUM / validResults.length) * 100).toFixed(1)}%)`);
  console.log(`  HIGH:   ${distribution.HIGH} (${((distribution.HIGH / validResults.length) * 100).toFixed(1)}%)`);
  console.log(`\n✓ Results saved to: ${summaryPath}`);

  // Compare with January 1st baseline
  const jan1EvalPath = path.join(RESULTS_DIR, 'evaluation-2026-01-01.json');
  const jan1SummaryPath = path.join(RESULTS_DIR, 'summary-2026-01-01.json');
  if (fs.existsSync(jan1EvalPath) && fs.existsSync(jan1SummaryPath)) {
    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
    console.log('║                     COMPARISON WITH JANUARY 1ST                          ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

    const jan1Summary = JSON.parse(fs.readFileSync(jan1SummaryPath, 'utf8'));
    const jan1Distribution = jan1Summary.byRiskLevel || {};

    console.log('Category      Jan 1st    Today    Change');
    console.log('─'.repeat(45));

    const categories = ['LOW', 'MEDIUM', 'HIGH'] as const;
    for (const cat of categories) {
      const jan1Val = jan1Distribution[cat] || 0;
      const todayVal = distribution[cat];
      const change = todayVal - jan1Val;
      const changeStr = change >= 0 ? `+${change}` : `${change}`;
      console.log(`${cat.padEnd(12)}  ${String(jan1Val).padStart(6)}    ${String(todayVal).padStart(6)}    ${changeStr}`);
    }

    // Find stocks that changed risk level
    const jan1Results: any[] = JSON.parse(fs.readFileSync(jan1EvalPath, 'utf8'));
    const jan1Map = new Map<string, string>(jan1Results.map((r: any) => [r.symbol, r.riskLevel]));

    const changes = {
      upgraded: [] as string[],
      downgraded: [] as string[],
    };

    for (const result of validResults) {
      const oldLevel = jan1Map.get(result.ticker);
      if (!oldLevel) continue;

      const levels = ['LOW', 'MEDIUM', 'HIGH'];
      const oldIdx = levels.indexOf(oldLevel);
      const newIdx = levels.indexOf(result.riskLevel);

      if (newIdx > oldIdx) {
        changes.downgraded.push(`${result.ticker} (${oldLevel} → ${result.riskLevel})`);
      } else if (newIdx < oldIdx) {
        changes.upgraded.push(`${result.ticker} (${oldLevel} → ${result.riskLevel})`);
      }
    }

    if (changes.upgraded.length > 0) {
      console.log(`\n⬆️  Upgraded (lower risk): ${changes.upgraded.length} stocks`);
      console.log(changes.upgraded.slice(0, 10).join(', ') + (changes.upgraded.length > 10 ? '...' : ''));
    }

    if (changes.downgraded.length > 0) {
      console.log(`\n⬇️  Downgraded (higher risk): ${changes.downgraded.length} stocks`);
      console.log(changes.downgraded.slice(0, 10).join(', ') + (changes.downgraded.length > 10 ? '...' : ''));
    }

    // Save comparison report
    const comparisonReport = {
      date,
      baselineDate: '2026-01-01',
      currentDistribution: distribution,
      baselineDistribution: jan1Distribution,
      changes: {
        upgraded: changes.upgraded.length,
        downgraded: changes.downgraded.length,
        upgradedList: changes.upgraded.slice(0, 100),
        downgradedList: changes.downgraded.slice(0, 100),
      },
    };

    const comparisonPath = path.join(RESULTS_DIR, `comparison-${date}.json`);
    fs.writeFileSync(comparisonPath, JSON.stringify(comparisonReport, null, 2));
    console.log(`\n✓ Comparison report saved to: ${comparisonPath}`);
  }
}

main().catch(console.error);
