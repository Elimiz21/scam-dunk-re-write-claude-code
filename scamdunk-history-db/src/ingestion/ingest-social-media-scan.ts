#!/usr/bin/env tsx
/**
 * Ingest Social Media Scan Results
 *
 * Parses social media investigation reports and extracts promoted stock data
 * for storage in the historical database.
 *
 * Usage:
 *   npm run ingest:social                    # Ingest latest report
 *   npm run ingest:social -- --file path/to/report.md  # Ingest specific file
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { format } from 'date-fns';
import { prisma, connectDB, disconnectDB } from '../utils/db.js';
import type { SocialMediaEvidence } from '../utils/types.js';

// Configuration
const REPORTS_PATH = process.env.SOCIAL_MEDIA_RESULTS_PATH || '../evaluation/results';

interface PromotedStock {
  symbol: string;
  name?: string;
  riskScore: number;
  promoterName: string;
  promoterHandle?: string;
  platform: string;
  groupName?: string;
  promotionDate?: Date;
  promotionPrice?: number;
  peakPrice?: number;
  currentPrice?: number;
  gainPercent?: number;
  evidenceLinks: string[];
  signals?: string[];
  pumpAndDumpConfirmed: boolean;
  matchesAtlasPattern: boolean;
  missingDisclosures: boolean;
  notes?: string;
}

interface ParsedReport {
  reportDate: Date;
  promotedStocks: PromotedStock[];
  activePumps: PromotedStock[];
  promoterInfo: {
    name: string;
    handle?: string;
    platform: string;
    groupName?: string;
    memberCount?: number;
  } | null;
}

function parseMarkdownReport(content: string, filename: string): ParsedReport {
  const promotedStocks: PromotedStock[] = [];
  const activePumps: PromotedStock[] = [];

  // Extract date from filename or content
  let reportDate = new Date();
  const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    reportDate = new Date(dateMatch[1]);
  } else {
    // Try to extract from content
    const contentDateMatch = content.match(/(?:Date|January|February|March|April|May|June|July|August|September|October|November|December)[:\s]+(\d{1,2}),?\s*(\d{4})/i);
    if (contentDateMatch) {
      // Parse month name date
    }
  }

  // Extract promoter info
  let promoterInfo: ParsedReport['promoterInfo'] = null;
  const promoterMatch = content.match(/(?:"Making Easy Money"|Making Easy Money)[^"]*(?:by|run by|operated by)?\s*["""]?([^"""\n,]+)["""]?/i);
  const handleMatch = content.match(/@(\w+)/);
  const memberMatch = content.match(/(\d{1,3}(?:,\d{3})*)\+?\s*members/i);

  if (content.includes('Grandmaster-Obi') || content.includes('Making Easy Money')) {
    promoterInfo = {
      name: 'Grandmaster-Obi',
      handle: '@ObiMem',
      platform: 'Discord',
      groupName: 'Making Easy Money',
      memberCount: memberMatch ? parseInt(memberMatch[1].replace(/,/g, '')) : undefined,
    };
  }

  // Parse stock tables - looking for patterns like:
  // | LVRO | 14 | $1.12 | ... |
  // or markdown sections about specific stocks

  // Pattern 1: Stock tables with | separators
  const tableRowPattern = /\|\s*\*?\*?([A-Z]{2,5})\*?\*?\s*\|[^|]*\|[^|]*(?:\$?([\d.]+))?[^|]*\|/g;

  // Pattern 2: Detailed stock sections like "#### 1. LVRO - Lavoro Limited"
  const stockSectionPattern = /####\s*\d+\.\s*([A-Z]{2,5})\s*-\s*([^\n]+)\n([\s\S]*?)(?=####|\n##|\*\*---)/g;

  let match;

  // Extract from detailed sections
  while ((match = stockSectionPattern.exec(content)) !== null) {
    const symbol = match[1];
    const name = match[2].trim();
    const section = match[3];

    // Extract risk score
    const scoreMatch = section.match(/(?:Risk Score|Score)[:\s]*(\d+)/i);
    const riskScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    // Extract price
    const priceMatch = section.match(/(?:Price|Last Price)[:\s]*\$?([\d.]+)/i);
    const currentPrice = priceMatch ? parseFloat(priceMatch[1]) : undefined;

    // Extract promotion price
    const promoMatch = section.match(/(?:Promoted|promoted)[^$]*\$?([\d.]+)/i);
    const promotionPrice = promoMatch ? parseFloat(promoMatch[1]) : undefined;

    // Extract gain percentage
    const gainMatch = section.match(/\+(\d+(?:\.\d+)?)\s*%/);
    const gainPercent = gainMatch ? parseFloat(gainMatch[1]) : undefined;

    // Extract evidence links
    const links: string[] = [];
    const linkPattern = /https?:\/\/[^\s\)]+/g;
    let linkMatch;
    while ((linkMatch = linkPattern.exec(section)) !== null) {
      links.push(linkMatch[0]);
    }

    // Check for patterns
    const pumpAndDumpConfirmed = section.includes('SPIKE_THEN_DROP') ||
      section.toLowerCase().includes('pump-and-dump');
    const matchesAtlasPattern = content.toLowerCase().includes('atlas trading');

    // Extract signals
    const signalsMatch = section.match(/(?:Signals Triggered:|signals:)([\s\S]*?)(?=\n\n|\*\*Social|\n---)/i);
    const signals: string[] = [];
    if (signalsMatch) {
      const signalCodes = signalsMatch[1].match(/[A-Z_]+(?:\s*\(\+\d+)/g) || [];
      signals.push(...signalCodes.map(s => s.split('(')[0].trim()));
    }

    promotedStocks.push({
      symbol,
      name,
      riskScore,
      promoterName: promoterInfo?.name || 'Unknown',
      promoterHandle: promoterInfo?.handle,
      platform: promoterInfo?.platform || 'Discord',
      groupName: promoterInfo?.groupName,
      promotionPrice,
      currentPrice,
      gainPercent,
      evidenceLinks: links,
      signals,
      pumpAndDumpConfirmed,
      matchesAtlasPattern,
      missingDisclosures: content.includes('NO SEC disclosure') ||
        content.includes('Section 17(b)'),
      notes: pumpAndDumpConfirmed ? 'Pump-and-dump pattern detected' : undefined,
    });
  }

  // Parse "ACTIVE PUMP" table for stocks still in pump phase
  const activePumpSection = content.match(/ACTIVE PUMP PHASE[\s\S]*?\n\n\|[\s\S]*?\n\n/);
  if (activePumpSection) {
    const pumpRows = activePumpSection[0].matchAll(/\|\s*([A-Z]{2,5})\s*\|\s*(\d+)\s*\|\s*\$?([\d.]+)\s*\|\s*\+?(\d+)%/g);
    for (const row of pumpRows) {
      activePumps.push({
        symbol: row[1],
        riskScore: parseInt(row[2]),
        currentPrice: parseFloat(row[3]),
        gainPercent: parseFloat(row[4]),
        promoterName: promoterInfo?.name || 'Unknown',
        platform: 'Discord',
        evidenceLinks: [],
        pumpAndDumpConfirmed: false,
        matchesAtlasPattern: false,
        missingDisclosures: false,
        notes: 'Active pump - no drop yet',
      });
    }
  }

  // Also check for the simpler table format in investigation reports
  const investigationTablePattern = /\|\s*\*?\*?([A-Z]{2,5})\*?\*?\s*\|\s*(\d+)\s*\|([^|]*)\|/g;
  while ((match = investigationTablePattern.exec(content)) !== null) {
    const symbol = match[1];
    // Skip if already found
    if (promotedStocks.some(s => s.symbol === symbol)) continue;

    const scoreOrActivity = match[2];
    const description = match[3].trim();

    // Check if this looks like a promoted stock
    if (description.toLowerCase().includes('stocktwits') ||
        description.toLowerCase().includes('reddit') ||
        description.toLowerCase().includes('promoted') ||
        description.toLowerCase().includes('bullish')) {

      promotedStocks.push({
        symbol,
        riskScore: parseInt(scoreOrActivity) || 0,
        promoterName: 'Social Media',
        platform: description.includes('Stocktwits') ? 'StockTwits' :
                  description.includes('Reddit') ? 'Reddit' : 'Social Media',
        evidenceLinks: [],
        pumpAndDumpConfirmed: false,
        matchesAtlasPattern: false,
        missingDisclosures: false,
        notes: description,
      });
    }
  }

  return {
    reportDate,
    promotedStocks,
    activePumps,
    promoterInfo,
  };
}

function findLatestReportFile(basePath: string): string | null {
  const resolvedPath = join(process.cwd(), basePath);

  if (!existsSync(resolvedPath)) {
    console.error(`❌ Reports path not found: ${resolvedPath}`);
    return null;
  }

  const files = readdirSync(resolvedPath);

  // Look for social media / press report files
  const reportFiles = files
    .filter(f =>
      (f.includes('SOCIAL') || f.includes('PRESS') || f.includes('Social_Media')) &&
      f.endsWith('.md')
    )
    .sort()
    .reverse();

  if (reportFiles.length > 0) {
    return join(resolvedPath, reportFiles[0]);
  }

  return null;
}

async function ingestSocialMediaData(
  parsedReport: ParsedReport,
  dryRun: boolean = false
): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  const allStocks = [...parsedReport.promotedStocks, ...parsedReport.activePumps];

  console.log(`\n📱 Ingesting ${allStocks.length} social media records...`);

  if (dryRun) {
    console.log('🔍 DRY RUN - No changes will be made');
    for (const stock of allStocks) {
      console.log(`   Would ingest: ${stock.symbol} (Score: ${stock.riskScore}, Platform: ${stock.platform})`);
      processed++;
    }
    return { processed, errors };
  }

  for (const stock of allStocks) {
    try {
      // Find the stock in database
      const dbStock = await prisma.stock.findUnique({
        where: { symbol: stock.symbol },
      });

      if (!dbStock) {
        console.warn(`   ⚠️ Stock ${stock.symbol} not found in database, creating...`);
        const newStock = await prisma.stock.create({
          data: {
            symbol: stock.symbol,
            name: stock.name || stock.symbol,
            exchange: 'UNKNOWN',
          },
        });

        // Create social media scan record
        await prisma.socialMediaScan.upsert({
          where: {
            stockId_scanDate: {
              stockId: newStock.id,
              scanDate: parsedReport.reportDate,
            },
          },
          create: {
            stockId: newStock.id,
            scanDate: parsedReport.reportDate,
            isPromoted: true,
            promotionScore: Math.min(stock.riskScore, 10),
            promotionSource: stock.platform,
            promoterName: stock.promoterName,
            promoterHandle: stock.promoterHandle,
            promotionGroup: stock.groupName,
            promotionPrice: stock.promotionPrice,
            priceAtScan: stock.currentPrice,
            pricePeakAfter: stock.peakPrice,
            gainFromPromotion: stock.gainPercent,
            evidenceLinks: JSON.stringify(stock.evidenceLinks),
            notes: stock.notes,
            pumpAndDumpConfirmed: stock.pumpAndDumpConfirmed,
            matchesAtlasPattern: stock.matchesAtlasPattern,
            missingDisclosures: stock.missingDisclosures,
          },
          update: {
            isPromoted: true,
            promotionScore: Math.min(stock.riskScore, 10),
            promotionSource: stock.platform,
            promoterName: stock.promoterName,
            promoterHandle: stock.promoterHandle,
            promotionGroup: stock.groupName,
            promotionPrice: stock.promotionPrice,
            priceAtScan: stock.currentPrice,
            pricePeakAfter: stock.peakPrice,
            gainFromPromotion: stock.gainPercent,
            evidenceLinks: JSON.stringify(stock.evidenceLinks),
            notes: stock.notes,
            pumpAndDumpConfirmed: stock.pumpAndDumpConfirmed,
            matchesAtlasPattern: stock.matchesAtlasPattern,
            missingDisclosures: stock.missingDisclosures,
          },
        });

        processed++;
        continue;
      }

      // Create or update social media scan record
      await prisma.socialMediaScan.upsert({
        where: {
          stockId_scanDate: {
            stockId: dbStock.id,
            scanDate: parsedReport.reportDate,
          },
        },
        create: {
          stockId: dbStock.id,
          scanDate: parsedReport.reportDate,
          isPromoted: true,
          promotionScore: Math.min(stock.riskScore, 10),
          promotionSource: stock.platform,
          promoterName: stock.promoterName,
          promoterHandle: stock.promoterHandle,
          promotionGroup: stock.groupName,
          promotionPrice: stock.promotionPrice,
          priceAtScan: stock.currentPrice,
          pricePeakAfter: stock.peakPrice,
          gainFromPromotion: stock.gainPercent,
          evidenceLinks: JSON.stringify(stock.evidenceLinks),
          notes: stock.notes,
          pumpAndDumpConfirmed: stock.pumpAndDumpConfirmed,
          matchesAtlasPattern: stock.matchesAtlasPattern,
          missingDisclosures: stock.missingDisclosures,
        },
        update: {
          isPromoted: true,
          promotionScore: Math.min(stock.riskScore, 10),
          promotionSource: stock.platform,
          promoterName: stock.promoterName,
          promoterHandle: stock.promoterHandle,
          promotionGroup: stock.groupName,
          promotionPrice: stock.promotionPrice,
          priceAtScan: stock.currentPrice,
          pricePeakAfter: stock.peakPrice,
          gainFromPromotion: stock.gainPercent,
          evidenceLinks: JSON.stringify(stock.evidenceLinks),
          notes: stock.notes,
          pumpAndDumpConfirmed: stock.pumpAndDumpConfirmed,
          matchesAtlasPattern: stock.matchesAtlasPattern,
          missingDisclosures: stock.missingDisclosures,
        },
      });

      // Add to promoted watchlist if high risk
      if (stock.riskScore >= 10) {
        await prisma.promotedStockWatchlist.upsert({
          where: {
            symbol_addedDate: {
              symbol: stock.symbol,
              addedDate: parsedReport.reportDate,
            },
          },
          create: {
            symbol: stock.symbol,
            addedDate: parsedReport.reportDate,
            promoterName: stock.promoterName,
            promotionPlatform: stock.platform,
            promotionGroup: stock.groupName,
            entryPrice: stock.promotionPrice || stock.currentPrice || 0,
            entryRiskScore: stock.riskScore,
            peakPrice: stock.peakPrice,
            currentPrice: stock.currentPrice,
            outcome: stock.pumpAndDumpConfirmed ? 'DUMPED' : 'PUMPING',
            maxGainPct: stock.gainPercent,
            currentGainPct: stock.gainPercent,
            evidenceLinks: JSON.stringify(stock.evidenceLinks),
            isActive: true,
          },
          update: {
            currentPrice: stock.currentPrice,
            currentGainPct: stock.gainPercent,
            outcome: stock.pumpAndDumpConfirmed ? 'DUMPED' : 'PUMPING',
          },
        });
      }

      processed++;
      console.log(`   ✓ ${stock.symbol} (${stock.platform})`);

    } catch (error) {
      console.error(`   ❌ Error processing ${stock.symbol}:`, error);
      errors++;
    }
  }

  return { processed, errors };
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((_, i) => args[i - 1] === '--file');
  const dryRun = args.includes('--dry-run');

  console.log('🚀 ScamDunk History DB - Social Media Scan Ingestion');
  console.log('===================================================\n');

  try {
    // Find report file
    let reportFile: string | null;

    if (fileArg) {
      if (!existsSync(fileArg)) {
        console.error(`❌ File not found: ${fileArg}`);
        process.exit(1);
      }
      reportFile = fileArg;
    } else {
      reportFile = findLatestReportFile(REPORTS_PATH);
      if (!reportFile) {
        // Also check the reports subdirectory
        reportFile = findLatestReportFile('../evaluation/reports');
      }
    }

    if (!reportFile) {
      console.error('❌ No social media report files found');
      console.log('   Looked in:', REPORTS_PATH, '../evaluation/reports');
      process.exit(1);
    }

    console.log(`📂 Report file: ${reportFile}`);

    // Read and parse the report
    console.log('\n📖 Reading report...');
    const content = readFileSync(reportFile, 'utf-8');
    const parsed = parseMarkdownReport(content, basename(reportFile));

    console.log(`   Report date: ${format(parsed.reportDate, 'yyyy-MM-dd')}`);
    console.log(`   Promoted stocks found: ${parsed.promotedStocks.length}`);
    console.log(`   Active pumps found: ${parsed.activePumps.length}`);

    if (parsed.promoterInfo) {
      console.log(`   Promoter: ${parsed.promoterInfo.name} (${parsed.promoterInfo.platform})`);
      if (parsed.promoterInfo.memberCount) {
        console.log(`   Group members: ${parsed.promoterInfo.memberCount.toLocaleString()}`);
      }
    }

    // Preview found stocks
    console.log('\n📋 Stocks to ingest:');
    for (const stock of [...parsed.promotedStocks, ...parsed.activePumps].slice(0, 10)) {
      console.log(`   ${stock.symbol}: Score ${stock.riskScore}, ${stock.platform}${stock.pumpAndDumpConfirmed ? ' [DUMP CONFIRMED]' : ''}`);
    }
    if (parsed.promotedStocks.length + parsed.activePumps.length > 10) {
      console.log(`   ... and ${parsed.promotedStocks.length + parsed.activePumps.length - 10} more`);
    }

    // Connect to database
    if (!dryRun) {
      await connectDB();
    }

    // Ingest data
    const result = await ingestSocialMediaData(parsed, dryRun);

    // Print summary
    console.log('\n📊 Ingestion Summary');
    console.log('===================');
    console.log(`   Processed: ${result.processed}`);
    console.log(`   Errors: ${result.errors}`);

    console.log('\n✅ Social media scan ingestion complete!');

  } catch (error) {
    console.error('\n❌ Ingestion failed:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

main();
