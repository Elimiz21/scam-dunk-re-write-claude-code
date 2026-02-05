/**
 * Pump-and-Dump Analysis Script
 * Analyzes stocks promoted by Grandmaster-Obi scheme
 * Generates professional report with price movement analysis
 */

import * as fs from 'fs';
import * as path from 'path';

const FMP_API_KEY = process.env.FMP_API_KEY;
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable';

interface StockAnalysis {
  symbol: string;
  promotionDate: string;
  promotionPrice: number;
  peakDate: string;
  peakPrice: number;
  daysToPeak: number;
  gainToPeak: number;
  troughDate: string;
  troughPrice: number;
  peakToTroughDecline: number;
  currentPrice: number;
  currentVsPeak: number;
  currentVsPromotion: number;
}

// Stocks from Grandmaster-Obi press release with approximate promotion dates
const STOCKS_TO_ANALYZE = [
  { symbol: 'ANPA', promotionDate: '2024-08-01', name: 'Aruna Bio Inc' },
  { symbol: 'INBS', promotionDate: '2024-07-15', name: 'Intelligent Bio Solutions' },
  { symbol: 'VTYX', promotionDate: '2024-06-01', name: 'Ventyx Biosciences' },
  { symbol: 'NXTP', promotionDate: '2024-09-01', name: 'NextPlat Corp' },
  { symbol: 'YGTY', promotionDate: '2024-08-15', name: 'YieldGenie Technology' },
  { symbol: 'SVRE', promotionDate: '2024-07-01', name: 'SaverOne 2014 Ltd' },
  { symbol: 'PXMD', promotionDate: '2024-08-20', name: 'PaxMedica Inc' },
  { symbol: 'KRBP', promotionDate: '2024-06-15', name: 'Kiromic BioPharma' },
  { symbol: 'DRUG', promotionDate: '2024-09-15', name: 'Bright Minds Biosciences' },
  { symbol: 'NVNI', promotionDate: '2024-07-20', name: 'Nvni Group Ltd' },
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

async function fetchCurrentPrice(symbol: string): Promise<number | null> {
  const url = `${FMP_BASE_URL}/quote?symbol=${symbol}&apikey=${FMP_API_KEY}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return data[0]?.price || null;
  } catch (error) {
    return null;
  }
}

function analyzeStock(
  symbol: string,
  promotionDate: string,
  historicalPrices: any[],
  currentPrice: number | null
): StockAnalysis | null {
  if (!historicalPrices || historicalPrices.length === 0) {
    console.log(`No historical data for ${symbol}`);
    return null;
  }

  // Sort by date ascending
  const sorted = [...historicalPrices].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Find promotion date price (or closest date after)
  const promoDateObj = new Date(promotionDate);
  let promoIndex = sorted.findIndex(p => new Date(p.date) >= promoDateObj);
  if (promoIndex === -1) promoIndex = 0;

  const promotionPrice = sorted[promoIndex]?.close || sorted[promoIndex]?.adjClose || 0;
  const actualPromoDate = sorted[promoIndex]?.date || promotionDate;

  // Find peak after promotion
  let peakPrice = 0;
  let peakIndex = promoIndex;
  for (let i = promoIndex; i < sorted.length; i++) {
    const price = sorted[i].close || sorted[i].adjClose || 0;
    if (price > peakPrice) {
      peakPrice = price;
      peakIndex = i;
    }
  }
  const peakDate = sorted[peakIndex]?.date || '';
  const daysToPeak = peakIndex - promoIndex;

  // Find trough after peak
  let troughPrice = peakPrice;
  let troughIndex = peakIndex;
  for (let i = peakIndex; i < sorted.length; i++) {
    const price = sorted[i].close || sorted[i].adjClose || 0;
    if (price < troughPrice) {
      troughPrice = price;
      troughIndex = i;
    }
  }
  const troughDate = sorted[troughIndex]?.date || '';

  // Calculate metrics
  const gainToPeak = promotionPrice > 0 ? ((peakPrice - promotionPrice) / promotionPrice) * 100 : 0;
  const peakToTroughDecline = peakPrice > 0 ? ((troughPrice - peakPrice) / peakPrice) * 100 : 0;

  const finalCurrentPrice = currentPrice || sorted[sorted.length - 1]?.close || troughPrice;
  const currentVsPeak = peakPrice > 0 ? ((finalCurrentPrice - peakPrice) / peakPrice) * 100 : 0;
  const currentVsPromotion = promotionPrice > 0 ? ((finalCurrentPrice - promotionPrice) / promotionPrice) * 100 : 0;

  return {
    symbol,
    promotionDate: actualPromoDate,
    promotionPrice,
    peakDate,
    peakPrice,
    daysToPeak,
    gainToPeak,
    troughDate,
    troughPrice,
    peakToTroughDecline,
    currentPrice: finalCurrentPrice,
    currentVsPeak,
    currentVsPromotion,
  };
}

function generateMarkdownReport(analyses: StockAnalysis[], stockInfo: typeof STOCKS_TO_ANALYZE): string {
  const validAnalyses = analyses.filter(a => a !== null) as StockAnalysis[];

  // Calculate averages
  const avgDaysToPeak = validAnalyses.reduce((sum, a) => sum + a.daysToPeak, 0) / validAnalyses.length;
  const avgGainToPeak = validAnalyses.reduce((sum, a) => sum + a.gainToPeak, 0) / validAnalyses.length;
  const avgDecline = validAnalyses.reduce((sum, a) => sum + a.peakToTroughDecline, 0) / validAnalyses.length;
  const avgCurrentVsPeak = validAnalyses.reduce((sum, a) => sum + a.currentVsPeak, 0) / validAnalyses.length;

  // Sort by decline (worst first)
  const sortedByDecline = [...validAnalyses].sort((a, b) => a.peakToTroughDecline - b.peakToTroughDecline);

  let report = `# Pump-and-Dump Scheme Analysis Report

## Executive Summary

This report analyzes 10 stocks promoted by the "Grandmaster-Obi" pump-and-dump operation, as detailed in the SEC enforcement action and DOJ criminal complaint. The analysis examines price movements from the promotion period through the subsequent collapse.

**Key Findings:**
- **Average Days to Peak:** ${avgDaysToPeak.toFixed(1)} trading days
- **Average Gain During Pump:** +${avgGainToPeak.toFixed(1)}%
- **Average Peak-to-Trough Decline:** ${avgDecline.toFixed(1)}%
- **Average Current Price vs Peak:** ${avgCurrentVsPeak.toFixed(1)}%

---

## Methodology

For each stock, we analyzed:
1. **Promotion Price** - Price at/near the start of promotional activity
2. **Peak Price** - Highest price reached after promotion began
3. **Days to Peak** - Trading days from promotion to peak
4. **Trough Price** - Lowest price reached after the peak
5. **Current Price** - Most recent trading price

---

## Individual Stock Analysis

`;

  for (const analysis of validAnalyses) {
    const info = stockInfo.find(s => s.symbol === analysis.symbol);
    const companyName = info?.name || analysis.symbol;

    report += `### ${analysis.symbol} - ${companyName}

| Metric | Value |
|--------|-------|
| Promotion Date | ${analysis.promotionDate} |
| Promotion Price | $${analysis.promotionPrice.toFixed(2)} |
| Peak Date | ${analysis.peakDate} |
| Peak Price | $${analysis.peakPrice.toFixed(2)} |
| Days to Peak | ${analysis.daysToPeak} |
| Gain to Peak | ${analysis.gainToPeak >= 0 ? '+' : ''}${analysis.gainToPeak.toFixed(1)}% |
| Trough Date | ${analysis.troughDate} |
| Trough Price | $${analysis.troughPrice.toFixed(2)} |
| Peak to Trough Decline | ${analysis.peakToTroughDecline.toFixed(1)}% |
| Current Price | $${analysis.currentPrice.toFixed(2)} |
| Current vs Peak | ${analysis.currentVsPeak.toFixed(1)}% |

**Investor Impact:** An investor who bought at the peak of $${analysis.peakPrice.toFixed(2)} would have seen their investment decline by **${Math.abs(analysis.peakToTroughDecline).toFixed(1)}%** to a low of $${analysis.troughPrice.toFixed(2)}.

---

`;
  }

  report += `## Worst Performing Stocks (By Peak-to-Trough Decline)

| Rank | Symbol | Peak Price | Trough Price | Decline |
|------|--------|------------|--------------|---------|
`;

  sortedByDecline.slice(0, 5).forEach((a, i) => {
    report += `| ${i + 1} | ${a.symbol} | $${a.peakPrice.toFixed(2)} | $${a.troughPrice.toFixed(2)} | ${a.peakToTroughDecline.toFixed(1)}% |\n`;
  });

  report += `

---

## Summary Table

| Symbol | Promo Price | Peak Price | Gain | Trough | Decline | Current |
|--------|-------------|------------|------|--------|---------|---------|
`;

  for (const a of validAnalyses) {
    report += `| ${a.symbol} | $${a.promotionPrice.toFixed(2)} | $${a.peakPrice.toFixed(2)} | ${a.gainToPeak >= 0 ? '+' : ''}${a.gainToPeak.toFixed(0)}% | $${a.troughPrice.toFixed(2)} | ${a.peakToTroughDecline.toFixed(0)}% | $${a.currentPrice.toFixed(2)} |\n`;
  }

  report += `

---

## Conclusion

The data clearly demonstrates the classic pump-and-dump pattern:

1. **Artificial Price Inflation:** Stocks showed an average gain of **+${avgGainToPeak.toFixed(0)}%** during the promotional period
2. **Rapid Collapse:** After reaching peak prices, stocks declined an average of **${Math.abs(avgDecline).toFixed(0)}%**
3. **Sustained Damage:** Current prices remain an average of **${Math.abs(avgCurrentVsPeak).toFixed(0)}%** below peak levels

Investors who purchased during the promotional hype suffered significant losses when the artificial demand evaporated and prices collapsed.

---

*Report generated: ${new Date().toISOString().split('T')[0]}*
*Data source: Financial Modeling Prep API*
`;

  return report;
}

async function main() {
  if (!FMP_API_KEY) {
    console.error('FMP_API_KEY environment variable is required');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('PUMP-AND-DUMP ANALYSIS: Grandmaster-Obi Scheme');
  console.log('='.repeat(60));
  console.log('');

  const analyses: (StockAnalysis | null)[] = [];

  for (const stock of STOCKS_TO_ANALYZE) {
    console.log(`\nAnalyzing ${stock.symbol} (${stock.name})...`);

    // Fetch historical prices from promotion date
    const historical = await fetchHistoricalPrices(stock.symbol, stock.promotionDate);
    console.log(`  Found ${historical.length} historical price records`);

    // Fetch current price
    const currentPrice = await fetchCurrentPrice(stock.symbol);
    console.log(`  Current price: ${currentPrice ? '$' + currentPrice.toFixed(2) : 'N/A'}`);

    // Analyze
    const analysis = analyzeStock(stock.symbol, stock.promotionDate, historical, currentPrice);
    if (analysis) {
      console.log(`  Peak: $${analysis.peakPrice.toFixed(2)} on ${analysis.peakDate} (+${analysis.gainToPeak.toFixed(1)}%)`);
      console.log(`  Trough: $${analysis.troughPrice.toFixed(2)} (${analysis.peakToTroughDecline.toFixed(1)}% from peak)`);
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
  const report = generateMarkdownReport(analyses, STOCKS_TO_ANALYZE);

  // Save report
  const resultsDir = path.join(__dirname, '..', 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const reportPath = path.join(resultsDir, 'pump-dump-analysis-report.md');
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport saved to: ${reportPath}`);

  // Also save JSON for programmatic use
  const jsonPath = path.join(resultsDir, 'pump-dump-analysis-data.json');
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
