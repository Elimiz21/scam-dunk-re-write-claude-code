#!/usr/bin/env tsx
/**
 * Ingest Daily Evaluation Results
 *
 * Reads evaluation JSON files from ../evaluation/results/ and ingests them
 * into the historical database for tracking risk changes over time.
 *
 * Usage:
 *   npm run ingest:daily                    # Ingest latest evaluation
 *   npm run ingest:daily -- --date 2026-01-11  # Ingest specific date
 *   npm run ingest:daily -- --file path/to/file.json  # Ingest specific file
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { format, parse } from 'date-fns';
import { prisma, connectDB, disconnectDB } from '../utils/db.js';
import type { EvaluationResult, EvaluationSummary, DailyIngestionReport } from '../utils/types.js';

// Configuration
const EVALUATION_RESULTS_PATH = process.env.EVALUATION_RESULTS_PATH || '../evaluation/results';

interface IngestionOptions {
  date?: string;
  file?: string;
  dryRun?: boolean;
}

function parseArgs(): IngestionOptions {
  const args = process.argv.slice(2);
  const options: IngestionOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      options.date = args[++i];
    } else if (args[i] === '--file' && args[i + 1]) {
      options.file = args[++i];
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function findLatestEvaluationFile(basePath: string): { evalFile: string; summaryFile: string; date: string } | null {
  const resolvedPath = join(process.cwd(), basePath);

  if (!existsSync(resolvedPath)) {
    console.error(`❌ Evaluation results path not found: ${resolvedPath}`);
    return null;
  }

  const files = readdirSync(resolvedPath);

  // Look for fmp-evaluation-YYYY-MM-DD.json files first (preferred)
  const fmpEvalFiles = files
    .filter(f => f.match(/^fmp-evaluation-\d{4}-\d{2}-\d{2}\.json$/))
    .sort()
    .reverse();

  if (fmpEvalFiles.length > 0) {
    const latestFile = fmpEvalFiles[0];
    const dateMatch = latestFile.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : format(new Date(), 'yyyy-MM-dd');
    const summaryFile = `fmp-summary-${date}.json`;

    return {
      evalFile: join(resolvedPath, latestFile),
      summaryFile: existsSync(join(resolvedPath, summaryFile))
        ? join(resolvedPath, summaryFile)
        : '',
      date,
    };
  }

  // Fallback to evaluation-YYYY-MM-DD.json
  const evalFiles = files
    .filter(f => f.match(/^evaluation-\d{4}-\d{2}-\d{2}\.json$/))
    .sort()
    .reverse();

  if (evalFiles.length > 0) {
    const latestFile = evalFiles[0];
    const dateMatch = latestFile.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : format(new Date(), 'yyyy-MM-dd');
    const summaryFile = `summary-${date}.json`;

    return {
      evalFile: join(resolvedPath, latestFile),
      summaryFile: existsSync(join(resolvedPath, summaryFile))
        ? join(resolvedPath, summaryFile)
        : '',
      date,
    };
  }

  return null;
}

function findEvaluationFileByDate(basePath: string, date: string): { evalFile: string; summaryFile: string; date: string } | null {
  const resolvedPath = join(process.cwd(), basePath);

  // Try FMP format first
  const fmpEvalFile = join(resolvedPath, `fmp-evaluation-${date}.json`);
  const fmpSummaryFile = join(resolvedPath, `fmp-summary-${date}.json`);

  if (existsSync(fmpEvalFile)) {
    return {
      evalFile: fmpEvalFile,
      summaryFile: existsSync(fmpSummaryFile) ? fmpSummaryFile : '',
      date,
    };
  }

  // Try standard format
  const evalFile = join(resolvedPath, `evaluation-${date}.json`);
  const summaryFile = join(resolvedPath, `summary-${date}.json`);

  if (existsSync(evalFile)) {
    return {
      evalFile,
      summaryFile: existsSync(summaryFile) ? summaryFile : '',
      date,
    };
  }

  return null;
}

async function getOrCreateStock(symbol: string, data: EvaluationResult): Promise<string> {
  const existing = await prisma.stock.findUnique({
    where: { symbol },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const stock = await prisma.stock.create({
    data: {
      symbol,
      name: data.name,
      exchange: data.exchange,
      sector: data.sector || null,
      industry: data.industry || null,
      isOTC: data.exchange === 'OTC',
    },
  });

  return stock.id;
}

async function ingestEvaluation(
  results: EvaluationResult[],
  summary: EvaluationSummary | null,
  scanDate: Date,
  dryRun: boolean = false
): Promise<DailyIngestionReport> {
  const startTime = Date.now();
  const report: DailyIngestionReport = {
    scanDate: format(scanDate, 'yyyy-MM-dd'),
    totalProcessed: 0,
    newStocks: 0,
    updatedSnapshots: 0,
    errors: 0,
    riskDistribution: {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      INSUFFICIENT: 0,
    },
    duration: 0,
  };

  console.log(`\n📊 Ingesting ${results.length} evaluation results for ${format(scanDate, 'yyyy-MM-dd')}...`);

  if (dryRun) {
    console.log('🔍 DRY RUN - No changes will be made to database');
  }

  // Process in batches
  const batchSize = 100;
  const batches = Math.ceil(results.length / batchSize);

  for (let i = 0; i < batches; i++) {
    const batch = results.slice(i * batchSize, (i + 1) * batchSize);

    for (const result of batch) {
      try {
        if (!result.symbol) {
          console.warn(`⚠️ Skipping result with missing symbol`);
          continue;
        }

        report.totalProcessed++;

        // Count risk levels
        if (result.riskLevel in report.riskDistribution) {
          report.riskDistribution[result.riskLevel as keyof typeof report.riskDistribution]++;
        }

        if (dryRun) continue;

        // Get or create stock
        const existingStock = await prisma.stock.findUnique({
          where: { symbol: result.symbol },
        });

        let stockId: string;
        if (!existingStock) {
          const newStock = await prisma.stock.create({
            data: {
              symbol: result.symbol,
              name: result.name,
              exchange: result.exchange,
              sector: result.sector || null,
              industry: result.industry || null,
              isOTC: result.exchange === 'OTC',
            },
          });
          stockId = newStock.id;
          report.newStocks++;
        } else {
          stockId = existingStock.id;
          // Update stock metadata if changed
          if (existingStock.name !== result.name ||
              existingStock.sector !== result.sector ||
              existingStock.industry !== result.industry) {
            await prisma.stock.update({
              where: { id: stockId },
              data: {
                name: result.name,
                sector: result.sector || null,
                industry: result.industry || null,
              },
            });
          }
        }

        // Upsert daily snapshot
        const signalsJson = JSON.stringify(result.signals || []);
        await prisma.stockDailySnapshot.upsert({
          where: {
            stockId_scanDate: {
              stockId,
              scanDate,
            },
          },
          create: {
            stockId,
            scanDate,
            riskLevel: result.riskLevel,
            totalScore: result.totalScore,
            isLegitimate: result.isLegitimate,
            isInsufficient: result.isInsufficient || false,
            lastPrice: result.lastPrice,
            closePrice: result.lastPrice,
            marketCap: result.marketCap,
            signals: signalsJson,
            signalSummary: result.signalSummary || null,
            signalCount: result.signals?.length || 0,
            dataSource: result.priceDataSource,
            evaluatedAt: new Date(result.evaluatedAt),
          },
          update: {
            riskLevel: result.riskLevel,
            totalScore: result.totalScore,
            isLegitimate: result.isLegitimate,
            isInsufficient: result.isInsufficient || false,
            lastPrice: result.lastPrice,
            closePrice: result.lastPrice,
            marketCap: result.marketCap,
            signals: signalsJson,
            signalSummary: result.signalSummary || null,
            signalCount: result.signals?.length || 0,
            dataSource: result.priceDataSource,
            evaluatedAt: new Date(result.evaluatedAt),
          },
        });

        report.updatedSnapshots++;

      } catch (error) {
        console.error(`❌ Error processing ${result.symbol}:`, error);
        report.errors++;
      }
    }

    // Progress indicator
    const progress = Math.round(((i + 1) / batches) * 100);
    process.stdout.write(`\r   Processing: ${progress}% (${(i + 1) * batchSize}/${results.length})`);
  }

  console.log('\n');

  // Ingest summary if available
  if (summary && !dryRun) {
    console.log('📈 Ingesting scan summary...');

    // Calculate signal counts from results
    const spikeDropCount = results.filter(r =>
      r.signalSummary?.includes('SPIKE_THEN_DROP')
    ).length;

    const activePumpCount = results.filter(r =>
      r.signalSummary?.includes('SPIKE_7D') && !r.signalSummary?.includes('SPIKE_THEN_DROP')
    ).length;

    const volumeAnomalyCount = results.filter(r =>
      r.signalSummary?.includes('VOLUME_EXPLOSION')
    ).length;

    const overboughtCount = results.filter(r =>
      r.signalSummary?.includes('OVERBOUGHT_RSI')
    ).length;

    // Calculate sector breakdown
    const bySector: Record<string, { total: number; LOW: number; MEDIUM: number; HIGH: number }> = {};
    for (const result of results) {
      const sector = result.sector || 'Unknown';
      if (!bySector[sector]) {
        bySector[sector] = { total: 0, LOW: 0, MEDIUM: 0, HIGH: 0 };
      }
      bySector[sector].total++;
      if (result.riskLevel in bySector[sector]) {
        bySector[sector][result.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH']++;
      }
    }

    const byExchangeJson = JSON.stringify(summary.byExchange);
    const bySectorJson = JSON.stringify(bySector);

    await prisma.dailyScanSummary.upsert({
      where: { scanDate },
      create: {
        scanDate,
        totalStocks: summary.totalStocks,
        evaluated: summary.evaluated,
        skippedNoData: summary.skippedNoData,
        lowRiskCount: summary.byRiskLevel.LOW,
        mediumRiskCount: summary.byRiskLevel.MEDIUM,
        highRiskCount: summary.byRiskLevel.HIGH,
        insufficientCount: summary.byRiskLevel.INSUFFICIENT || 0,
        byExchange: byExchangeJson,
        bySector: bySectorJson,
        spikeDropCount,
        activePumpCount,
        volumeAnomalyCount,
        overboughtCount,
        scanStartTime: summary.startTime ? new Date(summary.startTime) : null,
        scanEndTime: summary.endTime ? new Date(summary.endTime) : null,
        scanDurationMins: summary.durationMinutes || null,
        apiCallsMade: summary.apiCallsMade || null,
      },
      update: {
        totalStocks: summary.totalStocks,
        evaluated: summary.evaluated,
        skippedNoData: summary.skippedNoData,
        lowRiskCount: summary.byRiskLevel.LOW,
        mediumRiskCount: summary.byRiskLevel.MEDIUM,
        highRiskCount: summary.byRiskLevel.HIGH,
        insufficientCount: summary.byRiskLevel.INSUFFICIENT || 0,
        byExchange: byExchangeJson,
        bySector: bySectorJson,
        spikeDropCount,
        activePumpCount,
        volumeAnomalyCount,
        overboughtCount,
        scanStartTime: summary.startTime ? new Date(summary.startTime) : null,
        scanEndTime: summary.endTime ? new Date(summary.endTime) : null,
        scanDurationMins: summary.durationMinutes || null,
        apiCallsMade: summary.apiCallsMade || null,
      },
    });
  }

  report.duration = Date.now() - startTime;
  return report;
}

async function detectRiskChanges(scanDate: Date): Promise<void> {
  console.log('🔍 Detecting risk changes from previous day...');

  // Get previous scan date
  const previousSummary = await prisma.dailyScanSummary.findFirst({
    where: {
      scanDate: { lt: scanDate },
    },
    orderBy: { scanDate: 'desc' },
  });

  if (!previousSummary) {
    console.log('   No previous scan found, skipping risk change detection');
    return;
  }

  const previousDate = previousSummary.scanDate;

  // Find stocks that changed risk level
  const currentSnapshots = await prisma.stockDailySnapshot.findMany({
    where: { scanDate },
    include: { stock: true },
  });

  const previousSnapshots = await prisma.stockDailySnapshot.findMany({
    where: { scanDate: previousDate },
  });

  const previousByStock = new Map(previousSnapshots.map(s => [s.stockId, s]));

  let changesDetected = 0;

  for (const current of currentSnapshots) {
    const previous = previousByStock.get(current.stockId);

    if (!previous) continue; // New stock, no comparison

    if (previous.riskLevel !== current.riskLevel) {
      // Determine alert type
      let alertType: string;
      if (current.riskLevel === 'HIGH' && previous.riskLevel !== 'HIGH') {
        alertType = 'NEW_HIGH_RISK';
      } else if (current.totalScore > previous.totalScore) {
        alertType = 'RISK_INCREASED';
      } else {
        alertType = 'RISK_DECREASED';
      }

      // Check for pump/dump patterns
      const currentSignals = current.signalSummary || '';
      const previousSignals = previous.signalSummary || '';

      if (currentSignals.includes('SPIKE_THEN_DROP') && !previousSignals.includes('SPIKE_THEN_DROP')) {
        alertType = 'DUMP_DETECTED';
      } else if (currentSignals.includes('SPIKE_7D') && !previousSignals.includes('SPIKE_7D')) {
        alertType = 'PUMP_DETECTED';
      }

      // Create alert
      await prisma.riskAlert.create({
        data: {
          stockId: current.stockId,
          alertDate: scanDate,
          alertType,
          previousRiskLevel: previous.riskLevel,
          newRiskLevel: current.riskLevel,
          previousScore: previous.totalScore,
          newScore: current.totalScore,
          triggeringSignals: current.signals, // Already a JSON string
          priceAtAlert: current.lastPrice,
        },
      });

      // Create risk change record
      const previousSignalCodes = previousSignals.split(', ').filter(Boolean);
      const currentSignalCodes = currentSignals.split(', ').filter(Boolean);
      const newSignals = currentSignalCodes.filter(s => !previousSignalCodes.includes(s));
      const removedSignals = previousSignalCodes.filter(s => !currentSignalCodes.includes(s));

      await prisma.stockRiskChange.create({
        data: {
          symbol: current.stock.symbol,
          fromDate: previousDate,
          toDate: scanDate,
          fromRiskLevel: previous.riskLevel,
          toRiskLevel: current.riskLevel,
          scoreChange: current.totalScore - previous.totalScore,
          fromPrice: previous.lastPrice,
          toPrice: current.lastPrice,
          priceChangePct: previous.lastPrice && current.lastPrice
            ? ((current.lastPrice - previous.lastPrice) / previous.lastPrice) * 100
            : null,
          newSignals: JSON.stringify(newSignals),
          removedSignals: JSON.stringify(removedSignals),
        },
      });

      changesDetected++;
    }
  }

  console.log(`   Detected ${changesDetected} risk changes`);
}

async function main() {
  const options = parseArgs();

  console.log('🚀 ScamDunk History DB - Daily Evaluation Ingestion');
  console.log('================================================\n');

  try {
    // Find the evaluation file
    let fileInfo: { evalFile: string; summaryFile: string; date: string } | null;

    if (options.file) {
      if (!existsSync(options.file)) {
        console.error(`❌ File not found: ${options.file}`);
        process.exit(1);
      }
      const dateMatch = basename(options.file).match(/(\d{4}-\d{2}-\d{2})/);
      fileInfo = {
        evalFile: options.file,
        summaryFile: '',
        date: dateMatch ? dateMatch[1] : format(new Date(), 'yyyy-MM-dd'),
      };
    } else if (options.date) {
      fileInfo = findEvaluationFileByDate(EVALUATION_RESULTS_PATH, options.date);
      if (!fileInfo) {
        console.error(`❌ No evaluation file found for date: ${options.date}`);
        process.exit(1);
      }
    } else {
      fileInfo = findLatestEvaluationFile(EVALUATION_RESULTS_PATH);
      if (!fileInfo) {
        console.error('❌ No evaluation files found');
        process.exit(1);
      }
    }

    console.log(`📂 Evaluation file: ${fileInfo.evalFile}`);
    if (fileInfo.summaryFile) {
      console.log(`📂 Summary file: ${fileInfo.summaryFile}`);
    }
    console.log(`📅 Scan date: ${fileInfo.date}`);

    // Read files
    console.log('\n📖 Reading evaluation data...');
    const evaluationData = JSON.parse(readFileSync(fileInfo.evalFile, 'utf-8')) as EvaluationResult[];
    console.log(`   Found ${evaluationData.length} stocks`);

    let summaryData: EvaluationSummary | null = null;
    if (fileInfo.summaryFile) {
      summaryData = JSON.parse(readFileSync(fileInfo.summaryFile, 'utf-8')) as EvaluationSummary;
      console.log(`   Summary: ${summaryData.evaluated} evaluated, ${summaryData.byRiskLevel.HIGH} high risk`);
    }

    // Connect to database
    if (!options.dryRun) {
      await connectDB();
    }

    // Parse scan date
    const scanDate = parse(fileInfo.date, 'yyyy-MM-dd', new Date());

    // Ingest data
    const report = await ingestEvaluation(evaluationData, summaryData, scanDate, options.dryRun);

    // Detect risk changes (skip for dry run)
    if (!options.dryRun) {
      await detectRiskChanges(scanDate);
    }

    // Print report
    console.log('\n📊 Ingestion Report');
    console.log('==================');
    console.log(`   Scan Date: ${report.scanDate}`);
    console.log(`   Total Processed: ${report.totalProcessed}`);
    console.log(`   New Stocks: ${report.newStocks}`);
    console.log(`   Updated Snapshots: ${report.updatedSnapshots}`);
    console.log(`   Errors: ${report.errors}`);
    console.log(`   Duration: ${(report.duration / 1000).toFixed(2)}s`);
    console.log('\n   Risk Distribution:');
    console.log(`     LOW: ${report.riskDistribution.LOW}`);
    console.log(`     MEDIUM: ${report.riskDistribution.MEDIUM}`);
    console.log(`     HIGH: ${report.riskDistribution.HIGH}`);
    console.log(`     INSUFFICIENT: ${report.riskDistribution.INSUFFICIENT}`);

    console.log('\n✅ Ingestion complete!');

  } catch (error) {
    console.error('\n❌ Ingestion failed:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

main();
