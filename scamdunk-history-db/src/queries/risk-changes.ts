#!/usr/bin/env tsx
/**
 * Risk Changes Query
 *
 * Find stocks that have changed risk levels over a time period.
 *
 * Usage:
 *   npm run query:changes                    # All changes in last 7 days
 *   npm run query:changes -- --days 30       # Changes in last 30 days
 *   npm run query:changes -- --from LOW --to HIGH  # Specific transitions
 *   npm run query:changes -- --type PUMP_DETECTED  # Specific alert types
 */

import { format, subDays } from 'date-fns';
import { prisma, connectDB, disconnectDB } from '../utils/db.js';

interface QueryOptions {
  days: number;
  fromRisk?: string;
  toRisk?: string;
  alertType?: string;
  limit: number;
  format: 'table' | 'json';
}

function parseArgs(): QueryOptions {
  const args = process.argv.slice(2);

  const options: QueryOptions = {
    days: 7,
    limit: 50,
    format: 'table',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      options.days = parseInt(args[++i]);
    } else if (args[i] === '--from' && args[i + 1]) {
      options.fromRisk = args[++i].toUpperCase();
    } else if (args[i] === '--to' && args[i + 1]) {
      options.toRisk = args[++i].toUpperCase();
    } else if (args[i] === '--type' && args[i + 1]) {
      options.alertType = args[++i];
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i]);
    } else if (args[i] === '--format' && args[i + 1]) {
      options.format = args[++i] as 'table' | 'json';
    }
  }

  return options;
}

async function queryRiskChanges(options: QueryOptions) {
  const startDate = subDays(new Date(), options.days);

  // Build where clause
  const where: any = {
    fromDate: { gte: startDate },
  };

  if (options.fromRisk) {
    where.fromRiskLevel = options.fromRisk;
  }

  if (options.toRisk) {
    where.toRiskLevel = options.toRisk;
  }

  // Get risk changes
  const changes = await prisma.stockRiskChange.findMany({
    where,
    orderBy: [
      { toDate: 'desc' },
      { scoreChange: 'desc' },
    ],
    take: options.limit,
  });

  // Get alerts if type specified
  let alerts: any[] = [];
  if (options.alertType) {
    alerts = await prisma.riskAlert.findMany({
      where: {
        alertDate: { gte: startDate },
        alertType: options.alertType,
      },
      include: {
        stock: true,
      },
      orderBy: { alertDate: 'desc' },
      take: options.limit,
    });
  }

  // Get summary statistics
  const summary = {
    totalChanges: changes.length,
    upgrades: changes.filter(c => {
      const order = { LOW: 0, MEDIUM: 1, HIGH: 2 };
      return (order[c.toRiskLevel as keyof typeof order] || 0) > (order[c.fromRiskLevel as keyof typeof order] || 0);
    }).length,
    downgrades: changes.filter(c => {
      const order = { LOW: 0, MEDIUM: 1, HIGH: 2 };
      return (order[c.toRiskLevel as keyof typeof order] || 0) < (order[c.fromRiskLevel as keyof typeof order] || 0);
    }).length,
    byTransition: {} as Record<string, number>,
  };

  for (const change of changes) {
    const key = `${change.fromRiskLevel}→${change.toRiskLevel}`;
    summary.byTransition[key] = (summary.byTransition[key] || 0) + 1;
  }

  return { changes, alerts, summary };
}

function printTable(data: Awaited<ReturnType<typeof queryRiskChanges>>, options: QueryOptions) {
  const { changes, alerts, summary } = data;

  console.log('\n' + '═'.repeat(100));
  console.log(`⚡ RISK CHANGES - Last ${options.days} days`);
  console.log('═'.repeat(100));

  console.log(`\n📊 Summary:`);
  console.log(`   Total Changes: ${summary.totalChanges}`);
  console.log(`   Risk Increased: ${summary.upgrades}`);
  console.log(`   Risk Decreased: ${summary.downgrades}`);

  console.log(`\n📈 By Transition:`);
  for (const [transition, count] of Object.entries(summary.byTransition).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${transition}: ${count}`);
  }

  if (changes.length > 0) {
    console.log('\n📋 Risk Changes:');
    console.log('─'.repeat(100));
    console.log('Symbol    | From Date  | To Date    | From   | To     | Score Δ | Price Δ%  | New Signals');
    console.log('─'.repeat(100));

    for (const change of changes) {
      const symbol = change.symbol.padEnd(9);
      const fromDate = format(change.fromDate, 'yyyy-MM-dd');
      const toDate = format(change.toDate, 'yyyy-MM-dd');
      const fromRisk = change.fromRiskLevel.padEnd(6);
      const toRisk = change.toRiskLevel.padEnd(6);
      const scoreChange = (change.scoreChange > 0 ? '+' : '') + change.scoreChange.toString().padStart(7);
      const priceChange = change.priceChangePct
        ? ((change.priceChangePct > 0 ? '+' : '') + change.priceChangePct.toFixed(1) + '%').padStart(9)
        : 'N/A'.padStart(9);
      const newSignals = (change.newSignals as string[] || []).slice(0, 3).join(', ').slice(0, 20);

      console.log(`${symbol} | ${fromDate} | ${toDate} | ${fromRisk} | ${toRisk} | ${scoreChange} | ${priceChange} | ${newSignals}`);
    }
  }

  if (alerts.length > 0) {
    console.log(`\n🚨 ${options.alertType} Alerts:`);
    console.log('─'.repeat(100));
    console.log('Date       | Symbol    | From   | To     | Score | Price');
    console.log('─'.repeat(100));

    for (const alert of alerts) {
      const date = format(alert.alertDate, 'yyyy-MM-dd');
      const symbol = alert.stock.symbol.padEnd(9);
      const fromRisk = (alert.previousRiskLevel || 'N/A').padEnd(6);
      const toRisk = alert.newRiskLevel.padEnd(6);
      const score = alert.newScore.toString().padStart(5);
      const price = alert.priceAtAlert ? `$${alert.priceAtAlert.toFixed(2)}` : 'N/A';

      console.log(`${date} | ${symbol} | ${fromRisk} | ${toRisk} | ${score} | ${price}`);
    }
  }

  console.log('\n' + '═'.repeat(100));
}

async function main() {
  const options = parseArgs();

  try {
    await connectDB();

    console.log(`\nQuerying risk changes (last ${options.days} days)...`);
    if (options.fromRisk) console.log(`   From risk: ${options.fromRisk}`);
    if (options.toRisk) console.log(`   To risk: ${options.toRisk}`);
    if (options.alertType) console.log(`   Alert type: ${options.alertType}`);

    const data = await queryRiskChanges(options);

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
