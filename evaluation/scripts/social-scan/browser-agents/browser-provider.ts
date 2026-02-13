/**
 * Browser Provider Abstraction
 *
 * Currently: Playwright with puppeteer-extra-plugin-stealth
 * Future:    Swap to Stagehand + Browserbase by implementing StagehandProvider
 *
 * Each platform agent calls this.provider methods without knowing
 * which browser engine is underneath.
 */

import { chromium, type Page, type BrowserContext, type Cookie, type ElementHandle } from 'playwright';
import type { BrowserProvider, BrowserSession, BrowserLaunchOptions } from './types';

// ─── Playwright Provider (free, local) ───────────────────────────────────────

export class PlaywrightProvider implements BrowserProvider {
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async launch(options?: BrowserLaunchOptions): Promise<BrowserSession> {
    let browser;

    try {
      // Try to use playwright-extra with stealth plugin for anti-detection
      const { chromium: stealthChromium } = await import('playwright-extra');
      const StealthPlugin = await import('puppeteer-extra-plugin-stealth');
      stealthChromium.use(StealthPlugin.default());
      browser = await stealthChromium.launch({
        headless: options?.headless ?? true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
        ],
      });
    } catch {
      // Fallback to standard Playwright if stealth plugin not available
      console.warn('  Stealth plugin not available, using standard Playwright');
      browser = await chromium.launch({
        headless: options?.headless ?? true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
        ],
      });
    }

    this.context = await browser.newContext({
      userAgent: options?.userAgent || getRandomUserAgent(),
      viewport: options?.viewport || { width: 1366, height: 768 },
      locale: options?.locale || 'en-US',
      timezoneId: options?.timezoneId || 'America/New_York',
      ...(options?.proxy ? { proxy: options.proxy } : {}),
    });

    this.page = await this.context.newPage();

    return new PlaywrightSession(this.page, this.context);
  }

  async close(): Promise<void> {
    if (this.context) {
      const browser = this.context.browser();
      await this.context.close();
      if (browser) await browser.close();
      this.context = null;
      this.page = null;
    }
  }
}

// ─── Playwright Session ──────────────────────────────────────────────────────

class PlaywrightSession implements BrowserSession {
  page: Page;
  context: BrowserContext;

  constructor(page: Page, context: BrowserContext) {
    this.page = page;
    this.context = context;
  }

  async goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void> {
    await this.page.goto(url, {
      waitUntil: options?.waitUntil || 'domcontentloaded',
      timeout: 30000,
    });
  }

  async click(selector: string, options?: { timeout?: number }): Promise<void> {
    await this.page.click(selector, { timeout: options?.timeout || 10000 });
  }

  async type(selector: string, text: string, options?: { delay?: number }): Promise<void> {
    await this.page.fill(selector, '');
    await this.page.type(selector, text, { delay: options?.delay || 50 });
  }

  async waitForSelector(selector: string, options?: { timeout?: number; state?: 'visible' | 'attached' }): Promise<void> {
    await this.page.waitForSelector(selector, {
      timeout: options?.timeout || 10000,
      state: options?.state || 'visible',
    });
  }

  async extractText(selector: string): Promise<string> {
    const element = await this.page.$(selector);
    if (!element) return '';
    return (await element.textContent()) || '';
  }

  async extractAll<T>(selector: string, extractor: (element: ElementHandle) => Promise<T>): Promise<T[]> {
    const elements = await this.page.$$(selector);
    const results: T[] = [];
    for (const el of elements) {
      try {
        results.push(await extractor(el));
      } catch {
        // Skip elements that fail extraction
      }
    }
    return results;
  }

  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ path, fullPage: false });
  }

  async getCookies(): Promise<Cookie[]> {
    return this.context.cookies();
  }

  async setCookies(cookies: Cookie[]): Promise<void> {
    await this.context.addCookies(cookies);
  }

  async close(): Promise<void> {
    const browser = this.context.browser();
    await this.context.close();
    if (browser) await browser.close();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** Random delay between min and max ms (human-like jitter) */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/** Get the provider based on environment config */
export function createBrowserProvider(): BrowserProvider {
  // Future: check env for Browserbase/Stagehand config and return StagehandProvider
  return new PlaywrightProvider();
}
