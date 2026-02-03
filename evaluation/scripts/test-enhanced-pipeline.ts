/**
 * Test Enhanced Pipeline - Local Testing Script
 * 
 * This script tests the enhanced pipeline using existing evaluation results.
 * It focuses on testing Phases 2-5 (filtering, news analysis, social scanning, scheme tracking)
 * without requiring API calls for fresh data.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });

import * as fs from 'fs';

// Import modules
import { performComprehensiveScan } from './real-time-social-scanner';
import {
    loadSchemeDatabase,
    saveSchemeDatabase,
    createSchemeRecord,
    updateSchemeRecord,
    getSchemeSummaries,
    generateDailySchemeReport,
    SchemeDatabase
} from './scheme-tracker';

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const SCHEME_DB_DIR = path.join(__dirname, '..', 'scheme-database');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Ensure directories exist
if (!fs.existsSync(SCHEME_DB_DIR)) fs.mkdirSync(SCHEME_DB_DIR, { recursive: true });

// Thresholds for filtering
const MARKET_CAP_THRESHOLD = 10_000_000_000; // $10B
const VOLUME_THRESHOLD = 10_000_000; // $10M daily volume

interface HighRiskStock {
    symbol: string;
    name: string;
    exchange: string;
    sector: string;
    industry: string;
    marketCap: number | null;
    lastPrice: number | null;
    avgDollarVolume?: number | null;  // Daily dollar volume - may not be present in older data
    riskLevel: string;
    totalScore: number;
    signals: Array<{
        code: string;
        category: string;
        weight: number;
        description: string;
    }>;
    signalSummary: string;
    evaluatedAt: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testEnhancedPipeline(): Promise<void> {
    console.log('='.repeat(80));
    console.log('TEST ENHANCED PIPELINE - Using Existing Data');
    console.log('='.repeat(80));

    // Find the most recent high-risk file
    const files = fs.readdirSync(RESULTS_DIR)
        .filter(f => f.startsWith('fmp-high-risk-') && f.endsWith('.json'))
        .sort()
        .reverse();

    if (files.length === 0) {
        console.error('No high-risk files found in results directory.');
        console.log('Please run the FMP evaluation first, or set FMP_API_KEY for a full test.');
        process.exit(1);
    }

    const latestFile = files[0];
    const highRiskPath = path.join(RESULTS_DIR, latestFile);
    console.log(`\nUsing high-risk data from: ${latestFile}`);

    const highRiskStocks: HighRiskStock[] = JSON.parse(fs.readFileSync(highRiskPath, 'utf-8'));
    console.log(`Loaded ${highRiskStocks.length} high-risk stocks\n`);

    // PHASE 2: Filter by market cap and volume
    console.log('='.repeat(80));
    console.log('PHASE 2: Filtering High-Risk Stocks');
    console.log('-'.repeat(50));

    let filteredByMarketCap = 0;
    let filteredByVolume = 0;
    const afterSizeFilter: HighRiskStock[] = [];

    for (const stock of highRiskStocks) {
        let filtered = false;
        let reason = '';

        if (stock.marketCap && stock.marketCap > MARKET_CAP_THRESHOLD) {
            filtered = true;
            reason = `Large market cap ($${(stock.marketCap / 1_000_000_000).toFixed(1)}B)`;
            filteredByMarketCap++;
        }

        // Volume filter - only applies if avgDollarVolume data is available
        if (!filtered && stock.avgDollarVolume && stock.avgDollarVolume > VOLUME_THRESHOLD) {
            filtered = true;
            reason = `High daily volume ($${(stock.avgDollarVolume / 1_000_000).toFixed(1)}M)`;
            filteredByVolume++;
        }

        if (!filtered) {
            afterSizeFilter.push(stock);
        }
    }

    console.log(`  Filtered by market cap: ${filteredByMarketCap}`);
    console.log(`  Filtered by volume: ${filteredByVolume}`);
    console.log(`  Remaining for analysis: ${afterSizeFilter.length}`);

    // Take top 10 for testing
    const testStocks = afterSizeFilter
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 10);

    console.log(`\nTesting with top ${testStocks.length} highest-risk stocks:\n`);

    // PHASE 3 & 4: Social Media Scanning (skip news check for speed in test)
    console.log('='.repeat(80));
    console.log('PHASE 3 & 4: Social Media Scanning');
    console.log('-'.repeat(50));

    interface ScanResult {
        stock: HighRiskStock;
        socialScan: Awaited<ReturnType<typeof performComprehensiveScan>> | null;
    }

    const scanResults: ScanResult[] = [];

    for (let i = 0; i < testStocks.length; i++) {
        const stock = testStocks[i];
        console.log(`\n[${i + 1}/${testStocks.length}] Scanning ${stock.symbol} (${stock.name})...`);
        console.log(`  Risk Score: ${stock.totalScore}`);
        console.log(`  Signals: ${stock.signals.map(s => s.code).join(', ')}`);

        try {
            const socialScan = await performComprehensiveScan(
                stock.symbol,
                stock.name,
                stock.marketCap || 0
            );

            scanResults.push({ stock, socialScan });

            console.log(`  Aggregated Promotion Score: ${socialScan.aggregatedScore}/100`);
            console.log(`  Risk Assessment: ${socialScan.riskAssessment.overallPromotionRisk.toUpperCase()}`);
            console.log(`  Urgency: ${socialScan.riskAssessment.urgency.toUpperCase()}`);

            if (socialScan.keyFindings.length > 0) {
                console.log(`  Key Findings: ${socialScan.keyFindings.slice(0, 3).join(', ')}`);
            }
        } catch (error: any) {
            console.log(`  Error: ${error?.message || error}`);
            scanResults.push({ stock, socialScan: null });
        }

        await sleep(1000);
    }

    // PHASE 5: Scheme Tracking
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 5: Scheme Tracking');
    console.log('-'.repeat(50));

    const db = loadSchemeDatabase();
    const today = new Date().toISOString().split('T')[0];
    let newSchemes = 0;
    let updatedSchemes = 0;

    for (const result of scanResults) {
        if (!result.socialScan) continue;

        const { stock, socialScan } = result;

        // Check if scheme already exists
        const existingScheme = Object.values(db.schemes).find(
            s => s.symbol === stock.symbol && s.status !== 'RESOLVED'
        );

        if (existingScheme) {
            // Update existing scheme
            updateSchemeRecord(existingScheme, {
                riskScore: stock.totalScore,
                promotionScore: socialScan.aggregatedScore,
                price: stock.lastPrice || 0,
                volume: 0,
                newPlatforms: socialScan.platformResults
                    .filter(p => p.promotionRisk === 'high')
                    .map(p => p.platform),
                newCoordinationIndicators: socialScan.keyFindings
            });

            console.log(`  Updated existing scheme: ${existingScheme.schemeId}`);
            updatedSchemes++;

        } else if (
            socialScan.aggregatedScore >= 50 ||
            socialScan.riskAssessment.urgency === 'immediate'
        ) {
            // Create new scheme
            const newScheme = createSchemeRecord(stock.symbol, stock.name, {
                sector: stock.sector,
                industry: stock.industry,
                riskScore: stock.totalScore,
                promotionScore: socialScan.aggregatedScore,
                price: stock.lastPrice || 0,
                volume: 0,
                promotionPlatforms: socialScan.platformResults
                    .filter(p => p.promotionRisk === 'high')
                    .map(p => p.platform),
                signals: stock.signals.map(s => s.code),
                coordinationIndicators: socialScan.keyFindings,
                promoterAccounts: socialScan.potentialPromoters.map(p => ({
                    platform: p.platform,
                    identifier: p.identifier,
                    confidence: p.confidence
                }))
            });

            db.schemes[newScheme.schemeId] = newScheme;
            console.log(`  🆕 Created new scheme: ${newScheme.schemeId}`);
            newSchemes++;
        }
    }

    // Save scheme database
    saveSchemeDatabase(db);

    console.log(`\n  New schemes: ${newSchemes}`);
    console.log(`  Updated schemes: ${updatedSchemes}`);
    console.log(`  Total active schemes: ${db.activeSchemes}`);

    // Generate report
    const report = generateDailySchemeReport(db, today);
    const reportPath = path.join(RESULTS_DIR, `test-scheme-report-${today}.md`);
    fs.writeFileSync(reportPath, report);
    console.log(`\n  Report saved to: ${reportPath}`);

    // Save test results
    const testResultsPath = path.join(RESULTS_DIR, `test-enhanced-results-${today}.json`);
    fs.writeFileSync(testResultsPath, JSON.stringify({
        testDate: today,
        stocksAnalyzed: testStocks.length,
        newSchemes,
        updatedSchemes,
        results: scanResults.map(r => ({
            symbol: r.stock.symbol,
            name: r.stock.name,
            riskScore: r.stock.totalScore,
            promotionScore: r.socialScan?.aggregatedScore || 0,
            urgency: r.socialScan?.riskAssessment.urgency || 'unknown',
            platforms: r.socialScan?.platformResults.map(p => ({
                name: p.platform,
                activityLevel: p.overallActivityLevel,
                promotionRisk: p.promotionRisk
            })) || []
        }))
    }, null, 2));

    console.log(`  Test results saved to: ${testResultsPath}`);

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));

    const highPromotionStocks = scanResults.filter(
        r => r.socialScan && r.socialScan.aggregatedScore >= 50
    );

    console.log(`\nStocks with HIGH promotion score (>= 50):`);
    if (highPromotionStocks.length === 0) {
        console.log('  None detected in this sample');
    } else {
        for (const result of highPromotionStocks) {
            if (!result.socialScan) continue;
            console.log(`\n  ${result.stock.symbol} (${result.stock.name})`);
            console.log(`    Risk Score: ${result.stock.totalScore}`);
            console.log(`    Promotion Score: ${result.socialScan.aggregatedScore}`);
            console.log(`    Urgency: ${result.socialScan.riskAssessment.urgency}`);
            console.log(`    Key Findings: ${result.socialScan.keyFindings.join(', ')}`);
        }
    }

    // Print scheme summaries
    const summaries = getSchemeSummaries(db);
    if (summaries.length > 0) {
        console.log('\n\nActive Scheme Summaries:');
        console.log('-'.repeat(50));
        for (const s of summaries.slice(0, 5)) {
            console.log(`  [${s.urgency.toUpperCase()}] ${s.symbol} (${s.schemeId})`);
            console.log(`    Days Active: ${s.daysActive} | Risk: ${s.currentRiskScore} | Promo: ${s.currentPromotionScore}`);
        }
    }
}

// Run test
testEnhancedPipeline()
    .then(() => {
        console.log('\n\n✅ Test completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n\n❌ Test failed:', error);
        process.exit(1);
    });
