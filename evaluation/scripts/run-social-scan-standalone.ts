/**
 * Standalone Social Media Scanner
 *
 * Runs social media scanning on high-risk stocks from existing evaluation data.
 * Uses only free public APIs (Reddit, StockTwits).
 */

import * as fs from 'fs';
import * as path from 'path';
import { performRealSocialScan, ComprehensiveScanResult } from './real-social-scanner';

const RESULTS_DIR = path.join(__dirname, '..', 'results');

interface HighRiskStock {
    symbol: string;
    name: string;
    totalScore: number;
    marketCap?: number;
}

async function runStandaloneSocialScan(): Promise<void> {
    const evaluationDate = process.env.EVALUATION_DATE || new Date().toISOString().split('T')[0];

    console.log('================================================================================');
    console.log('STANDALONE SOCIAL MEDIA SCANNER');
    console.log(`Date: ${evaluationDate}`);
    console.log('================================================================================\n');

    // Load high-risk stocks from the most recent evaluation
    const highRiskFiles = fs.readdirSync(RESULTS_DIR)
        .filter(f => f.startsWith('fmp-high-risk-') && f.endsWith('.json'))
        .sort()
        .reverse();

    if (highRiskFiles.length === 0) {
        console.error('No high-risk evaluation files found.');
        process.exit(1);
    }

    const latestFile = path.join(RESULTS_DIR, highRiskFiles[0]);
    console.log(`Loading high-risk stocks from: ${highRiskFiles[0]}\n`);

    const highRiskStocks: HighRiskStock[] = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));

    // Sort by score and take top 15 for scanning
    const stocksToScan = highRiskStocks
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 15);

    console.log(`Scanning top ${stocksToScan.length} high-risk stocks:\n`);
    stocksToScan.forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.symbol} (Score: ${s.totalScore}) - ${s.name}`);
    });
    console.log('\n' + '-'.repeat(80) + '\n');

    const results: ComprehensiveScanResult[] = [];
    const promotedStocks: Array<{
        symbol: string;
        name: string;
        riskScore: number;
        promotionScore: number;
        platforms: string[];
        redFlags: string[];
    }> = [];

    for (let i = 0; i < stocksToScan.length; i++) {
        const stock = stocksToScan[i];
        console.log(`\n[${i + 1}/${stocksToScan.length}] Scanning ${stock.symbol} (${stock.name})...`);

        try {
            const scanResult = await performRealSocialScan(
                stock.symbol,
                stock.name,
                stock.marketCap || 0
            );

            if (scanResult) {
                results.push(scanResult);

                // Check if this stock has high promotion activity
                if (scanResult.overallPromotionScore >= 40) {
                    const activePlatforms = scanResult.platforms
                        .filter(p => p.promotionRisk === 'high' || p.promotionRisk === 'medium')
                        .map(p => p.platform);

                    const redFlags = scanResult.platforms
                        .flatMap(p => p.mentions.flatMap(m => m.redFlags))
                        .filter((v, i, a) => a.indexOf(v) === i) // unique
                        .slice(0, 5);

                    promotedStocks.push({
                        symbol: stock.symbol,
                        name: stock.name,
                        riskScore: stock.totalScore,
                        promotionScore: scanResult.overallPromotionScore,
                        platforms: activePlatforms,
                        redFlags
                    });

                    console.log(`  🔴 HIGH PROMOTION DETECTED: Score ${scanResult.overallPromotionScore}/100`);
                    console.log(`     Platforms: ${activePlatforms.join(', ') || 'None'}`);
                } else if (scanResult.overallPromotionScore >= 20) {
                    console.log(`  🟡 MODERATE activity: Score ${scanResult.overallPromotionScore}/100`);
                } else {
                    console.log(`  🟢 LOW activity: Score ${scanResult.overallPromotionScore}/100`);
                }
            }

            // Rate limiting - be respectful of public APIs
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error: any) {
            console.log(`  ⚠️ Error scanning ${stock.symbol}: ${error?.message || error}`);
        }
    }

    // Save results
    const outputPath = path.join(RESULTS_DIR, `social-media-scan-${evaluationDate}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    // Generate summary report
    console.log('\n' + '='.repeat(80));
    console.log('SOCIAL MEDIA SCAN COMPLETE');
    console.log('='.repeat(80));

    console.log(`\nScanned: ${results.length} stocks`);
    console.log(`Promoted stocks found: ${promotedStocks.length}`);

    if (promotedStocks.length > 0) {
        console.log('\n📊 STOCKS WITH SOCIAL MEDIA PROMOTION EVIDENCE:\n');

        promotedStocks
            .sort((a, b) => b.promotionScore - a.promotionScore)
            .forEach((s, i) => {
                console.log(`${i + 1}. ${s.symbol} (${s.name})`);
                console.log(`   Risk Score: ${s.riskScore} | Promotion Score: ${s.promotionScore}/100`);
                console.log(`   Active Platforms: ${s.platforms.join(', ') || 'General activity'}`);
                if (s.redFlags.length > 0) {
                    console.log(`   Red Flags: ${s.redFlags.join('; ')}`);
                }
                console.log('');
            });
    }

    // Create markdown report
    const reportContent = `# Social Media Scan Report - ${evaluationDate}

## Summary
- **Stocks Scanned**: ${results.length}
- **Promotion Detected**: ${promotedStocks.length}
- **Data Sources**: Reddit (public API), StockTwits (public API)

## Stocks with Promotion Evidence

${promotedStocks.length === 0 ? 'No significant promotion activity detected.' : promotedStocks.map((s, i) => `
### ${i + 1}. ${s.symbol} - ${s.name}

| Metric | Value |
|--------|-------|
| Risk Score | ${s.riskScore} |
| Promotion Score | ${s.promotionScore}/100 |
| Active Platforms | ${s.platforms.join(', ') || 'General'} |

**Red Flags**: ${s.redFlags.length > 0 ? s.redFlags.join(', ') : 'None specific'}
`).join('\n')}

## All Scan Results

| Symbol | Name | Promotion Score | Risk Level |
|--------|------|-----------------|------------|
${results.map(r => `| ${r.symbol} | ${r.name} | ${r.overallPromotionScore}/100 | ${r.riskLevel} |`).join('\n')}

---
*Generated: ${new Date().toISOString()}*
`;

    const reportPath = path.join(RESULTS_DIR, `social-media-scan-${evaluationDate}.md`);
    fs.writeFileSync(reportPath, reportContent);

    console.log(`\n📁 Results saved to:`);
    console.log(`   - ${outputPath}`);
    console.log(`   - ${reportPath}`);
}

runStandaloneSocialScan()
    .then(() => {
        console.log('\n✅ Social media scan completed successfully.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Scan failed:', error);
        process.exit(1);
    });
