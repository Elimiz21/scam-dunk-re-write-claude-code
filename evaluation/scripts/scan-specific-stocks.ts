/**
 * Scan Specific Stocks - Real Social Media Scanner
 *
 * Runs REAL social media scans (Reddit, StockTwits, YouTube) on a list of specific stocks.
 * No AI predictions - only actual API data.
 *
 * Usage:
 *   STOCKS="NUWE,QNCX,MSGY" npx ts-node scripts/scan-specific-stocks.ts
 *
 * Or provide a file:
 *   STOCKS_FILE=suspicious-stocks.txt npx ts-node scripts/scan-specific-stocks.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import * as fs from 'fs';
import { performRealSocialScan, ComprehensiveScanResult } from './real-social-scanner';

const RESULTS_DIR = path.join(__dirname, '..', 'results');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('='.repeat(70));
    console.log('REAL SOCIAL MEDIA SCANNER - Specific Stocks');
    console.log('Uses actual Reddit, StockTwits, and YouTube APIs - NO AI predictions');
    console.log('='.repeat(70));

    // Get stock list from environment
    let stocks: string[] = [];

    if (process.env.STOCKS) {
        stocks = process.env.STOCKS.split(',').map(s => s.trim().toUpperCase());
    } else if (process.env.STOCKS_FILE) {
        const filePath = process.env.STOCKS_FILE;
        if (fs.existsSync(filePath)) {
            stocks = fs.readFileSync(filePath, 'utf-8')
                .split('\n')
                .map(s => s.trim().toUpperCase())
                .filter(s => s.length > 0 && !s.startsWith('#'));
        }
    } else {
        // Default: the 20 suspicious stocks from Feb 3 scan
        stocks = [
            'NUWE', 'QNCX', 'MSGY', 'MDCXW', 'TIRX', 'YJ', 'KXIN', 'XHLD', 'ECDA', 'DAICW',
            'CAPTW', 'BNAIW', 'BATL', 'VGAS', 'MRNO', 'MOBBW', 'PIII', 'SQFTP', 'LSH', 'WLDSW'
        ];
    }

    console.log(`\nStocks to scan: ${stocks.length}`);
    console.log(stocks.join(', '));
    console.log('');

    // Check API keys
    console.log('API Key Status:');
    console.log(`  YouTube API: ${process.env.YOUTUBE_API_KEY ? '✓ Configured' : '✗ Not set (YouTube scans will be skipped)'}`);
    console.log(`  Reddit: ✓ Public API (no key needed)`);
    console.log(`  StockTwits: ✓ Public API (no key needed)`);
    console.log('');

    const results: ComprehensiveScanResult[] = [];
    const startTime = Date.now();

    for (let i = 0; i < stocks.length; i++) {
        const symbol = stocks[i];
        console.log(`\n[${i + 1}/${stocks.length}] Scanning ${symbol}...`);

        try {
            const result = await performRealSocialScan(symbol, symbol, 0);
            results.push(result);

            // Summary
            const realMentions = result.platforms.reduce((sum, p) => sum + p.mentionsFound, 0);
            const hasRealEvidence = result.hasRealSocialEvidence;

            console.log(`  Total real mentions: ${realMentions}`);
            console.log(`  Has promotional evidence: ${hasRealEvidence ? 'YES' : 'No'}`);
            console.log(`  Promotion score: ${result.overallPromotionScore}/100`);

            for (const platform of result.platforms) {
                if (platform.success) {
                    console.log(`    ${platform.platform}: ${platform.mentionsFound} mentions (${platform.promotionRisk} risk)`);
                } else {
                    console.log(`    ${platform.platform}: ${platform.error || 'Failed'}`);
                }
            }

        } catch (error: any) {
            console.log(`  Error: ${error?.message || error}`);
        }

        // Rate limiting - wait between requests
        if (i < stocks.length - 1) {
            await sleep(2000);
        }
    }

    const endTime = Date.now();
    const durationMinutes = Math.round((endTime - startTime) / 60000);

    // Generate summary
    console.log('\n' + '='.repeat(70));
    console.log('SCAN COMPLETE');
    console.log('='.repeat(70));

    const withEvidence = results.filter(r => r.hasRealSocialEvidence);
    const highRisk = results.filter(r => r.riskLevel === 'high');
    const mediumRisk = results.filter(r => r.riskLevel === 'medium');
    const totalMentions = results.reduce((sum, r) =>
        sum + r.platforms.reduce((s, p) => s + p.mentionsFound, 0), 0);

    console.log(`\nSummary:`);
    console.log(`  Stocks scanned: ${results.length}`);
    console.log(`  Duration: ${durationMinutes} minutes`);
    console.log(`  Total real mentions found: ${totalMentions}`);
    console.log(`  With promotional evidence: ${withEvidence.length}`);
    console.log(`  High risk: ${highRisk.length}`);
    console.log(`  Medium risk: ${mediumRisk.length}`);

    if (withEvidence.length > 0) {
        console.log(`\nStocks with REAL promotional evidence:`);
        for (const r of withEvidence) {
            const platforms = r.platforms
                .filter(p => p.promotionRisk === 'high')
                .map(p => p.platform)
                .join(', ');
            console.log(`  ${r.symbol}: ${r.overallPromotionScore}/100 - ${platforms}`);
        }
    }

    // Save results
    const date = new Date().toISOString().split('T')[0];
    const outputPath = path.join(RESULTS_DIR, `real-social-scan-${date}.json`);

    const output = {
        scanDate: date,
        totalScanned: results.length,
        withEvidence: withEvidence.length,
        highRisk: highRisk.length,
        mediumRisk: mediumRisk.length,
        totalMentions,
        durationMinutes,
        results
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nResults saved to: ${outputPath}`);

    // Also save a summary report
    const summaryPath = path.join(RESULTS_DIR, `real-social-scan-summary-${date}.md`);
    let summary = `# Real Social Media Scan Results - ${date}\n\n`;
    summary += `## Summary\n`;
    summary += `- Stocks scanned: ${results.length}\n`;
    summary += `- Total real mentions: ${totalMentions}\n`;
    summary += `- With promotional evidence: ${withEvidence.length}\n`;
    summary += `- High risk: ${highRisk.length}\n`;
    summary += `- Medium risk: ${mediumRisk.length}\n\n`;

    if (withEvidence.length > 0) {
        summary += `## Stocks with Real Promotional Evidence\n\n`;
        for (const r of withEvidence) {
            summary += `### ${r.symbol}\n`;
            summary += `- Promotion Score: ${r.overallPromotionScore}/100\n`;
            summary += `- ${r.summary}\n\n`;
        }
    }

    summary += `## All Results\n\n`;
    summary += `| Symbol | Score | Real Mentions | Risk Level | Evidence |\n`;
    summary += `|--------|-------|---------------|------------|----------|\n`;
    for (const r of results.sort((a, b) => b.overallPromotionScore - a.overallPromotionScore)) {
        const mentions = r.platforms.reduce((s, p) => s + p.mentionsFound, 0);
        summary += `| ${r.symbol} | ${r.overallPromotionScore} | ${mentions} | ${r.riskLevel} | ${r.hasRealSocialEvidence ? 'YES' : 'No'} |\n`;
    }

    fs.writeFileSync(summaryPath, summary);
    console.log(`Summary saved to: ${summaryPath}`);
}

main()
    .then(() => {
        console.log('\n✅ Real social scan completed.');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Scan failed:', error);
        process.exit(1);
    });
