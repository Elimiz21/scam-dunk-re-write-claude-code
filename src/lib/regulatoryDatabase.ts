/**
 * Regulatory Database Service
 *
 * Manages the database of flagged stocks from regulatory sources:
 * - SEC (Trading Suspensions, Enforcement Actions)
 * - FINRA (Disciplinary Actions, Investor Alerts)
 * - NYSE/NASDAQ (Delisting Warnings)
 * - OTC Markets (Caveat Emptor, Grey Market)
 */

import { prisma } from '@/lib/db';

export interface RegulatoryCheck {
  isFlagged: boolean;
  flags: RegulatoryFlagInfo[];
  highestSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  sources: string[];
}

export interface RegulatoryFlagInfo {
  source: string;
  flagType: string;
  title: string | null;
  description: string | null;
  flagDate: Date;
  severity: string;
  sourceUrl: string | null;
}

/**
 * Check if a stock has any active regulatory flags
 */
export async function checkRegulatoryDatabase(ticker: string): Promise<RegulatoryCheck> {
  const normalizedTicker = ticker.toUpperCase().trim();

  try {
    const flags = await prisma.regulatoryFlag.findMany({
      where: {
        ticker: normalizedTicker,
        isActive: true,
        OR: [
          { expiryDate: null },
          { expiryDate: { gte: new Date() } },
        ],
      },
      orderBy: {
        flagDate: 'desc',
      },
    });

    if (flags.length === 0) {
      return {
        isFlagged: false,
        flags: [],
        highestSeverity: null,
        sources: [],
      };
    }

    const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    let highestSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    const sources = new Set<string>();

    const flagInfos: RegulatoryFlagInfo[] = flags.map((flag) => {
      sources.add(flag.source);

      const currentSeverity = flag.severity as keyof typeof severityOrder;
      if (severityOrder[currentSeverity] > severityOrder[highestSeverity]) {
        highestSeverity = currentSeverity;
      }

      return {
        source: flag.source,
        flagType: flag.flagType,
        title: flag.title,
        description: flag.description,
        flagDate: flag.flagDate,
        severity: flag.severity,
        sourceUrl: flag.sourceUrl,
      };
    });

    return {
      isFlagged: true,
      flags: flagInfos,
      highestSeverity,
      sources: Array.from(sources),
    };
  } catch (error) {
    console.error('Error checking regulatory database:', error);
    // Don't block the scan if database check fails
    return {
      isFlagged: false,
      flags: [],
      highestSeverity: null,
      sources: [],
    };
  }
}

/**
 * Format regulatory flags for display to user
 */
export function formatRegulatoryWarning(check: RegulatoryCheck): string {
  if (!check.isFlagged) return '';

  const sourceLabels: Record<string, string> = {
    SEC: 'SEC (Securities and Exchange Commission)',
    FINRA: 'FINRA (Financial Industry Regulatory Authority)',
    NYSE: 'NYSE (New York Stock Exchange)',
    NASDAQ: 'NASDAQ',
    OTC: 'OTC Markets',
  };

  const flagTypeLabels: Record<string, string> = {
    TRADING_SUSPENSION: 'Trading Suspension',
    ENFORCEMENT_ACTION: 'Enforcement Action',
    DELISTING_WARNING: 'Delisting Warning',
    FRAUD_ALERT: 'Fraud Alert',
    PUMP_DUMP_WARNING: 'Pump & Dump Warning',
    CAVEAT_EMPTOR: 'Caveat Emptor (Buyer Beware)',
  };

  const warnings: string[] = [];

  for (const flag of check.flags) {
    const source = sourceLabels[flag.source] || flag.source;
    const type = flagTypeLabels[flag.flagType] || flag.flagType;
    const date = flag.flagDate.toLocaleDateString();

    let warning = `**${source}**: ${type} (${date})`;
    if (flag.title) {
      warning += `\n  - ${flag.title}`;
    }
    if (flag.description) {
      const shortDesc = flag.description.length > 200
        ? flag.description.substring(0, 200) + '...'
        : flag.description;
      warning += `\n  - ${shortDesc}`;
    }

    warnings.push(warning);
  }

  return warnings.join('\n\n');
}

/**
 * Sync SEC Trading Suspensions
 * Source: https://www.sec.gov/litigation/suspensions.htm
 */
export async function syncSECTradingSuspensions(): Promise<{
  added: number;
  updated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let added = 0;
  let updated = 0;

  try {
    // Fetch SEC trading suspensions RSS feed
    const response = await fetch(
      'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=34-&dateb=&owner=include&count=100&output=atom'
    );

    if (!response.ok) {
      throw new Error(`SEC RSS fetch failed: ${response.status}`);
    }

    const text = await response.text();

    // Parse the RSS feed for suspension notices
    // The feed contains trading suspension orders under Exchange Act Rule 12(k)
    const tickerPattern = /\b([A-Z]{1,5})\b/g;
    const datePattern = /<updated>([^<]+)<\/updated>/g;
    const titlePattern = /<title[^>]*>([^<]+)<\/title>/g;

    // Extract entries from the feed
    const entries = text.split('<entry>').slice(1);

    for (const entry of entries) {
      const titleMatch = entry.match(/<title[^>]*>([^<]+)<\/title>/);
      const dateMatch = entry.match(/<updated>([^<]+)<\/updated>/);
      const linkMatch = entry.match(/<link[^>]*href="([^"]+)"/);

      if (!titleMatch || !dateMatch) continue;

      const title = titleMatch[1];
      const dateStr = dateMatch[1];
      const sourceUrl = linkMatch ? linkMatch[1] : null;

      // Look for common suspension patterns
      if (
        title.toLowerCase().includes('trading suspension') ||
        title.toLowerCase().includes('order of suspension')
      ) {
        // Extract ticker symbols from the title
        const tickers = title.match(/\b([A-Z]{2,5})\b/g) || [];

        for (const ticker of tickers) {
          // Skip common words that look like tickers
          if (['THE', 'AND', 'FOR', 'INC', 'LLC', 'LTD', 'SEC'].includes(ticker)) {
            continue;
          }

          try {
            const result = await prisma.regulatoryFlag.upsert({
              where: {
                ticker_source_flagType_flagDate: {
                  ticker,
                  source: 'SEC',
                  flagType: 'TRADING_SUSPENSION',
                  flagDate: new Date(dateStr),
                },
              },
              create: {
                ticker,
                source: 'SEC',
                flagType: 'TRADING_SUSPENSION',
                title,
                flagDate: new Date(dateStr),
                sourceUrl,
                severity: 'CRITICAL',
                isActive: true,
              },
              update: {
                title,
                sourceUrl,
                isActive: true,
              },
            });

            if (result.createdAt.getTime() === result.updatedAt.getTime()) {
              added++;
            } else {
              updated++;
            }
          } catch (err) {
            errors.push(`Failed to upsert ${ticker}: ${err}`);
          }
        }
      }
    }

    // Log sync result
    await prisma.regulatoryDatabaseSync.create({
      data: {
        source: 'SEC',
        lastSyncAt: new Date(),
        recordsAdded: added,
        recordsUpdated: updated,
        status: errors.length > 0 ? 'PARTIAL' : 'SUCCESS',
        errorMessage: errors.length > 0 ? errors.join('; ') : null,
      },
    });
  } catch (error) {
    errors.push(`SEC sync failed: ${error}`);

    await prisma.regulatoryDatabaseSync.create({
      data: {
        source: 'SEC',
        lastSyncAt: new Date(),
        recordsAdded: 0,
        recordsUpdated: 0,
        status: 'FAILED',
        errorMessage: errors.join('; '),
      },
    });
  }

  return { added, updated, errors };
}

/**
 * Get sync status for all sources
 */
export async function getRegulatoryDatabaseStatus(): Promise<{
  sources: Array<{
    source: string;
    lastSyncAt: Date | null;
    status: string;
    totalFlags: number;
  }>;
  totalActiveFlags: number;
}> {
  const sources = ['SEC', 'FINRA', 'NYSE', 'NASDAQ', 'OTC'];
  const result: Array<{
    source: string;
    lastSyncAt: Date | null;
    status: string;
    totalFlags: number;
  }> = [];

  for (const source of sources) {
    const lastSync = await prisma.regulatoryDatabaseSync.findFirst({
      where: { source },
      orderBy: { lastSyncAt: 'desc' },
    });

    const flagCount = await prisma.regulatoryFlag.count({
      where: { source, isActive: true },
    });

    result.push({
      source,
      lastSyncAt: lastSync?.lastSyncAt || null,
      status: lastSync?.status || 'NEVER_SYNCED',
      totalFlags: flagCount,
    });
  }

  const totalActiveFlags = await prisma.regulatoryFlag.count({
    where: { isActive: true },
  });

  return {
    sources: result,
    totalActiveFlags,
  };
}
