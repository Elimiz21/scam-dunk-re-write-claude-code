// Configuration values loaded from environment variables

export const config = {
  // Plan limits
  freeChecksPerMonth: parseInt(process.env.FREE_CHECKS_PER_MONTH || "5", 10),
  paidChecksPerMonth: parseInt(process.env.PAID_CHECKS_PER_MONTH || "200", 10),

  // PayPal
  paypalClientId: process.env.PAYPAL_CLIENT_ID || "",
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
  paypalPlanId: process.env.PAYPAL_PLAN_ID || "",
  paypalWebhookId: process.env.PAYPAL_WEBHOOK_ID || "",
  paypalMode: process.env.PAYPAL_MODE || "sandbox",

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY || "",

  // Financial Modeling Prep API (Primary)
  fmpApiKey: process.env.FMP_API_KEY || "",

  // Alpha Vantage API (Legacy/Fallback)
  alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY || "",

  // NextAuth
  nextAuthUrl: process.env.NEXTAUTH_URL || "http://localhost:3000",
  nextAuthSecret: process.env.NEXTAUTH_SECRET || "",

  // Python AI Backend (for full ML models)
  aiBackendUrl: process.env.AI_BACKEND_URL || "http://localhost:8000",

  // Social Scan APIs
  youtubeApiKey: process.env.YOUTUBE_API_KEY || "",
  redditClientId: process.env.REDDIT_CLIENT_ID || "",
  redditClientSecret: process.env.REDDIT_CLIENT_SECRET || "",
  redditUsername: process.env.REDDIT_USERNAME || "",
  redditPassword: process.env.REDDIT_PASSWORD || "",
  googleCseApiKey: process.env.GOOGLE_CSE_API_KEY || "",
  googleCseId: process.env.GOOGLE_CSE_ID || "",
  perplexityApiKey: process.env.PERPLEXITY_API_KEY || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  discordBotToken: process.env.DISCORD_BOT_TOKEN || "",
} as const;

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
