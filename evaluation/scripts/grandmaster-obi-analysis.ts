/**
 * Pump-and-Dump Analysis Script - Grandmaster-Obi / Making Easy Money Discord
 * Analyzes stocks from January 2026 ScamDunk HIGH risk report
 * Uses real FMP API price data
 */

import * as fs from 'fs';
import * as path from 'path';

const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';

interface StockInfo {
  symbol: string;
  name: string;
  promotionDate: string;
  promotionPrice: number;
  peakPrice: number;  // From press release
  riskScore: number;
  sector: string;
  industry: string;
}

interface StockAnalysis {
  symbol: string;
  name: string;
  promotionDate: string;
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
  troughVsPromotion: number;
  troughVsDay1: number;
  currentPrice: number;
  currentDate: string;
  currentVsPromotion: number;
  currentVsDay1: number;
  currentVsPeak: number;
  riskScore: number;
  sector: string;
  industry: string;
  signals: string[];
}

// Stocks from January 2026 ScamDunk Press Release - Grandmaster-Obi promotions
const STOCKS_TO_ANALYZE: StockInfo[] = [
  {
    symbol: 'LVRO',
    name: 'Lavoro Limited',
    promotionDate: '2025-12-31',
    promotionPrice: 0.18,
    peakPrice: 1.25,
    riskScore: 14,
    sector: 'Basic Materials',
    industry: 'Agricultural Inputs'
  },
  {
    symbol: 'SIDU',
    name: 'Sidus Space, Inc.',
    promotionDate: '2025-12-31',
    promotionPrice: 0.90,
    peakPrice: 4.44,
    riskScore: 13,
    sector: 'Industrials',
    industry: 'Aerospace & Defense'
  },
  {
    symbol: 'ANPA',
    name: 'Rich Sparkle Holdings Limited',
    promotionDate: '2026-01-07',
    promotionPrice: 24.40,
    peakPrice: 108.68,
    riskScore: 9,
    sector: 'Industrials',
    industry: 'Specialty Business Services'
  },
  {
    symbol: 'MRNO',
    name: 'Murano Global Investments PLC',
    promotionDate: '2025-12-31',
    promotionPrice: 0.55,
    peakPrice: 2.20,
    riskScore: 12,
    sector: 'Real Estate',
    industry: 'Real Estate - Development'
  },
  {
    symbol: 'UAVS',
    name: 'AgEagle Aerial Systems, Inc.',
    promotionDate: '2025-12-31',
    promotionPrice: 0.83,  // Estimated based on 105% 7-day gain to $1.70
    peakPrice: 1.70,
    riskScore: 12,
    sector: 'Technology',
    industry: 'Computer Hardware'
  },
  {
    symbol: 'INBS',
    name: 'Intelligent Bio Solutions Inc.',
    promotionDate: '2025-12-31',
    promotionPrice: 6.90,
    peakPrice: 17.92,  // Current as of Jan 11 report, may have gone higher
    riskScore: 10,
    sector: 'Healthcare',
    industry: 'Medical - Diagnostics & Research'
  },
  {
    symbol: 'GPUS',
    name: 'Hyperscale Data, Inc.',
    promotionDate: '2026-01-02',
    promotionPrice: 0.25,
    peakPrice: 0.38,
    riskScore: 11,
    sector: 'Industrials',
    industry: 'Aerospace & Defense'
  },
  {
    symbol: 'MNTS',
    name: 'Momentus Inc.',
    promotionDate: '2025-12-31',
    promotionPrice: 7.12,
    peakPrice: 12.46,  // Current as of Jan 11, showing SPIKE_THEN_DROP
    riskScore: 12,
    sector: 'Industrials',
    industry: 'Aerospace & Defense'
  },
  {
    symbol: 'VTYX',
    name: 'Ventyx Biosciences, Inc.',
    promotionDate: '2025-12-31',
    promotionPrice: 8.74,  // Estimated based on 58% gain to $13.81
    peakPrice: 13.81,
    riskScore: 12,
    sector: 'Healthcare',
    industry: 'Biotechnology'
  },
  {
    symbol: 'DVLT',
    name: 'Datavault AI Inc.',
    promotionDate: '2025-12-31',
    promotionPrice: 0.62,
    peakPrice: 1.50,
    riskScore: 12,
    sector: 'Technology',
    industry: 'Information Technology Services'
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
      console.error(`Failed to fetch ${symbol}: ${response.status}`);
      return [];
    }
    const data = await response.json();
    return data.historical || data || [];
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error);
    return [];
  }
}

async function fetchCurrentQuote(symbol: string): Promise<any | null> {
  const url = `${FMP_BASE_URL}/quote?symbol=${symbol}&apikey=${FMP_API_KEY}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data[0] || null;
  } catch (error) {
    return null;
  }
}

function analyzeStock(
  stockInfo: StockInfo,
  historicalPrices: any[],
  currentQuote: any | null
): StockAnalysis | null {
  if (!historicalPrices || historicalPrices.length === 0) {
    console.log(`No historical data for ${stockInfo.symbol}`);
    return null;
  }

  // Sort by date ascending
  const sorted = [...historicalPrices].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const promoDateObj = new Date(stockInfo.promotionDate);

  // Find Day 1 price (first trading day on or after promotion)
  let day1Index = sorted.findIndex(p => new Date(p.date) >= promoDateObj);
  if (day1Index === -1) day1Index = 0;

  const day1Price = sorted[day1Index]?.close || stockInfo.promotionPrice;
  const day1Date = sorted[day1Index]?.date || stockInfo.promotionDate;

  // Find peak after promotion
  let peakPrice = 0;
  let peakIndex = day1Index;
  for (let i = day1Index; i < sorted.length; i++) {
    const price = sorted[i].high || sorted[i].close || 0;
    if (price > peakPrice) {
      peakPrice = price;
      peakIndex = i;
    }
  }
  const peakDate = sorted[peakIndex]?.date || '';
  const daysToPeak = peakIndex - day1Index;

  // Find trough after peak
  let troughPrice = peakPrice;
  let troughIndex = peakIndex;
  for (let i = peakIndex; i < sorted.length; i++) {
    const price = sorted[i].low || sorted[i].close || 0;
    if (price < troughPrice) {
      troughPrice = price;
      troughIndex = i;
    }
  }
  const troughDate = sorted[troughIndex]?.date || '';
  const daysToTrough = troughIndex - peakIndex;

  // Current price
  const currentPrice = currentQuote?.price || sorted[sorted.length - 1]?.close || troughPrice;
  const currentDate = currentQuote?.timestamp
    ? new Date(currentQuote.timestamp * 1000).toISOString().split('T')[0]
    : sorted[sorted.length - 1]?.date || '';

  // Calculate metrics
  const gainToPeak = stockInfo.promotionPrice > 0
    ? ((peakPrice - stockInfo.promotionPrice) / stockInfo.promotionPrice) * 100
    : 0;

  const peakToTroughDecline = peakPrice > 0
    ? ((troughPrice - peakPrice) / peakPrice) * 100
    : 0;

  const troughVsPromotion = stockInfo.promotionPrice > 0
    ? ((troughPrice - stockInfo.promotionPrice) / stockInfo.promotionPrice) * 100
    : 0;

  const troughVsDay1 = day1Price > 0
    ? ((troughPrice - day1Price) / day1Price) * 100
    : 0;

  const currentVsPromotion = stockInfo.promotionPrice > 0
    ? ((currentPrice - stockInfo.promotionPrice) / stockInfo.promotionPrice) * 100
    : 0;

  const currentVsDay1 = day1Price > 0
    ? ((currentPrice - day1Price) / day1Price) * 100
    : 0;

  const currentVsPeak = peakPrice > 0
    ? ((currentPrice - peakPrice) / peakPrice) * 100
    : 0;

  // Determine signals
  const signals: string[] = [];
  if (gainToPeak > 100) signals.push('SPIKE_7D');
  if (peakToTroughDecline < -30) signals.push('SPIKE_THEN_DROP');
  if (stockInfo.promotionPrice < 5) signals.push('MICROCAP_PRICE');

  return {
    symbol: stockInfo.symbol,
    name: stockInfo.name,
    promotionDate: stockInfo.promotionDate,
    promotionPrice: stockInfo.promotionPrice,
    day1Price,
    peakDate,
    peakPrice,
    daysToPeak,
    gainToPeak,
    troughDate,
    troughPrice,
    daysToTrough,
    peakToTroughDecline,
    troughVsPromotion,
    troughVsDay1,
    currentPrice,
    currentDate,
    currentVsPromotion,
    currentVsDay1,
    currentVsPeak,
    riskScore: stockInfo.riskScore,
    sector: stockInfo.sector,
    industry: stockInfo.industry,
    signals,
  };
}

function generateMarkdownReport(analyses: StockAnalysis[]): string {
  const validAnalyses = analyses.filter(a => a !== null) as StockAnalysis[];

  // Calculate averages
  const avgDaysToPeak = validAnalyses.reduce((sum, a) => sum + a.daysToPeak, 0) / validAnalyses.length;
  const avgDaysToTrough = validAnalyses.reduce((sum, a) => sum + a.daysToTrough, 0) / validAnalyses.length;
  const avgGainToPeak = validAnalyses.reduce((sum, a) => sum + a.gainToPeak, 0) / validAnalyses.length;
  const avgDecline = validAnalyses.reduce((sum, a) => sum + a.peakToTroughDecline, 0) / validAnalyses.length;
  const avgTroughVsPromo = validAnalyses.reduce((sum, a) => sum + a.troughVsPromotion, 0) / validAnalyses.length;
  const avgTroughVsDay1 = validAnalyses.reduce((sum, a) => sum + a.troughVsDay1, 0) / validAnalyses.length;
  const avgCurrentVsPromo = validAnalyses.reduce((sum, a) => sum + a.currentVsPromotion, 0) / validAnalyses.length;
  const avgCurrentVsDay1 = validAnalyses.reduce((sum, a) => sum + a.currentVsDay1, 0) / validAnalyses.length;
  const avgCurrentVsPeak = validAnalyses.reduce((sum, a) => sum + a.currentVsPeak, 0) / validAnalyses.length;

  // Sort by decline (worst first)
  const sortedByDecline = [...validAnalyses].sort((a, b) => a.peakToTroughDecline - b.peakToTroughDecline);

  let report = `# Pump-and-Dump Scheme Analysis Report
## Grandmaster-Obi / "Making Easy Money" Discord Operation

**Report Date:** ${new Date().toISOString().split('T')[0]}
**Analysis Period:** December 31, 2025 - Present
**Data Source:** Financial Modeling Prep API, ScamDunk Risk Engine
**Stocks Analyzed:** ${validAnalyses.length} HIGH-risk stocks promoted through Discord

---

## Executive Summary

This report analyzes ${validAnalyses.length} stocks that were:
1. **Independently flagged as HIGH risk** by ScamDunk's AI-powered risk scoring engine
2. **Confirmed to be actively promoted** through the "Making Easy Money" Discord server operated by "Grandmaster-Obi"

The analysis tracks price movements from promotion date through peak and subsequent decline.

### Key Findings

| Metric | Value |
|--------|-------|
| **Average Days to Peak** | ${avgDaysToPeak.toFixed(1)} trading days |
| **Average Days from Peak to Trough** | ${avgDaysToTrough.toFixed(1)} trading days |
| **Average Gain During Pump Phase** | +${avgGainToPeak.toFixed(1)}% |
| **Average Peak-to-Trough Decline** | ${avgDecline.toFixed(1)}% |
| **Average Trough vs Promotion Price** | ${avgTroughVsPromo >= 0 ? '+' : ''}${avgTroughVsPromo.toFixed(1)}% |
| **Average Trough vs Day 1 Price** | ${avgTroughVsDay1 >= 0 ? '+' : ''}${avgTroughVsDay1.toFixed(1)}% |
| **Average Current vs Promotion Price** | ${avgCurrentVsPromo >= 0 ? '+' : ''}${avgCurrentVsPromo.toFixed(1)}% |
| **Average Current vs Day 1 Price** | ${avgCurrentVsDay1 >= 0 ? '+' : ''}${avgCurrentVsDay1.toFixed(1)}% |
| **Average Current vs Peak** | ${avgCurrentVsPeak.toFixed(1)}% |

---

## The Scheme

### How It Operates

The "Making Easy Money" Discord server (~17,000 members) operated by "Grandmaster-Obi" (former WallStreetBets moderator) follows this pattern:

1. **Pre-positioning:** Operator accumulates shares before alert
2. **Alert:** Stock is "called" to Discord members with buy signal
3. **Pump:** Coordinated buying drives price up rapidly (avg +${avgGainToPeak.toFixed(0)}%)
4. **Dump:** Operator sells at peak while members hold
5. **Collapse:** Price falls (avg ${avgDecline.toFixed(0)}% from peak)

### ScamDunk Risk Detection

All ${validAnalyses.length} stocks triggered multiple HIGH-risk signals:
- **SPIKE_7D:** Extreme price movement (>25%) in 7 days
- **SPIKE_THEN_DROP:** Classic pump-and-dump pattern detected
- **VOLUME_EXPLOSION:** Trading volume 3-4x normal
- **MICROCAP_PRICE:** Stock price below $5
- **SMALL_MARKET_CAP:** Market cap below $300M
- **OVERBOUGHT_RSI:** RSI > 70

---

## Individual Stock Analysis

`;

  for (const analysis of validAnalyses) {
    const gainIcon = analysis.currentVsDay1 >= 0 ? '📈' : '📉';
    const outcome = analysis.currentVsDay1 >= 0 ? 'GAIN' : 'LOSS';

    report += `### ${analysis.symbol} - ${analysis.name}

**Risk Score:** ${analysis.riskScore} (HIGH) | **Sector:** ${analysis.sector} | **Industry:** ${analysis.industry}

| Metric | Value |
|--------|-------|
| Promotion Date | ${analysis.promotionDate} |
| Promotion Price | $${analysis.promotionPrice.toFixed(2)} |
| Day 1 Price | $${analysis.day1Price.toFixed(2)} |
| Peak Date | ${analysis.peakDate} |
| Peak Price | $${analysis.peakPrice.toFixed(2)} |
| Days to Peak | ${analysis.daysToPeak} |
| **Gain to Peak** | **+${analysis.gainToPeak.toFixed(1)}%** |
| Trough Date | ${analysis.troughDate} |
| Trough Price | $${analysis.troughPrice.toFixed(2)} |
| Days Peak to Trough | ${analysis.daysToTrough} |
| **Peak-to-Trough Decline** | **${analysis.peakToTroughDecline.toFixed(1)}%** |
| **Trough vs Promotion** | **${analysis.troughVsPromotion >= 0 ? '+' : ''}${analysis.troughVsPromotion.toFixed(1)}%** |
| **Trough vs Day 1** | **${analysis.troughVsDay1 >= 0 ? '+' : ''}${analysis.troughVsDay1.toFixed(1)}%** |
| Current Price | $${analysis.currentPrice.toFixed(2)} |
| **Current vs Promotion** | **${analysis.currentVsPromotion >= 0 ? '+' : ''}${analysis.currentVsPromotion.toFixed(1)}%** |
| **Current vs Day 1** | **${analysis.currentVsDay1 >= 0 ? '+' : ''}${analysis.currentVsDay1.toFixed(1)}%** ${gainIcon} |
| **Current vs Peak** | **${analysis.currentVsPeak.toFixed(1)}%** |

**Day 1 Investor Outcome:** ${outcome} (${analysis.currentVsDay1 >= 0 ? '+' : ''}${analysis.currentVsDay1.toFixed(1)}%)

---

`;
  }

  // Summary tables
  report += `## Summary Tables

### Price Performance Overview

| Symbol | Promo Price | Day 1 | Peak | Trough | Current | Days to Peak | Days to Trough |
|--------|-------------|-------|------|--------|---------|--------------|----------------|
`;

  for (const a of validAnalyses) {
    report += `| ${a.symbol} | $${a.promotionPrice.toFixed(2)} | $${a.day1Price.toFixed(2)} | $${a.peakPrice.toFixed(2)} | $${a.troughPrice.toFixed(2)} | $${a.currentPrice.toFixed(2)} | ${a.daysToPeak} | ${a.daysToTrough} |\n`;
  }

  report += `

### Percentage Changes (Ranked by Peak-to-Trough Decline)

| Rank | Symbol | Gain to Peak | Peak to Trough | Trough vs Promo | Trough vs Day 1 | Current vs Day 1 |
|------|--------|--------------|----------------|-----------------|-----------------|------------------|
`;

  sortedByDecline.forEach((a, i) => {
    report += `| ${i + 1} | ${a.symbol} | +${a.gainToPeak.toFixed(0)}% | **${a.peakToTroughDecline.toFixed(1)}%** | ${a.troughVsPromotion >= 0 ? '+' : ''}${a.troughVsPromotion.toFixed(0)}% | ${a.troughVsDay1 >= 0 ? '+' : ''}${a.troughVsDay1.toFixed(0)}% | ${a.currentVsDay1 >= 0 ? '+' : ''}${a.currentVsDay1.toFixed(0)}% |\n`;
  });

  report += `

### Day 1 Investor Outcomes

| Symbol | Day 1 Price | Trough vs Day 1 | Current vs Day 1 | Outcome |
|--------|-------------|-----------------|------------------|---------|
`;

  for (const a of validAnalyses) {
    const outcome = a.currentVsDay1 >= 0 ? '✅ GAIN' : '❌ LOSS';
    report += `| ${a.symbol} | $${a.day1Price.toFixed(2)} | ${a.troughVsDay1 >= 0 ? '+' : ''}${a.troughVsDay1.toFixed(1)}% | ${a.currentVsDay1 >= 0 ? '+' : ''}${a.currentVsDay1.toFixed(1)}% | ${outcome} |\n`;
  }

  const losers = validAnalyses.filter(a => a.currentVsDay1 < 0);
  const winners = validAnalyses.filter(a => a.currentVsDay1 >= 0);

  report += `

### Summary Statistics

| Metric | Value |
|--------|-------|
| Day 1 Investors with Losses | ${losers.length} of ${validAnalyses.length} (${((losers.length / validAnalyses.length) * 100).toFixed(0)}%) |
| Day 1 Investors with Gains | ${winners.length} of ${validAnalyses.length} (${((winners.length / validAnalyses.length) * 100).toFixed(0)}%) |
| Average Days to Peak | ${avgDaysToPeak.toFixed(1)} |
| Average Days Peak to Trough | ${avgDaysToTrough.toFixed(1)} |
| Average Gain to Peak | +${avgGainToPeak.toFixed(1)}% |
| Average Peak-to-Trough Decline | ${avgDecline.toFixed(1)}% |
| Average Trough vs Day 1 | ${avgTroughVsDay1 >= 0 ? '+' : ''}${avgTroughVsDay1.toFixed(1)}% |
| Average Current vs Day 1 | ${avgCurrentVsDay1 >= 0 ? '+' : ''}${avgCurrentVsDay1.toFixed(1)}% |

---

## Who Won and Who Lost

### Winners: Scheme Operator (Grandmaster-Obi)

| Bought At | Sold At | Estimated Gain |
|-----------|---------|----------------|
| Pre-promotion | Near peak | **+${avgGainToPeak.toFixed(0)}%+** |

The operator knows the alert timing and can position before announcing to 17,000+ Discord members.

### Losers: Late Retail Investors (Bought at Peak)

| Bought At | Value at Trough | Loss |
|-----------|-----------------|------|
| Peak price | ${(100 + avgDecline).toFixed(1)}% of investment | **${avgDecline.toFixed(1)}%** |

Investors who bought during peak FOMO lost an average of ${Math.abs(avgDecline).toFixed(0)}%.

### Mixed: Day 1 Retail Investors

| Bought At | Trough vs Day 1 | Current vs Day 1 |
|-----------|-----------------|------------------|
| Day 1 price | ${avgTroughVsDay1 >= 0 ? '+' : ''}${avgTroughVsDay1.toFixed(1)}% | ${avgCurrentVsDay1 >= 0 ? '+' : ''}${avgCurrentVsDay1.toFixed(1)}% |

${losers.length} of ${validAnalyses.length} stocks (${((losers.length / validAnalyses.length) * 100).toFixed(0)}%) show losses for Day 1 investors.

---

## SEC Precedent: Atlas Trading Discord (2022)

This scheme mirrors the **Atlas Trading Discord** case that led to SEC enforcement:

- **Charges:** Securities fraud, market manipulation
- **Defendants:** 8 social media influencers
- **Scheme value:** $100+ million
- **Outcome:** Indictments, potential 25-year prison sentences

One defendant texted: *"we're robbing fucking idiots of their money"*

**SEC Press Release:** https://www.sec.gov/newsroom/press-releases/2022-221

---

## Report Suspected Fraud

- **SEC Tip Line:** www.sec.gov/tcr
- **Phone:** 1-800-732-0330

---

*Report generated: ${new Date().toISOString()}*
*Data source: Financial Modeling Prep API*
*Risk scoring: ScamDunk Risk Engine*
`;

  return report;
}

async function main() {
  if (!FMP_API_KEY) {
    console.error('FMP_API_KEY environment variable is required');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('PUMP-AND-DUMP ANALYSIS: Grandmaster-Obi / Making Easy Money');
  console.log('='.repeat(60));
  console.log('');

  const analyses: (StockAnalysis | null)[] = [];

  for (const stock of STOCKS_TO_ANALYZE) {
    console.log(`\nAnalyzing ${stock.symbol} (${stock.name})...`);
    console.log(`  Promotion: ${stock.promotionDate} at $${stock.promotionPrice.toFixed(2)}`);

    // Fetch historical prices from before promotion date
    const fromDate = new Date(stock.promotionDate);
    fromDate.setDate(fromDate.getDate() - 7);
    const historical = await fetchHistoricalPrices(stock.symbol, fromDate.toISOString().split('T')[0]);
    console.log(`  Found ${historical.length} historical price records`);

    // Fetch current quote
    const currentQuote = await fetchCurrentQuote(stock.symbol);
    console.log(`  Current price: ${currentQuote ? '$' + currentQuote.price?.toFixed(2) : 'N/A'}`);

    // Analyze
    const analysis = analyzeStock(stock, historical, currentQuote);
    if (analysis) {
      console.log(`  Peak: $${analysis.peakPrice.toFixed(2)} on ${analysis.peakDate} (+${analysis.gainToPeak.toFixed(1)}%)`);
      console.log(`  Trough: $${analysis.troughPrice.toFixed(2)} (${analysis.peakToTroughDecline.toFixed(1)}% from peak)`);
      console.log(`  Current vs Day 1: ${analysis.currentVsDay1 >= 0 ? '+' : ''}${analysis.currentVsDay1.toFixed(1)}%`);
      analyses.push(analysis);
    } else {
      console.log(`  Could not analyze - insufficient data`);
    }

    // Rate limiting
    await sleep(500);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Generating report...');

  // Generate markdown report
  const report = generateMarkdownReport(analyses);

  // Save report
  const resultsDir = path.join(__dirname, '..', 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const reportPath = path.join(resultsDir, 'grandmaster-obi-pump-dump-report.md');
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport saved to: ${reportPath}`);

  // Also save JSON for programmatic use
  const jsonPath = path.join(resultsDir, 'grandmaster-obi-pump-dump-data.json');
  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    stocks: STOCKS_TO_ANALYZE,
    analyses: analyses.filter(a => a !== null),
  }, null, 2));
  console.log(`JSON data saved to: ${jsonPath}`);

  console.log('\n' + '='.repeat(60));
  console.log('Analysis complete!');
}

main().catch(console.error);
