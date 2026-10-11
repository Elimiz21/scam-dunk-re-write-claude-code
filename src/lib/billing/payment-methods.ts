export interface PaymentMethodPlanConfig {
  paypalPlanId: string | null;
  stripePriceId: string | null;
}

export interface PaymentMethodAvailability {
  paypal: boolean;
  stripe: boolean;
}

/**
 * Keeps checkout options provider-specific. A configured PayPal plan must
 * never suppress a separately configured and verified Stripe card checkout.
 */
export function availablePaymentMethods(
  plan: PaymentMethodPlanConfig,
  stripeCheckoutEnabled: boolean,
): PaymentMethodAvailability {
  return {
    paypal: Boolean(plan.paypalPlanId),
    stripe: Boolean(plan.stripePriceId) && stripeCheckoutEnabled,
  };
}

export interface CheckoutAttemptLock {
  tryAcquire(): boolean;
  release(): void;
}

/** Prevents duplicate provider sessions before a client re-render can disable a button. */
export function createCheckoutAttemptLock(): CheckoutAttemptLock {
  let acquired = false;

  return {
    tryAcquire() {
      if (acquired) return false;
      acquired = true;
      return true;
    },
    release() {
      acquired = false;
    },
  };
}
