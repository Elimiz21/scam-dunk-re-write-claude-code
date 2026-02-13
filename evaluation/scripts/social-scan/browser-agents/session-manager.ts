/**
 * Session Manager
 *
 * Handles login, cookie persistence, and 2FA for browser agents.
 * Stores encrypted cookies per platform so we don't re-login every run.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Cookie } from 'playwright';
import type { BrowserSession, PlatformName, PlatformCredentials } from './types';

const SESSION_DIR = path.join(__dirname, '..', '..', '..', 'evaluation', 'browser-sessions');

export class SessionManager {
  private encryptionKey: string;
  private credentialsPath: string;

  constructor() {
    this.encryptionKey = process.env.BROWSER_AGENT_ENCRYPTION_KEY || '';
    this.credentialsPath = process.env.BROWSER_AGENT_CREDENTIALS_PATH ||
      path.join(SESSION_DIR, 'credentials.enc.json');
  }

  /**
   * Ensure the browser is logged in to the platform.
   * 1. Try loading saved cookies
   * 2. If cookies work (session valid), return
   * 3. If not, perform fresh login
   * 4. Save new cookies for next time
   */
  async ensureLoggedIn(session: BrowserSession, platform: PlatformName): Promise<boolean> {
    // Try loading saved cookies first
    const savedCookies = this.loadCookies(platform);
    if (savedCookies.length > 0) {
      await session.setCookies(savedCookies);
      console.log(`    Loaded ${savedCookies.length} saved cookies for ${platform}`);

      // Verify session is still valid
      const isValid = await this.verifySession(session, platform);
      if (isValid) {
        console.log(`    Session valid for ${platform}`);
        return true;
      }
      console.log(`    Saved session expired for ${platform}, re-authenticating...`);
    }

    // No valid cookies, need to login
    const credentials = this.loadCredentials(platform);
    if (!credentials) {
      console.error(`    No credentials found for ${platform}`);
      return false;
    }

    const loginSuccess = await this.performLogin(session, platform, credentials);
    if (loginSuccess) {
      // Save cookies for next time
      const newCookies = await session.getCookies();
      this.saveCookies(platform, newCookies);
      console.log(`    Login successful, saved ${newCookies.length} cookies for ${platform}`);
    }

    return loginSuccess;
  }

  /**
   * Verify if the current session is valid (not expired).
   * Each platform has different validation logic.
   */
  private async verifySession(session: BrowserSession, platform: PlatformName): Promise<boolean> {
    try {
      switch (platform) {
        case 'discord':
          await session.goto('https://discord.com/app', { waitUntil: 'domcontentloaded' });
          // If we're redirected to login, session is invalid
          return !session.page.url().includes('/login');

        case 'reddit':
          await session.goto('https://old.reddit.com', { waitUntil: 'domcontentloaded' });
          // Check if logged in by looking for username in top bar
          const logoutLink = await session.page.$('a[href*="logout"]');
          return logoutLink !== null;

        case 'twitter':
          await session.goto('https://twitter.com/home', { waitUntil: 'domcontentloaded' });
          return !session.page.url().includes('/login') && !session.page.url().includes('/flow');

        case 'instagram':
          await session.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
          return !session.page.url().includes('/accounts/login');

        case 'facebook':
          await session.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
          return !session.page.url().includes('/login');

        case 'tiktok':
          await session.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded' });
          // TikTok doesn't always redirect, check for login button
          const loginBtn = await session.page.$('[data-e2e="top-login-button"]');
          return loginBtn === null;

        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Perform a fresh login to the platform.
   */
  private async performLogin(
    session: BrowserSession,
    platform: PlatformName,
    credentials: PlatformCredentials
  ): Promise<boolean> {
    try {
      switch (platform) {
        case 'discord':
          return await this.loginDiscord(session, credentials);
        case 'reddit':
          return await this.loginReddit(session, credentials);
        case 'twitter':
          return await this.loginTwitter(session, credentials);
        case 'instagram':
          return await this.loginInstagram(session, credentials);
        case 'facebook':
          return await this.loginFacebook(session, credentials);
        case 'tiktok':
          return await this.loginTikTok(session, credentials);
        default:
          console.error(`    Unknown platform: ${platform}`);
          return false;
      }
    } catch (error: any) {
      console.error(`    Login failed for ${platform}: ${error.message}`);
      return false;
    }
  }

  // ─── Platform-Specific Login Flows ───────────────────────────────────────

  private async loginDiscord(session: BrowserSession, creds: PlatformCredentials): Promise<boolean> {
    await session.goto('https://discord.com/login');
    await session.waitForSelector('input[name="email"]');
    await session.type('input[name="email"]', creds.email || creds.username);
    await session.type('input[name="password"]', creds.password);
    await session.click('button[type="submit"]');

    // Handle 2FA if needed
    if (creds.totpSecret) {
      await this.handle2FA(session, creds.totpSecret, 'discord');
    }

    // Wait for app to load
    try {
      await session.page.waitForURL('**/channels/**', { timeout: 15000 });
      return true;
    } catch {
      return false;
    }
  }

  private async loginReddit(session: BrowserSession, creds: PlatformCredentials): Promise<boolean> {
    await session.goto('https://old.reddit.com/login');
    await session.waitForSelector('input#user_login');
    await session.type('input#user_login', creds.username);
    await session.type('input#passwd_login', creds.password);
    await session.click('#login-form button[type="submit"]');

    // Handle 2FA if needed
    if (creds.totpSecret) {
      await this.handle2FA(session, creds.totpSecret, 'reddit');
    }

    await session.page.waitForTimeout(3000);
    return !session.page.url().includes('/login');
  }

  private async loginTwitter(session: BrowserSession, creds: PlatformCredentials): Promise<boolean> {
    await session.goto('https://twitter.com/i/flow/login');
    await session.page.waitForTimeout(2000);

    // Twitter's login flow is multi-step
    await session.waitForSelector('input[autocomplete="username"]', { timeout: 10000 });
    await session.type('input[autocomplete="username"]', creds.username);

    // Click "Next"
    const nextButtons = await session.page.$$('div[role="button"]');
    for (const btn of nextButtons) {
      const text = await btn.textContent();
      if (text?.includes('Next')) {
        await btn.click();
        break;
      }
    }

    await session.page.waitForTimeout(2000);

    // Enter password
    await session.waitForSelector('input[type="password"]', { timeout: 10000 });
    await session.type('input[type="password"]', creds.password);

    // Click "Log in"
    const loginButtons = await session.page.$$('div[role="button"]');
    for (const btn of loginButtons) {
      const text = await btn.textContent();
      if (text?.includes('Log in')) {
        await btn.click();
        break;
      }
    }

    // Handle 2FA
    if (creds.totpSecret) {
      await this.handle2FA(session, creds.totpSecret, 'twitter');
    }

    await session.page.waitForTimeout(5000);
    return session.page.url().includes('twitter.com/home') || session.page.url().includes('x.com/home');
  }

  private async loginInstagram(session: BrowserSession, creds: PlatformCredentials): Promise<boolean> {
    await session.goto('https://www.instagram.com/accounts/login/');
    await session.page.waitForTimeout(2000);
    await session.waitForSelector('input[name="username"]');
    await session.type('input[name="username"]', creds.username);
    await session.type('input[name="password"]', creds.password);
    await session.click('button[type="submit"]');

    if (creds.totpSecret) {
      await this.handle2FA(session, creds.totpSecret, 'instagram');
    }

    await session.page.waitForTimeout(5000);
    return !session.page.url().includes('/accounts/login');
  }

  private async loginFacebook(session: BrowserSession, creds: PlatformCredentials): Promise<boolean> {
    await session.goto('https://www.facebook.com/login');
    await session.waitForSelector('#email');
    await session.type('#email', creds.email || creds.username);
    await session.type('#pass', creds.password);
    await session.click('button[name="login"]');

    if (creds.totpSecret) {
      await this.handle2FA(session, creds.totpSecret, 'facebook');
    }

    await session.page.waitForTimeout(5000);
    return !session.page.url().includes('/login');
  }

  private async loginTikTok(session: BrowserSession, creds: PlatformCredentials): Promise<boolean> {
    // TikTok login is complex and frequently changes
    // For now, rely on cookie-based sessions primarily
    console.warn('    TikTok auto-login not fully implemented. Use manual cookie export.');
    return false;
  }

  // ─── 2FA Handling ────────────────────────────────────────────────────────

  private async handle2FA(session: BrowserSession, totpSecret: string, platform: PlatformName): Promise<void> {
    try {
      const { authenticator } = await import('otplib');
      const code = authenticator.generate(totpSecret);
      console.log(`    Generating 2FA code for ${platform}...`);

      await session.page.waitForTimeout(2000);

      // Try common 2FA input selectors
      const selectors = [
        'input[name="code"]',
        'input[name="verificationCode"]',
        'input[autocomplete="one-time-code"]',
        'input[name="approvals_code"]',
        'input[placeholder*="code"]',
        'input[type="tel"]',
      ];

      for (const selector of selectors) {
        const input = await session.page.$(selector);
        if (input) {
          await session.type(selector, code);
          // Try to submit
          await session.page.keyboard.press('Enter');
          await session.page.waitForTimeout(3000);
          return;
        }
      }

      console.warn(`    Could not find 2FA input for ${platform}`);
    } catch (error: any) {
      console.error(`    2FA handling failed for ${platform}: ${error.message}`);
    }
  }

  // ─── Cookie Persistence ──────────────────────────────────────────────────

  private getCookiePath(platform: PlatformName): string {
    return path.join(SESSION_DIR, `${platform}-cookies.enc.json`);
  }

  saveCookies(platform: PlatformName, cookies: Cookie[]): void {
    const cookiePath = this.getCookiePath(platform);
    const data = JSON.stringify(cookies);

    if (this.encryptionKey) {
      const encrypted = this.encrypt(data);
      fs.writeFileSync(cookiePath, encrypted, 'utf-8');
    } else {
      // No encryption key -- store as plain JSON (warn user)
      console.warn(`    WARNING: Cookies stored unencrypted. Set BROWSER_AGENT_ENCRYPTION_KEY for security.`);
      fs.writeFileSync(cookiePath, data, 'utf-8');
    }
  }

  loadCookies(platform: PlatformName): Cookie[] {
    const cookiePath = this.getCookiePath(platform);
    if (!fs.existsSync(cookiePath)) return [];

    try {
      const raw = fs.readFileSync(cookiePath, 'utf-8');
      const data = this.encryptionKey ? this.decrypt(raw) : raw;
      return JSON.parse(data);
    } catch {
      console.warn(`    Failed to load cookies for ${platform}, will re-login`);
      return [];
    }
  }

  // ─── Credential Loading ──────────────────────────────────────────────────

  loadCredentials(platform: PlatformName): PlatformCredentials | null {
    if (!fs.existsSync(this.credentialsPath)) {
      console.error(`    Credentials file not found: ${this.credentialsPath}`);
      return null;
    }

    try {
      const raw = fs.readFileSync(this.credentialsPath, 'utf-8');
      const data = this.encryptionKey ? this.decrypt(raw) : raw;
      const allCreds = JSON.parse(data);
      const cred = allCreds[platform];
      if (!cred) return null;

      return {
        platform,
        username: cred.username || cred.email || '',
        password: cred.password || '',
        email: cred.email,
        totpSecret: cred.totpSecret,
      };
    } catch (error: any) {
      console.error(`    Failed to load credentials: ${error.message}`);
      return null;
    }
  }

  // ─── Encryption Helpers ──────────────────────────────────────────────────

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(this.encryptionKey, 'hex');
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const [ivHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = Buffer.from(this.encryptionKey, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  }
}
