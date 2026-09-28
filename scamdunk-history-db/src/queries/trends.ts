#!/usr/bin/env tsx
/**
 * Trends Query
 *
 * Analyze market-wide risk trends over time.
 *
 * Usage:
 *   npm run query:trends                     # Last 30 days
 *   npm run query:trends -- --days 90        # Last 90 days
 *   npm run query:trends -- --exchange NASDAQ
 *   npm run query:trends -- --sector Healthcare
 */

import { format, subDays } from 'date-fns';
import { prisma, connectDB, disconnectDB } from '../utils/db.js';

interface QueryOptions {
  days: number;
  exchange?: string;
  sector?: string;
  format: 'table' | 'json';
}

function parseArgs(): QueryOptions {
  const args = process.argv.slice(2);

  const options: QueryOptions = {
    days: 30,
    format: 'table',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      options.days = parseInt(args[++i]);
    } else if (args[i] === '--exchange' && args[i + 1]) {
      options.exchange = args[++i].toUpperCase();
    } else if (args[i] === '--sector' && args[i + 1]) {
      options.sector = args[++i];
    } else if (args[i] === '--format' && args[i + 1]) {
      options.format = args[++i] as 'table' | 'json';
    }
  }

  return options;
}

async function queryTrends(options: QueryOptions) {
  const startDate = subDays(new Date(), options.days);

  // Get daily summaries
  const summaries = await prisma.dailyScanSummary.findMany({
    where: {
      scanDate: { gte: startDate },
    },
    orderBy: { scanDate: 'asc' },
  });

  // Calculate trend data
  const trendData = summaries.map(s => ({
    date: format(s.scanDate, 'yyyy-MM-dd'),
    total: s.evaluated,
    low: s.lowRiskCount,
    medium: s.mediumRiskCount,
    high: s.highRiskCount,
    insufficient: s.insufficientCount,
    highRiskPct: ((s.highRiskCount / s.evaluated) * 100).toFixed(1),
    pumpDropCount: s.spikeDropCount || 0,
    activePumpCount: s.activePumpCount || 0,
    volumeAnomalyCount: s.volumeAnomalyCount || 0,
  }));

  // Get top movers (stocks with biggest score changes)
  const topMovers = await prisma.stockRiskChange.findMany({
    where: {
      fromDate: { gte: startDate },
    },
    orderBy: { scoreChange: 'desc' },
    take: 10,
  });

  // Get biggest losers (stocks that dropped to HIGH risk)
  const newHighRisk = await prisma.riskAlert.findMany({
    where: {
      alertDate: { gte: startDate },
      alertType: 'NEW_HIGH_RISK',
    },
    include: {
      stock: true,
    },
    orderBy: { alertDate: 'desc' },
    take: 10,
  });

  // Get most promoted stocks
  const promoted = await prisma.socialMediaScan.groupBy({
    by: ['stockId'],
    where: {
      scanDate: { gte: startDate },
      isPromoted: true,
    },
    _count: { stockId: true },
    orderBy: { _count: { stockId: 'desc' } },
    take: 10,
  });

  // Get stock details for promoted
  const promotedStocks = await Promise.all(
    promoted.map(async (p) => {
      const stock = await prisma.stock.findUnique({
        where: { id: p.stockId },
      });
      return {
        symbol: stock?.symbol || 'Unknown',
        name: stock?.name || 'Unknown',
        promotionCount: p._count.stockId,
      };
    })
  );

  // Calculate overall statistics
  const latestSummary = summaries[summaries.length - 1];
  const earliestSummary = summaries[0];

  const overallStats = latestSummary && earliestSummary ? {
    periodStart: format(earliestSummary.scanDate, 'yyyy-MM-dd'),
    periodEnd: format(latestSummary.scanDate, 'yyyy-MM-dd'),
    daysAnalyzed: summaries.length,
    latestHighRisk: latestSummary.highRiskCount,
    earliestHighRisk: earliestSummary.highRiskCount,
    highRiskChange: latestSummary.highRiskCount - earliestSummary.highRiskCount,
    highRiskChangePct: (((latestSummary.highRiskCount - earliestSummary.highRiskCount) / earliestSummary.highRiskCount) * 100).toFixed(1),
    avgHighRiskPct: (summaries.reduce((acc, s) => acc + (s.highRiskCount / s.evaluated) * 100, 0) / summaries.length).toFixed(1),
    maxHighRisk: Math.max(...summaries.map(s => s.highRiskCount)),
    minHighRisk: Math.min(...summaries.map(s => s.highRiskCount)),
  } : null;

  return {
    trendData,
    topMovers,
    newHighRisk,
    promotedStocks,
    overallStats,
  };
}

function printTable(data: Awaited<ReturnType<typeof queryTrends>>, options: QueryOptions) {
  const { trendData, topMovers, newHighRisk, promotedStocks, overallStats } = data;

  console.log('\n' + '═'.repeat(100));
  console.log(`📈 MARKET RISK TRENDS - Last ${options.days} days`);
  if (options.exchange) console.log(`   Exchange: ${options.exchange}`);
  if (options.sector) console.log(`   Sector: ${options.sector}`);
  console.log('═'.repeat(100));

  if (overallStats) {
    console.log(`\n📊 Overall Statistics (${overallStats.periodStart} to ${overallStats.periodEnd}):`);
    console.log(`   Days Analyzed: ${overallStats.daysAnalyzed}`);
    console.log(`   High Risk Change: ${overallStats.earliestHighRisk} → ${overallStats.latestHighRisk} (${overallStats.highRiskChange > 0 ? '+' : ''}${overallStats.highRiskChange}, ${overallStats.highRiskChangePct}%)`);
    console.log(`   Avg High Risk %: ${overallStats.avgHighRiskPct}%`);
    console.log(`   High Risk Range: ${overallStats.minHighRisk} - ${overallStats.maxHighRisk}`);
  }

  if (trendData.length > 0) {
    console.log('\n📅 Daily Breakdown:');
    console.log('─'.repeat(100));
    console.log('Date       | Total  | LOW    | MEDIUM | HIGH   | HIGH%  | P&D  | Pump | Vol');
    console.log('─'.repeat(100));

    for (const day of trendData) {
      console.log(
        `${day.date} | ${day.total.toString().padStart(6)} | ${day.low.toString().padStart(6)} | ${day.medium.toString().padStart(6)} | ${day.high.toString().padStart(6)} | ${day.highRiskPct.padStart(5)}% | ${day.pumpDropCount.toString().padStart(4)} | ${day.activePumpCount.toString().padStart(4)} | ${day.volumeAnomalyCount.toString().padStart(3)}`
      );
    }
  }

  if (topMovers.length > 0) {
    console.log('\n⬆️ Top Risk Score Increases:');
    console.log('─'.repeat(100));
    for (const mover of topMovers) {
      const direction = mover.scoreChange > 0 ? '↑' : '↓';
      console.log(`   ${mover.symbol}: ${mover.fromRiskLevel} → ${mover.toRiskLevel} (${direction}${Math.abs(mover.scoreChange)} pts)`);
    }
  }

  if (newHighRisk.length > 0) {
    console.log('\n🚨 Newly HIGH Risk Stocks:');
    console.log('─'.repeat(100));
    for (const alert of newHighRisk) {
      const date = format(alert.alertDate, 'yyyy-MM-dd');
      console.log(`   ${date}: ${alert.stock.symbol} - ${alert.stock.name}`);
      console.log(`            Score: ${alert.newScore}, Price: $${alert.priceAtAlert?.toFixed(2) || 'N/A'}`);
    }
  }

  if (promotedStocks.length > 0) {
    console.log('\n📱 Most Promoted on Social Media:');
    console.log('─'.repeat(100));
    for (const stock of promotedStocks) {
      console.log(`   ${stock.symbol}: ${stock.promotionCount} mentions (${stock.name})`);
    }
  }

  // ASCII chart for high risk trend
  if (trendData.length > 5) {
    console.log('\n📉 High Risk Trend (ASCII Chart):');
    console.log('─'.repeat(60));

    const highRiskValues = trendData.map(d => d.high);
    const max = Math.max(...highRiskValues);
    const min = Math.min(...highRiskValues);
    const range = max - min || 1;
    const height = 10;

    for (let row = height; row >= 0; row--) {
      const threshold = min + (range * row / height);
      let line = `${Math.round(threshold).toString().padStart(5)} │`;

      for (const value of highRiskValues) {
        if (value >= threshold) {
          line += '█';
        } else if (value >= threshold - (range / height / 2)) {
          line += '▄';
        } else {
          line += ' ';
        }
      }
      console.log(line);
    }
    console.log('      └' + '─'.repeat(highRiskValues.length));
    console.log('       ' + trendData[0].date.slice(5) + ' '.repeat(Math.max(0, highRiskValues.length - 12)) + trendData[trendData.length - 1].date.slice(5));
  }

  console.log('\n' + '═'.repeat(100));
}

async function main() {
  const options = parseArgs();

  try {
    await connectDB();

    console.log(`\nAnalyzing trends (last ${options.days} days)...`);

    const data = await queryTrends(options);

    if (options.format === 'json') {
      console.log(JSON.stringify(data, null, 2));
    } else {
      printTable(data, options);
    }

  } catch (error) {
    console.error('Query failed:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

main();
