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
import { fetchOTCProfile, assessOTCRisk } from '@/lib/otcMarkets';
import { searchFirm } from '@/lib/finra';

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
      take: 100,
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
    SHELL_RISK: 'Shell Company Risk',
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
 * Sync OTC Markets data for a specific ticker
 * Uses the free public backend.otcmarkets.com API
 */
export async function syncOTCMarketsFlags(ticker: string): Promise<{
  added: number;
  updated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let added = 0;
  let updated = 0;
  const normalizedTicker = ticker.toUpperCase().trim();

  try {
    // Check if OTC Markets integration is enabled
    const integration = await prisma.integrationConfig.findUnique({
      where: { name: 'OTC_MARKETS' },
    });
    if (integration && !integration.isEnabled) {
      return { added: 0, updated: 0, errors: ['OTC Markets integration is disabled'] };
    }

    const profile = await fetchOTCProfile(normalizedTicker);

    if (!profile) {
      // Not an OTC stock or API unavailable — not an error
      return { added: 0, updated: 0, errors: [] };
    }

    const risk = assessOTCRisk(profile);
    const now = new Date();

    // Upsert Caveat Emptor flag
    if (profile.caveatEmptor) {
      try {
        const result = await prisma.regulatoryFlag.upsert({
          where: {
            ticker_source_flagType_flagDate: {
              ticker: normalizedTicker,
              source: 'OTC',
              flagType: 'CAVEAT_EMPTOR',
              flagDate: now,
            },
          },
          create: {
            ticker: normalizedTicker,
            source: 'OTC',
            flagType: 'CAVEAT_EMPTOR',
            title: `Caveat Emptor — Buyer Beware Warning`,
            description: `OTC Markets has designated ${normalizedTicker} (${profile.companyName || 'Unknown'}) with a Caveat Emptor warning, indicating a public interest concern.`,
            flagDate: now,
            severity: 'CRITICAL',
            isActive: true,
            sourceUrl: `https://www.otcmarkets.com/stock/${normalizedTicker}/company-info`,
          },
          update: {
            isActive: true,
            description: `OTC Markets has designated ${normalizedTicker} (${profile.companyName || 'Unknown'}) with a Caveat Emptor warning, indicating a public interest concern.`,
          },
        });
        if (result.createdAt.getTime() === result.updatedAt.getTime()) added++;
        else updated++;
      } catch (err) {
        errors.push(`Failed to upsert Caveat Emptor for ${normalizedTicker}: ${err}`);
      }
    }

    // Upsert Shell Risk flag
    if (profile.shellRisk || profile.isShell) {
      try {
        const result = await prisma.regulatoryFlag.upsert({
          where: {
            ticker_source_flagType_flagDate: {
              ticker: normalizedTicker,
              source: 'OTC',
              flagType: 'SHELL_RISK',
              flagDate: now,
            },
          },
          create: {
            ticker: normalizedTicker,
            source: 'OTC',
            flagType: 'SHELL_RISK',
            title: `Shell Company Risk`,
            description: `${normalizedTicker} has been identified as a shell or blank-check entity by OTC Markets.`,
            flagDate: now,
            severity: 'HIGH',
            isActive: true,
            sourceUrl: `https://www.otcmarkets.com/stock/${normalizedTicker}/company-info`,
          },
          update: {
            isActive: true,
          },
        });
        if (result.createdAt.getTime() === result.updatedAt.getTime()) added++;
        else updated++;
      } catch (err) {
        errors.push(`Failed to upsert Shell Risk for ${normalizedTicker}: ${err}`);
      }
    }

    // Upsert Grey Market / Expert Market flag
    if (profile.tierCode === 'GM' || profile.tierCode === 'EM') {
      const tierLabel = profile.tierCode === 'GM' ? 'Grey Market' : 'Expert Market';
      try {
        const result = await prisma.regulatoryFlag.upsert({
          where: {
            ticker_source_flagType_flagDate: {
              ticker: normalizedTicker,
              source: 'OTC',
              flagType: 'DELISTING_WARNING',
              flagDate: now,
            },
          },
          create: {
            ticker: normalizedTicker,
            source: 'OTC',
            flagType: 'DELISTING_WARNING',
            title: `${tierLabel} Designation`,
            description: `${normalizedTicker} trades on the OTC ${tierLabel}, indicating extremely limited transparency and liquidity.`,
            flagDate: now,
            severity: 'HIGH',
            isActive: true,
            sourceUrl: `https://www.otcmarkets.com/stock/${normalizedTicker}/security`,
          },
          update: {
            isActive: true,
            title: `${tierLabel} Designation`,
          },
        });
        if (result.createdAt.getTime() === result.updatedAt.getTime()) added++;
        else updated++;
      } catch (err) {
        errors.push(`Failed to upsert tier flag for ${normalizedTicker}: ${err}`);
      }
    }

    // Upsert Promotion flag
    if (profile.hasPromotion) {
      try {
        const result = await prisma.regulatoryFlag.upsert({
          where: {
            ticker_source_flagType_flagDate: {
              ticker: normalizedTicker,
              source: 'OTC',
              flagType: 'PUMP_DUMP_WARNING',
              flagDate: now,
            },
          },
          create: {
            ticker: normalizedTicker,
            source: 'OTC',
            flagType: 'PUMP_DUMP_WARNING',
            title: `Active Stock Promotion Detected`,
            description: `OTC Markets has flagged active promotional activity for ${normalizedTicker}. Promoted stocks carry elevated pump-and-dump risk.`,
            flagDate: now,
            severity: 'HIGH',
            isActive: true,
            sourceUrl: `https://www.otcmarkets.com/stock/${normalizedTicker}/company-info`,
          },
          update: {
            isActive: true,
          },
        });
        if (result.createdAt.getTime() === result.updatedAt.getTime()) added++;
        else updated++;
      } catch (err) {
        errors.push(`Failed to upsert promotion flag for ${normalizedTicker}: ${err}`);
      }
    }

    // Log sync
    await prisma.regulatoryDatabaseSync.create({
      data: {
        source: 'OTC',
        lastSyncAt: now,
        recordsAdded: added,
        recordsUpdated: updated,
        status: errors.length > 0 ? 'PARTIAL' : 'SUCCESS',
        errorMessage: errors.length > 0 ? errors.join('; ') : null,
      },
    });
  } catch (error) {
    errors.push(`OTC Markets sync failed for ${normalizedTicker}: ${error}`);

    await prisma.regulatoryDatabaseSync.create({
      data: {
        source: 'OTC',
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
 * Sync FINRA data for a specific firm name
 * Uses the free public api.brokercheck.finra.org API
 */
export async function syncFINRAFlags(firmName: string, ticker?: string): Promise<{
  added: number;
  updated: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let added = 0;
  let updated = 0;

  try {
    // Check if FINRA integration is enabled
    const integration = await prisma.integrationConfig.findUnique({
      where: { name: 'FINRA' },
    });
    if (integration && !integration.isEnabled) {
      return { added: 0, updated: 0, errors: ['FINRA integration is disabled'] };
    }

    const firms = await searchFirm(firmName);
    if (firms.length === 0) {
      return { added: 0, updated: 0, errors: [] };
    }

    const now = new Date();
    const targetTicker = ticker?.toUpperCase().trim() || firmName.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 5);

    for (const firm of firms.slice(0, 3)) {
      if (!firm.hasDisclosures || firm.disclosureCount === 0) continue;

      const severity = firm.disclosureCount >= 10 ? 'HIGH' : firm.disclosureCount >= 3 ? 'MEDIUM' : 'LOW';

      try {
        const result = await prisma.regulatoryFlag.upsert({
          where: {
            ticker_source_flagType_flagDate: {
              ticker: targetTicker,
              source: 'FINRA',
              flagType: 'ENFORCEMENT_ACTION',
              flagDate: now,
            },
          },
          create: {
            ticker: targetTicker,
            source: 'FINRA',
            flagType: 'ENFORCEMENT_ACTION',
            title: `FINRA Disclosures: ${firm.name}`,
            description: `${firm.name} (CRD #${firm.sourceId}) has ${firm.disclosureCount} disclosure(s) on FINRA BrokerCheck, which may include customer complaints, regulatory actions, or disciplinary proceedings.`,
            flagDate: now,
            severity,
            isActive: true,
            sourceUrl: `https://brokercheck.finra.org/firm/summary/${firm.sourceId}`,
          },
          update: {
            isActive: true,
            severity,
            description: `${firm.name} (CRD #${firm.sourceId}) has ${firm.disclosureCount} disclosure(s) on FINRA BrokerCheck, which may include customer complaints, regulatory actions, or disciplinary proceedings.`,
          },
        });

        if (result.createdAt.getTime() === result.updatedAt.getTime()) added++;
        else updated++;
      } catch (err) {
        errors.push(`Failed to upsert FINRA flag for ${firm.name}: ${err}`);
      }
    }

    // Log sync
    await prisma.regulatoryDatabaseSync.create({
      data: {
        source: 'FINRA',
        lastSyncAt: now,
        recordsAdded: added,
        recordsUpdated: updated,
        status: errors.length > 0 ? 'PARTIAL' : 'SUCCESS',
        errorMessage: errors.length > 0 ? errors.join('; ') : null,
      },
    });
  } catch (error) {
    errors.push(`FINRA sync failed for ${firmName}: ${error}`);

    await prisma.regulatoryDatabaseSync.create({
      data: {
        source: 'FINRA',
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

  // Batch: fetch all syncs and flag counts in 2 queries instead of 10
  const [allSyncs, flagCounts, totalActiveFlags] = await Promise.all([
    prisma.regulatoryDatabaseSync.findMany({
      where: { source: { in: sources } },
      orderBy: { lastSyncAt: 'desc' },
      distinct: ['source'] as const,
    }),
    prisma.regulatoryFlag.groupBy({
      by: ['source'],
      where: { source: { in: sources }, isActive: true },
      _count: true,
    }),
    prisma.regulatoryFlag.count({
      where: { isActive: true },
    }),
  ]);

  const syncMap = new Map(allSyncs.map(s => [s.source, s]));
  const flagCountMap = new Map(flagCounts.map(f => [f.source, f._count]));

  const result = sources.map(source => ({
    source,
    lastSyncAt: syncMap.get(source)?.lastSyncAt || null,
    status: syncMap.get(source)?.status || 'NEVER_SYNCED',
    totalFlags: flagCountMap.get(source) || 0,
  }));

  return {
    sources: result,
    totalActiveFlags,
  };
}
