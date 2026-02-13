/**
 * Discord Browser Agent
 *
 * Logs into Discord web app, navigates to configured penny stock servers,
 * and searches for ticker mentions. Extracts message content, authors,
 * timestamps, and engagement metrics.
 *
 * Discord search uses the in-app search bar (Ctrl+F / search icon).
 * Selectors target Discord's web app DOM structure.
 */

import type { ScanTarget, SocialMention } from '../types';
import { BaseBrowserAgent } from './base-browser-agent';
import { randomDelay } from './browser-provider';
import type { PlatformName } from './types';
import * as fs from 'fs';
import * as path from 'path';

// Discord server IDs to monitor (loaded from config)
interface DiscordTarget {
  serverId: string;
  serverName: string;
  channels?: string[];  // If empty, search whole server
}

const CONFIG_PATH = path.join(__dirname, 'config', 'platform-targets.json');

export class DiscordBrowserAgent extends BaseBrowserAgent {
  name = 'browser_discord';
  platform = 'Discord';
  protected platformName: PlatformName = 'discord';

  private targets: DiscordTarget[] = [];

  constructor() {
    super();
    this.loadTargets();
  }

  private loadTargets(): void {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        this.targets = config.discord?.servers || [];
      }
    } catch {
      this.targets = [];
    }
  }

  /**
   * Scan for a ticker on Discord.
   * Navigates to each configured server and uses the search bar.
   */
  async scanForTicker(target: ScanTarget): Promise<SocialMention[]> {
    if (!this.session) return [];

    const mentions: SocialMention[] = [];
    const ticker = target.ticker;

    if (this.targets.length === 0) {
      // No specific servers configured -- use global Discord search
      const results = await this.searchGlobal(ticker);
      mentions.push(...results);
    } else {
      // Search in each configured server
      for (const server of this.targets) {
        try {
          const results = await this.searchServer(ticker, server);
          mentions.push(...results);
        } catch (error: any) {
          console.log(`      Error searching ${server.serverName}: ${error.message}`);
        }

        // Delay between servers
        await randomDelay(2000, 5000);
      }
    }

    return mentions;
  }

  /**
   * Search for a ticker using Discord's global search.
   */
  private async searchGlobal(ticker: string): Promise<SocialMention[]> {
    if (!this.session) return [];

    try {
      // Navigate to Discord app
      await this.session.goto('https://discord.com/app');
      await this.session.page.waitForTimeout(3000);

      // Click on search or use keyboard shortcut
      await this.session.page.keyboard.press('Control+k'); // Quick switcher / search
      await this.session.page.waitForTimeout(1000);

      // Close quick switcher if opened, and use the search bar instead
      await this.session.page.keyboard.press('Escape');
      await this.session.page.waitForTimeout(500);

      // Try clicking the search icon in the top bar
      const searchButton = await this.session.page.$('[aria-label="Search"]');
      if (searchButton) {
        await searchButton.click();
        await this.session.page.waitForTimeout(1000);
      }

      // Type the ticker in the search box
      const searchInput = await this.session.page.$('input[aria-label*="Search"]');
      if (searchInput) {
        await searchInput.fill('');
        await searchInput.type(ticker, { delay: 80 });
        await this.session.page.keyboard.press('Enter');
        await this.session.page.waitForTimeout(3000);
      }

      // Extract search results
      return await this.extractSearchResults(ticker, 'Discord Global Search');

    } catch (error: any) {
      console.log(`      Discord global search error: ${error.message}`);
      return [];
    }
  }

  /**
   * Navigate to a specific server and search for the ticker.
   */
  private async searchServer(ticker: string, server: DiscordTarget): Promise<SocialMention[]> {
    if (!this.session) return [];

    try {
      // Navigate directly to the server
      await this.session.goto(`https://discord.com/channels/${server.serverId}`);
      await this.session.page.waitForTimeout(3000);

      // Click the search icon in the top bar
      const searchButton = await this.session.page.$('[aria-label="Search"]');
      if (searchButton) {
        await searchButton.click();
        await this.session.page.waitForTimeout(1000);
      } else {
        // Try keyboard shortcut
        await this.session.page.keyboard.press('Control+f');
        await this.session.page.waitForTimeout(1000);
      }

      // Type search query
      // Use focused search to find the input
      const searchInputs = await this.session.page.$$('input[type="text"], input[placeholder*="Search"]');
      for (const input of searchInputs) {
        const placeholder = await input.getAttribute('placeholder');
        if (placeholder && (placeholder.includes('Search') || placeholder.includes('search'))) {
          await input.fill('');
          await input.type(ticker, { delay: 80 });
          await this.session.page.keyboard.press('Enter');
          break;
        }
      }

      await this.session.page.waitForTimeout(3000);

      return await this.extractSearchResults(ticker, `Discord: ${server.serverName}`);

    } catch (error: any) {
      console.log(`      Error in server ${server.serverName}: ${error.message}`);
      return [];
    }
  }

  /**
   * Extract messages from Discord search results.
   * Discord renders messages in a specific DOM structure.
   */
  private async extractSearchResults(ticker: string, source: string): Promise<SocialMention[]> {
    if (!this.session) return [];

    const mentions: SocialMention[] = [];

    try {
      // Discord search results appear in a panel on the right side
      // Each result is a message card. Try multiple selector strategies.
      const messageSelectors = [
        '[class*="searchResult"]',
        '[class*="message-"]',
        '[id^="search-result"]',
        'li[class*="messageListItem"]',
      ];

      let messageElements: any[] = [];
      for (const selector of messageSelectors) {
        messageElements = await this.session.page.$$(selector);
        if (messageElements.length > 0) break;
      }

      if (messageElements.length === 0) {
        // Try getting visible message content in a broader way
        const allText = await this.session.page.textContent('body');
        if (allText && allText.toLowerCase().includes(ticker.toLowerCase())) {
          // Page contains the ticker but we couldn't parse individual messages
          // Create a single mention representing the search results
          mentions.push(this.createMention({
            title: `${ticker} mentioned on Discord`,
            content: `Search results found for ${ticker} on Discord. Manual review recommended.`,
            url: this.session.page.url(),
            author: 'unknown',
            postDate: new Date().toISOString(),
            source,
          }));
        }
        return mentions;
      }

      // Extract data from each message element
      for (const element of messageElements.slice(0, 20)) { // Cap at 20 results
        try {
          // Try to extract message content
          const contentEl = await element.$('[class*="content"], [class*="messageContent"]');
          const content = contentEl ? (await contentEl.textContent()) || '' : '';

          // Only include messages that mention the ticker
          if (!content.toLowerCase().includes(ticker.toLowerCase())) continue;

          // Extract author
          const authorEl = await element.$('[class*="username"], [class*="headerText"] span');
          const author = authorEl ? (await authorEl.textContent()) || 'unknown' : 'unknown';

          // Extract timestamp
          const timeEl = await element.$('time');
          const postDate = timeEl
            ? (await timeEl.getAttribute('datetime')) || new Date().toISOString()
            : new Date().toISOString();

          // Extract channel name if visible
          const channelEl = await element.$('[class*="channelName"]');
          const channel = channelEl ? (await channelEl.textContent()) || '' : '';
          const fullSource = channel ? `${source} / #${channel}` : source;

          // Try to get reaction/engagement data
          const reactionEls = await element.$$('[class*="reaction"]');
          const reactions = reactionEls.length;

          // Build message URL (Discord message links)
          const messageLink = this.session.page.url();

          mentions.push(this.createMention({
            title: `${author} on Discord`,
            content: content.substring(0, 1000), // Cap content length
            url: messageLink,
            author,
            postDate,
            source: fullSource,
            engagement: {
              reactions,
            },
          }));

        } catch {
          // Skip messages that fail extraction
          continue;
        }
      }

    } catch (error: any) {
      console.log(`      Error extracting Discord results: ${error.message}`);
    }

    return mentions;
  }
}
