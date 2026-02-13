/**
 * Base Browser Agent
 *
 * Abstract class that all platform agents extend.
 * Implements the SocialScanner interface for plug-compatibility with
 * the existing scanner pipeline.
 *
 * Features:
 * - Cookie-based session persistence (via SessionManager)
 * - Per-ticker progress checkpointing (for save-kill-resume)
 * - Rate limiting per platform
 * - Evidence collection (screenshots for high-score findings)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SocialScanner, ScanTarget, PlatformScanResult, SocialMention } from '../types';
import { calculatePromotionScore } from '../types';
import { createBrowserProvider, randomDelay } from './browser-provider';
import { SessionManager } from './session-manager';
import { RateLimiter } from './rate-limiter';
import { CostTracker } from './cost-tracker';
import { EvidenceCollector } from './evidence-collector';
import type { BrowserProvider, BrowserSession, PlatformName, AgentProgress } from './types';

const PROGRESS_DIR = path.join(__dirname, '..', '..', '..', 'evaluation', 'browser-sessions');

export abstract class BaseBrowserAgent implements SocialScanner {
  abstract name: string;      // e.g., "browser_discord"
  abstract platform: string;  // e.g., "Discord"

  protected abstract platformName: PlatformName; // e.g., "discord"
  protected provider: BrowserProvider;
  protected session: BrowserSession | null = null;
  protected sessionManager: SessionManager;
  protected rateLimiter: RateLimiter;
  protected costTracker: CostTracker;
  protected evidenceCollector: EvidenceCollector;
  private sessionId: string = '';

  constructor() {
    this.provider = createBrowserProvider();
    this.sessionManager = new SessionManager();
    this.rateLimiter = new RateLimiter();
    this.costTracker = new CostTracker();
    this.evidenceCollector = new EvidenceCollector();
  }

  /**
   * Check if this agent is configured and enabled.
   */
  isConfigured(): boolean {
    const envKey = `BROWSER_AGENT_${this.platformName.toUpperCase()}_ENABLED`;
    const enabled = process.env[envKey];
    // Default enabled status comes from the platform config
    if (enabled === undefined) {
      const { DEFAULT_PLATFORM_CONFIGS } = require('./types');
      return DEFAULT_PLATFORM_CONFIGS[this.platformName]?.enabled ?? false;
    }
    return enabled === 'true';
  }

  /**
   * Main scan method - implements SocialScanner interface.
   * Handles login, progress resume, per-ticker scanning, and evidence collection.
   */
  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    this.sessionId = `${this.platformName}-${Date.now()}`;

    // Check daily budget
    if (!this.costTracker.hasBudget()) {
      console.log(`  ${this.platform}: Daily budget exhausted (${this.costTracker.getRemainingMinutes().toFixed(1)} min remaining)`);
      return [this.buildErrorResult('Daily budget exhausted', startTime)];
    }

    this.costTracker.startSession(this.sessionId);
    let completedMentions: SocialMention[] = [];
    let remaining = [...targets];

    try {
      // Resume from saved progress if this is a re-queued agent
      if (this.hasSavedProgress()) {
        const saved = this.loadProgress();
        completedMentions = saved.mentionsSoFar;
        remaining = saved.remainingTickers;
        console.log(`  ${this.platform}: Resuming - ${saved.completedTickers.length} tickers done, ${remaining.length} remaining`);
      }

      // Launch browser
      console.log(`  ${this.platform}: Launching browser...`);
      this.session = await this.provider.launch();

      // Login (load cookies first, re-auth if needed)
      const loggedIn = await this.sessionManager.ensureLoggedIn(this.session, this.platformName);
      if (!loggedIn) {
        return [this.buildErrorResult('Login failed', startTime)];
      }

      // Scan each ticker
      for (const target of remaining) {
        // Check rate limits
        if (!this.rateLimiter.canProceed(this.platformName)) {
          console.log(`  ${this.platform}: Rate limited, stopping scan`);
          break;
        }

        // Check budget
        if (!this.costTracker.hasBudget()) {
          console.log(`  ${this.platform}: Budget exhausted mid-scan`);
          break;
        }

        console.log(`    Scanning ${target.ticker} on ${this.platform}...`);

        try {
          // Platform-specific scanning logic (implemented by subclass)
          const mentions = await this.scanForTicker(target);
          completedMentions.push(...mentions);

          // Record rate limiter action
          this.rateLimiter.recordAction(this.platformName);

          // Take screenshots for high-score findings
          for (const mention of mentions.filter(m => m.promotionScore >= 40)) {
            await this.evidenceCollector.captureScreenshot(
              this.session,
              mention.url,
              target.ticker,
              this.platformName
            );
          }
        } catch (error: any) {
          console.error(`    Error scanning ${target.ticker} on ${this.platform}: ${error.message}`);
        }

        // Remove from remaining
        remaining = remaining.filter(t => t.ticker !== target.ticker);

        // Save progress checkpoint (crash-safe)
        this.saveProgress({
          platform: this.platformName,
          startedAt: new Date(startTime).toISOString(),
          completedTickers: targets.filter(t => !remaining.some(r => r.ticker === t.ticker)).map(t => t.ticker),
          remainingTickers: remaining,
          mentionsSoFar: completedMentions,
          browserMinutesUsed: (Date.now() - startTime) / 60000,
          lastCheckpoint: new Date().toISOString(),
        });

        // Wait before next ticker (human-like delay)
        if (remaining.length > 0) {
          await this.rateLimiter.waitForDelay(this.platformName);
        }
      }

      // Clean up progress file on successful completion
      this.clearProgress();

      return [this.buildSuccessResult(completedMentions, startTime)];

    } catch (error: any) {
      console.error(`  ${this.platform} agent error: ${error.message}`);
      // Save progress before returning error -- mentions so far are preserved
      return [this.buildErrorResult(error.message, startTime, completedMentions)];

    } finally {
      // Save cookies and close browser
      if (this.session) {
        try {
          const cookies = await this.session.getCookies();
          this.sessionManager.saveCookies(this.platformName, cookies);
        } catch { /* non-critical */ }
        await this.session.close();
        this.session = null;
      }
      await this.provider.close();

      const durationMin = this.costTracker.endSession(this.sessionId, this.platformName);
      console.log(`  ${this.platform}: Done (${durationMin.toFixed(1)} min, ${completedMentions.length} mentions)`);
    }
  }

  /**
   * Platform-specific scanning logic. Each agent implements this.
   * Should search for the ticker on the platform and return found mentions.
   */
  abstract scanForTicker(target: ScanTarget): Promise<SocialMention[]>;

  // ─── Progress Persistence (Save-Kill-Resume) ────────────────────────────

  private getProgressPath(): string {
    return path.join(PROGRESS_DIR, `.progress-${this.platformName}.json`);
  }

  hasSavedProgress(): boolean {
    return fs.existsSync(this.getProgressPath());
  }

  loadProgress(): AgentProgress {
    const raw = fs.readFileSync(this.getProgressPath(), 'utf-8');
    return JSON.parse(raw);
  }

  saveProgress(progress: AgentProgress): void {
    try {
      fs.writeFileSync(this.getProgressPath(), JSON.stringify(progress, null, 2));
    } catch { /* non-critical */ }
  }

  clearProgress(): void {
    try {
      const progressPath = this.getProgressPath();
      if (fs.existsSync(progressPath)) {
        fs.unlinkSync(progressPath);
      }
    } catch { /* non-critical */ }
  }

  // ─── Result Builders ───────────────────────────────────────────────────

  protected buildSuccessResult(mentions: SocialMention[], startTime: number): PlatformScanResult {
    const avgScore = mentions.length > 0
      ? mentions.reduce((sum, m) => sum + m.promotionScore, 0) / mentions.length
      : 0;

    return {
      platform: this.platform,
      scanner: this.name,
      success: true,
      mentionsFound: mentions.length,
      mentions,
      activityLevel: mentions.length >= 10 ? 'high' : mentions.length >= 3 ? 'medium' : mentions.length > 0 ? 'low' : 'none',
      promotionRisk: avgScore >= 50 ? 'high' : avgScore >= 25 ? 'medium' : 'low',
      scanDuration: Date.now() - startTime,
    };
  }

  protected buildErrorResult(error: string, startTime: number, partialMentions?: SocialMention[]): PlatformScanResult {
    return {
      platform: this.platform,
      scanner: this.name,
      success: false,
      error,
      mentionsFound: partialMentions?.length || 0,
      mentions: partialMentions || [],
      activityLevel: 'none',
      promotionRisk: 'low',
      scanDuration: Date.now() - startTime,
    };
  }

  // ─── Helpers for Subclasses ────────────────────────────────────────────

  /**
   * Score text content for promotional language using the existing scoring system.
   */
  protected scoreContent(text: string, context?: {
    isPromotionSubreddit?: boolean;
    isNewAccount?: boolean;
    hasHighEngagement?: boolean;
  }): { score: number; flags: string[]; isPromotional: boolean } {
    const { score, flags } = calculatePromotionScore(text, context);
    return { score, flags, isPromotional: score >= 30 };
  }

  /**
   * Create a SocialMention from extracted data.
   */
  protected createMention(data: {
    title: string;
    content: string;
    url: string;
    author: string;
    postDate: string;
    source: string;
    engagement?: SocialMention['engagement'];
  }): SocialMention {
    const fullText = `${data.title} ${data.content}`;
    const { score, flags, isPromotional } = this.scoreContent(fullText);

    return {
      platform: this.platform as SocialMention['platform'],
      source: data.source,
      discoveredVia: this.name,
      title: data.title,
      content: data.content,
      url: data.url,
      author: data.author,
      postDate: data.postDate,
      engagement: data.engagement || {},
      sentiment: this.inferSentiment(fullText),
      isPromotional,
      promotionScore: score,
      redFlags: flags,
    };
  }

  /**
   * Simple sentiment inference from text.
   */
  private inferSentiment(text: string): 'bullish' | 'bearish' | 'neutral' {
    const lower = text.toLowerCase();
    const bullishWords = ['buy', 'moon', 'rocket', 'bullish', 'long', 'squeeze', 'undervalued', 'gem', 'explode', 'gains'];
    const bearishWords = ['sell', 'short', 'dump', 'bearish', 'overvalued', 'scam', 'avoid', 'crash', 'fraud'];

    let bullishCount = 0;
    let bearishCount = 0;

    for (const word of bullishWords) {
      if (lower.includes(word)) bullishCount++;
    }
    for (const word of bearishWords) {
      if (lower.includes(word)) bearishCount++;
    }

    if (bullishCount > bearishCount + 1) return 'bullish';
    if (bearishCount > bullishCount + 1) return 'bearish';
    return 'neutral';
  }
}
