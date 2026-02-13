/**
 * Rate Limiter for Browser Agents
 *
 * Per-platform rate limiting with daily page budgets.
 * Enforces delays between actions to avoid triggering anti-bot detection.
 * Conservative limits to protect personal accounts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_PLATFORM_CONFIGS, type PlatformName } from './types';

interface PlatformUsage {
  platform: PlatformName;
  pagesUsedToday: number;
  actionsThisMinute: number;
  minuteStartedAt: number;  // timestamp
  lastActionAt: number;     // timestamp
  date: string;             // YYYY-MM-DD for daily reset
}

const USAGE_FILE = path.join(__dirname, '..', '..', '..', 'evaluation', 'browser-sessions', '.rate-limits.json');

export class RateLimiter {
  private usage: Map<PlatformName, PlatformUsage> = new Map();

  constructor() {
    this.loadUsage();
  }

  /**
   * Check if an action is allowed on this platform.
   * Returns true if within limits, false if rate-limited.
   */
  canProceed(platform: PlatformName): boolean {
    const config = DEFAULT_PLATFORM_CONFIGS[platform];
    const usage = this.getUsage(platform);

    // Daily page limit
    if (usage.pagesUsedToday >= config.maxPagesPerDay) {
      console.log(`    Rate limited: ${platform} at daily max (${config.maxPagesPerDay} pages)`);
      return false;
    }

    // Per-minute action limit
    const now = Date.now();
    if (now - usage.minuteStartedAt > 60000) {
      // Reset minute counter
      usage.actionsThisMinute = 0;
      usage.minuteStartedAt = now;
    }

    if (usage.actionsThisMinute >= config.maxActionsPerMinute) {
      console.log(`    Rate limited: ${platform} at ${config.maxActionsPerMinute} actions/min`);
      return false;
    }

    return true;
  }

  /**
   * Record that an action was performed on this platform.
   */
  recordAction(platform: PlatformName): void {
    const usage = this.getUsage(platform);
    usage.pagesUsedToday++;
    usage.actionsThisMinute++;
    usage.lastActionAt = Date.now();
    this.saveUsage();
  }

  /**
   * Get the required delay before the next action on this platform.
   * Returns a random value between min and max delay.
   */
  getRequiredDelay(platform: PlatformName): number {
    const config = DEFAULT_PLATFORM_CONFIGS[platform];
    return config.minDelayMs + Math.random() * (config.maxDelayMs - config.minDelayMs);
  }

  /**
   * Wait for the required delay before proceeding.
   */
  async waitForDelay(platform: PlatformName): Promise<void> {
    const delay = this.getRequiredDelay(platform);
    const usage = this.getUsage(platform);
    const timeSinceLastAction = Date.now() - usage.lastActionAt;

    if (timeSinceLastAction < delay) {
      const remainingDelay = delay - timeSinceLastAction;
      await new Promise(resolve => setTimeout(resolve, remainingDelay));
    }
  }

  /**
   * Get remaining page budget for today.
   */
  getRemainingPages(platform: PlatformName): number {
    const config = DEFAULT_PLATFORM_CONFIGS[platform];
    const usage = this.getUsage(platform);
    return Math.max(0, config.maxPagesPerDay - usage.pagesUsedToday);
  }

  /**
   * Get usage summary for all platforms.
   */
  getSummary(): Record<PlatformName, { used: number; limit: number; remaining: number }> {
    const summary: Record<string, { used: number; limit: number; remaining: number }> = {};
    for (const [platform, config] of Object.entries(DEFAULT_PLATFORM_CONFIGS)) {
      const usage = this.getUsage(platform as PlatformName);
      summary[platform] = {
        used: usage.pagesUsedToday,
        limit: config.maxPagesPerDay,
        remaining: Math.max(0, config.maxPagesPerDay - usage.pagesUsedToday),
      };
    }
    return summary as Record<PlatformName, { used: number; limit: number; remaining: number }>;
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private getUsage(platform: PlatformName): PlatformUsage {
    const today = new Date().toISOString().split('T')[0];
    let usage = this.usage.get(platform);

    // Reset if new day
    if (!usage || usage.date !== today) {
      usage = {
        platform,
        pagesUsedToday: 0,
        actionsThisMinute: 0,
        minuteStartedAt: Date.now(),
        lastActionAt: 0,
        date: today,
      };
      this.usage.set(platform, usage);
    }

    return usage;
  }

  private loadUsage(): void {
    try {
      if (fs.existsSync(USAGE_FILE)) {
        const data = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'));
        for (const [platform, usage] of Object.entries(data)) {
          this.usage.set(platform as PlatformName, usage as PlatformUsage);
        }
      }
    } catch {
      // Start fresh
    }
  }

  private saveUsage(): void {
    try {
      const data: Record<string, PlatformUsage> = {};
      for (const [platform, usage] of this.usage.entries()) {
        data[platform] = usage;
      }
      fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
    } catch {
      // Non-critical, continue without saving
    }
  }
}
