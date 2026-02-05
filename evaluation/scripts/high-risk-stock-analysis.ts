/**
 * High-Risk Stock Analysis Script
 * Analyzes stocks flagged by ScamDunk as HIGH risk for pump-and-dump manipulation
 * Uses FMP API to fetch real price data
 *
 * Stocks from January 2026 ScamDunk Press Release
 */

import * as fs from 'fs';
import * as path from 'path';

const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';

interface StockConfig {
  symbol: string;
  name: string;
  promotionDate: string;
  promotionPrice: number | null; // null = calculate from historical data
  riskScore: number;
  sector: string;
  industry: string;
}

interface StockAnalysis {
  symbol: string;
  name: string;
  promotionDate: string;
  prePromotionPrice: number;
  promotionPrice: number;
  day1Price: number;
  peakDate: string;
  peakPrice: number;
  daysToPeak: number;
  gainToPeak: number;
  troughDate: string;
  troughPrice: number;
  daysToTrough: number;
  peakToTroughDecline: number;
  troughVsPrePromotion: number;
  troughVsDay1: number;
  currentPrice: number;
  currentDate: string;
  currentVsPrePromotion: number;
  currentVsDay1: number;
  currentVsPeak: number;
  riskScore: number;
  sector: string;
  industry: string;
  day1Outcome: 'GAIN' | 'LOSS' | 'BREAK-EVEN';
}

// All 15 HIGH-risk stocks from January 2026 ScamDunk Press Release
const STOCKS_TO_ANALYZE: StockConfig[] = [
  // 10 Confirmed Promoted Stocks
  {
    symbol: 'LVRO',
    name: 'Lavoro Limited',
    promotionDate: '2025-12-31',
    promotionPrice: 0.18,
    riskScore: 14,
    sector: 'Basic Materials',
    industry: 'Agricultural Inputs'
  },
  {
    symbol: 'SIDU',
    name: 'Sidus Space, Inc.',
    promotionDate: '2025-12-31',
    promotionPrice: 0.90,
    riskScore: 13,
    sector: 'Industrials',
    industry: 'Aerospace & Defense'
  },
  {
    symbol: 'ANPA',
    name: 'Rich Sparkle Holdings Limited',
    promotionDate: '2026-01-07',
    promotionPrice: 24.40,
    riskScore: 9,
    sector: 'Industrials',
    industry: 'Specialty Business Services'
  },
  {
    symbol: 'MRNO',
    name: 'Murano Global Investments PLC',
    promotionDate: '2025-12-31',
    promotionPrice: 0.55,
    riskScore: 12,
    sector: 'Real Estate',
    industry: 'Real Estate - Development'
  },
  {
    symbol: 'UAVS',
    name: 'AgEagle Aerial Systems, Inc.',
    promotionDate: '2025-12-31',
    promotionPrice: null, // Will calculate
    riskScore: 12,
    sector: 'Technology',
    industry: 'Computer Hardware'
  },
  {
    symbol: 'INBS',
    name: 'Intelligent Bio Solutions Inc.',
    promotionDate: '2025-12-31',
    promotionPrice: 6.90,
    riskScore: 10,
    sector: 'Healthcare',
    industry: 'Medical - Diagnostics & Research'
  },
  {
    symbol: 'GPUS',
    name: 'Hyperscale Data, Inc.',
    promotionDate: '2026-01-02',
    promotionPrice: 0.25,
    riskScore: 11,
    sector: 'Industrials',
    industry: 'Aerospace & Defense'
  },
  {
    symbol: 'MNTS',
    name: 'Momentus Inc.',
    promotionDate: '2025-12-31',
    promotionPrice: 7.12,
    riskScore: 12,
    sector: 'Industrials',
    industry: 'Aerospace & Defense'
  },
  {
    symbol: 'VTYX',
    name: 'Ventyx Biosciences, Inc.',
    promotionDate: '2025-12-31',
    promotionPrice: null, // Will calculate
    riskScore: 12,
    sector: 'Healthcare',
    industry: 'Biotechnology'
  },
  {
    symbol: 'DVLT',
    name: 'Datavault AI Inc.',
    promotionDate: '2025-12-31',
    promotionPrice: 0.62,
    riskScore: 12,
    sector: 'Technology',
    industry: 'Information Technology Services'
  },
  // 5 Additional Active Pump Phase Stocks
  {
    symbol: 'DRTSW',
    name: 'DermTech Inc Warrants',
    promotionDate: '2025-12-31',
    promotionPrice: null,
    riskScore: 15,
    sector: 'Healthcare',
    industry: 'Diagnostics & Research'
  },
  {
    symbol: 'RVMDW',
    name: 'Revolution Medicines Warrants',
    promotionDate: '2025-12-31',
    promotionPrice: null,
    riskScore: 13,
    sector: 'Healthcare',
    industry: 'Biotechnology'
  },
  {
    symbol: 'VLN',
    name: 'Valens Semiconductor Ltd.',
    promotionDate: '2025-12-31',
    promotionPrice: null,
    riskScore: 13,
    sector: 'Technology',
    industry: 'Semiconductors'
  },
  {
    symbol: 'JCSE',
    name: 'JE Cleantech Holdings Limited',
    promotionDate: '2025-12-31',
    promotionPrice: null,
    riskScore: 13,
    sector: 'Industrials',
    industry: 'Waste Management'
  },
  {
    symbol: 'OPAD',
    name: 'Offerpad Solutions Inc.',
    promotionDate: '2025-12-31',
    promotionPrice: null,
    riskScore: 12,
    sector: 'Real Estate',
    industry: 'Real Estate Services'
  },
];

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHistoricalPrices(symbol: string, from: string): Promise<any[]> {
  const url = `${FMP_BASE_URL}/historical-price-eod/full?symbol=${symbol}&from=${from}&apikey=${FMP_API_KEY}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`  Failed to fetch ${symbol}: HTTP ${response.status}`);
      return [];
    }
    const data = await response.json();

    // Handle different response formats
    if (Array.isArray(data)) {
      return data;
    } else if (data.historical) {
      return data.historical;
    }
    return [];
  } catch (error: any) {
    console.error(`  Error fetching ${symbol}: ${error.message}`);
    return [];
  }
}

async function fetchCurrentQuote(symbol: string): Promise<any | null> {
  const url = `${FMP_BASE_URL}/quote?symbol=${symbol}&apikey=${FMP_API_KEY}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data) ? data[0] : data;
  } catch (error) {
    return null;
  }
}

function analyzeStock(
  config: StockConfig,
  historicalPrices: any[],
  currentQuote: any | null
): StockAnalysis | null {
  if (!historicalPrices || historicalPrices.length === 0) {
    console.log(`  No historical data available`);
    return null;
  }

  // Sort by date ascending
  const sorted = [...historicalPrices].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const promoDateObj = new Date(config.promotionDate);

  // Find pre-promotion price (day before promotion)
  const prePromoDate = new Date(promoDateObj);
  prePromoDate.setDate(prePromoDate.getDate() - 1);

  let prePromoIndex = sorted.findIndex(p => new Date(p.date) >= prePromoDate);
  if (prePromoIndex <= 0) prePromoIndex = 0;
  const prePromotionPrice = sorted[prePromoIndex]?.close || sorted[0]?.close || 0;

  // Find Day 1 price (promotion date or next trading day)
  let day1Index = sorted.findIndex(p => new Date(p.date) >= promoDateObj);
  if (day1Index === -1) day1Index = sorted.length - 1;

  const day1Price = sorted[day1Index]?.close || prePromotionPrice;
  const day1Date = sorted[day1Index]?.date || config.promotionDate;

  // Use provided promotion price or calculate from data
  const promotionPrice = config.promotionPrice || prePromotionPrice;

  // Find peak after promotion
  let peakPrice = 0;
  let peakIndex = day1Index;
  for (let i = day1Index; i < sorted.length; i++) {
    const highPrice = sorted[i].high || sorted[i].close || 0;
    if (highPrice > peakPrice) {
      peakPrice = highPrice;
      peakIndex = i;
    }
  }
  const peakDate = sorted[peakIndex]?.date || '';
  const daysToPeak = peakIndex - day1Index;

  // Find trough after peak
  let troughPrice = peakPrice;
  let troughIndex = peakIndex;
  for (let i = peakIndex; i < sorted.length; i++) {
    const lowPrice = sorted[i].low || sorted[i].close || 0;
    if (lowPrice < troughPrice) {
      troughPrice = lowPrice;
      troughIndex = i;
    }
  }
  const troughDate = sorted[troughIndex]?.date || '';
  const daysToTrough = troughIndex - peakIndex;

  // Current price from quote or last historical
  const currentPrice = currentQuote?.price || sorted[sorted.length - 1]?.close || troughPrice;
  const currentDate = currentQuote
    ? new Date().toISOString().split('T')[0]
    : sorted[sorted.length - 1]?.date || '';

  // Calculate all metrics
  const gainToPeak = promotionPrice > 0
    ? ((peakPrice - promotionPrice) / promotionPrice) * 100
    : 0;

  const peakToTroughDecline = peakPrice > 0
    ? ((troughPrice - peakPrice) / peakPrice) * 100
    : 0;

  const troughVsPrePromotion = prePromotionPrice > 0
    ? ((troughPrice - prePromotionPrice) / prePromotionPrice) * 100
    : 0;

  const troughVsDay1 = day1Price > 0
    ? ((troughPrice - day1Price) / day1Price) * 100
    : 0;

  const currentVsPrePromotion = prePromotionPrice > 0
    ? ((currentPrice - prePromotionPrice) / prePromotionPrice) * 100
    : 0;

  const currentVsDay1 = day1Price > 0
    ? ((currentPrice - day1Price) / day1Price) * 100
    : 0;

  const currentVsPeak = peakPrice > 0
    ? ((currentPrice - peakPrice) / peakPrice) * 100
    : 0;

  // Determine Day 1 investor outcome
  let day1Outcome: 'GAIN' | 'LOSS' | 'BREAK-EVEN' = 'BREAK-EVEN';
  if (currentVsDay1 > 1) day1Outcome = 'GAIN';
  else if (currentVsDay1 < -1) day1Outcome = 'LOSS';

  return {
    symbol: config.symbol,
    name: config.name,
    promotionDate: config.promotionDate,
    prePromotionPrice,
    promotionPrice,
    day1Price,
    peakDate,
    peakPrice,
    daysToPeak,
    gainToPeak,
    troughDate,
    troughPrice,
    daysToTrough,
    peakToTroughDecline,
    troughVsPrePromotion,
    troughVsDay1,
    currentPrice,
    currentDate,
    currentVsPrePromotion,
    currentVsDay1,
    currentVsPeak,
    riskScore: config.riskScore,
    sector: config.sector,
    industry: config.industry,
    day1Outcome,
  };
}

function generateMarkdownReport(analyses: StockAnalysis[]): string {
  const validAnalyses = analyses.filter(a => a !== null) as StockAnalysis[];

  if (validAnalyses.length === 0) {
    return '# Error: No stocks could be analyzed\n\nNo historical data was available.';
  }

  // Calculate averages
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const avgDaysToPeak = avg(validAnalyses.map(a => a.daysToPeak));
  const avgDaysToTrough = avg(validAnalyses.map(a => a.daysToTrough));
  const avgGainToPeak = avg(validAnalyses.map(a => a.gainToPeak));
  const avgDecline = avg(validAnalyses.map(a => a.peakToTroughDecline));
  const avgTroughVsPrePromo = avg(validAnalyses.map(a => a.troughVsPrePromotion));
  const avgTroughVsDay1 = avg(validAnalyses.map(a => a.troughVsDay1));
  const avgCurrentVsPrePromo = avg(validAnalyses.map(a => a.currentVsPrePromotion));
  const avgCurrentVsDay1 = avg(validAnalyses.map(a => a.currentVsDay1));
  const avgCurrentVsPeak = avg(validAnalyses.map(a => a.currentVsPeak));

  const losers = validAnalyses.filter(a => a.day1Outcome === 'LOSS');
  const winners = validAnalyses.filter(a => a.day1Outcome === 'GAIN');

  const reportDate = new Date().toISOString().split('T')[0];

  let report = `# High-Risk Stock Manipulation Analysis Report

**Report Generated:** ${reportDate}
**Analysis Period:** December 31, 2025 - Present
**Data Source:** Financial Modeling Prep API
**Risk Detection:** ScamDunk Risk Scoring Engine

---

## Executive Summary

This report analyzes **${validAnalyses.length} stocks** that were:
1. Independently flagged as **HIGH risk** by ScamDunk's AI-powered risk scoring engine
2. Identified as showing pump-and-dump manipulation patterns
3. Many confirmed to be actively promoted through coordinated social media campaigns

### Key Findings

| Metric | Value |
|--------|-------|
| **Stocks Analyzed** | ${validAnalyses.length} |
| **Average Days to Peak** | ${avgDaysToPeak.toFixed(1)} trading days |
| **Average Days Peak to Trough** | ${avgDaysToTrough.toFixed(1)} trading days |
| **Average Gain During Pump** | +${avgGainToPeak.toFixed(1)}% |
| **Average Peak-to-Trough Decline** | ${avgDecline.toFixed(1)}% |
| **Average Trough vs Pre-Promotion** | ${avgTroughVsPrePromo >= 0 ? '+' : ''}${avgTroughVsPrePromo.toFixed(1)}% |
| **Average Trough vs Day 1** | ${avgTroughVsDay1 >= 0 ? '+' : ''}${avgTroughVsDay1.toFixed(1)}% |
| **Average Current vs Pre-Promotion** | ${avgCurrentVsPrePromo >= 0 ? '+' : ''}${avgCurrentVsPrePromo.toFixed(1)}% |
| **Average Current vs Day 1** | ${avgCurrentVsDay1 >= 0 ? '+' : ''}${avgCurrentVsDay1.toFixed(1)}% |
| **Average Current vs Peak** | ${avgCurrentVsPeak.toFixed(1)}% |
| **Day 1 Investors with Losses** | ${losers.length} of ${validAnalyses.length} (${((losers.length / validAnalyses.length) * 100).toFixed(0)}%) |
| **Day 1 Investors with Gains** | ${winners.length} of ${validAnalyses.length} (${((winners.length / validAnalyses.length) * 100).toFixed(0)}%) |

---

## Methodology

### Data Retrieved (FMP API)
- Historical daily OHLC prices from December 24, 2025 to present
- Current real-time quotes
- ~6 weeks of price data per stock

### Metrics Calculated

| Metric | Description |
|--------|-------------|
| **Pre-Promotion Price** | Close price on day before promotion started |
| **Day 1 Price** | Close price on first day of promotion |
| **Peak Price** | Highest price reached after promotion |
| **Trough Price** | Lowest price after peak |
| **Days to Peak** | Trading days from promotion to peak |
| **Days to Trough** | Trading days from peak to trough |
| **Gain to Peak** | % change from promotion price to peak |
| **Peak-to-Trough Decline** | % change from peak to trough |
| **Trough vs Day 1** | % change from Day 1 to trough |
| **Current vs Day 1** | % change from Day 1 to current |

---

## Individual Stock Analysis

`;

  // Individual stock sections
  for (const a of validAnalyses) {
    const outcomeIcon = a.day1Outcome === 'GAIN' ? '✅' : a.day1Outcome === 'LOSS' ? '❌' : '➖';

    report += `### ${a.symbol} - ${a.name}

**Risk Score:** ${a.riskScore} (HIGH) | **Sector:** ${a.sector} | **Industry:** ${a.industry}

| Metric | Value |
|--------|-------|
| Pre-Promotion Price | $${a.prePromotionPrice.toFixed(2)} |
| Promotion Date | ${a.promotionDate} |
| Day 1 Price | $${a.day1Price.toFixed(2)} |
| Peak Date | ${a.peakDate} |
| Peak Price | $${a.peakPrice.toFixed(2)} |
| Days to Peak | ${a.daysToPeak} |
| **Gain to Peak** | **+${a.gainToPeak.toFixed(1)}%** |
| Trough Date | ${a.troughDate} |
| Trough Price | $${a.troughPrice.toFixed(2)} |
| Days Peak to Trough | ${a.daysToTrough} |
| **Peak-to-Trough Decline** | **${a.peakToTroughDecline.toFixed(1)}%** |
| **Trough vs Pre-Promotion** | **${a.troughVsPrePromotion >= 0 ? '+' : ''}${a.troughVsPrePromotion.toFixed(1)}%** |
| **Trough vs Day 1** | **${a.troughVsDay1 >= 0 ? '+' : ''}${a.troughVsDay1.toFixed(1)}%** |
| Current Price | $${a.currentPrice.toFixed(2)} (as of ${a.currentDate}) |
| **Current vs Pre-Promotion** | **${a.currentVsPrePromotion >= 0 ? '+' : ''}${a.currentVsPrePromotion.toFixed(1)}%** |
| **Current vs Day 1** | **${a.currentVsDay1 >= 0 ? '+' : ''}${a.currentVsDay1.toFixed(1)}%** ${outcomeIcon} |
| **Current vs Peak** | **${a.currentVsPeak.toFixed(1)}%** |

**Day 1 Investor Outcome:** ${a.day1Outcome} (${a.currentVsDay1 >= 0 ? '+' : ''}${a.currentVsDay1.toFixed(1)}%)

---

`;
  }

  // Summary tables
  report += `## Summary Tables

### Price Performance Overview

| Symbol | Pre-Promo | Day 1 | Peak | Trough | Current | Days to Peak | Days to Trough |
|--------|-----------|-------|------|--------|---------|--------------|----------------|
`;

  for (const a of validAnalyses) {
    report += `| ${a.symbol} | $${a.prePromotionPrice.toFixed(2)} | $${a.day1Price.toFixed(2)} | $${a.peakPrice.toFixed(2)} | $${a.troughPrice.toFixed(2)} | $${a.currentPrice.toFixed(2)} | ${a.daysToPeak} | ${a.daysToTrough} |\n`;
  }

  report += `

### Percentage Changes (Ranked by Peak-to-Trough Decline)

| Rank | Symbol | Risk | Gain to Peak | Peak to Trough | Trough vs Day 1 | Current vs Day 1 |
|------|--------|------|--------------|----------------|-----------------|------------------|
`;

  const sortedByDecline = [...validAnalyses].sort((a, b) => a.peakToTroughDecline - b.peakToTroughDecline);
  sortedByDecline.forEach((a, i) => {
    report += `| ${i + 1} | ${a.symbol} | ${a.riskScore} | +${a.gainToPeak.toFixed(0)}% | **${a.peakToTroughDecline.toFixed(1)}%** | ${a.troughVsDay1 >= 0 ? '+' : ''}${a.troughVsDay1.toFixed(0)}% | ${a.currentVsDay1 >= 0 ? '+' : ''}${a.currentVsDay1.toFixed(0)}% |\n`;
  });

  report += `

### Day 1 Investor Outcomes

| Symbol | Day 1 Price | Trough vs Day 1 | Current vs Day 1 | Outcome |
|--------|-------------|-----------------|------------------|---------|
`;

  for (const a of validAnalyses) {
    const icon = a.day1Outcome === 'GAIN' ? '✅' : a.day1Outcome === 'LOSS' ? '❌' : '➖';
    report += `| ${a.symbol} | $${a.day1Price.toFixed(2)} | ${a.troughVsDay1 >= 0 ? '+' : ''}${a.troughVsDay1.toFixed(1)}% | ${a.currentVsDay1 >= 0 ? '+' : ''}${a.currentVsDay1.toFixed(1)}% | ${icon} ${a.day1Outcome} |\n`;
  }

  report += `

---

## Who Won and Who Lost

### Potential Scheme Operators
Entities with advance knowledge of promotion timing could:
- Buy at pre-promotion prices
- Sell near peak
- **Potential gain: +${avgGainToPeak.toFixed(0)}%**

### Late Retail Investors (Bought at Peak)
- Bought during FOMO at peak prices
- Held through collapse
- **Average loss: ${avgDecline.toFixed(0)}%**

### Day 1 Retail Investors
- Bought on first day of promotion
- **${losers.length} of ${validAnalyses.length}** (${((losers.length / validAnalyses.length) * 100).toFixed(0)}%) currently underwater
- **Average position: ${avgCurrentVsDay1 >= 0 ? '+' : ''}${avgCurrentVsDay1.toFixed(1)}%**

---

## Risk Distribution by Sector

| Sector | Count | Avg Risk Score |
|--------|-------|----------------|
`;

  const bySector = new Map<string, StockAnalysis[]>();
  for (const a of validAnalyses) {
    const list = bySector.get(a.sector) || [];
    list.push(a);
    bySector.set(a.sector, list);
  }

  for (const [sector, stocks] of bySector) {
    const avgRisk = avg(stocks.map(s => s.riskScore));
    report += `| ${sector} | ${stocks.length} | ${avgRisk.toFixed(1)} |\n`;
  }

  report += `

---

## SEC Precedent

This pattern matches the **Atlas Trading Discord** scheme (2022):
- 8 social media influencers charged
- $100+ million in securities fraud
- Defendants purchased before alerting followers
- Sold while still promoting

**SEC Press Release:** https://www.sec.gov/newsroom/press-releases/2022-221

---

## Report Suspected Fraud

- **SEC Tip Line:** www.sec.gov/tcr
- **Phone:** 1-800-732-0330

---

*Report generated: ${new Date().toISOString()}*
*Data source: Financial Modeling Prep API*
*Risk detection: ScamDunk Risk Scoring Engine*
`;

  return report;
}

async function main() {
  if (!FMP_API_KEY) {
    console.error('ERROR: FMP_API_KEY environment variable is required');
    console.error('Set it with: export FMP_API_KEY=your_api_key');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('HIGH-RISK STOCK MANIPULATION ANALYSIS');
  console.log('ScamDunk Risk Engine + FMP Live Data');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Analyzing ${STOCKS_TO_ANALYZE.length} HIGH-risk stocks...`);
  console.log('');

  const analyses: (StockAnalysis | null)[] = [];
  const startDate = '2025-12-24'; // Start before promotion dates

  for (const stock of STOCKS_TO_ANALYZE) {
    console.log(`\n[${analyses.length + 1}/${STOCKS_TO_ANALYZE.length}] ${stock.symbol} - ${stock.name}`);
    console.log(`  Risk Score: ${stock.riskScore} | Promotion: ${stock.promotionDate}`);

    // Fetch historical prices
    const historical = await fetchHistoricalPrices(stock.symbol, startDate);
    console.log(`  Historical records: ${historical.length}`);

    // Fetch current quote
    const currentQuote = await fetchCurrentQuote(stock.symbol);
    if (currentQuote?.price) {
      console.log(`  Current price: $${currentQuote.price.toFixed(2)}`);
    }

    // Analyze
    const analysis = analyzeStock(stock, historical, currentQuote);
    if (analysis) {
      console.log(`  Peak: $${analysis.peakPrice.toFixed(2)} on ${analysis.peakDate} (+${analysis.gainToPeak.toFixed(1)}%)`);
      console.log(`  Trough: $${analysis.troughPrice.toFixed(2)} (${analysis.peakToTroughDecline.toFixed(1)}% from peak)`);
      console.log(`  Current vs Day 1: ${analysis.currentVsDay1 >= 0 ? '+' : ''}${analysis.currentVsDay1.toFixed(1)}% [${analysis.day1Outcome}]`);
      analyses.push(analysis);
    } else {
      console.log(`  SKIPPED - insufficient data`);
    }

    // Rate limiting
    await sleep(300);
  }

  const validAnalyses = analyses.filter(a => a !== null) as StockAnalysis[];

  console.log('\n' + '='.repeat(70));
  console.log(`Successfully analyzed: ${validAnalyses.length} of ${STOCKS_TO_ANALYZE.length} stocks`);
  console.log('Generating report...');

  // Generate markdown report
  const report = generateMarkdownReport(validAnalyses);

  // Ensure results directory exists
  const resultsDir = path.join(__dirname, '..', 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  // Save report
  const reportDate = new Date().toISOString().split('T')[0];
  const reportPath = path.join(resultsDir, `high-risk-analysis-${reportDate}.md`);
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport saved: ${reportPath}`);

  // Save JSON data
  const jsonPath = path.join(resultsDir, `high-risk-analysis-${reportDate}.json`);
  const jsonData = {
    generatedAt: new Date().toISOString(),
    stocksConfigured: STOCKS_TO_ANALYZE.length,
    stocksAnalyzed: validAnalyses.length,
    analyses: validAnalyses,
    summary: {
      avgDaysToPeak: validAnalyses.reduce((s, a) => s + a.daysToPeak, 0) / validAnalyses.length,
      avgDaysToTrough: validAnalyses.reduce((s, a) => s + a.daysToTrough, 0) / validAnalyses.length,
      avgGainToPeak: validAnalyses.reduce((s, a) => s + a.gainToPeak, 0) / validAnalyses.length,
      avgPeakToTroughDecline: validAnalyses.reduce((s, a) => s + a.peakToTroughDecline, 0) / validAnalyses.length,
      avgTroughVsDay1: validAnalyses.reduce((s, a) => s + a.troughVsDay1, 0) / validAnalyses.length,
      avgCurrentVsDay1: validAnalyses.reduce((s, a) => s + a.currentVsDay1, 0) / validAnalyses.length,
      day1Losers: validAnalyses.filter(a => a.day1Outcome === 'LOSS').length,
      day1Winners: validAnalyses.filter(a => a.day1Outcome === 'GAIN').length,
    },
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
  console.log(`JSON saved: ${jsonPath}`);

  console.log('\n' + '='.repeat(70));
  console.log('Analysis complete!');
  console.log('='.repeat(70));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
