/**
 * Live Stock Evaluation Script - Finnhub Primary
 *
 * Runs the ScamDunk risk scoring model on all US stocks using Finnhub API.
 * Finnhub free tier: 60 requests/minute = ~2 hours for 7000 stocks
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

import { computeRiskScore, MarketData, PriceHistory, StockQuote } from './standalone-scorer';

const DATA_DIR = path.join(__dirname, '..', 'data');
const RESULTS_DIR = path.join(__dirname, '..', 'results');

// Finnhub settings (free tier: 60 requests/minute)
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const FINNHUB_DELAY_MS = 1050; // ~57 requests/minute (safe margin)
const REQUEST_TIMEOUT_MS = 15000;
const BATCH_SIZE = 50;

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
  signals: { code: string; category: string; weight: number; description: string }[];
  signalSummary: string;
  evaluatedAt: string;
  priceDataSource: string;
}

interface ComparisonResult {
  symbol: string;
  name: string;
  exchange: string;
  previousRisk: string;
  currentRisk: string;
  previousScore: number;
  currentScore: number;
  changeType: string;
  previousSignals: string;
  currentSignals: string;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function progressBar(current: number, total: number): string {
  const width = 40;
  const percent = current / total;
  const filled = Math.round(width * percent);
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${(percent * 100).toFixed(1)}%`;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// Fetch from Finnhub
async function fetchFinnhubData(symbol: string): Promise<PriceHistory[] | null> {
  if (!FINNHUB_API_KEY) return null;

  return new Promise((resolve) => {
    const to = Math.floor(Date.now() / 1000);
    const from = to - (60 * 24 * 60 * 60); // 60 days

    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;

    const req = https.get(url, { timeout: REQUEST_TIMEOUT_MS }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 429) {
            console.log('\n⚠️ Finnhub rate limit hit, waiting 60s...');
            resolve(null);
            return;
          }
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }

          const json = JSON.parse(data);
          if (json.s !== 'ok' || !json.t || !json.o || !json.h || !json.l || !json.c || !json.v) {
            resolve(null);
            return;
          }

          const priceHistory: PriceHistory[] = [];
          for (let i = 0; i < json.t.length; i++) {
            if (json.o[i] == null || json.h[i] == null || json.l[i] == null || json.c[i] == null || json.v[i] == null) continue;
            const date = new Date(json.t[i] * 1000);
            priceHistory.push({
              date: date.toISOString().split('T')[0],
              open: json.o[i],
              high: json.h[i],
              low: json.l[i],
              close: json.c[i],
              volume: json.v[i],
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

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function createMarketData(stock: StockTicker, priceHistory: PriceHistory[]): MarketData {
  const avgVolume30d = priceHistory.slice(-30).reduce((sum, day) => sum + day.volume, 0) / Math.min(priceHistory.length, 30);
  const lastPrice = priceHistory[priceHistory.length - 1].close;

  return {
    quote: {
      ticker: stock.symbol,
      companyName: stock.name,
      exchange: stock.exchange,
      lastPrice,
      marketCap: stock.marketCap || 0,
      avgVolume30d,
      avgDollarVolume30d: avgVolume30d * lastPrice,
    },
    priceHistory,
    isOTC: stock.isOTC || ['OTC', 'OTCQX', 'OTCQB', 'PINK', 'GREY'].some(ex => stock.exchange.toUpperCase().includes(ex)),
    dataAvailable: true,
  };
}

interface Checkpoint {
  results: EvaluationResult[];
  skipped: string[];
  successCount: number;
}

function loadCheckpoint(path: string): Checkpoint {
  if (fs.existsSync(path)) {
    try {
      return JSON.parse(fs.readFileSync(path, 'utf-8'));
    } catch { }
  }
  return { results: [], skipped: [], successCount: 0 };
}

function saveCheckpoint(checkpoint: Checkpoint, path: string): void {
  fs.writeFileSync(path, JSON.stringify(checkpoint, null, 2));
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║     ScamDunk US Stock Evaluation - FINNHUB (60 req/min free tier)        ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  if (!FINNHUB_API_KEY) {
    console.error('❌ FINNHUB_API_KEY not set. Export it and try again.');
    process.exit(1);
  }
  console.log('✓ Finnhub API key configured\n');

  const stocksPath = path.join(DATA_DIR, 'us-stocks.json');
  if (!fs.existsSync(stocksPath)) {
    console.error('Stock list not found.');
    process.exit(1);
  }

  let stocks: StockTicker[] = JSON.parse(fs.readFileSync(stocksPath, 'utf-8'));
  const limitArg = process.argv.find(a => a.startsWith('--limit='))?.split('=')[1];
  if (limitArg) {
    stocks = stocks.slice(0, parseInt(limitArg));
    console.log(`Limited to ${stocks.length} stocks`);
  }

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().split('T')[0];
  const checkpointPath = path.join(RESULTS_DIR, `checkpoint-finnhub-${timestamp}.json`);

  let checkpoint = loadCheckpoint(checkpointPath);
  const noResume = process.argv.includes('--no-resume');
  if (noResume) checkpoint = { results: [], skipped: [], successCount: 0 };

  let startIndex = checkpoint.results.length + checkpoint.skipped.length;
  let results = checkpoint.results;
  let skipped = checkpoint.skipped;
  let successCount = checkpoint.successCount;

  if (startIndex > 0) {
    console.log(`📂 Resuming: ${results.length} done, ${skipped.length} skipped\n`);
  }

  const remaining = stocks.length - startIndex;
  const estTime = (remaining * FINNHUB_DELAY_MS) / 1000;
  console.log(`📊 Processing ${remaining} stocks @ ~57/min`);
  console.log(`⏱️  Estimated time: ${formatTime(estTime)}\n`);

  const startTime = Date.now();

  for (let i = startIndex; i < stocks.length; i++) {
    const stock = stocks[i];
    const priceHistory = await fetchFinnhubData(stock.symbol);

    if (priceHistory === null) {
      skipped.push(stock.symbol);
    } else {
      successCount++;
      const marketData = createMarketData(stock, priceHistory);
      const scoring = computeRiskScore(marketData);

      results.push({
        symbol: stock.symbol,
        name: stock.name,
        exchange: stock.exchange,
        sector: stock.sector || 'Unknown',
        industry: stock.industry || 'Unknown',
        marketCap: stock.marketCap || null,
        lastPrice: marketData.quote.lastPrice,
        riskLevel: scoring.riskLevel,
        totalScore: scoring.totalScore,
        isLegitimate: scoring.isLegitimate,
        isInsufficient: scoring.isInsufficient,
        signals: scoring.signals.map(s => ({ code: s.code, category: s.category, weight: s.weight, description: s.description })),
        signalSummary: scoring.signals.map(s => s.code).join(', ') || 'None',
        evaluatedAt: new Date().toISOString(),
        priceDataSource: 'finnhub',
      });
    }

    const progress = i + 1;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (progress - startIndex) / elapsed;
    const eta = rate > 0 ? (stocks.length - progress) / rate : 0;

    process.stdout.write(`\r${progressBar(progress, stocks.length)} ${progress}/${stocks.length} | ✓${successCount} ✗${skipped.length} | ETA: ${formatTime(eta)}  `);

    if ((i + 1) % BATCH_SIZE === 0) {
      saveCheckpoint({ results, skipped, successCount }, checkpointPath);
    }

    if (i < stocks.length - 1) {
      await delay(FINNHUB_DELAY_MS);
    }
  }

  console.log('\n\n✅ Evaluation complete!\n');

  if (fs.existsSync(checkpointPath)) fs.unlinkSync(checkpointPath);

  // Save results
  const resultsPath = path.join(RESULTS_DIR, `evaluation-finnhub-${timestamp}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`📄 Results: ${resultsPath}`);

  const summaryPath = path.join(RESULTS_DIR, `summary-finnhub-${timestamp}.json`);
  const summary = {
    totalStocks: stocks.length,
    evaluated: results.length,
    skipped: skipped.length,
    byRiskLevel: {
      LOW: results.filter(r => r.riskLevel === 'LOW').length,
      MEDIUM: results.filter(r => r.riskLevel === 'MEDIUM').length,
      HIGH: results.filter(r => r.riskLevel === 'HIGH').length,
    },
    byExchange: {} as Record<string, { total: number; HIGH: number }>,
    topHighRisk: results.filter(r => r.riskLevel === 'HIGH').sort((a, b) => b.totalScore - a.totalScore).slice(0, 50),
    evaluationDate: new Date().toISOString(),
  };

  for (const r of results) {
    if (!summary.byExchange[r.exchange]) summary.byExchange[r.exchange] = { total: 0, HIGH: 0 };
    summary.byExchange[r.exchange].total++;
    if (r.riskLevel === 'HIGH') summary.byExchange[r.exchange].HIGH++;
  }

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`📊 Summary: ${summaryPath}`);

  // Save CSVs
  const highRisk = results.filter(r => r.riskLevel === 'HIGH');
  const highCsv = 'Symbol,Name,Exchange,MarketCap,Price,Score,Signals\n' +
    highRisk.map(r => `"${r.symbol}","${r.name.replace(/"/g, '""')}","${r.exchange}",${r.marketCap || ''},${r.lastPrice || ''},${r.totalScore},"${r.signalSummary}"`).join('\n');
  fs.writeFileSync(path.join(RESULTS_DIR, `high-risk-finnhub-${timestamp}.csv`), highCsv);

  const medRisk = results.filter(r => r.riskLevel === 'MEDIUM');
  const medCsv = 'Symbol,Name,Exchange,MarketCap,Price,Score,Signals\n' +
    medRisk.map(r => `"${r.symbol}","${r.name.replace(/"/g, '""')}","${r.exchange}",${r.marketCap || ''},${r.lastPrice || ''},${r.totalScore},"${r.signalSummary}"`).join('\n');
  fs.writeFileSync(path.join(RESULTS_DIR, `medium-risk-finnhub-${timestamp}.csv`), medCsv);

  const lowRisk = results.filter(r => r.riskLevel === 'LOW');
  const lowCsv = 'Symbol,Name,Exchange,MarketCap,Price,Score,IsLegitimate\n' +
    lowRisk.map(r => `"${r.symbol}","${r.name.replace(/"/g, '""')}","${r.exchange}",${r.marketCap || ''},${r.lastPrice || ''},${r.totalScore},${r.isLegitimate}`).join('\n');
  fs.writeFileSync(path.join(RESULTS_DIR, `low-risk-finnhub-${timestamp}.csv`), lowCsv);

  console.log(`🔴 HIGH risk: ${highRisk.length} stocks`);
  console.log(`🟡 MEDIUM risk: ${medRisk.length} stocks`);
  console.log(`🟢 LOW risk: ${lowRisk.length} stocks`);

  // Comparison with Jan 1st
  const jan1Path = path.join(RESULTS_DIR, 'evaluation-2026-01-01.json');
  if (fs.existsSync(jan1Path)) {
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('                    COMPARISON: Jan 1st vs Today                    ');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    const jan1: EvaluationResult[] = JSON.parse(fs.readFileSync(jan1Path, 'utf-8'));
    const jan1Map = new Map(jan1.filter(r => r.priceDataSource === 'yahoo').map(r => [r.symbol, r]));

    const riskOrder: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    const newHighRisk: ComparisonResult[] = [];
    const noLongerHigh: ComparisonResult[] = [];
    let increased = 0, decreased = 0;

    for (const curr of results) {
      const prev = jan1Map.get(curr.symbol);
      if (!prev) continue;

      const prevRisk = riskOrder[prev.riskLevel] ?? -1;
      const currRisk = riskOrder[curr.riskLevel] ?? -1;

      if (currRisk > prevRisk && prevRisk >= 0) {
        increased++;
        if (curr.riskLevel === 'HIGH' && prev.riskLevel !== 'HIGH') {
          newHighRisk.push({ symbol: curr.symbol, name: curr.name, exchange: curr.exchange, previousRisk: prev.riskLevel, currentRisk: curr.riskLevel, previousScore: prev.totalScore, currentScore: curr.totalScore, changeType: 'DOWNGRADED', previousSignals: prev.signalSummary, currentSignals: curr.signalSummary });
        }
      } else if (currRisk < prevRisk && currRisk >= 0) {
        decreased++;
        if (prev.riskLevel === 'HIGH' && curr.riskLevel !== 'HIGH') {
          noLongerHigh.push({ symbol: curr.symbol, name: curr.name, exchange: curr.exchange, previousRisk: prev.riskLevel, currentRisk: curr.riskLevel, previousScore: prev.totalScore, currentScore: curr.totalScore, changeType: 'UPGRADED', previousSignals: prev.signalSummary, currentSignals: curr.signalSummary });
        }
      }
    }

    const jan1High = jan1.filter(r => r.riskLevel === 'HIGH' && r.priceDataSource === 'yahoo').length;
    const currHigh = results.filter(r => r.riskLevel === 'HIGH').length;

    console.log(`Jan 1st HIGH risk: ${jan1High}`);
    console.log(`Today HIGH risk:   ${currHigh} (${currHigh > jan1High ? '+' : ''}${currHigh - jan1High})`);
    console.log(`\n🔺 Risk INCREASED: ${increased} stocks`);
    console.log(`🔻 Risk DECREASED: ${decreased} stocks`);
    console.log(`🆕 NEW HIGH risk:  ${newHighRisk.length} stocks`);
    console.log(`✅ No longer HIGH: ${noLongerHigh.length} stocks`);

    if (newHighRisk.length > 0) {
      console.log('\n🆕 NEW HIGH RISK STOCKS:');
      newHighRisk.slice(0, 20).forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.symbol.padEnd(8)} ${s.previousRisk} → ${s.currentRisk} (${s.previousScore} → ${s.currentScore})`);
      });
    }

    if (noLongerHigh.length > 0) {
      console.log('\n✅ NO LONGER HIGH RISK:');
      noLongerHigh.slice(0, 20).forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.symbol.padEnd(8)} ${s.previousRisk} → ${s.currentRisk} (${s.previousScore} → ${s.currentScore})`);
      });
    }

    // Save comparison
    const compPath = path.join(RESULTS_DIR, `comparison-jan1-vs-${timestamp}.json`);
    fs.writeFileSync(compPath, JSON.stringify({ newHighRisk, noLongerHigh, increased, decreased, jan1High, currentHigh: currHigh }, null, 2));
    console.log(`\n📋 Comparison saved: ${compPath}`);
  }

  console.log('\n✅ DONE!');
}

main().catch(console.error);
