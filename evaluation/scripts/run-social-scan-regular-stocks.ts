/**
 * Social Media Scanner for Regular Stocks
 *
 * Scans regular stocks (excluding warrants/rights) that are more likely
 * to have social media promotion activity.
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

async function runRegularStocksScan(): Promise<void> {
    const evaluationDate = process.env.EVALUATION_DATE || new Date().toISOString().split('T')[0];

    console.log('================================================================================');
    console.log('SOCIAL MEDIA SCANNER - REGULAR STOCKS ONLY');
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

    // Filter out warrants, rights, units - these don't get promoted on social media
    const suffixesToExclude = ['W', 'WS', 'R', 'U', 'WT'];
    const regularStocks = highRiskStocks.filter(s =>
        !suffixesToExclude.some(suffix => s.symbol.endsWith(suffix))
    );

    console.log(`Total high-risk stocks: ${highRiskStocks.length}`);
    console.log(`Regular stocks (excluding warrants/rights): ${regularStocks.length}\n`);

    // Sort by score and scan all regular stocks (no artificial limit)
    const maxStocks = process.env.SOCIAL_SCAN_LIMIT ? parseInt(process.env.SOCIAL_SCAN_LIMIT, 10) : regularStocks.length;
    const stocksToScan = regularStocks
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, maxStocks);

    console.log(`Scanning top ${stocksToScan.length} regular high-risk stocks:\n`);
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
        summary: string;
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
                if (scanResult.overallPromotionScore >= 30) {
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
                        redFlags,
                        summary: scanResult.summary
                    });

                    console.log(`  🔴 PROMOTION DETECTED: Score ${scanResult.overallPromotionScore}/100`);
                    console.log(`     Platforms: ${activePlatforms.join(', ') || 'General activity'}`);
                    if (scanResult.summary) {
                        console.log(`     Summary: ${scanResult.summary}`);
                    }
                } else if (scanResult.overallPromotionScore >= 15) {
                    console.log(`  🟡 MODERATE activity: Score ${scanResult.overallPromotionScore}/100`);
                } else {
                    console.log(`  🟢 LOW activity: Score ${scanResult.overallPromotionScore}/100`);
                }

                // Show mention counts
                const totalMentions = scanResult.platforms.reduce((sum, p) => sum + p.mentionsFound, 0);
                if (totalMentions > 0) {
                    console.log(`     Total mentions found: ${totalMentions}`);
                }
            }

            // Rate limiting - be respectful of public APIs
            await new Promise(resolve => setTimeout(resolve, 2500));

        } catch (error: any) {
            console.log(`  ⚠️ Error scanning ${stock.symbol}: ${error?.message || error}`);
        }
    }

    // Save results
    const outputPath = path.join(RESULTS_DIR, `social-media-scan-regular-${evaluationDate}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    // Generate summary report
    console.log('\n' + '='.repeat(80));
    console.log('SOCIAL MEDIA SCAN COMPLETE');
    console.log('='.repeat(80));

    console.log(`\nScanned: ${results.length} regular stocks`);
    console.log(`Stocks with promotion activity: ${promotedStocks.length}`);

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
                if (s.summary) {
                    console.log(`   Summary: ${s.summary}`);
                }
                console.log('');
            });
    } else {
        console.log('\nNo significant promotion activity detected on these stocks.');
        console.log('This may indicate:');
        console.log('  - Promotion happening on platforms we cannot scan (Discord, Telegram)');
        console.log('  - Price movements driven by other factors (news, market conditions)');
        console.log('  - Manipulation without social media component');
    }

    // Create markdown report
    const reportContent = `# Social Media Scan Report - Regular Stocks
## Date: ${evaluationDate}

## Summary
- **Total Regular Stocks Scanned**: ${results.length}
- **Stocks with Promotion Activity**: ${promotedStocks.length}
- **Data Sources**: Reddit (public API), StockTwits (public API), YouTube (limited without API key)

## Methodology
- Excluded warrants (W, WS, WT), rights (R), and units (U)
- Focused on regular common stocks more likely to be promoted
- Scanned all regular high-risk stocks (no limit)

${promotedStocks.length > 0 ? `
## Stocks with Promotion Evidence

${promotedStocks.map((s, i) => `
### ${i + 1}. ${s.symbol} - ${s.name}

| Metric | Value |
|--------|-------|
| Risk Score | ${s.riskScore} |
| Promotion Score | ${s.promotionScore}/100 |
| Active Platforms | ${s.platforms.join(', ') || 'General'} |

**Red Flags**: ${s.redFlags.length > 0 ? s.redFlags.join(', ') : 'None specific'}

**Summary**: ${s.summary || 'N/A'}
`).join('\n')}
` : `
## No Significant Promotion Detected

The scanned stocks showed minimal social media promotion activity. This could indicate:
- Promotion occurring on platforms we cannot scan (Discord, Telegram private groups)
- Price movements driven by legitimate market factors
- Manipulation without coordinated social media campaigns
`}

## All Scan Results

| Symbol | Name | Score | Promotion Score | Risk Level |
|--------|------|-------|-----------------|------------|
${results.map(r => `| ${r.symbol} | ${r.name} | ${r.overallPromotionScore}/100 | ${r.riskLevel} |`).join('\n')}

---
*Generated: ${new Date().toISOString()}*
`;

    const reportPath = path.join(RESULTS_DIR, `social-media-scan-regular-${evaluationDate}.md`);
    fs.writeFileSync(reportPath, reportContent);

    console.log(`\n📁 Results saved to:`);
    console.log(`   - ${outputPath}`);
    console.log(`   - ${reportPath}`);
}

runRegularStocksScan()
    .then(() => {
        console.log('\n✅ Social media scan completed successfully.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Scan failed:', error);
        process.exit(1);
    });
