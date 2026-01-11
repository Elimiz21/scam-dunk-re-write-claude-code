/**
 * Scam Dunk - FMP Integration Test Suite
 *
 * Comprehensive end-to-end test of the scanning capabilities using
 * Financial Modeling Prep (FMP) as the live data source.
 *
 * Tests:
 * 1. FMP API connectivity and data quality
 * 2. Historical data retrieval (pattern detection capability)
 * 3. Multiple stock types (legitimate, pump-and-dump, OTC, microcap)
 * 4. Full scoring pipeline with pattern detection
 * 5. Real-world known pump-and-dump detection
 */

import { execSync } from 'child_process';

// FMP Configuration
const FMP_API_KEY = process.env.FMP_API_KEY || '';
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';

// Test stocks covering various categories
const TEST_STOCKS = {
  // Known legitimate blue-chip stocks
  legitimate: [
    { symbol: 'AAPL', name: 'Apple Inc.', expected: 'LOW' },
    { symbol: 'MSFT', name: 'Microsoft Corp.', expected: 'LOW' },
    { symbol: 'JNJ', name: 'Johnson & Johnson', expected: 'LOW' },
  ],
  // Previously identified high-risk/pump-and-dump candidates
  pumpAndDump: [
    { symbol: 'SIDU', name: 'Sidus Space', expected: 'HIGH', notes: '+477% in 30 days (Jan 2026)' },
    { symbol: 'OPTX', name: 'Syntec Optics', expected: 'HIGH', notes: 'RSI 86, actively promoted' },
    { symbol: 'SOS', name: 'SOS Limited', expected: 'HIGH', notes: 'Pump-and-dump pattern' },
  ],
  // Microcap/penny stocks
  microcap: [
    { symbol: 'SOBR', name: 'SOBR Safe', expected: 'HIGH', notes: 'Sub-$5, low liquidity' },
    { symbol: 'GDHG', name: 'Golden Heaven', expected: 'HIGH', notes: 'Micro liquidity' },
  ],
};

// Types
interface PriceHistory {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockQuote {
  ticker: string;
  companyName: string;
  exchange: string;
  lastPrice: number;
  marketCap: number;
  avgVolume30d: number;
}

interface TestResult {
  symbol: string;
  name: string;
  category: string;
  expected: string;
  actual: string;
  score: number;
  signals: string[];
  dataSource: string;
  historyDays: number;
  priceChange7d: number | null;
  priceChange30d: number | null;
  rsi: number | null;
  volumeRatio: number | null;
  passed: boolean;
  details: string;
}

// ============================================================================
// FMP DATA FETCHING
// ============================================================================

function curlFetch(url: string): string | null {
  try {
    return execSync(`curl -s --max-time 15 "${url}"`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function fetchProfile(symbol: string): StockQuote | null {
  const url = `${FMP_BASE_URL}/profile?symbol=${symbol}&apikey=${FMP_API_KEY}`;
  const response = curlFetch(url);
  if (!response) return null;

  try {
    const data = JSON.parse(response);
    if (!data || data.length === 0 || data['Error Message']) return null;
    const p = data[0];
    return {
      ticker: symbol,
      companyName: p.companyName || symbol,
      exchange: p.exchange || 'Unknown',
      lastPrice: p.price || 0,
      marketCap: p.marketCap || 0,
      avgVolume30d: p.averageVolume || 0,
    };
  } catch {
    return null;
  }
}

function fetchHistory(symbol: string): PriceHistory[] {
  const url = `${FMP_BASE_URL}/historical-price-eod/full?symbol=${symbol}&apikey=${FMP_API_KEY}`;
  const response = curlFetch(url);
  if (!response) return [];

  try {
    const data = JSON.parse(response);
    if (!data || data.length === 0 || data['Error Message']) return [];
    return data.slice(0, 100).reverse().map((d: any) => ({
      date: d.date,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
    }));
  } catch {
    return [];
  }
}

// ============================================================================
// PATTERN DETECTION (Mirrors scoring.ts logic)
// ============================================================================

function calculatePriceChange(history: PriceHistory[], days: number): number | null {
  if (history.length < days + 1) return null;
  const current = history[history.length - 1].close;
  const past = history[history.length - 1 - days].close;
  if (past === 0) return null;
  return ((current - past) / past) * 100;
}

function calculateRSI(history: PriceHistory[], period: number = 14): number | null {
  if (history.length < period + 1) return null;
  const changes: number[] = [];
  for (let i = 1; i < history.length; i++) {
    changes.push(history[i].close - history[i - 1].close);
  }
  const recent = changes.slice(-period);
  const gains = recent.filter(c => c > 0);
  const losses = recent.filter(c => c < 0).map(c => Math.abs(c));
  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / gains.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateVolumeRatio(history: PriceHistory[]): number | null {
  if (history.length < 30) return null;
  const last30 = history.slice(-30);
  const avg30 = last30.reduce((s, d) => s + d.volume, 0) / 30;
  const last7 = history.slice(-7);
  const avg7 = last7.reduce((s, d) => s + d.volume, 0) / 7;
  if (avg30 === 0) return null;
  return avg7 / avg30;
}

function detectSpikeThenDrop(history: PriceHistory[]): boolean {
  if (history.length < 15) return false;
  const recent = history.slice(-15);
  const start = recent[0].close;
  let max = start, maxIdx = 0;
  for (let i = 0; i < recent.length; i++) {
    if (recent[i].high > max) { max = recent[i].high; maxIdx = i; }
  }
  const spikePercent = ((max - start) / start) * 100;
  if (spikePercent < 25) return false;
  const current = recent[recent.length - 1].close;
  const dropPercent = ((max - current) / max) * 100;
  return dropPercent >= 20 && maxIdx < recent.length - 2;
}

// ============================================================================
// RISK SCORING (Simplified version of scoring.ts)
// ============================================================================

interface ScoringResult {
  riskLevel: string;
  totalScore: number;
  signals: string[];
}

function computeRiskScore(quote: StockQuote, history: PriceHistory[]): ScoringResult {
  const signals: string[] = [];
  let score = 0;

  // Structural signals
  if (quote.lastPrice < 5) {
    signals.push('MICROCAP_PRICE');
    score += 1;
  }
  if (quote.marketCap > 0 && quote.marketCap < 300_000_000) {
    signals.push('SMALL_MARKET_CAP');
    score += 1;
  }
  const avgDollarVolume = quote.avgVolume30d * quote.lastPrice;
  if (avgDollarVolume > 0 && avgDollarVolume < 150_000) {
    signals.push('MICRO_LIQUIDITY');
    score += 2;
  }

  const otcExchanges = ['OTC', 'OTCQX', 'OTCQB', 'PINK'];
  if (otcExchanges.some(e => quote.exchange.toUpperCase().includes(e))) {
    signals.push('OTC_EXCHANGE');
    score += 2;
  }

  // Pattern signals (require historical data)
  if (history.length >= 30) {
    const change7d = calculatePriceChange(history, 7);
    const change30d = calculatePriceChange(history, 30);

    if (change7d !== null && change7d >= 50) {
      signals.push(`SPIKE_7D_HIGH (+${change7d.toFixed(1)}%)`);
      score += 3;
    } else if (change7d !== null && change7d >= 25) {
      signals.push(`SPIKE_7D_MEDIUM (+${change7d.toFixed(1)}%)`);
      score += 2;
    }

    if (change30d !== null && change30d >= 100) {
      signals.push(`SPIKE_30D (+${change30d.toFixed(1)}%)`);
      score += 2;
    }

    const volumeRatio = calculateVolumeRatio(history);
    if (volumeRatio !== null && volumeRatio >= 5) {
      signals.push(`VOLUME_EXPLOSION (${volumeRatio.toFixed(1)}x)`);
      score += 3;
    } else if (volumeRatio !== null && volumeRatio >= 3) {
      signals.push(`VOLUME_SPIKE (${volumeRatio.toFixed(1)}x)`);
      score += 2;
    }

    if (detectSpikeThenDrop(history)) {
      signals.push('SPIKE_THEN_DROP');
      score += 3;
    }

    const rsi = calculateRSI(history);
    if (rsi !== null && rsi >= 80) {
      signals.push(`OVERBOUGHT_RSI (${rsi.toFixed(0)})`);
      score += 2;
    } else if (rsi !== null && rsi >= 70) {
      signals.push(`HIGH_RSI (${rsi.toFixed(0)})`);
      score += 1;
    }
  }

  // Determine risk level
  let riskLevel = 'LOW';
  if (score >= 5) riskLevel = 'HIGH';
  else if (score >= 2) riskLevel = 'MEDIUM';

  return { riskLevel, totalScore: score, signals };
}

// ============================================================================
// TEST RUNNER
// ============================================================================

function sleep(ms: number): void {
  execSync(`sleep ${ms / 1000}`);
}

async function runTests(): Promise<void> {
  console.log('='.repeat(80));
  console.log('SCAM DUNK - FMP INTEGRATION TEST SUITE');
  console.log('='.repeat(80));
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`FMP API: ${FMP_API_KEY ? 'Configured ✓' : 'NOT CONFIGURED ✗'}`);
  console.log('');

  if (!FMP_API_KEY) {
    console.error('ERROR: FMP_API_KEY not set. Please configure in .env file.');
    process.exit(1);
  }

  const results: TestResult[] = [];
  let totalTests = 0;
  let passedTests = 0;

  // Test each category
  for (const [category, stocks] of Object.entries(TEST_STOCKS)) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`TESTING: ${category.toUpperCase()} STOCKS`);
    console.log('─'.repeat(80));

    for (const stock of stocks) {
      totalTests++;
      process.stdout.write(`  Testing ${stock.symbol.padEnd(6)} (${stock.name.slice(0, 25).padEnd(25)})... `);

      // Fetch data
      const profile = fetchProfile(stock.symbol);
      sleep(250); // Rate limiting
      const history = fetchHistory(stock.symbol);
      sleep(250);

      if (!profile) {
        console.log('SKIP (no profile data)');
        results.push({
          symbol: stock.symbol,
          name: stock.name,
          category,
          expected: stock.expected,
          actual: 'N/A',
          score: 0,
          signals: [],
          dataSource: 'FMP',
          historyDays: 0,
          priceChange7d: null,
          priceChange30d: null,
          rsi: null,
          volumeRatio: null,
          passed: false,
          details: 'No profile data available',
        });
        continue;
      }

      // Run scoring
      const scoring = computeRiskScore(profile, history);
      const priceChange7d = calculatePriceChange(history, 7);
      const priceChange30d = calculatePriceChange(history, 30);
      const rsi = calculateRSI(history);
      const volumeRatio = calculateVolumeRatio(history);

      // Determine pass/fail
      const passed = scoring.riskLevel === stock.expected;
      if (passed) passedTests++;

      const statusIcon = passed ? '✓' : '✗';
      const statusColor = passed ? '\x1b[32m' : '\x1b[31m';
      console.log(`${statusColor}${statusIcon}\x1b[0m ${scoring.riskLevel} (score: ${scoring.totalScore})`);

      results.push({
        symbol: stock.symbol,
        name: stock.name,
        category,
        expected: stock.expected,
        actual: scoring.riskLevel,
        score: scoring.totalScore,
        signals: scoring.signals,
        dataSource: 'FMP',
        historyDays: history.length,
        priceChange7d,
        priceChange30d,
        rsi,
        volumeRatio,
        passed,
        details: scoring.signals.join(', ') || 'No signals detected',
      });
    }
  }

  // ============================================================================
  // GENERATE REPORT
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('TEST RESULTS SUMMARY');
  console.log('='.repeat(80));
  console.log(`\nTotal Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${totalTests - passedTests}`);

  // Detailed results table
  console.log('\n' + '─'.repeat(80));
  console.log('DETAILED RESULTS');
  console.log('─'.repeat(80));
  console.log('');
  console.log('| Symbol | Category     | Expected | Actual | Score | History | 7d Chg  | 30d Chg | RSI  | Status |');
  console.log('|--------|--------------|----------|--------|-------|---------|---------|---------|------|--------|');

  for (const r of results) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    const chg7d = r.priceChange7d !== null ? `${r.priceChange7d >= 0 ? '+' : ''}${r.priceChange7d.toFixed(1)}%` : 'N/A';
    const chg30d = r.priceChange30d !== null ? `${r.priceChange30d >= 0 ? '+' : ''}${r.priceChange30d.toFixed(1)}%` : 'N/A';
    const rsi = r.rsi !== null ? r.rsi.toFixed(0) : 'N/A';
    console.log(
      `| ${r.symbol.padEnd(6)} | ${r.category.padEnd(12)} | ${r.expected.padEnd(8)} | ${r.actual.padEnd(6)} | ${String(r.score).padStart(5)} | ${String(r.historyDays).padStart(7)} | ${chg7d.padStart(7)} | ${chg30d.padStart(7)} | ${rsi.padStart(4)} | ${status} |`
    );
  }

  // Signal breakdown for high-risk stocks
  console.log('\n' + '─'.repeat(80));
  console.log('HIGH-RISK STOCK SIGNAL BREAKDOWN');
  console.log('─'.repeat(80));

  for (const r of results.filter(r => r.actual === 'HIGH' || r.expected === 'HIGH')) {
    console.log(`\n${r.symbol} (${r.name})`);
    console.log(`  Risk Level: ${r.actual} | Score: ${r.score}`);
    console.log(`  Historical Data: ${r.historyDays} days`);
    console.log(`  Price Changes: 7d=${r.priceChange7d?.toFixed(1) || 'N/A'}%, 30d=${r.priceChange30d?.toFixed(1) || 'N/A'}%`);
    console.log(`  RSI: ${r.rsi?.toFixed(1) || 'N/A'} | Volume Ratio: ${r.volumeRatio?.toFixed(2) || 'N/A'}x`);
    console.log(`  Signals: ${r.signals.length > 0 ? r.signals.join(', ') : 'None'}`);
  }

  // Data quality check
  console.log('\n' + '─'.repeat(80));
  console.log('FMP DATA QUALITY CHECK');
  console.log('─'.repeat(80));

  const withHistory = results.filter(r => r.historyDays > 0);
  const avgHistoryDays = withHistory.length > 0
    ? withHistory.reduce((s, r) => s + r.historyDays, 0) / withHistory.length
    : 0;

  console.log(`\n  Stocks with historical data: ${withHistory.length}/${results.length}`);
  console.log(`  Average history length: ${avgHistoryDays.toFixed(0)} days`);
  console.log(`  Pattern detection enabled: ${avgHistoryDays >= 30 ? '✓ YES' : '✗ NO (need 30+ days)'}`);

  // Final verdict
  console.log('\n' + '='.repeat(80));
  if (passedTests === totalTests && avgHistoryDays >= 30) {
    console.log('✓ ALL TESTS PASSED - FMP INTEGRATION WORKING CORRECTLY');
  } else if (passedTests >= totalTests * 0.7) {
    console.log('⚠ MOSTLY PASSED - Some edge cases may need attention');
  } else {
    console.log('✗ TESTS FAILED - FMP integration may have issues');
  }
  console.log('='.repeat(80));

  // Save detailed report to file
  const reportPath = `/home/user/scam-dunk-re-write-claude-code/evaluation/results/fmp-test-report-${new Date().toISOString().split('T')[0]}.json`;
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalTests,
      passed: passedTests,
      failed: totalTests - passedTests,
      passRate: ((passedTests / totalTests) * 100).toFixed(1) + '%',
      dataSource: 'FMP (Financial Modeling Prep)',
      avgHistoryDays: avgHistoryDays.toFixed(0),
    },
    results,
  };

  const fs = require('fs');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nDetailed report saved to: ${reportPath}`);
}

// Run tests
runTests().catch(console.error);
