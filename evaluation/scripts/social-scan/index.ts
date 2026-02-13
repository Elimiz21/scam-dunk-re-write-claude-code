/**
 * Social Media Scan Orchestrator
 *
 * Runs all configured scanners in the layered approach:
 * Layer 1: Broad sweep (Google CSE, Perplexity)
 * Layer 2: Platform-specific deep scan (Reddit OAuth, YouTube, StockTwits, Discord)
 *
 * Usage:
 *   npx ts-node evaluation/scripts/social-scan/index.ts [--tickers AAPL,TSLA] [--date 2026-02-11]
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import {
  ScanTarget, SocialMention, PlatformScanResult,
  TickerScanResult, ScanRunResult, SocialScanner
} from './types';
import { RedditOAuthScanner } from './reddit-oauth-scanner';
import { YouTubeScanner } from './youtube-scanner';
import { PerplexityResearcher } from './perplexity-researcher';
import { GoogleCSEScanner } from './google-cse-scanner';
import { StockTwitsScanner } from './stocktwits-scanner';
import { DiscordBotScanner } from './discord-bot-scanner';

const RESULTS_DIR = path.join(__dirname, '..', '..', 'results');

// Initialize all scanners
function getConfiguredScanners(): SocialScanner[] {
  const allScanners: SocialScanner[] = [
    // Layer 1: Broad sweep
    new GoogleCSEScanner(),
    new PerplexityResearcher(),
    // Layer 2: Platform-specific
    new RedditOAuthScanner(),
    new YouTubeScanner(),
    new StockTwitsScanner(),
    new DiscordBotScanner(),
  ];

  const configured = allScanners.filter(s => s.isConfigured());
  const unconfigured = allScanners.filter(s => !s.isConfigured());

  console.log('\nConfigured scanners:');
  for (const s of configured) {
    console.log(`  ✓ ${s.name} (${s.platform})`);
  }
  if (unconfigured.length > 0) {
    console.log('\nUnconfigured scanners (will be skipped):');
    for (const s of unconfigured) {
      console.log(`  ✗ ${s.name} (${s.platform})`);
    }
  }

  return configured;
}

// Load suspicious tickers from the enhanced pipeline output
function loadSuspiciousTickers(date: string): ScanTarget[] {
  // Try loading from the enhanced pipeline suspicious stocks file
  const suspiciousPath = path.join(RESULTS_DIR, `suspicious-stocks-${date}.json`);
  if (fs.existsSync(suspiciousPath)) {
    const data = JSON.parse(fs.readFileSync(suspiciousPath, 'utf-8'));
    const stocks = Array.isArray(data) ? data : data.stocks || data.results || [];
    return stocks.map((s: any) => ({
      ticker: s.symbol || s.ticker,
      name: s.name || s.stockName || '',
      riskScore: s.totalScore || s.riskScore || 0,
      riskLevel: s.riskLevel || 'HIGH',
      signals: s.signals?.map((sig: any) => typeof sig === 'string' ? sig : sig.code) || [],
    }));
  }

  // Try loading from the enhanced high-risk file
  const highRiskPath = path.join(RESULTS_DIR, `enhanced-high-risk-${date}.json`);
  if (fs.existsSync(highRiskPath)) {
    const data = JSON.parse(fs.readFileSync(highRiskPath, 'utf-8'));
    const stocks = Array.isArray(data) ? data : data.stocks || data.results || [];
    return stocks.slice(0, 30).map((s: any) => ({
      ticker: s.symbol || s.ticker,
      name: s.name || s.stockName || '',
      riskScore: s.totalScore || s.riskScore || 0,
      riskLevel: s.riskLevel || 'HIGH',
      signals: s.signals?.map((sig: any) => typeof sig === 'string' ? sig : sig.code) || [],
    }));
  }

  // Try loading from the FMP high-risk file
  const fmpPath = path.join(RESULTS_DIR, `fmp-high-risk-${date}.json`);
  if (fs.existsSync(fmpPath)) {
    const data = JSON.parse(fs.readFileSync(fmpPath, 'utf-8'));
    const stocks = Array.isArray(data) ? data : [];
    return stocks.slice(0, 30).map((s: any) => ({
      ticker: s.symbol,
      name: s.name || '',
      riskScore: s.totalScore || 0,
      riskLevel: 'HIGH' as const,
      signals: s.signals?.map((sig: any) => sig.code) || [],
    }));
  }

  return [];
}

// Combine platform results into per-ticker results
function aggregateResults(
  targets: ScanTarget[],
  platformResults: PlatformScanResult[]
): TickerScanResult[] {
  const results: TickerScanResult[] = [];

  for (const target of targets) {
    const tickerLower = target.ticker.toLowerCase();

    // Find all mentions for this ticker across all platforms
    const tickerMentions: SocialMention[] = [];
    for (const platform of platformResults) {
      for (const mention of platform.mentions) {
        const text = `${mention.title} ${mention.content} ${mention.url}`.toLowerCase();
        if (text.includes(tickerLower) || text.includes(`$${tickerLower}`)) {
          tickerMentions.push(mention);
        }
      }
    }

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const uniqueMentions = tickerMentions.filter(m => {
      if (!m.url || seenUrls.has(m.url)) return false;
      seenUrls.add(m.url);
      return true;
    });

    // Calculate overall promotion score
    const overallPromotionScore = uniqueMentions.length > 0
      ? Math.round(uniqueMentions.reduce((sum, m) => sum + m.promotionScore, 0) / uniqueMentions.length)
      : 0;

    // Find top promoters
    const authorMap = new Map<string, { platform: string; count: number; totalScore: number }>();
    for (const mention of uniqueMentions.filter(m => m.isPromotional)) {
      const key = `${mention.author}@${mention.platform}`;
      const existing = authorMap.get(key) || { platform: mention.platform, count: 0, totalScore: 0 };
      existing.count++;
      existing.totalScore += mention.promotionScore;
      authorMap.set(key, existing);
    }

    const topPromoters = Array.from(authorMap.entries())
      .map(([key, data]) => ({
        platform: data.platform,
        username: key.split('@')[0],
        postCount: data.count,
        avgPromotionScore: Math.round(data.totalScore / data.count),
      }))
      .sort((a, b) => b.postCount - a.postCount || b.avgPromotionScore - a.avgPromotionScore)
      .slice(0, 10);

    // Determine platforms with mentions
    const platformsWithMentions = new Set(uniqueMentions.map(m => m.platform));

    // Risk level
    const highRiskPlatforms = [...platformsWithMentions].filter(p => {
      const platformMentions = uniqueMentions.filter(m => m.platform === p);
      const avgScore = platformMentions.reduce((s, m) => s + m.promotionScore, 0) / platformMentions.length;
      return avgScore >= 40;
    });

    const riskLevel = highRiskPlatforms.length >= 2 ? 'high'
      : highRiskPlatforms.length >= 1 || overallPromotionScore >= 50 ? 'medium' : 'low';

    // Generate summary
    let summary = '';
    if (uniqueMentions.length === 0) {
      summary = `No social media mentions found for ${target.ticker}.`;
    } else if (overallPromotionScore >= 50) {
      summary = `HIGH promotional activity for ${target.ticker}: ${uniqueMentions.length} mentions across ${platformsWithMentions.size} platform(s) (${[...platformsWithMentions].join(', ')}). Average promotion score: ${overallPromotionScore}/100.`;
    } else if (uniqueMentions.length > 0) {
      summary = `${uniqueMentions.length} mention(s) found for ${target.ticker} on ${[...platformsWithMentions].join(', ')}. Promotion score: ${overallPromotionScore}/100.`;
    }

    // Group mentions by platform for the platforms array
    const platformBreakdown: PlatformScanResult[] = [];
    for (const platformName of platformsWithMentions) {
      const pMentions = uniqueMentions.filter(m => m.platform === platformName);
      const pAvg = pMentions.reduce((s, m) => s + m.promotionScore, 0) / pMentions.length;
      platformBreakdown.push({
        platform: platformName,
        scanner: pMentions[0]?.discoveredVia || 'unknown',
        success: true,
        mentionsFound: pMentions.length,
        mentions: pMentions,
        activityLevel: pMentions.length >= 10 ? 'high' : pMentions.length >= 3 ? 'medium' : 'low',
        promotionRisk: pAvg >= 50 ? 'high' : pAvg >= 25 ? 'medium' : 'low',
        scanDuration: 0,
      });
    }

    results.push({
      ticker: target.ticker,
      name: target.name,
      scanDate: new Date().toISOString(),
      platforms: platformBreakdown,
      totalMentions: uniqueMentions.length,
      overallPromotionScore,
      riskLevel,
      hasRealEvidence: uniqueMentions.some(m => m.isPromotional && m.url),
      topPromoters,
      summary,
    });
  }

  return results.sort((a, b) => b.overallPromotionScore - a.overallPromotionScore);
}

// Main scan function
export async function runSocialScan(options: {
  tickers?: ScanTarget[];
  date?: string;
  scanId?: string;
}): Promise<ScanRunResult> {
  const startTime = Date.now();
  const scanDate = options.date || new Date().toISOString().split('T')[0];
  const scanId = options.scanId || `social-scan-${scanDate}-${Date.now()}`;

  console.log('='.repeat(70));
  console.log('SOCIAL MEDIA SCAN');
  console.log(`Date: ${scanDate}`);
  console.log(`Scan ID: ${scanId}`);
  console.log('='.repeat(70));

  // Load targets
  const targets = options.tickers || loadSuspiciousTickers(scanDate);
  if (targets.length === 0) {
    console.log('\nNo suspicious tickers to scan. Exiting.');
    return {
      scanId,
      scanDate,
      status: 'COMPLETED',
      tickersScanned: 0,
      tickersWithMentions: 0,
      totalMentions: 0,
      platformsUsed: [],
      results: [],
      errors: ['No suspicious tickers found to scan'],
      duration: Date.now() - startTime,
    };
  }

  console.log(`\nTickers to scan: ${targets.length}`);
  targets.forEach(t => console.log(`  ${t.ticker} (${t.name}) - Risk: ${t.riskLevel}, Score: ${t.riskScore}`));

  // Get configured scanners
  const scanners = getConfiguredScanners();
  if (scanners.length === 0) {
    console.error('\nNo scanners configured! Set up at least one API key.');
    return {
      scanId,
      scanDate,
      status: 'FAILED',
      tickersScanned: targets.length,
      tickersWithMentions: 0,
      totalMentions: 0,
      platformsUsed: [],
      results: [],
      errors: ['No scanners configured'],
      duration: Date.now() - startTime,
    };
  }

  // Run all scanners
  const allPlatformResults: PlatformScanResult[] = [];
  const errors: string[] = [];
  const platformsUsed: string[] = [];

  for (const scanner of scanners) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Running ${scanner.name} (${scanner.platform})...`);
    console.log('─'.repeat(50));

    try {
      const results = await scanner.scan(targets);
      allPlatformResults.push(...results);
      platformsUsed.push(scanner.name);

      for (const r of results) {
        if (r.success) {
          console.log(`  ✓ ${r.platform}: ${r.mentionsFound} mentions found (${r.activityLevel} activity, ${r.promotionRisk} promotion risk)`);
        } else {
          console.log(`  ✗ ${r.platform}: ${r.error}`);
          if (r.error) errors.push(`${scanner.name}: ${r.error}`);
        }
      }
    } catch (error: any) {
      const msg = `${scanner.name} failed: ${error.message}`;
      console.error(`  ✗ ${msg}`);
      errors.push(msg);
    }
  }

  // Aggregate results
  console.log(`\n${'='.repeat(70)}`);
  console.log('AGGREGATING RESULTS');
  console.log('='.repeat(70));

  const tickerResults = aggregateResults(targets, allPlatformResults);

  const tickersWithMentions = tickerResults.filter(r => r.totalMentions > 0).length;
  const totalMentions = tickerResults.reduce((sum, r) => sum + r.totalMentions, 0);

  // Build scan run result
  const scanResult: ScanRunResult = {
    scanId,
    scanDate,
    status: errors.length > 0 && platformsUsed.length === 0 ? 'FAILED'
      : errors.length > 0 ? 'PARTIAL' : 'COMPLETED',
    tickersScanned: targets.length,
    tickersWithMentions,
    totalMentions,
    platformsUsed,
    results: tickerResults,
    errors,
    duration: Date.now() - startTime,
  };

  // Save results to file
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const outputPath = path.join(RESULTS_DIR, `social-scan-${scanDate}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(scanResult, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);

  // Print summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('SCAN SUMMARY');
  console.log('='.repeat(70));
  console.log(`Tickers scanned:       ${targets.length}`);
  console.log(`Tickers with mentions: ${tickersWithMentions}`);
  console.log(`Total mentions found:  ${totalMentions}`);
  console.log(`Platforms used:        ${platformsUsed.join(', ')}`);
  console.log(`Duration:              ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log(`Status:                ${scanResult.status}`);

  if (tickerResults.filter(r => r.riskLevel === 'high').length > 0) {
    console.log(`\n⚠ HIGH RISK TICKERS:`);
    for (const r of tickerResults.filter(r => r.riskLevel === 'high')) {
      console.log(`  ${r.ticker} (${r.name}): ${r.totalMentions} mentions, score ${r.overallPromotionScore}/100`);
      console.log(`    ${r.summary}`);
      if (r.topPromoters.length > 0) {
        console.log(`    Top promoters: ${r.topPromoters.map(p => `${p.username}@${p.platform}`).join(', ')}`);
      }
    }
  }

  return scanResult;
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  let tickers: ScanTarget[] | undefined;
  let date: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tickers' && args[i + 1]) {
      tickers = args[i + 1].split(',').map(t => ({
        ticker: t.trim().toUpperCase(),
        name: '',
        riskScore: 0,
        riskLevel: 'HIGH' as const,
        signals: [],
      }));
      i++;
    }
    if (args[i] === '--date' && args[i + 1]) {
      date = args[i + 1];
      i++;
    }
  }

  runSocialScan({ tickers, date })
    .then(result => {
      console.log(`\nScan completed with status: ${result.status}`);
      process.exit(result.status === 'FAILED' ? 1 : 0);
    })
    .catch(error => {
      console.error('Scan failed:', error);
      process.exit(1);
    });
}
