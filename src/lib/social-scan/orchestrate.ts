/**
 * Social Scan Orchestrator (server-side)
 *
 * Runs all configured scanners, aggregates results per ticker,
 * and stores everything in the database.
 */

import { prisma } from "@/lib/db";
import { getConfiguredScanners } from "./scanners";
import { getScanTargetsFromLatestDailyScan } from "./get-scan-targets";
import {
  ScanTarget, SocialMention, PlatformScanResult,
  TickerScanResult, ScanRunResult,
} from "./types";

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

    // Deduplicate by URL (keep mentions without URLs)
    const seenUrls = new Set<string>();
    const uniqueMentions = tickerMentions.filter(m => {
      if (!m.url) return true; // Keep mentions without URLs (e.g. StockTwits)
      if (seenUrls.has(m.url)) return false;
      seenUrls.add(m.url);
      return true;
    });

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

    const platformsWithMentionsSet = new Set(uniqueMentions.map(m => m.platform));
    const platformsWithMentions = Array.from(platformsWithMentionsSet);
    const highRiskPlatforms = platformsWithMentions.filter(p => {
      const pMentions = uniqueMentions.filter(m => m.platform === p);
      const avgScore = pMentions.reduce((s, m) => s + m.promotionScore, 0) / pMentions.length;
      return avgScore >= 25;
    });

    const riskLevel = highRiskPlatforms.length >= 2 ? 'high'
      : highRiskPlatforms.length >= 1 || overallPromotionScore >= 30 ? 'medium' : 'low';

    let summary = '';
    if (uniqueMentions.length === 0) {
      summary = `No social media mentions found for ${target.ticker}.`;
    } else if (overallPromotionScore >= 50) {
      summary = `HIGH promotional activity for ${target.ticker}: ${uniqueMentions.length} mentions across ${platformsWithMentions.length} platform(s) (${platformsWithMentions.join(', ')}). Avg promotion score: ${overallPromotionScore}/100.`;
    } else {
      summary = `${uniqueMentions.length} mention(s) found for ${target.ticker} on ${platformsWithMentions.join(', ')}. Promotion score: ${overallPromotionScore}/100.`;
    }

    // Group mentions by platform
    const platformBreakdown: PlatformScanResult[] = [];
    for (const platformName of platformsWithMentions) {
      const pMentions = uniqueMentions.filter(m => m.platform === platformName);
      const pAvg = pMentions.reduce((s, m) => s + m.promotionScore, 0) / pMentions.length;
      platformBreakdown.push({
        platform: platformName, scanner: pMentions[0]?.discoveredVia || 'unknown',
        success: true, mentionsFound: pMentions.length, mentions: pMentions,
        activityLevel: pMentions.length >= 10 ? 'high' : pMentions.length >= 3 ? 'medium' : 'low',
        promotionRisk: pAvg >= 50 ? 'high' : pAvg >= 25 ? 'medium' : 'low',
        scanDuration: 0,
      });
    }

    results.push({
      ticker: target.ticker, name: target.name,
      scanDate: new Date().toISOString(), platforms: platformBreakdown,
      totalMentions: uniqueMentions.length, overallPromotionScore, riskLevel,
      hasRealEvidence: uniqueMentions.some(m => m.isPromotional && m.url),
      topPromoters, summary,
    });
  }

  return results.sort((a, b) => b.overallPromotionScore - a.overallPromotionScore);
}

/**
 * Run a full social media scan and store results in the database.
 *
 * @param scanRunId - existing SocialScanRun record ID to update
 * @param triggeredBy - admin user ID who triggered the scan
 * @param manualTickers - optional manual ticker list (overrides DB query)
 */
export async function runSocialScanAndStore(options: {
  scanRunId: string;
  triggeredBy: string;
  manualTickers?: ScanTarget[];
}): Promise<ScanRunResult> {
  const startTime = Date.now();
  const { scanRunId, triggeredBy, manualTickers } = options;

  // Step 1: Get targets (from DB or manual list)
  let targets: ScanTarget[];
  let scanDateStr: string;

  if (manualTickers && manualTickers.length > 0) {
    targets = manualTickers;
    scanDateStr = new Date().toISOString().split('T')[0];
  } else {
    const { targets: dbTargets, scanDate } = await getScanTargetsFromLatestDailyScan(30);
    targets = dbTargets;
    scanDateStr = scanDate || new Date().toISOString().split('T')[0];
  }

  if (targets.length === 0) {
    await prisma.socialScanRun.update({
      where: { id: scanRunId },
      data: {
        status: 'COMPLETED',
        tickersScanned: 0,
        errors: JSON.stringify(['No high-risk tickers found in the latest daily scan to scan for social media promotion.']),
        duration: Date.now() - startTime,
      },
    });

    return {
      scanId: scanRunId, scanDate: scanDateStr, status: 'COMPLETED',
      tickersScanned: 0, tickersWithMentions: 0, totalMentions: 0,
      platformsUsed: [], results: [],
      errors: ['No high-risk tickers found in the latest daily scan'],
      duration: Date.now() - startTime,
    };
  }

  // Step 2: Update scan run with target count
  await prisma.socialScanRun.update({
    where: { id: scanRunId },
    data: { tickersScanned: targets.length },
  });

  // Step 3: Get configured scanners
  const scanners = getConfiguredScanners();
  if (scanners.length === 0) {
    await prisma.socialScanRun.update({
      where: { id: scanRunId },
      data: {
        status: 'FAILED',
        errors: JSON.stringify(['No scanners configured. Set up API keys for YouTube, Google CSE, Perplexity, or Discord Bot.']),
        duration: Date.now() - startTime,
      },
    });

    return {
      scanId: scanRunId, scanDate: scanDateStr, status: 'FAILED',
      tickersScanned: targets.length, tickersWithMentions: 0, totalMentions: 0,
      platformsUsed: [], results: [],
      errors: ['No scanners configured'],
      duration: Date.now() - startTime,
    };
  }

  console.log(`[Social Scan] Starting scan of ${targets.length} tickers with ${scanners.length} scanner(s): ${scanners.map(s => s.name).join(', ')}`);
  console.log(`[Social Scan] Tickers: ${targets.map(t => `${t.ticker} (score: ${t.riskScore})`).join(', ')}`);

  // Step 4: Run all scanners sequentially
  const allPlatformResults: PlatformScanResult[] = [];
  const errors: string[] = [];
  const platformsUsed: string[] = [];

  for (const scanner of scanners) {
    try {
      console.log(`[Social Scan] Running ${scanner.name}...`);
      const results = await scanner.scan(targets);
      allPlatformResults.push(...results);
      platformsUsed.push(scanner.name);

      for (const r of results) {
        if (r.success) {
          console.log(`[Social Scan] ${scanner.name}: ${r.mentionsFound} mentions (${r.activityLevel} activity)`);
        } else if (r.error) {
          errors.push(`${scanner.name}: ${r.error}`);
        }
      }
    } catch (error: any) {
      const msg = `${scanner.name} failed: ${error.message}`;
      console.error(`[Social Scan] ${msg}`);
      errors.push(msg);
    }
  }

  // Step 5: Aggregate results per ticker
  const tickerResults = aggregateResults(targets, allPlatformResults);
  const tickersWithMentions = tickerResults.filter(r => r.totalMentions > 0).length;
  const totalMentions = tickerResults.reduce((sum, r) => sum + r.totalMentions, 0);

  const status = errors.length > 0 && platformsUsed.length === 0 ? 'FAILED'
    : errors.length > 0 ? 'PARTIAL' : 'COMPLETED';

  // Step 6: Store mentions in DB
  let mentionsStored = 0;
  for (const tickerResult of tickerResults) {
    for (const platform of tickerResult.platforms) {
      for (const mention of platform.mentions) {
        try {
          await prisma.socialMention.create({
            data: {
              scanRunId,
              ticker: tickerResult.ticker,
              stockName: tickerResult.name || null,
              platform: mention.platform,
              source: mention.source,
              discoveredVia: mention.discoveredVia,
              title: mention.title || null,
              content: mention.content || null,
              url: mention.url || null,
              author: mention.author || null,
              postDate: mention.postDate ? new Date(mention.postDate) : null,
              engagement: JSON.stringify(mention.engagement || {}),
              sentiment: mention.sentiment || null,
              isPromotional: mention.isPromotional || false,
              promotionScore: mention.promotionScore || 0,
              redFlags: JSON.stringify(mention.redFlags || []),
            },
          });
          mentionsStored++;
        } catch (error: any) {
          console.error(`[Social Scan] Failed to store mention:`, error.message);
        }
      }
    }
  }

  // Step 7: Update scan run with final results
  const duration = Date.now() - startTime;
  await prisma.socialScanRun.update({
    where: { id: scanRunId },
    data: {
      status: status as string,
      tickersScanned: targets.length,
      tickersWithMentions: tickersWithMentions,
      totalMentions: mentionsStored,
      platformsUsed: JSON.stringify(platformsUsed),
      duration,
      errors: JSON.stringify(errors),
    },
  });

  console.log(`[Social Scan] Complete: ${mentionsStored} mentions stored, ${tickersWithMentions}/${targets.length} tickers with mentions, ${status}`);

  return {
    scanId: scanRunId, scanDate: scanDateStr, status: status as any,
    tickersScanned: targets.length, tickersWithMentions, totalMentions: mentionsStored,
    platformsUsed, results: tickerResults, errors, duration,
  };
}
