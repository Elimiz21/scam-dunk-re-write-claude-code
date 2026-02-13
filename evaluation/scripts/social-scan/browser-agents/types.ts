/**
 * Types for Browser Agent System
 *
 * Defines interfaces for browser automation, evidence collection,
 * and the BrowserProvider abstraction (Playwright today, Stagehand later).
 */

import type { Page, BrowserContext, Cookie } from 'playwright';
import type { SocialMention, ScanTarget } from '../types';

// ─── Browser Provider Abstraction ────────────────────────────────────────────
// Thin layer over the browser so we can swap Playwright for Stagehand later

export interface BrowserProvider {
  launch(options?: BrowserLaunchOptions): Promise<BrowserSession>;
  close(): Promise<void>;
}

export interface BrowserSession {
  page: Page;
  context: BrowserContext;
  goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void>;
  click(selector: string, options?: { timeout?: number }): Promise<void>;
  type(selector: string, text: string, options?: { delay?: number }): Promise<void>;
  waitForSelector(selector: string, options?: { timeout?: number; state?: 'visible' | 'attached' }): Promise<void>;
  extractText(selector: string): Promise<string>;
  extractAll<T>(selector: string, extractor: (element: any) => T): Promise<T[]>;
  screenshot(path: string): Promise<void>;
  getCookies(): Promise<Cookie[]>;
  setCookies(cookies: Cookie[]): Promise<void>;
  close(): Promise<void>;
}

export interface BrowserLaunchOptions {
  headless?: boolean;
  proxy?: { server: string; username?: string; password?: string };
  userAgent?: string;
  viewport?: { width: number; height: number };
  locale?: string;
  timezoneId?: string;
}

// ─── Platform Configuration ──────────────────────────────────────────────────

export type PlatformName = 'discord' | 'reddit' | 'twitter' | 'instagram' | 'facebook' | 'tiktok';

export interface PlatformCredentials {
  platform: PlatformName;
  username: string;
  password: string;
  email?: string;
  totpSecret?: string;  // For 2FA via otplib
}

export interface PlatformConfig {
  platform: PlatformName;
  enabled: boolean;
  loginUrl: string;
  searchUrlTemplate: string;  // Use {TICKER} as placeholder
  maxPagesPerDay: number;
  maxActionsPerMinute: number;
  minDelayMs: number;
  maxDelayMs: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export const DEFAULT_PLATFORM_CONFIGS: Record<PlatformName, PlatformConfig> = {
  discord: {
    platform: 'discord',
    enabled: true,
    loginUrl: 'https://discord.com/app',
    searchUrlTemplate: '', // Discord uses in-app search, not URL-based
    maxPagesPerDay: 100,
    maxActionsPerMinute: 2,
    minDelayMs: 3000,
    maxDelayMs: 8000,
    riskLevel: 'low',
  },
  reddit: {
    platform: 'reddit',
    enabled: true,
    loginUrl: 'https://old.reddit.com/login',
    searchUrlTemplate: 'https://old.reddit.com/r/{SUBREDDIT}/search?q={TICKER}&restrict_sr=on&sort=new&t=month',
    maxPagesPerDay: 150,
    maxActionsPerMinute: 3,
    minDelayMs: 2000,
    maxDelayMs: 5000,
    riskLevel: 'low',
  },
  twitter: {
    platform: 'twitter',
    enabled: true,
    loginUrl: 'https://twitter.com/i/flow/login',
    searchUrlTemplate: 'https://twitter.com/search?q=%24{TICKER}&src=typed_query&f=live',
    maxPagesPerDay: 75,
    maxActionsPerMinute: 1,
    minDelayMs: 5000,
    maxDelayMs: 12000,
    riskLevel: 'medium',
  },
  instagram: {
    platform: 'instagram',
    enabled: true,
    loginUrl: 'https://www.instagram.com/accounts/login/',
    searchUrlTemplate: 'https://www.instagram.com/explore/tags/{TICKER}/',
    maxPagesPerDay: 75,
    maxActionsPerMinute: 1,
    minDelayMs: 5000,
    maxDelayMs: 12000,
    riskLevel: 'medium',
  },
  facebook: {
    platform: 'facebook',
    enabled: false, // Disabled by default - high ban risk
    loginUrl: 'https://www.facebook.com/login',
    searchUrlTemplate: 'https://www.facebook.com/search/posts/?q={TICKER}%20stock',
    maxPagesPerDay: 50,
    maxActionsPerMinute: 1,
    minDelayMs: 8000,
    maxDelayMs: 15000,
    riskLevel: 'high',
  },
  tiktok: {
    platform: 'tiktok',
    enabled: false, // Disabled by default
    loginUrl: 'https://www.tiktok.com/login',
    searchUrlTemplate: 'https://www.tiktok.com/search?q={TICKER}%20stock',
    maxPagesPerDay: 50,
    maxActionsPerMinute: 1,
    minDelayMs: 5000,
    maxDelayMs: 10000,
    riskLevel: 'medium',
  },
};

// ─── Browser Agent Config ────────────────────────────────────────────────────

export interface BrowserAgentConfig {
  maxParallel: number;
  maxMemoryMb: number;
  memoryCheckIntervalMs: number;
  perBrowserEstimateMb: number;
  maxDailyMinutes: number;
  credentialsPath: string;
  encryptionKey: string;
  sessionDir: string;
  progressDir: string;
}

export function loadBrowserAgentConfig(): BrowserAgentConfig {
  return {
    maxParallel: parseInt(process.env.BROWSER_AGENT_MAX_PARALLEL || '4'),
    maxMemoryMb: parseInt(process.env.BROWSER_AGENT_MAX_MEMORY_MB || '2048'),
    memoryCheckIntervalMs: parseInt(process.env.BROWSER_AGENT_MEMORY_CHECK_MS || '5000'),
    perBrowserEstimateMb: 450,
    maxDailyMinutes: parseInt(process.env.BROWSER_AGENT_MAX_DAILY_MINUTES || '60'),
    credentialsPath: process.env.BROWSER_AGENT_CREDENTIALS_PATH || 'evaluation/browser-sessions/credentials.enc.json',
    encryptionKey: process.env.BROWSER_AGENT_ENCRYPTION_KEY || '',
    sessionDir: 'evaluation/browser-sessions',
    progressDir: 'evaluation/browser-sessions',
  };
}

// ─── Evidence Types ──────────────────────────────────────────────────────────

export interface BrowserEvidence {
  ticker: string;
  platform: PlatformName;
  url: string;
  textContent: string;
  author: string;
  timestamp: string;        // ISO date
  source: string;           // e.g., "Discord: PennyStocks Server / #general"
  conversationThread?: string;

  engagement: {
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
    reactions?: number;
  };

  screenshotPath?: string;
  screenshotUrl?: string;   // After Supabase upload

  promotionScore: number;
  redFlags: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral';
  isPromotional: boolean;

  discoveredVia: string;    // e.g., "browser_discord"
  capturedAt: string;       // ISO date
  browserSessionId: string;
}

// ─── Progress Tracking (for save-kill-resume) ────────────────────────────────

export interface AgentProgress {
  platform: PlatformName;
  startedAt: string;
  completedTickers: string[];
  remainingTickers: ScanTarget[];
  mentionsSoFar: SocialMention[];
  browserMinutesUsed: number;
  lastCheckpoint: string;   // ISO date
}

// ─── Orchestrator Types ──────────────────────────────────────────────────────

export interface AgentRunStatus {
  platform: PlatformName;
  status: 'queued' | 'running' | 'suspended' | 'completed' | 'failed';
  pid?: number;             // Chrome process ID for memory monitoring
  memoryMb?: number;
  tickersCompleted: number;
  tickersTotal: number;
  mentionsFound: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  suspendCount: number;     // How many times this agent has been save-killed
}

export interface OrchestratorResult {
  totalAgentsRun: number;
  totalMentionsFound: number;
  totalBrowserMinutes: number;
  agentStatuses: AgentRunStatus[];
  memoryPeakMb: number;
  suspensionsTriggered: number;
}
