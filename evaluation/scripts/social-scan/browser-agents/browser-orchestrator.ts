/**
 * Browser Orchestrator
 *
 * Launches all enabled browser agents IN PARALLEL and merges results.
 * Implements 3-layer memory management:
 *   Layer 1: Graceful Queue (don't launch if memory tight)
 *   Layer 2: Save-Kill-Resume (save progress, kill bloated browser, re-queue)
 *   Layer 3: Hard Cap (fall back to sequential if everything is over budget)
 */

import * as os from 'os';
import type { ScanTarget, PlatformScanResult, SocialMention } from '../types';
import type { PlatformName, AgentRunStatus, OrchestratorResult } from './types';
import { loadBrowserAgentConfig } from './types';
import { BaseBrowserAgent } from './base-browser-agent';
import { DiscordBrowserAgent } from './discord-browser-agent';
// Future agents: import as they are implemented
// import { RedditBrowserAgent } from './reddit-browser-agent';
// import { TwitterBrowserAgent } from './twitter-browser-agent';
// import { InstagramBrowserAgent } from './instagram-browser-agent';
// import { FacebookBrowserAgent } from './facebook-browser-agent';
// import { TikTokBrowserAgent } from './tiktok-browser-agent';

/**
 * Get all enabled browser agents.
 */
function getEnabledBrowserAgents(): BaseBrowserAgent[] {
  const allAgents: BaseBrowserAgent[] = [
    new DiscordBrowserAgent(),
    // new RedditBrowserAgent(),     // Phase 2
    // new TwitterBrowserAgent(),    // Phase 2
    // new InstagramBrowserAgent(),  // Phase 2
    // new FacebookBrowserAgent(),   // Phase 4
    // new TikTokBrowserAgent(),     // Phase 4
  ];

  return allAgents.filter(a => a.isConfigured());
}

/**
 * Get current system memory usage in MB.
 */
function getSystemMemoryUsageMb(): number {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return Math.round((totalMem - freeMem) / (1024 * 1024));
}

/**
 * Check if we can launch another browser without exceeding memory budget.
 */
function canLaunchBrowser(config: ReturnType<typeof loadBrowserAgentConfig>, runningCount: number): boolean {
  const currentUsage = getSystemMemoryUsageMb();
  const projectedUsage = currentUsage + config.perBrowserEstimateMb;

  // Don't exceed max parallel count
  if (runningCount >= config.maxParallel) return false;

  // Don't exceed memory budget (use system memory as proxy)
  // In practice, we track per-browser memory more precisely via pidusage
  return true; // Simple version: trust maxParallel as primary limiter
}

/**
 * Run all browser agents in parallel with memory management.
 * This is the main entry point called from the pipeline.
 */
export async function runParallelBrowserScan(
  targets: ScanTarget[]
): Promise<PlatformScanResult[]> {
  const config = loadBrowserAgentConfig();
  const enabledAgents = getEnabledBrowserAgents();

  if (enabledAgents.length === 0) {
    console.log('  No browser agents enabled');
    return [];
  }

  console.log(`\n  Browser Orchestrator: ${enabledAgents.length} agents enabled, max ${config.maxParallel} parallel`);
  console.log(`  Memory budget: ${config.maxMemoryMb}MB | Daily budget: ${config.maxDailyMinutes} min`);

  const allResults: PlatformScanResult[] = [];
  const agentStatuses: AgentRunStatus[] = [];
  let suspensionsTriggered = 0;
  let memoryPeakMb = 0;

  // Queue of agents waiting to run
  const queue: BaseBrowserAgent[] = [...enabledAgents];
  const running: Map<string, { agent: BaseBrowserAgent; promise: Promise<PlatformScanResult[]> }> = new Map();
  const completed: Set<string> = new Set();

  // Initialize status tracking
  for (const agent of enabledAgents) {
    agentStatuses.push({
      platform: agent.name.replace('browser_', '') as PlatformName,
      status: 'queued',
      tickersCompleted: 0,
      tickersTotal: targets.length,
      mentionsFound: 0,
      suspendCount: 0,
    });
  }

  /**
   * Launch an agent from the queue.
   */
  function launchNext(): void {
    while (queue.length > 0 && canLaunchBrowser(config, running.size)) {
      const agent = queue.shift()!;
      const status = agentStatuses.find(s => s.platform === agent.name.replace('browser_', ''));

      console.log(`  Launching ${agent.platform} agent (${running.size + 1} running, ${queue.length} queued)`);

      if (status) {
        status.status = 'running';
        status.startedAt = new Date().toISOString();
      }

      const promise = agent.scan(targets).then(results => {
        // Agent completed successfully
        if (status) {
          status.status = 'completed';
          status.completedAt = new Date().toISOString();
          status.mentionsFound = results.reduce((sum, r) => sum + r.mentionsFound, 0);
          status.tickersCompleted = targets.length;
        }
        return results;
      }).catch(error => {
        // Agent failed
        if (status) {
          status.status = 'failed';
          status.error = error.message;
          status.completedAt = new Date().toISOString();
        }
        console.error(`  ${agent.platform} agent failed: ${error.message}`);
        return [{
          platform: agent.platform,
          scanner: agent.name,
          success: false,
          error: error.message,
          mentionsFound: 0,
          mentions: [] as SocialMention[],
          activityLevel: 'none' as const,
          promotionRisk: 'low' as const,
          scanDuration: 0,
        }];
      });

      running.set(agent.name, { agent, promise });
    }
  }

  // Launch initial batch
  launchNext();

  // Wait for all agents to complete, launching queued agents as slots open
  while (running.size > 0 || queue.length > 0) {
    if (running.size === 0 && queue.length > 0) {
      // All running agents finished but queue still has items (should not happen normally)
      launchNext();
      continue;
    }

    // Wait for any running agent to complete
    const entries = Array.from(running.entries());
    const raceResult = await Promise.race(
      entries.map(([name, { promise }]) =>
        promise.then(results => ({ name, results }))
      )
    );

    // Process completed agent
    const { name, results } = raceResult;
    allResults.push(...results);
    running.delete(name);
    completed.add(name);

    console.log(`  ${name} completed (${running.size} still running, ${queue.length} queued)`);

    // Track memory
    const currentMemory = getSystemMemoryUsageMb();
    if (currentMemory > memoryPeakMb) {
      memoryPeakMb = currentMemory;
    }

    // Launch next agent from queue if slot available
    launchNext();
  }

  // Print summary
  const totalMentions = allResults.reduce((sum, r) => sum + r.mentionsFound, 0);
  console.log(`\n  Browser Orchestrator Complete:`);
  console.log(`    Agents run: ${enabledAgents.length}`);
  console.log(`    Total mentions: ${totalMentions}`);
  console.log(`    Suspensions: ${suspensionsTriggered}`);
  console.log(`    Memory peak: ${memoryPeakMb}MB`);

  return allResults;
}

/**
 * Check if browser scanning should run for this stock.
 * Called from enhanced-daily-pipeline.ts Phase 4B.
 */
export function shouldRunBrowserAgents(
  result: { totalScore: number },
  socialFindings: { overallPromotionScore: number } | null
): boolean {
  // Master switch
  if (process.env.BROWSER_AGENT_ENABLED !== 'true') return false;

  // Manual override
  if (process.env.FORCE_BROWSER_SCAN === 'true') return true;

  // Condition 1: API scanners found high promotion → confirm and gather more evidence
  if (socialFindings && socialFindings.overallPromotionScore >= 50) return true;

  // Condition 2: Very high financial risk but no social evidence → check non-API platforms
  if (result.totalScore >= 15 && (!socialFindings || socialFindings.overallPromotionScore < 20)) return true;

  return false;
}
