/**
 * Filter Evaluation Results to Only Real Data
 *
 * Reads the existing evaluation results and regenerates summary/reports
 * excluding stocks that used mock data (only keeping Yahoo Finance data).
 */

import * as fs from 'fs';
import * as path from 'path';

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

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

// Find the latest evaluation file
function findLatestEvaluation(): string | null {
  const files = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith('evaluation-') && f.endsWith('.json'))
    .sort()
    .reverse();

  return files.length > 0 ? path.join(RESULTS_DIR, files[0]) : null;
}

// Generate summary from filtered results
function generateSummary(results: EvaluationResult[]): EvaluationSummary {
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
    totalStocks: results.length,
    evaluated: results.length,
    errors: results.filter(r => r.error).length,
    realDataCount: results.length,
    mockDataCount: 0,
    byRiskLevel,
    byExchange,
    bySector,
    bySignal,
    topHighRisk,
    legitimateStocks: results.filter(r => r.isLegitimate).length,
    evaluationDate: new Date().toISOString(),
    durationSeconds: 0,
  };
}

// Format market cap
function formatMarketCap(mc: number): string {
  if (mc >= 1_000_000_000_000) return `$${(mc / 1_000_000_000_000).toFixed(1)}T`;
  if (mc >= 1_000_000_000) return `$${(mc / 1_000_000_000).toFixed(1)}B`;
  if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(1)}M`;
  return `$${mc.toLocaleString()}`;
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

// Generate HTML report
function generateHTMLReport(results: EvaluationResult[], summary: EvaluationSummary, timestamp: string): void {
  const reportPath = path.join(REPORTS_DIR, `evaluation-report-real-data-${timestamp}.html`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ScamDunk US Stock Evaluation Report (Real Data Only) - ${timestamp}</title>
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
    .real-data-badge { background: #dcfce7; color: #166534; padding: 5px 15px; border-radius: 20px; display: inline-block; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🎯 ScamDunk US Stock Evaluation Report</h1>
      <p><span class="real-data-badge">✓ Real Yahoo Finance Data Only</span></p>
      <p>Evaluation Date: ${new Date(summary.evaluationDate).toLocaleString()} | Total Stocks: ${summary.totalStocks.toLocaleString()}</p>
    </header>

    <div class="summary-box">
      <h3>📊 Key Findings (Real Price Data Only)</h3>
      <p>Out of <strong>${summary.totalStocks.toLocaleString()}</strong> US stocks with real Yahoo Finance data:</p>
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
        This report includes ONLY stocks with real Yahoo Finance historical price data.
        Stocks with mock/fallback data have been excluded for accuracy.
      </p>
    </footer>
  </div>

  <script>
    // Risk Level Pie Chart
    new Chart(document.getElementById('riskPieChart'), {
      type: 'doughnut',
      data: {
        labels: ['LOW', 'MEDIUM', 'HIGH'],
        datasets: [{
          data: [${summary.byRiskLevel.LOW}, ${summary.byRiskLevel.MEDIUM}, ${summary.byRiskLevel.HIGH}],
          backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'],
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          title: { display: true, text: 'Risk Level Distribution (Real Data Only)' }
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

// Save filtered results
function saveFilteredResults(results: EvaluationResult[], summary: EvaluationSummary, timestamp: string): void {
  // Save filtered results JSON
  const resultsPath = path.join(RESULTS_DIR, `evaluation-real-data-${timestamp}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Filtered results saved to: ${resultsPath}`);

  // Save summary JSON
  const summaryPath = path.join(RESULTS_DIR, `summary-real-data-${timestamp}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`Summary saved to: ${summaryPath}`);

  // Save HIGH risk stocks CSV
  const highRiskPath = path.join(RESULTS_DIR, `high-risk-real-data-${timestamp}.csv`);
  const highRiskStocks = results.filter(r => r.riskLevel === 'HIGH');
  const highRiskCsv = 'Symbol,Name,Exchange,Sector,MarketCap,LastPrice,TotalScore,Signals\n' +
    highRiskStocks.map(r =>
      `"${r.symbol}","${(r.name || '').replace(/"/g, '""')}","${r.exchange}","${r.sector}",` +
      `${r.marketCap || ''},${r.lastPrice || ''},${r.totalScore},"${r.signalSummary}"`
    ).join('\n');
  fs.writeFileSync(highRiskPath, highRiskCsv);
  console.log(`HIGH risk stocks saved to: ${highRiskPath}`);
}

// Print summary
function printSummary(summary: EvaluationSummary, originalCount: number, filteredCount: number): void {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║       FILTERED EVALUATION SUMMARY (Real Data Only)         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Original Total: ${originalCount.toLocaleString()} stocks`);
  console.log(`Filtered (Real Data Only): ${filteredCount.toLocaleString()} stocks`);
  console.log(`Removed (Mock Data): ${(originalCount - filteredCount).toLocaleString()} stocks (${(((originalCount - filteredCount) / originalCount) * 100).toFixed(1)}%)\n`);

  console.log('Risk Level Distribution:');
  console.log(`  🟢 LOW:     ${summary.byRiskLevel.LOW.toLocaleString().padStart(6)} (${((summary.byRiskLevel.LOW / summary.evaluated) * 100).toFixed(1)}%)`);
  console.log(`  🟡 MEDIUM:  ${summary.byRiskLevel.MEDIUM.toLocaleString().padStart(6)} (${((summary.byRiskLevel.MEDIUM / summary.evaluated) * 100).toFixed(1)}%)`);
  console.log(`  🔴 HIGH:    ${summary.byRiskLevel.HIGH.toLocaleString().padStart(6)} (${((summary.byRiskLevel.HIGH / summary.evaluated) * 100).toFixed(1)}%)`);

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
    console.log(`  ${(i + 1).toString().padStart(2)}. ${stock.symbol.padEnd(6)} (Score: ${stock.totalScore}) - ${stock.signalSummary}`);
  });

  console.log('\nBy Exchange:');
  Object.entries(summary.byExchange)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([exchange, data]) => {
      console.log(`  ${exchange.padEnd(8)}: ${data.total.toLocaleString().padStart(5)} total | LOW: ${data.LOW.toLocaleString().padStart(5)} | MEDIUM: ${data.MEDIUM.toLocaleString().padStart(5)} | HIGH: ${data.HIGH.toLocaleString().padStart(5)} (${((data.HIGH / data.total) * 100).toFixed(1)}%)`);
    });

  console.log('\n');
}

// Main function
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Filter Evaluation Results (Real Data Only)            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Find latest evaluation file
  const evalPath = findLatestEvaluation();
  if (!evalPath) {
    console.error('No evaluation results found in', RESULTS_DIR);
    process.exit(1);
  }

  console.log(`Loading results from: ${evalPath}`);
  const allResults: EvaluationResult[] = JSON.parse(fs.readFileSync(evalPath, 'utf-8'));
  console.log(`Total stocks in file: ${allResults.length.toLocaleString()}`);

  // Filter to only real Yahoo Finance data
  const realDataResults = allResults.filter(r => r.priceDataSource === 'yahoo');
  console.log(`Stocks with real Yahoo Finance data: ${realDataResults.length.toLocaleString()}`);
  console.log(`Stocks with mock data (excluded): ${(allResults.length - realDataResults.length).toLocaleString()}`);

  // Generate new summary
  const summary = generateSummary(realDataResults);
  const timestamp = new Date().toISOString().split('T')[0];

  // Save results
  saveFilteredResults(realDataResults, summary, timestamp);
  generateHTMLReport(realDataResults, summary, timestamp);

  // Print summary
  printSummary(summary, allResults.length, realDataResults.length);
}

main().catch(console.error);
