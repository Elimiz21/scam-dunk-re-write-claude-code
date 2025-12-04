// Configuration values loaded from environment variables

export const config = {
  // Plan limits
  freeChecksPerMonth: parseInt(process.env.FREE_CHECKS_PER_MONTH || "5", 10),
  paidChecksPerMonth: parseInt(process.env.PAID_CHECKS_PER_MONTH || "200", 10),

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripePricePaidPlanId: process.env.STRIPE_PRICE_PAID_PLAN_ID || "",

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY || "",

  // Alpha Vantage API
  alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY || "",

  // NextAuth
  nextAuthUrl: process.env.NEXTAUTH_URL || "http://localhost:3000",
  nextAuthSecret: process.env.NEXTAUTH_SECRET || "",
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
