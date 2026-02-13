/**
 * CLI Entry Point for Browser Agent Scanning
 *
 * Usage:
 *   npx ts-node evaluation/scripts/social-scan/browser-agents/run-browser-scan.ts \
 *     --tickers ACME,DEFG,HIJK \
 *     --platforms discord,reddit,twitter
 *
 * Options:
 *   --tickers     Comma-separated list of ticker symbols to scan
 *   --platforms   Comma-separated list of platforms (discord,reddit,twitter,instagram,facebook,tiktok)
 *   --date        Override scan date (YYYY-MM-DD)
 *   --force       Ignore rate limits and budget checks
 *
 * Environment:
 *   BROWSER_AGENT_ENABLED=true      Must be set to run
 *   BROWSER_AGENT_DISCORD_ENABLED=true/false  Per-platform toggles
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

import type { ScanTarget } from '../types';
import { runParallelBrowserScan } from './browser-orchestrator';
import { EvidenceCollector } from './evidence-collector';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  let tickers: string[] = [];
  let platforms: string[] = [];
  let date = new Date().toISOString().split('T')[0];
  let force = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--tickers':
        tickers = (args[++i] || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
        break;
      case '--platforms':
        platforms = (args[++i] || '').split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
        break;
      case '--date':
        date = args[++i] || date;
        break;
      case '--force':
        force = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  // Validate
  if (tickers.length === 0) {
    console.error('Error: --tickers is required');
    printHelp();
    process.exit(1);
  }

  // Check master switch
  if (!force && process.env.BROWSER_AGENT_ENABLED !== 'true') {
    console.error('Error: BROWSER_AGENT_ENABLED is not set to true');
    console.error('Set BROWSER_AGENT_ENABLED=true in .env.local or use --force');
    process.exit(1);
  }

  // Override platform toggles if specified
  if (platforms.length > 0) {
    const allPlatforms = ['discord', 'reddit', 'twitter', 'instagram', 'facebook', 'tiktok'];
    for (const p of allPlatforms) {
      const envKey = `BROWSER_AGENT_${p.toUpperCase()}_ENABLED`;
      process.env[envKey] = platforms.includes(p) ? 'true' : 'false';
    }
  }

  if (force) {
    process.env.BROWSER_AGENT_ENABLED = 'true';
  }

  // Build scan targets
  const targets: ScanTarget[] = tickers.map(ticker => ({
    ticker,
    name: '',
    riskScore: 0,
    riskLevel: 'HIGH' as const,
    signals: [],
  }));

  console.log('='.repeat(70));
  console.log('BROWSER AGENT SCAN');
  console.log(`Date: ${date}`);
  console.log(`Tickers: ${tickers.join(', ')}`);
  if (platforms.length > 0) {
    console.log(`Platforms: ${platforms.join(', ')}`);
  }
  console.log('='.repeat(70));

  const startTime = Date.now();

  try {
    // Run parallel browser scan
    const results = await runParallelBrowserScan(targets);

    // Save evidence
    const evidenceCollector = new EvidenceCollector();
    evidenceCollector.saveEvidenceFile(date);

    // Print results
    console.log('\n' + '='.repeat(70));
    console.log('SCAN RESULTS');
    console.log('='.repeat(70));

    let totalMentions = 0;
    for (const result of results) {
      if (result.success) {
        console.log(`\n  ${result.platform} (${result.scanner}):`);
        console.log(`    Mentions found: ${result.mentionsFound}`);
        console.log(`    Activity: ${result.activityLevel} | Promotion risk: ${result.promotionRisk}`);
        totalMentions += result.mentionsFound;

        // Print top mentions
        const topMentions = result.mentions
          .sort((a, b) => b.promotionScore - a.promotionScore)
          .slice(0, 5);

        for (const mention of topMentions) {
          const flag = mention.promotionScore >= 50 ? '🔴' : mention.promotionScore >= 30 ? '🟡' : '🟢';
          console.log(`    ${flag} [${mention.promotionScore}/100] @${mention.author}: ${mention.title.substring(0, 60)}`);
          if (mention.redFlags.length > 0) {
            console.log(`       Flags: ${mention.redFlags.join(', ')}`);
          }
        }
      } else {
        console.log(`\n  ${result.platform}: FAILED - ${result.error}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Total mentions: ${totalMentions} | Duration: ${duration}s`);
    console.log('─'.repeat(70));

    process.exit(0);

  } catch (error: any) {
    console.error(`\nScan failed: ${error.message}`);
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
Browser Agent Scanner - ScamDunk

Usage:
  npx ts-node run-browser-scan.ts --tickers ACME,DEFG [options]

Options:
  --tickers <list>     Comma-separated ticker symbols (required)
  --platforms <list>   Comma-separated platforms: discord,reddit,twitter,instagram
  --date <YYYY-MM-DD>  Override scan date
  --force              Skip BROWSER_AGENT_ENABLED check
  --help               Show this help

Environment Variables:
  BROWSER_AGENT_ENABLED=true              Master switch (required unless --force)
  BROWSER_AGENT_DISCORD_ENABLED=true      Enable Discord scanning
  BROWSER_AGENT_REDDIT_ENABLED=true       Enable Reddit scanning
  BROWSER_AGENT_TWITTER_ENABLED=true      Enable Twitter scanning
  BROWSER_AGENT_INSTAGRAM_ENABLED=true    Enable Instagram scanning
  BROWSER_AGENT_FACEBOOK_ENABLED=false    Enable Facebook scanning (risky)
  BROWSER_AGENT_TIKTOK_ENABLED=false      Enable TikTok scanning
  BROWSER_AGENT_MAX_PARALLEL=4            Max simultaneous browsers
  BROWSER_AGENT_MAX_DAILY_MINUTES=60      Daily browser time budget
  BROWSER_AGENT_MAX_MEMORY_MB=2048        Memory budget for all browsers
  BROWSER_AGENT_CREDENTIALS_PATH=...      Path to encrypted credentials
  BROWSER_AGENT_ENCRYPTION_KEY=...        Encryption key (32-byte hex)

Examples:
  # Scan ACME on Discord only
  npx ts-node run-browser-scan.ts --tickers ACME --platforms discord --force

  # Scan multiple tickers on all enabled platforms
  npx ts-node run-browser-scan.ts --tickers ACME,DEFG,HIJK

  # Force scan with custom date
  npx ts-node run-browser-scan.ts --tickers ACME --date 2026-02-13 --force
`);
}

main();
