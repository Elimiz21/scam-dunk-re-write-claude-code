/**
 * Get scan targets from the latest enhanced daily scan.
 *
 * Queries the database for the most recent daily scan run,
 * filters for HIGH risk stocks, and prioritizes those showing
 * pump signals: volume explosion, price spikes, and pump-and-dump patterns.
 */

import { prisma } from "@/lib/db";
import { ScanTarget } from "./types";

// Pump-related signal codes (higher priority for social scanning)
const PUMP_SIGNALS = [
  'SPIKE_THEN_DROP',     // Classic pump-and-dump pattern
  'VOLUME_EXPLOSION',    // Abnormal volume surge
  'SPIKE_7D',            // Sharp price spike
  'OVERBOUGHT_RSI',      // RSI > 70
  'HIGH_VOLATILITY',     // Extreme daily volatility
];

export async function getScanTargetsFromLatestDailyScan(
  maxTargets: number = 30
): Promise<{ targets: ScanTarget[]; scanDate: string | null }> {
  // Find the most recent scan date that has data
  const latestSnapshot = await prisma.stockDailySnapshot.findFirst({
    where: { riskLevel: 'HIGH' },
    orderBy: { scanDate: 'desc' },
    select: { scanDate: true },
  });

  if (!latestSnapshot) {
    return { targets: [], scanDate: null };
  }

  const scanDate = latestSnapshot.scanDate;

  // Get all HIGH risk stocks from that scan date
  const highRiskStocks = await prisma.stockDailySnapshot.findMany({
    where: {
      scanDate,
      riskLevel: 'HIGH',
      isLegitimate: false,
      isInsufficient: false,
    },
    include: {
      stock: {
        select: { symbol: true, name: true },
      },
    },
    orderBy: { totalScore: 'desc' },
  });

  // Score each stock by pump signal priority
  const scored = highRiskStocks.map(snapshot => {
    let signals: string[] = [];
    try {
      const parsed = JSON.parse(snapshot.signals || '[]');
      signals = parsed.map((s: any) => typeof s === 'string' ? s : s.code || '');
    } catch { /* ignore parse errors */ }

    // Priority score: stocks with pump signals get scanned first
    let priorityScore = snapshot.totalScore;
    for (const signal of signals) {
      if (signal.includes('SPIKE_THEN_DROP')) priorityScore += 20; // Highest priority: P&D pattern
      if (signal.includes('VOLUME_EXPLOSION')) priorityScore += 15;
      if (signal.includes('SPIKE_7D')) priorityScore += 10;
      if (signal.includes('OVERBOUGHT_RSI')) priorityScore += 5;
      if (signal.includes('HIGH_VOLATILITY')) priorityScore += 5;
    }

    // Boost if there's significant volume or price change
    if (snapshot.volumeRatio && snapshot.volumeRatio > 3) priorityScore += 10;
    if (snapshot.priceChangePct && Math.abs(snapshot.priceChangePct) > 25) priorityScore += 10;

    return {
      ticker: snapshot.stock.symbol,
      name: snapshot.stock.name,
      riskScore: snapshot.totalScore,
      riskLevel: 'HIGH' as const,
      signals,
      priorityScore,
    };
  });

  // Sort by priority score (pump signals first) and take top N
  scored.sort((a, b) => b.priorityScore - a.priorityScore);
  const top = scored.slice(0, maxTargets);

  const targets: ScanTarget[] = top.map(s => ({
    ticker: s.ticker,
    name: s.name,
    riskScore: s.riskScore,
    riskLevel: s.riskLevel,
    signals: s.signals,
  }));

  return {
    targets,
    scanDate: scanDate.toISOString().split('T')[0],
  };
}
