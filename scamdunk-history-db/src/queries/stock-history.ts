#!/usr/bin/env tsx
/**
 * Stock History Query
 *
 * Query the risk history for a specific stock.
 *
 * Usage:
 *   npm run query:history -- NVDA
 *   npm run query:history -- LVRO --days 30
 *   npm run query:history -- SIDU --format json
 */

import { format, subDays } from 'date-fns';
import { prisma, connectDB, disconnectDB } from '../utils/db.js';

interface QueryOptions {
  symbol: string;
  days: number;
  format: 'table' | 'json';
}

function parseArgs(): QueryOptions {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0].startsWith('-')) {
    console.error('Usage: npm run query:history -- SYMBOL [--days N] [--format table|json]');
    process.exit(1);
  }

  const options: QueryOptions = {
    symbol: args[0].toUpperCase(),
    days: 30,
    format: 'table',
  };

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      options.days = parseInt(args[++i]);
    } else if (args[i] === '--format' && args[i + 1]) {
      options.format = args[++i] as 'table' | 'json';
    }
  }

  return options;
}

async function getStockHistory(symbol: string, days: number) {
  const startDate = subDays(new Date(), days);

  // Get stock info
  const stock = await prisma.stock.findUnique({
    where: { symbol },
  });

  if (!stock) {
    return null;
  }

  // Get daily snapshots
  const snapshots = await prisma.stockDailySnapshot.findMany({
    where: {
      stockId: stock.id,
      scanDate: { gte: startDate },
    },
    orderBy: { scanDate: 'asc' },
  });

  // Get risk changes
  const riskChanges = await prisma.stockRiskChange.findMany({
    where: {
      symbol,
      fromDate: { gte: startDate },
    },
    orderBy: { fromDate: 'desc' },
  });

  // Get social media scans
  const socialScans = await prisma.socialMediaScan.findMany({
    where: {
      stockId: stock.id,
      scanDate: { gte: startDate },
    },
    orderBy: { scanDate: 'desc' },
  });

  // Get alerts
  const alerts = await prisma.riskAlert.findMany({
    where: {
      stockId: stock.id,
      alertDate: { gte: startDate },
    },
    orderBy: { alertDate: 'desc' },
  });

  return {
    stock,
    snapshots,
    riskChanges,
    socialScans,
    alerts,
  };
}

function printTable(data: Awaited<ReturnType<typeof getStockHistory>>) {
  if (!data) {
    console.log('Stock not found in database');
    return;
  }

  const { stock, snapshots, riskChanges, socialScans, alerts } = data;

  console.log('\n' + '═'.repeat(80));
  console.log(`📊 STOCK HISTORY: ${stock.symbol} - ${stock.name}`);
  console.log('═'.repeat(80));

  console.log(`\n📋 Basic Info:`);
  console.log(`   Exchange: ${stock.exchange}`);
  console.log(`   Sector: ${stock.sector || 'Unknown'}`);
  console.log(`   Industry: ${stock.industry || 'Unknown'}`);

  if (snapshots.length > 0) {
    const latest = snapshots[snapshots.length - 1];
    console.log(`\n📈 Latest Snapshot (${format(latest.scanDate, 'yyyy-MM-dd')}):`);
    console.log(`   Risk Level: ${latest.riskLevel}`);
    console.log(`   Score: ${latest.totalScore}`);
    console.log(`   Price: $${latest.lastPrice?.toFixed(2) || 'N/A'}`);
    console.log(`   Market Cap: $${latest.marketCap?.toLocaleString() || 'N/A'}`);
    console.log(`   Signals: ${latest.signalSummary || 'None'}`);
  }

  console.log('\n📅 Daily History:');
  console.log('─'.repeat(80));
  console.log('Date        | Risk   | Score | Price      | Market Cap      | Signals');
  console.log('─'.repeat(80));

  for (const snap of snapshots) {
    const date = format(snap.scanDate, 'yyyy-MM-dd');
    const risk = snap.riskLevel.padEnd(6);
    const score = snap.totalScore.toString().padStart(5);
    const price = snap.lastPrice ? `$${snap.lastPrice.toFixed(2)}`.padStart(10) : 'N/A'.padStart(10);
    const marketCap = snap.marketCap
      ? `$${(snap.marketCap / 1e6).toFixed(1)}M`.padStart(15)
      : 'N/A'.padStart(15);
    const signals = snap.signalSummary?.slice(0, 30) || '';

    console.log(`${date} | ${risk} | ${score} | ${price} | ${marketCap} | ${signals}`);
  }

  if (riskChanges.length > 0) {
    console.log('\n⚡ Risk Changes:');
    console.log('─'.repeat(80));
    for (const change of riskChanges.slice(0, 5)) {
      const from = format(change.fromDate, 'yyyy-MM-dd');
      const to = format(change.toDate, 'yyyy-MM-dd');
      const direction = change.scoreChange > 0 ? '↑' : '↓';
      console.log(`   ${from} → ${to}: ${change.fromRiskLevel} → ${change.toRiskLevel} (${direction}${Math.abs(change.scoreChange)} pts)`);
      if (change.priceChangePct) {
        console.log(`      Price change: ${change.priceChangePct > 0 ? '+' : ''}${change.priceChangePct.toFixed(1)}%`);
      }
    }
  }

  if (socialScans.length > 0) {
    console.log('\n📱 Social Media Activity:');
    console.log('─'.repeat(80));
    for (const scan of socialScans.slice(0, 5)) {
      const date = format(scan.scanDate, 'yyyy-MM-dd');
      console.log(`   ${date}: ${scan.promotionSource || 'Unknown'} - ${scan.promoterName || 'Unknown'}`);
      if (scan.gainFromPromotion) {
        console.log(`      Gain: +${scan.gainFromPromotion.toFixed(1)}%`);
      }
      if (scan.pumpAndDumpConfirmed) {
        console.log(`      ⚠️ PUMP AND DUMP CONFIRMED`);
      }
    }
  }

  if (alerts.length > 0) {
    console.log('\n🚨 Recent Alerts:');
    console.log('─'.repeat(80));
    for (const alert of alerts.slice(0, 5)) {
      const date = format(alert.alertDate, 'yyyy-MM-dd');
      console.log(`   ${date}: ${alert.alertType} - ${alert.previousRiskLevel || 'N/A'} → ${alert.newRiskLevel}`);
    }
  }

  console.log('\n' + '═'.repeat(80));
}

async function main() {
  const options = parseArgs();

  try {
    await connectDB();

    console.log(`\nQuerying history for ${options.symbol} (last ${options.days} days)...`);

    const data = await getStockHistory(options.symbol, options.days);

    if (options.format === 'json') {
      console.log(JSON.stringify(data, null, 2));
    } else {
      printTable(data);
    }

  } catch (error) {
    console.error('Query failed:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

main();
