/**
 * Cost Tracker for Browser Agents
 *
 * Tracks browser minutes and enforces daily budget limits.
 * Optionally tracks LLM tokens if Stagehand is used later.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PlatformName } from './types';

interface DailyUsage {
  date: string;             // YYYY-MM-DD
  totalBrowserMinutes: number;
  platformBreakdown: Record<string, number>; // platform -> minutes
  sessionCount: number;
  peakMemoryMb: number;
  suspensionCount: number;
}

const COST_FILE = path.join(__dirname, '..', '..', '..', 'evaluation', 'browser-sessions', '.cost-tracker.json');

export class CostTracker {
  private dailyUsage: DailyUsage;
  private sessionStartTimes: Map<string, number> = new Map(); // sessionId -> start timestamp
  private maxDailyMinutes: number;

  constructor() {
    this.maxDailyMinutes = parseInt(process.env.BROWSER_AGENT_MAX_DAILY_MINUTES || '60');
    this.dailyUsage = this.loadOrCreateDailyUsage();
  }

  /**
   * Check if we have budget remaining for today.
   */
  hasBudget(): boolean {
    return this.dailyUsage.totalBrowserMinutes < this.maxDailyMinutes;
  }

  /**
   * Get remaining budget in minutes.
   */
  getRemainingMinutes(): number {
    return Math.max(0, this.maxDailyMinutes - this.dailyUsage.totalBrowserMinutes);
  }

  /**
   * Start tracking a browser session.
   */
  startSession(sessionId: string): void {
    this.sessionStartTimes.set(sessionId, Date.now());
    this.dailyUsage.sessionCount++;
    this.save();
  }

  /**
   * End tracking a browser session. Returns duration in minutes.
   */
  endSession(sessionId: string, platform: PlatformName): number {
    const startTime = this.sessionStartTimes.get(sessionId);
    if (!startTime) return 0;

    const durationMs = Date.now() - startTime;
    const durationMinutes = durationMs / 60000;

    this.dailyUsage.totalBrowserMinutes += durationMinutes;
    this.dailyUsage.platformBreakdown[platform] =
      (this.dailyUsage.platformBreakdown[platform] || 0) + durationMinutes;

    this.sessionStartTimes.delete(sessionId);
    this.save();

    return durationMinutes;
  }

  /**
   * Record peak memory usage.
   */
  recordMemoryPeak(memoryMb: number): void {
    if (memoryMb > this.dailyUsage.peakMemoryMb) {
      this.dailyUsage.peakMemoryMb = memoryMb;
    }
  }

  /**
   * Record a save-kill-resume suspension.
   */
  recordSuspension(): void {
    this.dailyUsage.suspensionCount++;
    this.save();
  }

  /**
   * Get today's usage summary.
   */
  getSummary(): DailyUsage & { maxDailyMinutes: number; remainingMinutes: number } {
    return {
      ...this.dailyUsage,
      maxDailyMinutes: this.maxDailyMinutes,
      remainingMinutes: this.getRemainingMinutes(),
    };
  }

  // ─── Persistence ───────────────────────────────────────────────────────

  private loadOrCreateDailyUsage(): DailyUsage {
    const today = new Date().toISOString().split('T')[0];

    try {
      if (fs.existsSync(COST_FILE)) {
        const data = JSON.parse(fs.readFileSync(COST_FILE, 'utf-8')) as DailyUsage;
        if (data.date === today) {
          return data;
        }
      }
    } catch {
      // Start fresh
    }

    return {
      date: today,
      totalBrowserMinutes: 0,
      platformBreakdown: {},
      sessionCount: 0,
      peakMemoryMb: 0,
      suspensionCount: 0,
    };
  }

  private save(): void {
    try {
      fs.writeFileSync(COST_FILE, JSON.stringify(this.dailyUsage, null, 2));
    } catch {
      // Non-critical
    }
  }
}
