/**
 * Admin Integrations Management
 * Functions for managing and testing API integrations
 */

import { prisma } from "@/lib/db";
import { config } from "@/lib/config";

/**
 * Mask an API key for display (show first 4 and last 4 characters)
 */
function maskApiKey(key: string | undefined, showFull = false): string {
  if (!key || key.length === 0) return "Not configured";
  if (showFull) return key;
  if (key.length < 12) return "Not configured";
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}

/**
 * Test OpenAI connection
 */
async function testOpenAI(): Promise<{ status: string; message?: string }> {
  if (!config.openaiApiKey) {
    return { status: "ERROR", message: "API key not configured" };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
    });

    if (response.ok) {
      return { status: "CONNECTED" };
    } else {
      const error = await response.json();
      return { status: "ERROR", message: error.error?.message || "Connection failed" };
    }
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test Alpha Vantage connection
 */
async function testAlphaVantage(): Promise<{ status: string; message?: string }> {
  if (!config.alphaVantageApiKey) {
    return { status: "ERROR", message: "API key not configured" };
  }

  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${config.alphaVantageApiKey}`
    );

    if (response.ok) {
      const data = await response.json();
      if (data["Error Message"]) {
        return { status: "ERROR", message: data["Error Message"] };
      }
      if (data["Note"]) {
        return { status: "ERROR", message: "Rate limit exceeded" };
      }
      return { status: "CONNECTED" };
    } else {
      return { status: "ERROR", message: "Connection failed" };
    }
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test PayPal connection
 */
async function testPayPal(): Promise<{ status: string; message?: string }> {
  if (!config.paypalClientId || !config.paypalClientSecret) {
    return { status: "ERROR", message: "API credentials not configured" };
  }

  try {
    const auth = Buffer.from(`${config.paypalClientId}:${config.paypalClientSecret}`).toString("base64");
    const baseUrl = config.paypalMode === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (response.ok) {
      return { status: "CONNECTED" };
    } else {
      const error = await response.json();
      return { status: "ERROR", message: error.error_description || "Connection failed" };
    }
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test database connection
 */
async function testDatabase(): Promise<{ status: string; message?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "CONNECTED" };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test YouTube Data API v3
 */
async function testYouTube(): Promise<{ status: string; message?: string }> {
  if (!config.youtubeApiKey) {
    return { status: "ERROR", message: "API key not configured" };
  }
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=${config.youtubeApiKey}`
    );
    if (response.ok) return { status: "CONNECTED" };
    const error = await response.json();
    return { status: "ERROR", message: error.error?.message || "Connection failed" };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test Reddit OAuth
 */
async function testRedditOAuth(): Promise<{ status: string; message?: string }> {
  if (!config.redditClientId || !config.redditClientSecret || !config.redditUsername || !config.redditPassword) {
    return { status: "ERROR", message: "Reddit credentials not fully configured" };
  }
  try {
    const auth = Buffer.from(`${config.redditClientId}:${config.redditClientSecret}`).toString("base64");
    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ScamDunk/1.0",
      },
      body: `grant_type=password&username=${encodeURIComponent(config.redditUsername)}&password=${encodeURIComponent(config.redditPassword)}`,
    });
    if (response.ok) {
      const data = await response.json();
      if (data.access_token) return { status: "CONNECTED" };
      return { status: "ERROR", message: data.error || "No access token returned" };
    }
    return { status: "ERROR", message: `Reddit auth returned ${response.status}` };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test Google Custom Search Engine
 */
async function testGoogleCSE(): Promise<{ status: string; message?: string }> {
  if (!config.googleCseApiKey || !config.googleCseId) {
    return { status: "ERROR", message: "Google CSE API key or Search Engine ID not configured" };
  }
  try {
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${config.googleCseApiKey}&cx=${config.googleCseId}&q=test&num=1`
    );
    if (response.ok) return { status: "CONNECTED" };
    const error = await response.json();
    return { status: "ERROR", message: error.error?.message || "Connection failed" };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test Perplexity API
 */
async function testPerplexity(): Promise<{ status: string; message?: string }> {
  if (!config.perplexityApiKey) {
    return { status: "ERROR", message: "API key not configured" };
  }
  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.perplexityApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
    });
    if (response.ok) return { status: "CONNECTED" };
    const error = await response.json().catch(() => ({}));
    return { status: "ERROR", message: error.error?.message || `API returned ${response.status}` };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test Anthropic API
 */
async function testAnthropic(): Promise<{ status: string; message?: string }> {
  if (!config.anthropicApiKey) {
    return { status: "ERROR", message: "API key not configured" };
  }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 5,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (response.ok) return { status: "CONNECTED" };
    const error = await response.json().catch(() => ({}));
    return { status: "ERROR", message: error.error?.message || `API returned ${response.status}` };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test Discord Bot
 */
async function testDiscordBot(): Promise<{ status: string; message?: string }> {
  if (!config.discordBotToken) {
    return { status: "ERROR", message: "Bot token not configured" };
  }
  try {
    const response = await fetch("https://discord.com/api/v10/users/@me", {
      headers: {
        Authorization: `Bot ${config.discordBotToken}`,
      },
    });
    if (response.ok) {
      const data = await response.json();
      return { status: "CONNECTED", message: `Bot: ${data.username}#${data.discriminator}` };
    }
    return { status: "ERROR", message: `Discord returned ${response.status}` };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test CrowdTangle / Meta Content Library
 */
async function testCrowdTangle(): Promise<{ status: string; message?: string }> {
  if (!config.crowdtangleApiKey) {
    return { status: "ERROR", message: "API token not configured" };
  }
  try {
    const response = await fetch(
      `https://api.crowdtangle.com/lists?token=${config.crowdtangleApiKey}`
    );
    if (response.ok) return { status: "CONNECTED" };
    if (response.status === 401) return { status: "ERROR", message: "Invalid API token" };
    return { status: "ERROR", message: `CrowdTangle returned ${response.status}` };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

/**
 * Test browser agent credential (just checks if username + password are set)
 */
function testBrowserCredential(
  usernameKey: keyof typeof config,
  passwordKey: keyof typeof config
): () => Promise<{ status: string; message?: string }> {
  return async () => {
    const username = config[usernameKey];
    const password = config[passwordKey];
    if (!username || !password) {
      return { status: "ERROR", message: "Username and password not configured" };
    }
    return { status: "CONNECTED", message: `Credentials set for ${username}` };
  };
}

/**
 * Test browser session encryption key
 */
async function testBrowserEncryptionKey(): Promise<{ status: string; message?: string }> {
  if (!config.browserSessionEncryptionKey) {
    return { status: "ERROR", message: "Encryption key not configured" };
  }
  if (config.browserSessionEncryptionKey.length < 32) {
    return { status: "ERROR", message: "Encryption key must be at least 32 characters" };
  }
  return { status: "CONNECTED", message: "Key configured" };
}

/**
 * Integration definitions with test functions
 */
const INTEGRATIONS = [
  {
    name: "OPENAI",
    displayName: "OpenAI",
    category: "API",
    description: "Powers AI narrative generation for scan results",
    getApiKey: () => config.openaiApiKey,
    testConnection: testOpenAI,
    rateLimit: 500, // requests per minute
    documentation: "https://platform.openai.com/docs",
  },
  {
    name: "ALPHA_VANTAGE",
    displayName: "Alpha Vantage",
    category: "API",
    description: "Provides real-time stock market data",
    getApiKey: () => config.alphaVantageApiKey,
    testConnection: testAlphaVantage,
    rateLimit: 5, // Free tier: 5 calls per minute
    documentation: "https://www.alphavantage.co/documentation/",
  },
  {
    name: "PAYPAL",
    displayName: "PayPal",
    category: "PAYMENT",
    description: "Handles subscription billing and payments",
    getApiKey: () => config.paypalClientId,
    testConnection: testPayPal,
    rateLimit: 100,
    documentation: "https://developer.paypal.com/docs/api/",
  },
  {
    name: "DATABASE",
    displayName: "PostgreSQL (Supabase)",
    category: "DATABASE",
    description: "Primary database for user data and analytics",
    getApiKey: () => process.env.DATABASE_URL,
    testConnection: testDatabase,
    documentation: "https://supabase.com/docs",
  },
  // Social Media Scan Integrations
  {
    name: "YOUTUBE",
    displayName: "YouTube Data API",
    category: "SOCIAL_SCAN",
    description: "Searches for stock promotion videos on YouTube (10,000 units/day free)",
    getApiKey: () => config.youtubeApiKey,
    testConnection: testYouTube,
    rateLimit: 100, // 100 searches per day (each costs 100 units)
    documentation: "https://developers.google.com/youtube/v3",
  },
  {
    name: "REDDIT_OAUTH",
    displayName: "Reddit OAuth API",
    category: "SOCIAL_SCAN",
    description: "Reddit API app credentials for authenticated search (separate from personal account)",
    getApiKey: () => config.redditClientId,
    testConnection: testRedditOAuth,
    rateLimit: 60,
    documentation: "https://www.reddit.com/wiki/api/",
  },
  {
    name: "GOOGLE_CSE",
    displayName: "Google Custom Search",
    category: "SOCIAL_SCAN",
    description: "Searches all social media platforms via Google (100 free queries/day)",
    getApiKey: () => config.googleCseApiKey,
    testConnection: testGoogleCSE,
    rateLimit: 100, // 100 queries per day on free tier
    documentation: "https://developers.google.com/custom-search/v1/overview",
  },
  {
    name: "PERPLEXITY",
    displayName: "Perplexity AI",
    category: "SOCIAL_SCAN",
    description: "Web-grounded AI search for social media mentions with real citations",
    getApiKey: () => config.perplexityApiKey,
    testConnection: testPerplexity,
    rateLimit: 600, // 600 queries per day
    documentation: "https://docs.perplexity.ai/",
  },
  {
    name: "ANTHROPIC",
    displayName: "Anthropic Claude",
    category: "SOCIAL_SCAN",
    description: "Deep analysis of suspicious social media patterns using Claude",
    getApiKey: () => config.anthropicApiKey,
    testConnection: testAnthropic,
    rateLimit: 1000,
    documentation: "https://docs.anthropic.com/",
  },
  {
    name: "DISCORD_BOT",
    displayName: "Discord Bot",
    category: "SOCIAL_SCAN",
    description: "Bot created but not yet linked to any servers. Needs server invites to begin monitoring.",
    getApiKey: () => config.discordBotToken,
    testConnection: testDiscordBot,
    documentation: "https://discord.com/developers/docs",
  },
  {
    name: "CROWDTANGLE",
    displayName: "CrowdTangle / Meta Content Library",
    category: "SOCIAL_SCAN",
    description: "Searches public Facebook, Instagram, and Reddit content (Meta research tool)",
    getApiKey: () => config.crowdtangleApiKey,
    testConnection: testCrowdTangle,
    documentation: "https://www.crowdtangle.com/",
  },
  // Browser Agent Platform Credentials (personal accounts)
  {
    name: "BROWSER_DISCORD",
    displayName: "Discord (Personal Account)",
    category: "BROWSER_AGENT",
    description: "Owner's personal Discord account for browser-based server scanning",
    getApiKey: () => config.browserDiscordEmail,
    showFullKey: true,
    testConnection: testBrowserCredential("browserDiscordEmail", "browserDiscordPassword"),
  },
  {
    name: "BROWSER_REDDIT",
    displayName: "Reddit (Personal Account)",
    category: "BROWSER_AGENT",
    description: "Owner's personal Reddit account for browser-based subreddit scanning",
    getApiKey: () => config.browserRedditUsername,
    showFullKey: true,
    testConnection: testBrowserCredential("browserRedditUsername", "browserRedditPassword"),
  },
  {
    name: "BROWSER_TWITTER",
    displayName: "Twitter/X (Personal Account)",
    category: "BROWSER_AGENT",
    description: "Owner's personal Twitter/X account for browser-based cashtag scanning",
    getApiKey: () => config.browserTwitterUsername,
    showFullKey: true,
    testConnection: testBrowserCredential("browserTwitterUsername", "browserTwitterPassword"),
  },
  {
    name: "BROWSER_INSTAGRAM",
    displayName: "Instagram (Personal Account)",
    category: "BROWSER_AGENT",
    description: "Owner's personal Instagram account for browser-based hashtag scanning",
    getApiKey: () => config.browserInstagramUsername,
    showFullKey: true,
    testConnection: testBrowserCredential("browserInstagramUsername", "browserInstagramPassword"),
  },
  {
    name: "BROWSER_FACEBOOK",
    displayName: "Facebook (Personal Account)",
    category: "BROWSER_AGENT",
    description: "Owner's personal Facebook account for browser-based group scanning",
    getApiKey: () => config.browserFacebookEmail,
    showFullKey: true,
    testConnection: testBrowserCredential("browserFacebookEmail", "browserFacebookPassword"),
  },
  {
    name: "BROWSER_TIKTOK",
    displayName: "TikTok (Personal Account)",
    category: "BROWSER_AGENT",
    description: "Owner's personal TikTok account for browser-based hashtag scanning",
    getApiKey: () => config.browserTiktokUsername,
    showFullKey: true,
    testConnection: testBrowserCredential("browserTiktokUsername", "browserTiktokPassword"),
  },
  {
    name: "BROWSER_ENCRYPTION_KEY",
    displayName: "Session Encryption Key",
    category: "BROWSER_AGENT",
    description: "AES-256 encryption key for browser cookie/session storage",
    getApiKey: () => config.browserSessionEncryptionKey,
    testConnection: testBrowserEncryptionKey,
  },
];

/**
 * Initialize or update integration configs in database
 */
export async function initializeIntegrations() {
  for (const integration of INTEGRATIONS) {
    const existing = await prisma.integrationConfig.findUnique({
      where: { name: integration.name },
    });

    const showFull = 'showFullKey' in integration && integration.showFullKey === true;

    if (!existing) {
      await prisma.integrationConfig.create({
        data: {
          name: integration.name,
          displayName: integration.displayName,
          category: integration.category,
          isEnabled: true,
          apiKeyMasked: maskApiKey(integration.getApiKey(), showFull),
          rateLimit: integration.rateLimit,
          status: "UNKNOWN",
        },
      });
    } else {
      // Update masked API key (or full username) if changed
      const newMasked = maskApiKey(integration.getApiKey(), showFull);
      if (existing.apiKeyMasked !== newMasked || existing.displayName !== integration.displayName) {
        await prisma.integrationConfig.update({
          where: { name: integration.name },
          data: {
            apiKeyMasked: newMasked,
            displayName: integration.displayName,
          },
        });
      }
    }
  }
}

/**
 * Get all integrations with their current status
 */
export async function getIntegrations() {
  // Ensure all integrations are in the database
  await initializeIntegrations();

  const integrations = await prisma.integrationConfig.findMany({
    orderBy: [{ category: "asc" }, { displayName: "asc" }],
  });

  return integrations.map((integration) => {
    const definition = INTEGRATIONS.find((i) => i.name === integration.name);
    return {
      ...integration,
      description: definition?.description || "",
      documentation: definition?.documentation || "",
    };
  });
}

/**
 * Test a specific integration
 */
export async function testIntegration(name: string) {
  const definition = INTEGRATIONS.find((i) => i.name === name);
  if (!definition) {
    return { status: "ERROR", message: "Unknown integration" };
  }

  const result = await definition.testConnection();

  // Update database with result
  await prisma.integrationConfig.update({
    where: { name },
    data: {
      status: result.status,
      lastCheckedAt: new Date(),
      errorMessage: result.message || null,
    },
  });

  return result;
}

/**
 * Test all integrations
 */
export async function testAllIntegrations() {
  const results: Record<string, { status: string; message?: string }> = {};

  for (const integration of INTEGRATIONS) {
    results[integration.name] = await testIntegration(integration.name);
  }

  return results;
}

/**
 * Update integration configuration
 */
export async function updateIntegrationConfig(
  name: string,
  updates: {
    isEnabled?: boolean;
    monthlyBudget?: number | null;
    rateLimit?: number | null;
  }
) {
  const integration = await prisma.integrationConfig.findUnique({
    where: { name },
  });

  if (!integration) {
    throw new Error("Integration not found");
  }

  return prisma.integrationConfig.update({
    where: { name },
    data: {
      isEnabled: updates.isEnabled ?? integration.isEnabled,
      monthlyBudget: updates.monthlyBudget,
      rateLimit: updates.rateLimit,
    },
  });
}

/**
 * Get integration health summary
 */
export async function getIntegrationHealthSummary() {
  const integrations = await prisma.integrationConfig.findMany();

  const summary = {
    total: integrations.length,
    connected: integrations.filter((i) => i.status === "CONNECTED").length,
    errors: integrations.filter((i) => i.status === "ERROR").length,
    unknown: integrations.filter((i) => i.status === "UNKNOWN").length,
    disabled: integrations.filter((i) => !i.isEnabled).length,
  };

  return summary;
}
