/**
 * ScamDunk US Stock Evaluation - FINNHUB Free Tier (Quote-only)
 *
 * Uses curl for HTTP requests. Only uses free tier (quote + profile).
 * No historical candle data = structural signals only.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Paths
const RESULTS_DIR = path.join(__dirname, '..', 'results');
const STOCK_LIST_FILE = path.join(RESULTS_DIR, 'stock-list.json');
const CHECKPOINT_FILE = path.join(RESULTS_DIR, 'checkpoint-finnhub-free.json');

// API Config
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const REQUESTS_PER_MINUTE = 60;
const DELAY_MS = Math.ceil(60000 / REQUESTS_PER_MINUTE) + 100; // ~1100ms to be safe

// Types
interface StockResult {
  ticker: string;
  name: string;
  exchange: string;
  riskLevel: string;
  totalScore: number;
  signals: string[];
  lastPrice: number;
  marketCap: number;
  dailyChange: number;
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

// Compute risk based on structural signals only (no historical data)
function computeStructuralRisk(
  price: number,
  marketCap: number,
  exchange: string,
  dailyChangePercent: number
): { riskLevel: string; totalScore: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  // MICROCAP_PRICE - price below $5 (penny stock)
  if (price < 5) {
    signals.push(`MICROCAP_PRICE: Stock price ($${price.toFixed(2)}) below $5`);
    score += 2;
  }

  // SMALL_MARKET_CAP - market cap below $300M
  if (marketCap > 0 && marketCap < 300_000_000) {
    signals.push(`SMALL_MARKET_CAP: Market cap ($${(marketCap / 1_000_000).toFixed(0)}M) below $300M`);
    score += 2;
  }

  // OTC_EXCHANGE - traded on OTC/Pink Sheets
  const isOTC = exchange && (
    exchange.includes('OTC') ||
    exchange.includes('PINK') ||
    exchange.includes('GREY')
  );
  if (isOTC) {
    signals.push(`OTC_EXCHANGE: Traded on ${exchange} - less regulated`);
    score += 3;
  }

  // Daily volatility check - if available and significant
  if (Math.abs(dailyChangePercent) >= 10) {
    signals.push(`HIGH_DAILY_MOVE: ${dailyChangePercent > 0 ? '+' : ''}${dailyChangePercent.toFixed(1)}% today`);
    score += 1;
  }

  // Very low price (below $1) - extra risk
  if (price < 1 && price > 0) {
    signals.push(`SUB_DOLLAR: Stock priced below $1.00`);
    score += 1;
  }

  // Determine risk level
  let riskLevel: string;
  if (score >= 5) {
    riskLevel = 'HIGH';
  } else if (score >= 2) {
    riskLevel = 'MEDIUM';
  } else {
    riskLevel = 'LOW';
  }

  return { riskLevel, totalScore: score, signals };
}

// Fetch stock data from Finnhub
async function fetchStockData(ticker: string): Promise<StockResult | null> {
  // Get quote
  const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`;
  const quote = curlFetch(quoteUrl);

  if (!quote || quote.c === 0 || quote.c === null || quote.error) {
    return null;
  }

  // Get company profile
  const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_API_KEY}`;
  const profile = curlFetch(profileUrl);

  const price = quote.c || 0;
  const marketCap = profile?.marketCapitalization ? profile.marketCapitalization * 1_000_000 : 0;
  const exchange = profile?.exchange || '';
  const dailyChange = quote.dp || 0;
  const name = profile?.name || ticker;

  const isOTC = exchange.includes('OTC') || exchange.includes('PINK') || exchange.includes('GREY');

  // Compute risk
  const { riskLevel, totalScore, signals } = computeStructuralRisk(price, marketCap, exchange, dailyChange);

  return {
    ticker,
    name,
    exchange,
    riskLevel,
    totalScore,
    signals,
    lastPrice: price,
    marketCap,
    dailyChange,
    isOTC,
    dataSource: 'finnhub-free',
    timestamp: new Date().toISOString(),
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
  console.log('║   ScamDunk US Stock Evaluation - FINNHUB Free Tier (Structural Only)     ║');
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
  console.log(`⏱️  Delay: ${DELAY_MS}ms per request (~${Math.floor(60000/DELAY_MS)}/min)\n`);

  if (remaining.length === 0) {
    console.log('✅ All stocks already processed!');
    generateSummary(checkpoint.results);
    return;
  }

  let success = checkpoint.results.length;
  let failed = processed.size - success;
  const startTime = Date.now();

  for (let i = 0; i < remaining.length; i++) {
    const ticker = remaining[i];
    const current = processed.size + i + 1;

    try {
      const result = await fetchStockData(ticker);

      if (result) {
        checkpoint.results.push(result);
        success++;
      } else {
        failed++;
      }
      checkpoint.processedTickers.push(ticker);

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

      // Save checkpoint every 100 stocks
      if ((i + 1) % 100 === 0) {
        saveCheckpoint(checkpoint);
      }

    } catch (e) {
      failed++;
      checkpoint.processedTickers.push(ticker);
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

  // Risk distribution
  const distribution = {
    LOW: results.filter(r => r.riskLevel === 'LOW').length,
    MEDIUM: results.filter(r => r.riskLevel === 'MEDIUM').length,
    HIGH: results.filter(r => r.riskLevel === 'HIGH').length,
  };

  const summary = {
    date,
    totalStocks: results.length,
    riskDistribution: distribution,
    dataSource: 'finnhub-free',
    note: 'Structural signals only (no historical data on free tier)',
    results: results,
  };

  // Save summary
  const summaryPath = path.join(RESULTS_DIR, `summary-${date}-finnhub.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  // Print summary
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           ANALYSIS SUMMARY                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');
  console.log(`Date: ${date}`);
  console.log(`Total stocks analyzed: ${results.length}\n`);
  console.log('Risk Distribution (Structural Signals Only):');
  console.log(`  LOW:    ${distribution.LOW} (${((distribution.LOW / results.length) * 100).toFixed(1)}%)`);
  console.log(`  MEDIUM: ${distribution.MEDIUM} (${((distribution.MEDIUM / results.length) * 100).toFixed(1)}%)`);
  console.log(`  HIGH:   ${distribution.HIGH} (${((distribution.HIGH / results.length) * 100).toFixed(1)}%)`);
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

    for (const result of results) {
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
      note: 'Current analysis uses structural signals only (Finnhub free tier). January 1st used full pattern analysis.',
    };

    const comparisonPath = path.join(RESULTS_DIR, `comparison-${date}.json`);
    fs.writeFileSync(comparisonPath, JSON.stringify(comparisonReport, null, 2));
    console.log(`\n✓ Comparison report saved to: ${comparisonPath}`);
  }
}

main().catch(console.error);
