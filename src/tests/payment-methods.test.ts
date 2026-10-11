import {
  availablePaymentMethods,
  createCheckoutAttemptLock,
} from "@/lib/billing/payment-methods";

describe("availablePaymentMethods", () => {
  test("keeps both configured providers available for a plan", () => {
    expect(
      availablePaymentMethods(
        { paypalPlanId: "P-PRO", stripePriceId: "price_pro" },
        true,
      ),
    ).toEqual({ paypal: true, stripe: true });
  });

  test("does not offer Stripe when the verified checkout path is unavailable", () => {
    expect(
      availablePaymentMethods(
        { paypalPlanId: "P-PRO", stripePriceId: "price_pro" },
        false,
      ),
    ).toEqual({ paypal: true, stripe: false });
  });

  test("does not invent a payment choice without that provider's plan id", () => {
    expect(
      availablePaymentMethods(
        { paypalPlanId: null, stripePriceId: null },
        true,
      ),
    ).toEqual({ paypal: false, stripe: false });
  });
});

describe("createCheckoutAttemptLock", () => {
  test("allows one checkout attempt until the failed request is released", () => {
    const lock = createCheckoutAttemptLock();

    expect(lock.tryAcquire()).toBe(true);
    expect(lock.tryAcquire()).toBe(false);

    lock.release();

    expect(lock.tryAcquire()).toBe(true);
  });
});
