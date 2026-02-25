// Configuration values loaded from environment variables.
// Uses getters so process.env is read at access time (not at build/module-init
// time). This ensures runtime env vars injected by Vercel are always picked up,
// even if they were absent during `next build`.

function env(key: string, fallback = ""): string {
  return process.env[key] || fallback;
}

function envInt(key: string, fallback: number): number {
  return parseInt(process.env[key] || String(fallback), 10);
}

export const config = {
  // Plan limits
  get freeChecksPerMonth() { return envInt("FREE_CHECKS_PER_MONTH", 5); },
  get paidChecksPerMonth() { return envInt("PAID_CHECKS_PER_MONTH", 200); },

  // PayPal
  get paypalClientId() { return env("PAYPAL_CLIENT_ID"); },
  get paypalClientSecret() { return env("PAYPAL_CLIENT_SECRET"); },
  get paypalPlanId() { return env("PAYPAL_PLAN_ID"); },
  get paypalWebhookId() { return env("PAYPAL_WEBHOOK_ID"); },
  get paypalMode() { return env("PAYPAL_MODE", "sandbox"); },

  // OpenAI
  get openaiApiKey() { return env("OPENAI_API_KEY"); },

  // Financial Modeling Prep API (Primary)
  get fmpApiKey() { return env("FMP_API_KEY"); },

  // Alpha Vantage API (Legacy/Fallback)
  get alphaVantageApiKey() { return env("ALPHA_VANTAGE_API_KEY"); },

  // OTC Markets API (optional - free public API used by default, paid API if key provided)
  get otcMarketsApiKey() { return env("OTC_MARKETS_API_KEY"); },

  // FINRA API (optional - free BrokerCheck API used by default, official API if key provided)
  get finraApiKey() { return env("FINRA_API_KEY"); },

  // NextAuth
  get nextAuthUrl() { return env("NEXTAUTH_URL", "http://localhost:3000"); },
  get nextAuthSecret() { return env("NEXTAUTH_SECRET"); },

  // Python AI Backend (for full ML models)
  aiBackendUrl: process.env.AI_BACKEND_URL || "http://localhost:8000",
  aiApiSecret: process.env.AI_API_SECRET || "",
  get aiBackendUrl() { return env("AI_BACKEND_URL", "http://localhost:8000"); },

  // Social Scan APIs
  get youtubeApiKey() { return env("YOUTUBE_API_KEY"); },
  // Reddit OAuth credentials — no longer required (public JSON scanner needs no auth).
  // Kept for backward compatibility if OAuth access is restored in the future.
  get redditClientId() { return env("REDDIT_CLIENT_ID"); },
  get redditClientSecret() { return env("REDDIT_CLIENT_SECRET"); },
  get redditUsername() { return env("REDDIT_USERNAME"); },
  get redditPassword() { return env("REDDIT_PASSWORD"); },
  get googleCseApiKey() { return env("GOOGLE_CSE_API_KEY"); },
  get googleCseId() { return env("GOOGLE_CSE_ID"); },
  get perplexityApiKey() { return env("PERPLEXITY_API_KEY"); },
  get anthropicApiKey() { return env("ANTHROPIC_API_KEY"); },
  get discordBotToken() { return env("DISCORD_BOT_TOKEN"); },

  // Email (Resend)
  get resendApiKey() { return env("RESEND_API_KEY"); },
  get emailFrom() { return env("EMAIL_FROM"); },
  get adminAlertEmail() { return env("ADMIN_ALERT_EMAIL"); },

  // Browser Agent Platform Credentials (personal account logins)
  get browserDiscordEmail() { return env("BROWSER_DISCORD_EMAIL"); },
  get browserDiscordPassword() { return env("BROWSER_DISCORD_PASSWORD"); },
  get browserDiscord2faSecret() { return env("BROWSER_DISCORD_2FA_SECRET"); },
  get browserRedditUsername() { return env("BROWSER_REDDIT_USERNAME"); },
  get browserRedditPassword() { return env("BROWSER_REDDIT_PASSWORD"); },
  get browserReddit2faSecret() { return env("BROWSER_REDDIT_2FA_SECRET"); },
  get browserTwitterUsername() { return env("BROWSER_TWITTER_USERNAME"); },
  get browserTwitterPassword() { return env("BROWSER_TWITTER_PASSWORD"); },
  get browserTwitter2faSecret() { return env("BROWSER_TWITTER_2FA_SECRET"); },
  get browserInstagramUsername() { return env("BROWSER_INSTAGRAM_USERNAME"); },
  get browserInstagramPassword() { return env("BROWSER_INSTAGRAM_PASSWORD"); },
  get browserInstagram2faSecret() { return env("BROWSER_INSTAGRAM_2FA_SECRET"); },
  get browserFacebookEmail() { return env("BROWSER_FACEBOOK_EMAIL"); },
  get browserFacebookPassword() { return env("BROWSER_FACEBOOK_PASSWORD"); },
  get browserFacebook2faSecret() { return env("BROWSER_FACEBOOK_2FA_SECRET"); },
  get browserTiktokUsername() { return env("BROWSER_TIKTOK_USERNAME"); },
  get browserTiktokPassword() { return env("BROWSER_TIKTOK_PASSWORD"); },
  get browserTiktok2faSecret() { return env("BROWSER_TIKTOK_2FA_SECRET"); },
  get browserSessionEncryptionKey() { return env("BROWSER_SESSION_ENCRYPTION_KEY"); },

  // Credential Sync (bootstrap secrets for dashboard → Vercel/GitHub push)
  get vercelApiToken() { return env("VERCEL_API_TOKEN"); },
  get vercelProjectId() { return env("VERCEL_PROJECT_ID"); },
  get vercelTeamId() { return env("VERCEL_TEAM_ID"); },
  get githubSyncPat() { return env("GITHUB_SYNC_PAT"); },
  get githubRepoOwner() { return env("GITHUB_REPO_OWNER"); },
  get githubRepoName() { return env("GITHUB_REPO_NAME"); },
};

/**
 * Validate required environment variables at startup.
 * Throws if critical secrets are missing.
 */
export function validateRequiredEnvVars(): void {
  const required = ["NEXTAUTH_SECRET", "DATABASE_URL"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `FATAL: Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

// Get scan limit based on plan
export function getScanLimit(plan: "FREE" | "PAID"): number {
  return plan === "PAID" ? config.paidChecksPerMonth : config.freeChecksPerMonth;
}

// Get current month key in YYYY-MM format
export function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
