/**
 * Deep Analysis of Pump-and-Dump and Volume Explosion Stocks
 *
 * This script analyzes the flagged stocks to identify:
 * 1. Large-cap stocks that may have legitimate reasons (news, earnings)
 * 2. True micro-cap manipulation candidates
 * 3. Stocks with multiple overlapping signals (highest confidence)
 */

import * as fs from 'fs';
import * as path from 'path';

const RESULTS_DIR = path.join(__dirname, '..', 'results');

interface Signal {
  code: string;
  category: string;
  weight: number;
  description: string;
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
  signals: Signal[];
  signalSummary: string;
}

// Classification thresholds
const LARGE_CAP_THRESHOLD = 1_000_000_000; // $1B
const MID_CAP_THRESHOLD = 300_000_000; // $300M
const MICRO_CAP_THRESHOLD = 50_000_000; // $50M

// Load evaluation results
function loadResults(): EvaluationResult[] {
  const files = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith('evaluation-real-data-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error('No evaluation results found');
    process.exit(1);
  }

  const filePath = path.join(RESULTS_DIR, files[0]);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// Categorize by market cap
function categorizeByMarketCap(marketCap: number | null): string {
  if (!marketCap || marketCap <= 0) return 'Unknown';
  if (marketCap >= LARGE_CAP_THRESHOLD) return 'Large Cap (>$1B)';
  if (marketCap >= MID_CAP_THRESHOLD) return 'Mid Cap ($300M-$1B)';
  if (marketCap >= MICRO_CAP_THRESHOLD) return 'Small Cap ($50M-$300M)';
  return 'Micro Cap (<$50M)';
}

// Check if stock has multiple high-confidence signals
function getConfidenceLevel(stock: EvaluationResult): string {
  const signals = stock.signals.map(s => s.code);
  const hasPatternSignals = signals.filter(s =>
    ['SPIKE_THEN_DROP', 'VOLUME_EXPLOSION', 'SPIKE_7D'].includes(s)
  ).length;
  const hasStructuralSignals = signals.filter(s =>
    ['MICROCAP_PRICE', 'SMALL_MARKET_CAP', 'MICRO_LIQUIDITY'].includes(s)
  ).length;

  if (hasPatternSignals >= 2 && hasStructuralSignals >= 2) return 'VERY HIGH';
  if (hasPatternSignals >= 2 || (hasPatternSignals >= 1 && hasStructuralSignals >= 2)) return 'HIGH';
  if (hasPatternSignals >= 1 && hasStructuralSignals >= 1) return 'MEDIUM';
  return 'LOW';
}

// Industries/sectors that commonly have volatile stocks
const VOLATILE_SECTORS = [
  'cannabis', 'marijuana', 'weed',
  'biotech', 'pharmaceutical', 'therapeutics', 'bioscience',
  'crypto', 'bitcoin', 'blockchain',
  'spac', 'acquisition',
  'ev', 'electric vehicle',
  'space', 'aerospace',
  'ai', 'artificial intelligence',
];

function isVolatileSector(name: string): boolean {
  const nameLower = name.toLowerCase();
  return VOLATILE_SECTORS.some(sector => nameLower.includes(sector));
}

// Main analysis
function analyze() {
  const results = loadResults();

  // Get pump-and-dump stocks
  const pumpAndDump = results.filter(r =>
    r.signals.some(s => s.code === 'SPIKE_THEN_DROP')
  );

  // Get volume explosion stocks
  const volumeExplosion = results.filter(r =>
    r.signals.some(s => s.code === 'VOLUME_EXPLOSION')
  );

  // Get stocks with BOTH signals (highest concern)
  const bothSignals = results.filter(r =>
    r.signals.some(s => s.code === 'SPIKE_THEN_DROP') &&
    r.signals.some(s => s.code === 'VOLUME_EXPLOSION')
  );

  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           DEEP ANALYSIS: Pump-and-Dump & Volume Explosion Stocks          ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`Total Pump-and-Dump Pattern Stocks: ${pumpAndDump.length}`);
  console.log(`Total Volume Explosion Stocks: ${volumeExplosion.length}`);
  console.log(`Stocks with BOTH signals: ${bothSignals.length}\n`);

  // ========== SECTION 1: LARGE CAP ANALYSIS ==========
  console.log('\n' + '='.repeat(80));
  console.log('SECTION 1: LARGE CAP STOCKS (Market Cap > $1B) - LIKELY LEGITIMATE');
  console.log('='.repeat(80));
  console.log('These are established companies. Their patterns are likely due to:');
  console.log('- Earnings announcements');
  console.log('- Major news events');
  console.log('- Sector-wide movements');
  console.log('- Legitimate market volatility');
  console.log('-'.repeat(80));

  const largeCap = pumpAndDump.filter(s => s.marketCap && s.marketCap >= LARGE_CAP_THRESHOLD);
  largeCap.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

  console.log(`\nFound ${largeCap.length} large-cap stocks with pump-and-dump patterns:\n`);

  largeCap.forEach((stock, i) => {
    const mcStr = stock.marketCap ? `$${(stock.marketCap / 1_000_000_000).toFixed(2)}B` : 'N/A';
    const volatileSector = isVolatileSector(stock.name) ? ' [VOLATILE SECTOR]' : '';
    console.log(`${(i+1).toString().padStart(2)}. ${stock.symbol.padEnd(6)} | ${mcStr.padStart(10)} | ${stock.name.substring(0, 40)}${volatileSector}`);
    console.log(`    Signals: ${stock.signalSummary}`);
    console.log(`    Price: $${stock.lastPrice?.toFixed(2)} | Score: ${stock.totalScore}`);
    console.log('');
  });

  // ========== SECTION 2: MID CAP ANALYSIS ==========
  console.log('\n' + '='.repeat(80));
  console.log('SECTION 2: MID CAP STOCKS ($300M - $1B) - MIXED RISK');
  console.log('='.repeat(80));
  console.log('These require individual investigation. Some may be legitimate volatility,');
  console.log('others could be manipulation targets.');
  console.log('-'.repeat(80));

  const midCap = pumpAndDump.filter(s =>
    s.marketCap && s.marketCap >= MID_CAP_THRESHOLD && s.marketCap < LARGE_CAP_THRESHOLD
  );
  midCap.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

  console.log(`\nFound ${midCap.length} mid-cap stocks with pump-and-dump patterns:\n`);

  midCap.forEach((stock, i) => {
    const mcStr = stock.marketCap ? `$${(stock.marketCap / 1_000_000).toFixed(0)}M` : 'N/A';
    const confidence = getConfidenceLevel(stock);
    const volatileSector = isVolatileSector(stock.name) ? ' [VOLATILE SECTOR]' : '';
    console.log(`${(i+1).toString().padStart(2)}. ${stock.symbol.padEnd(6)} | ${mcStr.padStart(8)} | Confidence: ${confidence.padEnd(9)} | ${stock.name.substring(0, 35)}${volatileSector}`);
  });

  // ========== SECTION 3: HIGH CONFIDENCE MANIPULATION CANDIDATES ==========
  console.log('\n' + '='.repeat(80));
  console.log('SECTION 3: HIGH CONFIDENCE MANIPULATION CANDIDATES');
  console.log('='.repeat(80));
  console.log('Stocks with MULTIPLE warning signals AND small market cap.');
  console.log('These are the most likely manipulation targets.');
  console.log('-'.repeat(80));

  // Stocks with both pump-and-dump AND volume explosion
  console.log(`\n### HIGHEST RISK: Both Pump-and-Dump AND Volume Explosion (${bothSignals.length} stocks)\n`);

  bothSignals.sort((a, b) => b.totalScore - a.totalScore);
  bothSignals.slice(0, 30).forEach((stock, i) => {
    const mcStr = stock.marketCap ?
      (stock.marketCap >= 1_000_000_000 ? `$${(stock.marketCap / 1_000_000_000).toFixed(2)}B` :
       `$${(stock.marketCap / 1_000_000).toFixed(0)}M`) : 'N/A';
    const capCategory = categorizeByMarketCap(stock.marketCap);
    console.log(`${(i+1).toString().padStart(2)}. ${stock.symbol.padEnd(6)} | Score: ${stock.totalScore.toString().padStart(2)} | ${mcStr.padStart(8)} | ${capCategory}`);
    console.log(`    ${stock.name.substring(0, 60)}`);
    console.log(`    Signals: ${stock.signalSummary}`);
    console.log('');
  });

  // ========== SECTION 4: MICRO CAP ANALYSIS ==========
  console.log('\n' + '='.repeat(80));
  console.log('SECTION 4: MICRO CAP STOCKS (<$50M) - HIGHEST MANIPULATION RISK');
  console.log('='.repeat(80));
  console.log('These are prime pump-and-dump targets due to low liquidity.');
  console.log('-'.repeat(80));

  const microCap = pumpAndDump.filter(s =>
    !s.marketCap || s.marketCap < MICRO_CAP_THRESHOLD
  );
  microCap.sort((a, b) => b.totalScore - a.totalScore);

  console.log(`\nFound ${microCap.length} micro-cap stocks with pump-and-dump patterns (Top 50):\n`);

  microCap.slice(0, 50).forEach((stock, i) => {
    const mcStr = stock.marketCap ? `$${(stock.marketCap / 1_000_000).toFixed(1)}M` : 'N/A';
    const confidence = getConfidenceLevel(stock);
    console.log(`${(i+1).toString().padStart(2)}. ${stock.symbol.padEnd(6)} | Score: ${stock.totalScore.toString().padStart(2)} | ${mcStr.padStart(8)} | Conf: ${confidence.padEnd(9)} | $${stock.lastPrice?.toFixed(2)}`);
    console.log(`    ${stock.name.substring(0, 55)}`);
    console.log(`    Signals: ${stock.signalSummary}`);
  });

  // ========== SECTION 5: VOLUME EXPLOSION WITHOUT PUMP PATTERN ==========
  console.log('\n' + '='.repeat(80));
  console.log('SECTION 5: VOLUME EXPLOSION ONLY (No Pump-and-Dump Pattern Yet)');
  console.log('='.repeat(80));
  console.log('These stocks have unusual volume but have NOT yet shown the "dump" phase.');
  console.log('They could be in the EARLY STAGES of a pump scheme.');
  console.log('-'.repeat(80));

  const volumeOnly = volumeExplosion.filter(s =>
    !s.signals.some(sig => sig.code === 'SPIKE_THEN_DROP')
  );
  volumeOnly.sort((a, b) => b.totalScore - a.totalScore);

  console.log(`\nFound ${volumeOnly.length} stocks with volume explosion but NO dump yet:\n`);

  volumeOnly.forEach((stock, i) => {
    const mcStr = stock.marketCap ?
      (stock.marketCap >= 1_000_000_000 ? `$${(stock.marketCap / 1_000_000_000).toFixed(2)}B` :
       `$${(stock.marketCap / 1_000_000).toFixed(0)}M`) : 'N/A';
    const capCategory = categorizeByMarketCap(stock.marketCap);
    console.log(`${(i+1).toString().padStart(2)}. ${stock.symbol.padEnd(6)} | Score: ${stock.totalScore.toString().padStart(2)} | ${mcStr.padStart(8)} | ${capCategory}`);
    console.log(`    ${stock.name.substring(0, 60)}`);
    console.log(`    Signals: ${stock.signalSummary}`);
    console.log('');
  });

  // ========== SUMMARY STATISTICS ==========
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY STATISTICS');
  console.log('='.repeat(80));

  // Market cap distribution of pump-and-dump stocks
  const capDistribution = {
    'Large Cap (>$1B)': largeCap.length,
    'Mid Cap ($300M-$1B)': midCap.length,
    'Small Cap ($50M-$300M)': pumpAndDump.filter(s =>
      s.marketCap && s.marketCap >= MICRO_CAP_THRESHOLD && s.marketCap < MID_CAP_THRESHOLD
    ).length,
    'Micro Cap (<$50M)': microCap.length,
  };

  console.log('\nPump-and-Dump Stocks by Market Cap:');
  Object.entries(capDistribution).forEach(([cap, count]) => {
    const pct = ((count / pumpAndDump.length) * 100).toFixed(1);
    console.log(`  ${cap.padEnd(25)}: ${count.toString().padStart(3)} (${pct}%)`);
  });

  // Confidence level distribution
  const confidenceDistribution = {
    'VERY HIGH': pumpAndDump.filter(s => getConfidenceLevel(s) === 'VERY HIGH').length,
    'HIGH': pumpAndDump.filter(s => getConfidenceLevel(s) === 'HIGH').length,
    'MEDIUM': pumpAndDump.filter(s => getConfidenceLevel(s) === 'MEDIUM').length,
    'LOW': pumpAndDump.filter(s => getConfidenceLevel(s) === 'LOW').length,
  };

  console.log('\nPump-and-Dump Stocks by Confidence Level:');
  Object.entries(confidenceDistribution).forEach(([level, count]) => {
    const pct = ((count / pumpAndDump.length) * 100).toFixed(1);
    console.log(`  ${level.padEnd(10)}: ${count.toString().padStart(3)} (${pct}%)`);
  });

  // Volatile sector analysis
  const volatileSectorCount = pumpAndDump.filter(s => isVolatileSector(s.name)).length;
  console.log(`\nStocks in naturally volatile sectors (biotech, cannabis, crypto, etc.): ${volatileSectorCount} (${((volatileSectorCount / pumpAndDump.length) * 100).toFixed(1)}%)`);

  // Final recommendations
  console.log('\n' + '='.repeat(80));
  console.log('RECOMMENDATIONS FOR PRESS RELEASE');
  console.log('='.repeat(80));

  const trulyHighRisk = pumpAndDump.filter(s => {
    const isMicroOrSmall = !s.marketCap || s.marketCap < MID_CAP_THRESHOLD;
    const hasMultipleSignals = s.totalScore >= 8;
    const notVolatileSector = !isVolatileSector(s.name);
    return isMicroOrSmall && hasMultipleSignals;
  });

  console.log(`\n1. REMOVE from manipulation count: ${largeCap.length} large-cap stocks`);
  console.log(`   These are likely legitimate market movements.\n`);

  console.log(`2. FLAG for investigation: ${midCap.length} mid-cap stocks`);
  console.log(`   Require individual review.\n`);

  console.log(`3. HIGH CONFIDENCE manipulation candidates: ${trulyHighRisk.length} stocks`);
  console.log(`   Small/micro cap with multiple warning signals.\n`);

  console.log(`4. WATCH LIST (early stage): ${volumeOnly.length} stocks`);
  console.log(`   Volume explosion but no dump yet - could be developing.\n`);

  // Revised numbers for press release
  const revisedHighConfidence = trulyHighRisk.length + bothSignals.filter(s =>
    !s.marketCap || s.marketCap < LARGE_CAP_THRESHOLD
  ).length;

  console.log('REVISED STATISTICS FOR PRESS:');
  console.log(`  - Total pump-and-dump patterns detected: ${pumpAndDump.length}`);
  console.log(`  - Likely legitimate (large cap): ${largeCap.length}`);
  console.log(`  - High-confidence manipulation: ${trulyHighRisk.length}`);
  console.log(`  - Volume explosions (potential early-stage): ${volumeOnly.length}`);
  console.log(`  - Stocks with BOTH signals: ${bothSignals.length}`);
}

analyze();
