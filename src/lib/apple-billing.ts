import type { BillingPlan } from "@/lib/billing/provider";

export interface AppleBillingConfig {
  sharedSecret: string;
  bundleId: string;
  proProductId: string;
  proMaxProductId: string;
}

export function getAppleBillingConfig(): AppleBillingConfig {
  return {
    sharedSecret: process.env.APPLE_SHARED_SECRET || "",
    bundleId: process.env.APPLE_BUNDLE_ID || "",
    proProductId: process.env.APPLE_PRO_PRODUCT_ID || "",
    proMaxProductId: process.env.APPLE_PRO_MAX_PRODUCT_ID || "",
  };
}

export function isAppleBillingConfigured(config: AppleBillingConfig): boolean {
  return Boolean(
    config.sharedSecret &&
      config.bundleId &&
      config.proProductId &&
      config.proMaxProductId,
  );
}

export function applePlanForProduct(
  productId: string,
  config: AppleBillingConfig = getAppleBillingConfig(),
): BillingPlan | null {
  if (productId === config.proMaxProductId) return "PRO_MAX";
  if (productId === config.proProductId) return "PAID";
  return null;
}
