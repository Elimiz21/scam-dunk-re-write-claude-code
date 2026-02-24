/**
 * Admin Integrations Management
 * Functions for managing and testing API integrations.
 *
 * Credentials are resolved with DB-first priority:
 *   1. Encrypted credentials stored in IntegrationConfig.config (set via dashboard)
 *   2. Fallback to environment variables (Vercel / .env)
 */

import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { testOTCMarketsConnection } from "@/lib/otcMarkets";
import { testFINRAConnection } from "@/lib/finra";
import { encryptCredentials, decryptCredentials } from "@/lib/admin/encryption";
import {
  syncCredentials,
  unsyncCredentials,
  shouldSync,
  type SyncResults,
} from "@/lib/admin/sync-credentials";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CredentialField {
  key: string;       // internal key stored in encrypted JSON (e.g. "apiKey")
  label: string;     // human-readable label for the form
  envVar: string;    // corresponding environment variable name
  sensitive?: boolean; // default true – false for usernames / emails
}

interface IntegrationDefinition {
  name: string;
  displayName: string;
  category: string;
  description: string;
  getApiKey: () => string | undefined;
  testConnection: () => Promise<{ status: string; message?: string }>;
  rateLimit?: number;
  documentation?: string;
  showFullKey?: boolean;
  credentialFields: CredentialField[];
}

// ---------------------------------------------------------------------------
// DB Credential Loading
// ---------------------------------------------------------------------------

/**
 * Load encrypted credentials from the database and inject them into
 * process.env so that config.ts getters pick them up transparently.
 * DB values take priority over existing env vars.
 */
async function loadDbCredentials() {
  const records = await prisma.integrationConfig.findMany({
    where: { config: { not: null } },
    select: { name: true, config: true },
  });

  for (const record of records) {
    const creds = decryptCredentials(record.config);
    if (!creds) continue;

    const def = INTEGRATIONS.find((i) => i.name === record.name);
    if (!def) continue;

    for (const field of def.credentialFields) {
      const value = creds[field.key];
      if (value) {
        process.env[field.envVar] = value;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskApiKey(key: string | undefined, showFull = false): string {
  if (!key || key.length === 0) return "Not configured";
  if (showFull) return key;
  if (key.length < 12) return "Not configured";
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}

// ---------------------------------------------------------------------------
// Test Functions
// ---------------------------------------------------------------------------

async function testOpenAI(): Promise<{ status: string; message?: string }> {
  if (!config.openaiApiKey) return { status: "ERROR", message: "API key not configured" };
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${config.openaiApiKey}` },
    });
    if (response.ok) return { status: "CONNECTED" };
    const error = await response.json();
    return { status: "ERROR", message: error.error?.message || "Connection failed" };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

async function testFMP(): Promise<{ status: string; message?: string }> {
  if (!config.fmpApiKey) return { status: "ERROR", message: "API key not configured" };
  try {
    const response = await fetch(
      `https://financialmodelingprep.com/stable/profile?symbol=AAPL&apikey=${config.fmpApiKey}`
    );
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) return { status: "CONNECTED" };
      return { status: "ERROR", message: "API returned empty data — key may be invalid" };
    }
    if (response.status === 401 || response.status === 403) {
      return { status: "ERROR", message: "Invalid or expired API key" };
    }
    return { status: "ERROR", message: `FMP returned ${response.status}` };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

async function testAlphaVantage(): Promise<{ status: string; message?: string }> {
  if (!config.alphaVantageApiKey) return { status: "ERROR", message: "API key not configured" };
  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${config.alphaVantageApiKey}`
    );
    if (response.ok) {
      const data = await response.json();
      if (data["Error Message"]) return { status: "ERROR", message: data["Error Message"] };
      if (data["Note"]) return { status: "ERROR", message: "Rate limit exceeded" };
      return { status: "CONNECTED" };
    }
    return { status: "ERROR", message: "Connection failed" };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

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
    if (response.ok) return { status: "CONNECTED" };
    const error = await response.json();
    return { status: "ERROR", message: error.error_description || "Connection failed" };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

async function testDatabase(): Promise<{ status: string; message?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "CONNECTED" };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

async function testOTCMarkets(): Promise<{ status: string; message?: string }> {
  return testOTCMarketsConnection();
}

async function testFINRA(): Promise<{ status: string; message?: string }> {
  return testFINRAConnection();
}

async function testResend(): Promise<{ status: string; message?: string }> {
  if (!config.resendApiKey) return { status: "ERROR", message: "API key not configured" };
  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${config.resendApiKey}` },
    });
    if (response.ok) return { status: "CONNECTED" };
    if (response.status === 401) return { status: "ERROR", message: "Invalid API key" };
    return { status: "ERROR", message: `Resend returned ${response.status}` };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

async function testYouTube(): Promise<{ status: string; message?: string }> {
  if (!config.youtubeApiKey) return { status: "ERROR", message: "API key not configured" };
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

async function testRedditPublic(): Promise<{ status: string; message?: string }> {
  try {
    const response = await fetch("https://www.reddit.com/r/stocks/new.json?limit=1", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ScamDunk/1.0; Stock Research Tool)",
        Accept: "application/json",
      },
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.data?.children?.length > 0) {
        return { status: "CONNECTED", message: "Public JSON endpoint reachable (no credentials needed)" };
      }
      return { status: "CONNECTED", message: "Endpoint reachable but returned no posts" };
    }
    if (response.status === 429) return { status: "ERROR", message: "Rate limited — try again in a minute" };
    return { status: "ERROR", message: `Reddit returned ${response.status}` };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

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

async function testPerplexity(): Promise<{ status: string; message?: string }> {
  if (!config.perplexityApiKey) return { status: "ERROR", message: "API key not configured" };
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

async function testAnthropic(): Promise<{ status: string; message?: string }> {
  if (!config.anthropicApiKey) return { status: "ERROR", message: "API key not configured" };
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

async function testDiscordBot(): Promise<{ status: string; message?: string }> {
  if (!config.discordBotToken) return { status: "ERROR", message: "Bot token not configured" };
  try {
    const response = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${config.discordBotToken}` },
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

async function testCrowdTangle(): Promise<{ status: string; message?: string }> {
  if (!config.crowdtangleApiKey) return { status: "ERROR", message: "API token not configured" };
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

async function testBrowserEncryptionKey(): Promise<{ status: string; message?: string }> {
  if (!config.browserSessionEncryptionKey) {
    return { status: "ERROR", message: "Encryption key not configured" };
  }
  if (config.browserSessionEncryptionKey.length < 32) {
    return { status: "ERROR", message: "Encryption key must be at least 32 characters" };
  }
  return { status: "CONNECTED", message: "Key configured" };
}

async function testVercelSync(): Promise<{ status: string; message?: string }> {
  if (!config.vercelApiToken || !config.vercelProjectId) {
    return { status: "ERROR", message: "Vercel API token or project ID not configured" };
  }
  try {
    const teamQuery = config.vercelTeamId ? `?teamId=${config.vercelTeamId}` : "";
    const res = await fetch(
      `https://api.vercel.com/v9/projects/${config.vercelProjectId}/env${teamQuery}`,
      { headers: { Authorization: `Bearer ${config.vercelApiToken}` } }
    );
    if (res.ok) {
      const data = await res.json();
      const count = data.envs?.length ?? 0;
      return { status: "CONNECTED", message: `Access OK — ${count} env var(s) found` };
    }
    if (res.status === 401 || res.status === 403) {
      return { status: "ERROR", message: "Invalid token or insufficient permissions" };
    }
    return { status: "ERROR", message: `Vercel API returned ${res.status}` };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

async function testGitHubSync(): Promise<{ status: string; message?: string }> {
  if (!config.githubSyncPat || !config.githubRepoOwner || !config.githubRepoName) {
    return { status: "ERROR", message: "GitHub PAT, repo owner, or repo name not configured" };
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${config.githubRepoOwner}/${config.githubRepoName}/actions/secrets/public-key`,
      {
        headers: {
          Authorization: `Bearer ${config.githubSyncPat}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    if (res.ok) return { status: "CONNECTED", message: "Access OK — can read/write secrets" };
    if (res.status === 401 || res.status === 403) {
      return { status: "ERROR", message: "Invalid PAT or missing repo scope" };
    }
    if (res.status === 404) {
      return { status: "ERROR", message: "Repository not found — check owner/name" };
    }
    return { status: "ERROR", message: `GitHub API returned ${res.status}` };
  } catch (error) {
    return { status: "ERROR", message: error instanceof Error ? error.message : "Connection failed" };
  }
}

// ---------------------------------------------------------------------------
// Integration Definitions
// ---------------------------------------------------------------------------

const INTEGRATIONS: IntegrationDefinition[] = [
  {
    name: "OPENAI",
    displayName: "OpenAI",
    category: "API",
    description: "Powers AI narrative generation for scan results",
    getApiKey: () => config.openaiApiKey,
    testConnection: testOpenAI,
    rateLimit: 500,
    documentation: "https://platform.openai.com/docs",
    credentialFields: [
      { key: "apiKey", label: "API Key", envVar: "OPENAI_API_KEY" },
    ],
  },
  {
    name: "FMP",
    displayName: "Financial Modeling Prep",
    category: "API",
    description: "Primary source for real-time stock quotes, financials, and company data",
    getApiKey: () => config.fmpApiKey,
    testConnection: testFMP,
    rateLimit: 300,
    documentation: "https://site.financialmodelingprep.com/developer/docs",
    credentialFields: [
      { key: "apiKey", label: "API Key", envVar: "FMP_API_KEY" },
    ],
  },
  {
    name: "ALPHA_VANTAGE",
    displayName: "Alpha Vantage",
    category: "API",
    description: "Provides real-time stock market data (legacy fallback)",
    getApiKey: () => config.alphaVantageApiKey,
    testConnection: testAlphaVantage,
    rateLimit: 5,
    documentation: "https://www.alphavantage.co/documentation/",
    credentialFields: [
      { key: "apiKey", label: "API Key", envVar: "ALPHA_VANTAGE_API_KEY" },
    ],
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
    credentialFields: [
      { key: "clientId", label: "Client ID", envVar: "PAYPAL_CLIENT_ID" },
      { key: "clientSecret", label: "Client Secret", envVar: "PAYPAL_CLIENT_SECRET" },
      { key: "planId", label: "Plan ID", envVar: "PAYPAL_PLAN_ID" },
      { key: "webhookId", label: "Webhook ID", envVar: "PAYPAL_WEBHOOK_ID" },
    ],
  },
  {
    name: "DATABASE",
    displayName: "PostgreSQL (Supabase)",
    category: "DATABASE",
    description: "Primary database for user data and analytics",
    getApiKey: () => process.env.DATABASE_URL,
    testConnection: testDatabase,
    documentation: "https://supabase.com/docs",
    credentialFields: [
      { key: "url", label: "Connection URL", envVar: "DATABASE_URL" },
    ],
  },
  {
    name: "RESEND",
    displayName: "Resend (Email)",
    category: "API",
    description: "Sends transactional emails — password resets, scan alerts, admin notifications",
    getApiKey: () => config.resendApiKey,
    testConnection: testResend,
    rateLimit: 100,
    documentation: "https://resend.com/docs",
    credentialFields: [
      { key: "apiKey", label: "API Key", envVar: "RESEND_API_KEY" },
    ],
  },
  // Regulatory Data Integrations (free public APIs)
  {
    name: "OTC_MARKETS",
    displayName: "OTC Markets",
    category: "REGULATORY",
    description: "Caveat Emptor flags, shell risk, tier data, compliance status (free public API)",
    getApiKey: () => config.otcMarketsApiKey || "FREE_PUBLIC_API",
    testConnection: testOTCMarkets,
    rateLimit: 30,
    documentation: "https://www.otcmarkets.com/market-data/overview",
    credentialFields: [
      { key: "apiKey", label: "API Key (optional)", envVar: "OTC_MARKETS_API_KEY" },
    ],
  },
  {
    name: "FINRA",
    displayName: "FINRA BrokerCheck",
    category: "REGULATORY",
    description: "Firm disclosures, disciplinary actions, broker misconduct (free public API)",
    getApiKey: () => config.finraApiKey || "FREE_PUBLIC_API",
    testConnection: testFINRA,
    rateLimit: 20,
    documentation: "https://brokercheck.finra.org/",
    credentialFields: [
      { key: "apiKey", label: "API Key (optional)", envVar: "FINRA_API_KEY" },
    ],
  },
  // Social Media Scan Integrations
  {
    name: "YOUTUBE",
    displayName: "YouTube Data API",
    category: "SOCIAL_SCAN",
    description: "Searches for stock promotion videos on YouTube (10,000 units/day free)",
    getApiKey: () => config.youtubeApiKey,
    testConnection: testYouTube,
    rateLimit: 100,
    documentation: "https://developers.google.com/youtube/v3",
    credentialFields: [
      { key: "apiKey", label: "API Key", envVar: "YOUTUBE_API_KEY" },
    ],
  },
  {
    name: "REDDIT_PUBLIC",
    displayName: "Reddit Public JSON",
    category: "SOCIAL_SCAN",
    description: "Reddit public JSON endpoints — no credentials needed (10 req/min)",
    getApiKey: () => "No credentials required",
    testConnection: testRedditPublic,
    rateLimit: 10,
    documentation: "https://www.reddit.com/wiki/api/",
    credentialFields: [],
  },
  {
    name: "GOOGLE_CSE",
    displayName: "Google Custom Search",
    category: "SOCIAL_SCAN",
    description: "Searches all social media platforms via Google (100 free queries/day)",
    getApiKey: () => config.googleCseApiKey,
    testConnection: testGoogleCSE,
    rateLimit: 100,
    documentation: "https://developers.google.com/custom-search/v1/overview",
    credentialFields: [
      { key: "apiKey", label: "API Key", envVar: "GOOGLE_CSE_API_KEY" },
      { key: "searchEngineId", label: "Search Engine ID", envVar: "GOOGLE_CSE_ID", sensitive: false },
    ],
  },
  {
    name: "PERPLEXITY",
    displayName: "Perplexity AI",
    category: "SOCIAL_SCAN",
    description: "Web-grounded AI search for social media mentions with real citations",
    getApiKey: () => config.perplexityApiKey,
    testConnection: testPerplexity,
    rateLimit: 600,
    documentation: "https://docs.perplexity.ai/",
    credentialFields: [
      { key: "apiKey", label: "API Key", envVar: "PERPLEXITY_API_KEY" },
    ],
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
    credentialFields: [
      { key: "apiKey", label: "API Key", envVar: "ANTHROPIC_API_KEY" },
    ],
  },
  {
    name: "DISCORD_BOT",
    displayName: "Discord Bot",
    category: "SOCIAL_SCAN",
    description: "Bot created but not yet linked to any servers. Needs server invites to begin monitoring.",
    getApiKey: () => config.discordBotToken,
    testConnection: testDiscordBot,
    documentation: "https://discord.com/developers/docs",
    credentialFields: [
      { key: "botToken", label: "Bot Token", envVar: "DISCORD_BOT_TOKEN" },
    ],
  },
  {
    name: "CROWDTANGLE",
    displayName: "CrowdTangle / Meta Content Library",
    category: "SOCIAL_SCAN",
    description: "Searches public Facebook, Instagram, and Reddit content (Meta research tool)",
    getApiKey: () => config.crowdtangleApiKey,
    testConnection: testCrowdTangle,
    documentation: "https://www.crowdtangle.com/",
    credentialFields: [
      { key: "apiKey", label: "API Token", envVar: "CROWDTANGLE_API_KEY" },
    ],
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
    credentialFields: [
      { key: "email", label: "Email", envVar: "BROWSER_DISCORD_EMAIL", sensitive: false },
      { key: "password", label: "Password", envVar: "BROWSER_DISCORD_PASSWORD" },
      { key: "twoFaSecret", label: "2FA Secret (optional)", envVar: "BROWSER_DISCORD_2FA_SECRET" },
    ],
  },
  {
    name: "BROWSER_REDDIT",
    displayName: "Reddit (Personal Account)",
    category: "BROWSER_AGENT",
    description: "Owner's personal Reddit account for browser-based subreddit scanning",
    getApiKey: () => config.browserRedditUsername,
    showFullKey: true,
    testConnection: testBrowserCredential("browserRedditUsername", "browserRedditPassword"),
    credentialFields: [
      { key: "username", label: "Username", envVar: "BROWSER_REDDIT_USERNAME", sensitive: false },
      { key: "password", label: "Password", envVar: "BROWSER_REDDIT_PASSWORD" },
      { key: "twoFaSecret", label: "2FA Secret (optional)", envVar: "BROWSER_REDDIT_2FA_SECRET" },
    ],
  },
  {
    name: "BROWSER_TWITTER",
    displayName: "Twitter/X (Personal Account)",
    category: "BROWSER_AGENT",
    description: "Owner's personal Twitter/X account for browser-based cashtag scanning",
    getApiKey: () => config.browserTwitterUsername,
    showFullKey: true,
    testConnection: testBrowserCredential("browserTwitterUsername", "browserTwitterPassword"),
    credentialFields: [
      { key: "username", label: "Username", envVar: "BROWSER_TWITTER_USERNAME", sensitive: false },
      { key: "password", label: "Password", envVar: "BROWSER_TWITTER_PASSWORD" },
      { key: "twoFaSecret", label: "2FA Secret (optional)", envVar: "BROWSER_TWITTER_2FA_SECRET" },
    ],
  },
  {
    name: "BROWSER_INSTAGRAM",
    displayName: "Instagram (Personal Account)",
    category: "BROWSER_AGENT",
    description: "Owner's personal Instagram account for browser-based hashtag scanning",
    getApiKey: () => config.browserInstagramUsername,
    showFullKey: true,
    testConnection: testBrowserCredential("browserInstagramUsername", "browserInstagramPassword"),
    credentialFields: [
      { key: "username", label: "Username", envVar: "BROWSER_INSTAGRAM_USERNAME", sensitive: false },
      { key: "password", label: "Password", envVar: "BROWSER_INSTAGRAM_PASSWORD" },
      { key: "twoFaSecret", label: "2FA Secret (optional)", envVar: "BROWSER_INSTAGRAM_2FA_SECRET" },
    ],
  },
  {
    name: "BROWSER_FACEBOOK",
    displayName: "Facebook (Personal Account)",
    category: "BROWSER_AGENT",
    description: "Owner's personal Facebook account for browser-based group scanning",
    getApiKey: () => config.browserFacebookEmail,
    showFullKey: true,
    testConnection: testBrowserCredential("browserFacebookEmail", "browserFacebookPassword"),
    credentialFields: [
      { key: "email", label: "Email", envVar: "BROWSER_FACEBOOK_EMAIL", sensitive: false },
      { key: "password", label: "Password", envVar: "BROWSER_FACEBOOK_PASSWORD" },
      { key: "twoFaSecret", label: "2FA Secret (optional)", envVar: "BROWSER_FACEBOOK_2FA_SECRET" },
    ],
  },
  {
    name: "BROWSER_TIKTOK",
    displayName: "TikTok (Personal Account)",
    category: "BROWSER_AGENT",
    description: "Owner's personal TikTok account for browser-based hashtag scanning",
    getApiKey: () => config.browserTiktokUsername,
    showFullKey: true,
    testConnection: testBrowserCredential("browserTiktokUsername", "browserTiktokPassword"),
    credentialFields: [
      { key: "username", label: "Username", envVar: "BROWSER_TIKTOK_USERNAME", sensitive: false },
      { key: "password", label: "Password", envVar: "BROWSER_TIKTOK_PASSWORD" },
      { key: "twoFaSecret", label: "2FA Secret (optional)", envVar: "BROWSER_TIKTOK_2FA_SECRET" },
    ],
  },
  {
    name: "BROWSER_ENCRYPTION_KEY",
    displayName: "Session Encryption Key",
    category: "BROWSER_AGENT",
    description: "AES-256 encryption key for browser cookie/session storage",
    getApiKey: () => config.browserSessionEncryptionKey,
    testConnection: testBrowserEncryptionKey,
    credentialFields: [
      { key: "encryptionKey", label: "Encryption Key (min 32 chars)", envVar: "BROWSER_SESSION_ENCRYPTION_KEY" },
    ],
  },
  // Credential Sync — bootstrap tokens (set once, enables dashboard → Vercel/GitHub push)
  {
    name: "SYNC_VERCEL",
    displayName: "Vercel Sync",
    category: "SYNC",
    description: "Pushes credentials to Vercel env vars when saved in dashboard",
    getApiKey: () => config.vercelApiToken,
    testConnection: testVercelSync,
    documentation: "https://vercel.com/docs/rest-api#endpoints/projects/create-one-or-more-environment-variables",
    credentialFields: [
      { key: "apiToken", label: "Vercel API Token", envVar: "VERCEL_API_TOKEN" },
      { key: "projectId", label: "Project ID", envVar: "VERCEL_PROJECT_ID", sensitive: false },
      { key: "teamId", label: "Team ID (optional)", envVar: "VERCEL_TEAM_ID", sensitive: false },
    ],
  },
  {
    name: "SYNC_GITHUB",
    displayName: "GitHub Secrets Sync",
    category: "SYNC",
    description: "Pushes credentials to GitHub Actions secrets when saved in dashboard",
    getApiKey: () => config.githubSyncPat,
    testConnection: testGitHubSync,
    documentation: "https://docs.github.com/en/rest/actions/secrets",
    credentialFields: [
      { key: "pat", label: "Personal Access Token (repo scope)", envVar: "GITHUB_SYNC_PAT" },
      { key: "owner", label: "Repo Owner", envVar: "GITHUB_REPO_OWNER", sensitive: false },
      { key: "repo", label: "Repo Name", envVar: "GITHUB_REPO_NAME", sensitive: false },
    ],
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize or update integration configs in database.
 * Also loads any DB-stored credentials into process.env.
 */
export async function initializeIntegrations() {
  // Load DB-stored credentials so env getters pick them up
  await loadDbCredentials();

  for (const integration of INTEGRATIONS) {
    const existing = await prisma.integrationConfig.findUnique({
      where: { name: integration.name },
    });

    const showFull = integration.showFullKey === true;

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
 * Get all integrations with their current status.
 */
export async function getIntegrations() {
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
      credentialFields: definition?.credentialFields || [],
      hasDbCredentials: !!integration.config,
    };
  });
}

/**
 * Test a specific integration.
 */
export async function testIntegration(name: string) {
  // Make sure DB credentials are loaded before testing
  await loadDbCredentials();

  const definition = INTEGRATIONS.find((i) => i.name === name);
  if (!definition) {
    return { status: "ERROR", message: "Unknown integration" };
  }

  const result = await definition.testConnection();

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
 * Test all integrations.
 */
export async function testAllIntegrations() {
  await loadDbCredentials();

  const results: Record<string, { status: string; message?: string }> = {};
  for (const integration of INTEGRATIONS) {
    results[integration.name] = await testIntegration(integration.name);
  }
  return results;
}

/**
 * Update integration configuration (enable/disable, budget, rate limit).
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
 * Save credentials for an integration.
 * Encrypts the values and stores them in IntegrationConfig.config.
 * Also injects them into process.env immediately so tests work.
 * If Vercel/GitHub sync is configured, pushes the env vars there too.
 */
export async function updateIntegrationCredentials(
  name: string,
  credentials: Record<string, string>
): Promise<{ success: true; sync?: SyncResults }> {
  const definition = INTEGRATIONS.find((i) => i.name === name);
  if (!definition) {
    throw new Error("Unknown integration");
  }

  // Validate that only known field keys are provided
  const validKeys = new Set(definition.credentialFields.map((f) => f.key));
  for (const key of Object.keys(credentials)) {
    if (!validKeys.has(key)) {
      throw new Error(`Unknown credential field: ${key}`);
    }
  }

  // Merge with existing DB credentials (so partial updates work)
  const existing = await prisma.integrationConfig.findUnique({
    where: { name },
    select: { config: true },
  });
  const existingCreds = decryptCredentials(existing?.config) || {};
  const merged = { ...existingCreds, ...credentials };

  // Remove empty values
  for (const [k, v] of Object.entries(merged)) {
    if (!v) delete merged[k];
  }

  const encrypted = Object.keys(merged).length > 0 ? encryptCredentials(merged) : null;

  // Inject into process.env immediately
  for (const field of definition.credentialFields) {
    const value = merged[field.key];
    if (value) {
      process.env[field.envVar] = value;
    }
  }

  // Update masked display value
  const showFull = definition.showFullKey === true;
  const newMasked = maskApiKey(definition.getApiKey(), showFull);

  await prisma.integrationConfig.update({
    where: { name },
    data: {
      config: encrypted,
      apiKeyMasked: newMasked,
    },
  });

  // Sync to Vercel + GitHub (skip for the sync integrations themselves)
  let sync: SyncResults | undefined;
  if (shouldSync(name)) {
    const envVarsToSync: Record<string, string> = {};
    for (const field of definition.credentialFields) {
      const value = merged[field.key];
      if (value) {
        envVarsToSync[field.envVar] = value;
      }
    }
    if (Object.keys(envVarsToSync).length > 0) {
      sync = await syncCredentials(envVarsToSync);
    }
  }

  return { success: true, sync };
}

/**
 * Remove DB-stored credentials for an integration (revert to env-var-only).
 * Also removes the env vars from Vercel + GitHub if sync is configured.
 */
export async function clearIntegrationCredentials(
  name: string
): Promise<{ success: true; sync?: SyncResults }> {
  const definition = INTEGRATIONS.find((i) => i.name === name);
  if (!definition) {
    throw new Error("Unknown integration");
  }

  // Clear the injected env vars (revert to original env)
  for (const field of definition.credentialFields) {
    delete process.env[field.envVar];
  }

  const showFull = definition.showFullKey === true;
  const newMasked = maskApiKey(definition.getApiKey(), showFull);

  await prisma.integrationConfig.update({
    where: { name },
    data: {
      config: null,
      apiKeyMasked: newMasked,
    },
  });

  // Remove from Vercel + GitHub
  let sync: SyncResults | undefined;
  if (shouldSync(name)) {
    const envVarKeys = definition.credentialFields.map((f) => f.envVar);
    if (envVarKeys.length > 0) {
      sync = await unsyncCredentials(envVarKeys);
    }
  }

  return { success: true, sync };
}

/**
 * Get integration health summary.
 */
export async function getIntegrationHealthSummary() {
  const integrations = await prisma.integrationConfig.findMany();

  return {
    total: integrations.length,
    connected: integrations.filter((i) => i.status === "CONNECTED").length,
    errors: integrations.filter((i) => i.status === "ERROR").length,
    unknown: integrations.filter((i) => i.status === "UNKNOWN").length,
    disabled: integrations.filter((i) => !i.isEnabled).length,
  };
}
