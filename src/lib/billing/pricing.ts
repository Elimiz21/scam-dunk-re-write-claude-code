export const DEFAULT_BILLING_MONTHLY_PRICE_CENTS = {
  PAID: 499,
  PRO_MAX: 1499,
} as const;

export function configuredPrice(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getPublicBillingPrices(): {
  PAID: number;
  PRO_MAX: number;
} {
  return {
    PAID: configuredPrice(
      process.env.BILLING_PRO_MONTHLY_PRICE_CENTS,
      DEFAULT_BILLING_MONTHLY_PRICE_CENTS.PAID,
    ),
    PRO_MAX: configuredPrice(
      process.env.BILLING_PRO_MAX_MONTHLY_PRICE_CENTS,
      DEFAULT_BILLING_MONTHLY_PRICE_CENTS.PRO_MAX,
    ),
  };
}

export function formatUsdCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
