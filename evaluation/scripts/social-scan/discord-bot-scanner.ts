/**
 * Discord Bot Scanner
 *
 * Uses a Discord bot to search for stock ticker mentions
 * in joined servers. Bot must be invited to target servers manually.
 *
 * Setup: https://discord.com/developers/applications
 * Env: DISCORD_BOT_TOKEN
 *
 * Note: The bot must have MESSAGE_CONTENT intent enabled and
 * must be invited to servers with "Read Messages" permission.
 */

import {
  ScanTarget, PlatformScanResult, SocialMention,
  calculatePromotionScore, SocialScanner
} from './types';

const DISCORD_API = 'https://discord.com/api/v10';

async function discordApiGet(endpoint: string, token: string): Promise<any> {
  const response = await fetch(`${DISCORD_API}${endpoint}`, {
    headers: {
      'Authorization': `Bot ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Discord API ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export class DiscordBotScanner implements SocialScanner {
  name = 'discord_bot';
  platform = 'Discord';

  isConfigured(): boolean {
    return !!process.env.DISCORD_BOT_TOKEN;
  }

  async scan(targets: ScanTarget[]): Promise<PlatformScanResult[]> {
    const startTime = Date.now();
    const token = process.env.DISCORD_BOT_TOKEN;

    if (!token) {
      return [{
        platform: 'Discord',
        scanner: this.name,
        success: false,
        error: 'Discord bot token not configured',
        mentionsFound: 0,
        mentions: [],
        activityLevel: 'none',
        promotionRisk: 'low',
        scanDuration: Date.now() - startTime,
      }];
    }

    console.log(`  [Discord] Scanning servers for ${targets.length} tickers...`);
    const allMentions: SocialMention[] = [];

    try {
      // Get list of guilds (servers) the bot is in
      const guilds = await discordApiGet('/users/@me/guilds', token);
      console.log(`    Bot is in ${guilds.length} server(s)`);

      const tickerPatterns = targets.map(t => ({
        target: t,
        regex: new RegExp(`\\b\\$?${t.ticker}\\b`, 'i'),
      }));

      for (const guild of guilds) {
        try {
          // Get text channels in this guild
          const channels = await discordApiGet(`/guilds/${guild.id}/channels`, token);
          const textChannels = channels.filter((c: any) => c.type === 0); // GUILD_TEXT

          for (const channel of textChannels.slice(0, 10)) { // Limit to 10 channels per server
            try {
              // Get recent messages
              const messages = await discordApiGet(
                `/channels/${channel.id}/messages?limit=100`,
                token
              );

              for (const msg of messages) {
                const content = msg.content || '';
                if (!content) continue;

                // Check if any ticker is mentioned
                for (const { target, regex } of tickerPatterns) {
                  if (!regex.test(content)) continue;

                  const { score, flags } = calculatePromotionScore(content);

                  // Discord-specific: check for coordinated posting
                  const memberSince = msg.member?.joined_at;
                  if (memberSince) {
                    const daysSince = (Date.now() - new Date(memberSince).getTime()) / (1000 * 60 * 60 * 24);
                    if (daysSince < 7) {
                      flags.push('Recently joined server');
                    }
                  }

                  const finalScore = Math.min(
                    score + (flags.includes('Recently joined server') ? 15 : 0),
                    100
                  );

                  allMentions.push({
                    platform: 'Discord',
                    source: `${guild.name} / #${channel.name}`,
                    discoveredVia: 'discord_bot',
                    title: '',
                    content: content.substring(0, 500),
                    url: `https://discord.com/channels/${guild.id}/${channel.id}/${msg.id}`,
                    author: msg.author?.username || 'unknown',
                    postDate: msg.timestamp || new Date().toISOString(),
                    engagement: {
                      likes: msg.reactions?.reduce((sum: number, r: any) => sum + (r.count || 0), 0) || 0,
                    },
                    sentiment: finalScore > 30 ? 'bullish' : 'neutral',
                    isPromotional: finalScore >= 30,
                    promotionScore: finalScore,
                    redFlags: flags,
                  });

                  break; // Don't double-count if multiple tickers match
                }
              }

              await new Promise(r => setTimeout(r, 500)); // Rate limit
            } catch {
              // Skip channels we can't read
            }
          }

          await new Promise(r => setTimeout(r, 1000));
        } catch (error: any) {
          console.error(`    Error scanning guild ${guild.name}:`, error.message);
        }
      }
    } catch (error: any) {
      return [{
        platform: 'Discord',
        scanner: this.name,
        success: false,
        error: `Discord API error: ${error.message}`,
        mentionsFound: 0,
        mentions: [],
        activityLevel: 'none',
        promotionRisk: 'low',
        scanDuration: Date.now() - startTime,
      }];
    }

    const avgScore = allMentions.length > 0
      ? allMentions.reduce((sum, m) => sum + m.promotionScore, 0) / allMentions.length
      : 0;

    return [{
      platform: 'Discord',
      scanner: this.name,
      success: true,
      mentionsFound: allMentions.length,
      mentions: allMentions,
      activityLevel: allMentions.length >= 15 ? 'high'
        : allMentions.length >= 5 ? 'medium'
        : allMentions.length > 0 ? 'low' : 'none',
      promotionRisk: avgScore >= 40 ? 'high'
        : avgScore >= 20 ? 'medium' : 'low',
      scanDuration: Date.now() - startTime,
    }];
  }
}
