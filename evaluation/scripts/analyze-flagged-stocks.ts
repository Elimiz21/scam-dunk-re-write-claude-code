/**
 * Targeted Analysis Script - Flagged Stocks Only
 *
 * Runs full pattern analysis (including historical signals like SPIKE_7D,
 * SPIKE_THEN_DROP, HIGH_VOLATILITY, etc.) on specific stocks that were
 * previously identified as high-risk and/or being promoted on social media.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Import the full scoring module
import { computeRiskScore, MarketData, PriceHistory, StockQuote } from './standalone-scorer';

// Use curl to bypass Node.js DNS issues
function curlFetch(url: string): string | null {
  try {
    const result = execSync(
      `curl -s --max-time 15 -H "User-Agent: Mozilla/5.0" "${url}"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    return result;
  } catch {
    return null;
  }
}

// Stocks to analyze - previously flagged as high-risk with social media promotion
const FLAGGED_STOCKS = [
  { symbol: 'SIDU', name: 'Sidus Space Inc', exchange: 'NASDAQ' },
  { symbol: 'OPTX', name: 'Syntec Optics Holdings Inc', exchange: 'NASDAQ' },
  { symbol: 'SOBR', name: 'Sobr Safe Inc', exchange: 'NASDAQ' },
  { symbol: 'SOS', name: 'SOS Limited', exchange: 'NYSE' },
  { symbol: 'GDHG', name: 'Golden Heaven Group Holdings Ltd', exchange: 'NASDAQ' },
  { symbol: 'EDHL', name: 'Everbright Digital Holding Ltd', exchange: 'NASDAQ' },
  { symbol: 'WAI', name: 'Top KingWin Ltd', exchange: 'NASDAQ' },
  { symbol: 'CIGL', name: 'Concorde International Group Ltd', exchange: 'NASDAQ' },
];

const RESULTS_DIR = path.join(__dirname, '..', 'results');

interface AnalysisResult {
  symbol: string;
  name: string;
  exchange: string;
  currentPrice: number;
  marketCap: number;
  riskLevel: string;
  totalScore: number;
  signals: {
    code: string;
    category: string;
    weight: number;
    description: string;
  }[];
  priceChange7d: number;
  priceChange30d: number;
  volumeVsAvg: number;
  analyzedAt: string;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchYahooData(symbol: string): { priceHistory: PriceHistory[], quote: any } | null {
  const endDate = Math.floor(Date.now() / 1000);
  const startDate = endDate - (90 * 24 * 60 * 60); // 90 days of history

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${startDate}&period2=${endDate}&interval=1d&events=history`;

  const data = curlFetch(url);
  if (!data) return null;

  try {
    const json = JSON.parse(data);
    const result = json.chart?.result?.[0];

    if (!result?.timestamp || !result?.indicators?.quote?.[0]) {
      return null;
    }

    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    const meta = result.meta;
    const priceHistory: PriceHistory[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close?.[i] != null && quote.volume?.[i] != null) {
        priceHistory.push({
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          open: quote.open[i] || quote.close[i],
          high: quote.high[i] || quote.close[i],
          low: quote.low[i] || quote.close[i],
          close: quote.close[i],
          volume: quote.volume[i],
        });
      }
    }

    return {
      priceHistory,
      quote: {
        regularMarketPrice: meta.regularMarketPrice,
        marketCap: meta.marketCap || 0,
        regularMarketVolume: meta.regularMarketVolume || 0,
      }
    };
  } catch {
    return null;
  }
}

function analyzeStock(stock: { symbol: string; name: string; exchange: string }): AnalysisResult | null {
  console.log(`  Fetching data for ${stock.symbol}...`);

  const data = fetchYahooData(stock.symbol);
  if (!data || data.priceHistory.length < 14) {
    console.log(`    Failed to get data for ${stock.symbol}`);
    return null;
  }

  const { priceHistory, quote } = data;
  const lastPrice = priceHistory[priceHistory.length - 1].close;
  const avgVolume30d = priceHistory.slice(-30).reduce((sum, day) => sum + day.volume, 0) / Math.min(priceHistory.length, 30);

  // Calculate price changes
  const price7dAgo = priceHistory.length >= 7 ? priceHistory[priceHistory.length - 7].close : lastPrice;
  const price30dAgo = priceHistory.length >= 30 ? priceHistory[priceHistory.length - 30].close : lastPrice;
  const priceChange7d = ((lastPrice - price7dAgo) / price7dAgo) * 100;
  const priceChange30d = ((lastPrice - price30dAgo) / price30dAgo) * 100;

  // Calculate volume vs average
  const todayVolume = priceHistory[priceHistory.length - 1].volume;
  const volumeVsAvg = avgVolume30d > 0 ? todayVolume / avgVolume30d : 1;

  const stockQuote: StockQuote = {
    ticker: stock.symbol,
    companyName: stock.name,
    exchange: stock.exchange,
    lastPrice: lastPrice,
    marketCap: quote.marketCap || 0,
    avgVolume30d: avgVolume30d,
    avgDollarVolume30d: avgVolume30d * lastPrice,
  };

  const marketData: MarketData = {
    quote: stockQuote,
    priceHistory,
    isOTC: false,
    dataAvailable: true,
  };

  const scoringResult = computeRiskScore(marketData);

  return {
    symbol: stock.symbol,
    name: stock.name,
    exchange: stock.exchange,
    currentPrice: lastPrice,
    marketCap: quote.marketCap || 0,
    riskLevel: scoringResult.riskLevel,
    totalScore: scoringResult.totalScore,
    signals: scoringResult.signals.map(s => ({
      code: s.code,
      category: s.category,
      weight: s.weight,
      description: s.description,
    })),
    priceChange7d,
    priceChange30d,
    volumeVsAvg,
    analyzedAt: new Date().toISOString(),
  };
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   TARGETED ANALYSIS: Previously Flagged High-Risk Stocks                  ║');
  console.log('║   Full Pattern Analysis with Historical Data                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`Analyzing ${FLAGGED_STOCKS.length} stocks with full pattern detection...\n`);

  const results: AnalysisResult[] = [];

  for (const stock of FLAGGED_STOCKS) {
    const result = await analyzeStock(stock);
    if (result) {
      results.push(result);

      // Print immediate result
      const riskEmoji = result.riskLevel === 'HIGH' ? '🔴' : result.riskLevel === 'MEDIUM' ? '🟡' : '🟢';
      console.log(`    ${riskEmoji} ${result.symbol}: Score ${result.totalScore} (${result.riskLevel})`);
      console.log(`       Price: $${result.currentPrice.toFixed(2)} | 7d: ${result.priceChange7d >= 0 ? '+' : ''}${result.priceChange7d.toFixed(1)}% | 30d: ${result.priceChange30d >= 0 ? '+' : ''}${result.priceChange30d.toFixed(1)}%`);
      if (result.signals.length > 0) {
        console.log(`       Signals: ${result.signals.map(s => s.code).join(', ')}`);
      }
    }

    // Small delay between requests
    await delay(1500);
  }

  console.log('\n' + '═'.repeat(75));
  console.log('\nFULL RESULTS SUMMARY\n');

  // Sort by risk score
  results.sort((a, b) => b.totalScore - a.totalScore);

  // Print detailed results
  for (const result of results) {
    const riskEmoji = result.riskLevel === 'HIGH' ? '🔴' : result.riskLevel === 'MEDIUM' ? '🟡' : '🟢';
    console.log(`\n${riskEmoji} ${result.symbol} - ${result.name}`);
    console.log(`   Risk Level: ${result.riskLevel} (Score: ${result.totalScore})`);
    console.log(`   Current Price: $${result.currentPrice.toFixed(2)}`);
    console.log(`   Market Cap: $${(result.marketCap / 1000000).toFixed(1)}M`);
    console.log(`   7-Day Change: ${result.priceChange7d >= 0 ? '+' : ''}${result.priceChange7d.toFixed(1)}%`);
    console.log(`   30-Day Change: ${result.priceChange30d >= 0 ? '+' : ''}${result.priceChange30d.toFixed(1)}%`);
    console.log(`   Volume vs Avg: ${result.volumeVsAvg.toFixed(1)}x`);

    if (result.signals.length > 0) {
      console.log('   Risk Signals:');
      for (const signal of result.signals) {
        console.log(`     - ${signal.code}: ${signal.description} (+${signal.weight})`);
      }
    } else {
      console.log('   Risk Signals: None detected');
    }
  }

  // Save results
  const timestamp = new Date().toISOString().split('T')[0];
  const outputPath = path.join(RESULTS_DIR, `flagged-stocks-full-analysis-${timestamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n\n📄 Results saved to: ${outputPath}`);

  // Print comparison with January 8 structural-only analysis
  console.log('\n' + '═'.repeat(75));
  console.log('\nCOMPARISON: Full Pattern Analysis vs Structural-Only (Jan 8)\n');

  const jan8Results = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, 'summary-2026-01-08-finnhub.json'), 'utf-8'));

  console.log('Stock      | Jan 8 (Structural) | Today (Full Pattern) | Change');
  console.log('-'.repeat(75));

  for (const result of results) {
    const jan8Stock = jan8Results.results.find((r: any) => r.ticker === result.symbol);
    if (jan8Stock) {
      const change = result.totalScore - jan8Stock.totalScore;
      const changeStr = change > 0 ? `+${change}` : change.toString();
      console.log(`${result.symbol.padEnd(10)} | ${jan8Stock.riskLevel.padEnd(6)} (${jan8Stock.totalScore})         | ${result.riskLevel.padEnd(6)} (${result.totalScore})            | ${changeStr}`);
    }
  }
}

main().catch(console.error);
