/**
 * Batch Stock Evaluation Script
 *
 * Runs the ScamDunk risk scoring model on all US stocks and generates
 * comprehensive reports on risk distribution.
 */

import * as fs from 'fs';
import * as path from 'path';

// Import scoring module
import { computeRiskScore, getSignalsByCategory, SIGNAL_CODES } from '../../src/lib/scoring';
import { MarketData, ScoringInput, PriceHistory, StockQuote, RiskSignal } from '../../src/lib/types';

const DATA_DIR = path.join(__dirname, '..', 'data');
const RESULTS_DIR = path.join(__dirname, '..', 'results');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// Rate limiting for API calls
const RATE_LIMIT_DELAY = 250; // ms between API calls

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
}

interface EvaluationSummary {
  totalStocks: number;
  evaluated: number;
  errors: number;
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
  bySignal: Record<string, number>;
  topHighRisk: EvaluationResult[];
  evaluationDate: string;
  durationSeconds: number;
}

// Create mock market data from stock info
function createMarketDataFromStock(stock: StockTicker): MarketData {
  // Generate stable mock price history (no volatility for consistent testing)
  const priceHistory: PriceHistory[] = [];
  const basePrice = stock.lastPrice || 50;

  for (let i = 60; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    priceHistory.push({
      date: date.toISOString().split('T')[0],
      open: basePrice * 0.995,
      high: basePrice * 1.005,
      low: basePrice * 0.99,
      close: basePrice,
      volume: stock.volume || 1_000_000,
    });
  }

  const quote: StockQuote = {
    ticker: stock.symbol,
    companyName: stock.name,
    exchange: stock.exchange,
    lastPrice: stock.lastPrice || 50,
    marketCap: stock.marketCap || 0,
    avgVolume30d: stock.volume || 1_000_000,
    avgDollarVolume30d: (stock.volume || 1_000_000) * (stock.lastPrice || 50),
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

// Evaluate a single stock
async function evaluateStock(stock: StockTicker): Promise<EvaluationResult> {
  try {
    const marketData = createMarketDataFromStock(stock);

    // Create scoring input with no behavioral flags (neutral evaluation)
    const input: ScoringInput = {
      marketData,
      pitchText: '', // No pitch text for neutral evaluation
      context: {
        unsolicited: false,
        promisesHighReturns: false,
        urgencyPressure: false,
        secrecyInsideInfo: false,
      },
    };

    const result = await computeRiskScore(input);

    return {
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      marketCap: stock.marketCap || null,
      lastPrice: stock.lastPrice || null,
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
    };
  } catch (error) {
    return {
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
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

// Main evaluation function
async function evaluateAllStocks(
  options: {
    limit?: number;
    batchSize?: number;
    saveInterval?: number;
  } = {}
): Promise<void> {
  const { limit, batchSize = 100, saveInterval = 500 } = options;

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           ScamDunk US Stock Evaluation Suite               ║');
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

  const startTime = Date.now();
  const results: EvaluationResult[] = [];
  const errors: EvaluationResult[] = [];

  console.log(`\nStarting evaluation of ${stocks.length} stocks...\n`);

  // Process in batches
  for (let i = 0; i < stocks.length; i += batchSize) {
    const batch = stocks.slice(i, Math.min(i + batchSize, stocks.length));

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(stock => evaluateStock(stock))
    );

    for (const result of batchResults) {
      if (result.error) {
        errors.push(result);
      }
      results.push(result);
    }

    // Update progress
    const progress = Math.min(i + batchSize, stocks.length);
    process.stdout.write(`\r${progressBar(progress, stocks.length)} `);

    // Save intermediate results
    if (results.length % saveInterval === 0) {
      const tempPath = path.join(RESULTS_DIR, 'evaluation-progress.json');
      fs.writeFileSync(tempPath, JSON.stringify(results, null, 2));
    }

    // Small delay to prevent overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  console.log('\n\nEvaluation complete!\n');

  const endTime = Date.now();
  const durationSeconds = (endTime - startTime) / 1000;

  // Generate summary
  const summary = generateSummary(results, stocks.length, durationSeconds);

  // Save results
  saveResults(results, summary);

  // Print summary
  printSummary(summary);
}

// Generate evaluation summary
function generateSummary(
  results: EvaluationResult[],
  totalStocks: number,
  durationSeconds: number
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
    .slice(0, 50);

  return {
    totalStocks,
    evaluated: results.length,
    errors: results.filter(r => r.error).length,
    byRiskLevel,
    byExchange,
    bySignal,
    topHighRisk,
    evaluationDate: new Date().toISOString(),
    durationSeconds,
  };
}

// Save results to files
function saveResults(results: EvaluationResult[], summary: EvaluationSummary): void {
  const timestamp = new Date().toISOString().split('T')[0];

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
  const csvHeader = 'Symbol,Name,Exchange,MarketCap,LastPrice,RiskLevel,TotalScore,IsLegitimate,SignalSummary\n';
  const csvRows = results.map(r =>
    `"${r.symbol}","${(r.name || '').replace(/"/g, '""')}","${r.exchange}",${r.marketCap || ''},` +
    `${r.lastPrice || ''},"${r.riskLevel}",${r.totalScore},${r.isLegitimate},"${r.signalSummary}"`
  ).join('\n');
  fs.writeFileSync(csvPath, csvHeader + csvRows);
  console.log(`CSV saved to: ${csvPath}`);

  // Save HIGH risk stocks CSV
  const highRiskPath = path.join(RESULTS_DIR, `high-risk-${timestamp}.csv`);
  const highRiskStocks = results.filter(r => r.riskLevel === 'HIGH');
  const highRiskCsv = 'Symbol,Name,Exchange,MarketCap,LastPrice,TotalScore,Signals\n' +
    highRiskStocks.map(r =>
      `"${r.symbol}","${(r.name || '').replace(/"/g, '""')}","${r.exchange}",${r.marketCap || ''},` +
      `${r.lastPrice || ''},${r.totalScore},"${r.signalSummary}"`
    ).join('\n');
  fs.writeFileSync(highRiskPath, highRiskCsv);
  console.log(`HIGH risk stocks saved to: ${highRiskPath}`);

  // Generate HTML report
  generateHTMLReport(results, summary, timestamp);
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
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); text-align: center; }
    .stat-card h3 { font-size: 2.5em; margin-bottom: 5px; }
    .stat-card p { color: #666; text-transform: uppercase; font-size: 0.85em; letter-spacing: 1px; }
    .stat-card.low h3 { color: #22c55e; }
    .stat-card.medium h3 { color: #f59e0b; }
    .stat-card.high h3 { color: #ef4444; }
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
    footer { text-align: center; padding: 30px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🎯 ScamDunk US Stock Evaluation Report</h1>
      <p>Evaluation Date: ${new Date(summary.evaluationDate).toLocaleString()} | Duration: ${summary.durationSeconds.toFixed(1)}s</p>
    </header>

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
    </div>

    <div class="chart-section">
      <h2>⚠️ Top HIGH Risk Stocks</h2>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th>Exchange</th>
            <th>Market Cap</th>
            <th>Price</th>
            <th>Score</th>
            <th>Risk Signals</th>
          </tr>
        </thead>
        <tbody>
          ${summary.topHighRisk.slice(0, 25).map(stock => `
          <tr>
            <td><strong>${stock.symbol}</strong></td>
            <td>${stock.name?.substring(0, 40) || 'N/A'}${stock.name && stock.name.length > 40 ? '...' : ''}</td>
            <td>${stock.exchange}</td>
            <td>${stock.marketCap ? formatMarketCap(stock.marketCap) : 'N/A'}</td>
            <td>${stock.lastPrice ? '$' + stock.lastPrice.toFixed(2) : 'N/A'}</td>
            <td><strong>${stock.totalScore}</strong></td>
            <td>
              <div class="signal-list">
                ${stock.signals.map(s => `<span class="signal-tag">${s.code}</span>`).join('')}
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
          ${Object.entries(summary.byExchange).map(([exchange, data]) => `
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
          legend: { position: 'bottom' }
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
        plugins: { legend: { position: 'top' } },
        scales: { x: { stacked: true }, y: { stacked: true } }
      }
    });

    // Signal Chart
    const signalData = ${JSON.stringify(Object.entries(summary.bySignal).sort((a, b) => b[1] - a[1]).slice(0, 15))};
    new Chart(document.getElementById('signalChart'), {
      type: 'bar',
      data: {
        labels: signalData.map(d => d[0]),
        datasets: [{
          label: 'Occurrences',
          data: signalData.map(d => d[1]),
          backgroundColor: '#6366f1',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } }
      }
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(reportPath, html);
  console.log(`HTML report saved to: ${reportPath}`);
}

function formatMarketCap(mc: number): string {
  if (mc >= 1_000_000_000_000) return `$${(mc / 1_000_000_000_000).toFixed(1)}T`;
  if (mc >= 1_000_000_000) return `$${(mc / 1_000_000_000).toFixed(1)}B`;
  if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(1)}M`;
  return `$${mc.toLocaleString()}`;
}

// Print summary to console
function printSummary(summary: EvaluationSummary): void {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    EVALUATION SUMMARY                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Total Stocks Evaluated: ${summary.evaluated.toLocaleString()}`);
  console.log(`Errors: ${summary.errors}`);
  console.log(`Duration: ${summary.durationSeconds.toFixed(1)} seconds\n`);

  console.log('Risk Level Distribution:');
  console.log(`  🟢 LOW:     ${summary.byRiskLevel.LOW.toLocaleString().padStart(6)} (${((summary.byRiskLevel.LOW / summary.evaluated) * 100).toFixed(1)}%)`);
  console.log(`  🟡 MEDIUM:  ${summary.byRiskLevel.MEDIUM.toLocaleString().padStart(6)} (${((summary.byRiskLevel.MEDIUM / summary.evaluated) * 100).toFixed(1)}%)`);
  console.log(`  🔴 HIGH:    ${summary.byRiskLevel.HIGH.toLocaleString().padStart(6)} (${((summary.byRiskLevel.HIGH / summary.evaluated) * 100).toFixed(1)}%)`);
  console.log(`  ⚪ OTHER:   ${summary.byRiskLevel.INSUFFICIENT.toLocaleString().padStart(6)} (${((summary.byRiskLevel.INSUFFICIENT / summary.evaluated) * 100).toFixed(1)}%)`);

  console.log('\nTop Risk Signals:');
  Object.entries(summary.bySignal)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([signal, count]) => {
      console.log(`  ${signal.padEnd(25)} ${count.toLocaleString().padStart(6)}`);
    });

  console.log('\nTop 10 HIGH Risk Stocks:');
  summary.topHighRisk.slice(0, 10).forEach((stock, i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. ${stock.symbol.padEnd(6)} (Score: ${stock.totalScore}) - ${stock.signalSummary}`);
  });
}

// Parse command line arguments
const args = process.argv.slice(2);
const limit = args.find(a => a.startsWith('--limit='))?.split('=')[1];

// Run evaluation
evaluateAllStocks({
  limit: limit ? parseInt(limit) : undefined,
  batchSize: 50,
  saveInterval: 200,
}).catch(console.error);
