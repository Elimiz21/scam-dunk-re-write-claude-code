import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { isAppleBillingConfigured } from "@/lib/apple-billing";

const mockAuthenticateMobileRequest = jest.fn();
const mockUserFindUnique = jest.fn();
const mockUserFindFirst = jest.fn();
const mockUserUpdate = jest.fn();

jest.mock("@/lib/mobile-auth", () => ({
  authenticateMobileRequest: mockAuthenticateMobileRequest,
}));
jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      findFirst: mockUserFindFirst,
      update: mockUserUpdate,
    },
  },
}));

describe("Stage B production regressions", () => {
  test("does not re-add subscriptionExpiresAt after the audit migration already added it", () => {
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/20260825_billing_provider_events/migration.sql",
      ),
      "utf8",
    );

    expect(migration).not.toMatch(/ADD COLUMN\s+"subscriptionExpiresAt"/i);
    expect(migration).toContain("LOWER(COALESCE(\"subscriptionStore\", '')) = 'stripe'");
    expect(migration).not.toMatch(/billingCustomerId.*THEN 'PAYPAL'/i);
  });

  test("registers the monitoring runner as an EOD Vercel cron", () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons?: Array<{ path: string; schedule: string }> };

    expect(config.crons).toContainEqual({
      path: "/api/cron/monitoring",
      schedule: "0 23 * * 1-5",
    });
  });

  test("does not attach a receipt to a different existing Apple subscription", async () => {
    process.env.APPLE_SHARED_SECRET = "test-secret";
    process.env.APPLE_PRO_PRODUCT_ID = "com.scamdunk.pro";
    process.env.APPLE_PRO_MAX_PRODUCT_ID = "com.scamdunk.pro.max";
    process.env.APPLE_BUNDLE_ID = "com.scamdunk.app";
    mockAuthenticateMobileRequest.mockResolvedValue("user-1");
    mockUserFindUnique.mockResolvedValue({
      plan: "PAID",
      billingProvider: "APPLE",
      appleOriginalTransactionId: "original-account",
      subscriptionStore: "apple",
    });
    mockUserUpdate.mockResolvedValue({});
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        status: 0,
        receipt: { bundle_id: "com.scamdunk.app", in_app: [] },
        latest_receipt_info: [
          {
            product_id: "com.scamdunk.pro",
            transaction_id: "transaction-new",
            original_transaction_id: "original-other-account",
            expires_date_ms: String(Date.now() + 86_400_000),
          },
        ],
      }),
    }) as typeof fetch;

    try {
      const { POST } = await import("@/app/api/billing/apple/validate/route");
      const response = await POST(
        new NextRequest("http://localhost/api/billing/apple/validate", {
          method: "POST",
          body: JSON.stringify({
            receiptData: "receipt",
            productId: "com.scamdunk.pro",
          }),
        }),
      );

      expect(response.status).toBe(409);
      expect(mockUserUpdate).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
      delete process.env.APPLE_SHARED_SECRET;
      delete process.env.APPLE_PRO_PRODUCT_ID;
      delete process.env.APPLE_PRO_MAX_PRODUCT_ID;
      delete process.env.APPLE_BUNDLE_ID;
    }
  });

  test("rejects an Apple receipt already owned by another account", async () => {
    process.env.APPLE_SHARED_SECRET = "test-secret";
    process.env.APPLE_BUNDLE_ID = "com.scamdunk.app";
    process.env.APPLE_PRO_PRODUCT_ID = "com.scamdunk.pro";
    process.env.APPLE_PRO_MAX_PRODUCT_ID = "com.scamdunk.pro.max";
    mockAuthenticateMobileRequest.mockResolvedValue("user-2");
    mockUserFindUnique.mockResolvedValue({
      plan: "FREE",
      billingProvider: "NONE",
      appleOriginalTransactionId: null,
      subscriptionStore: null,
    });
    mockUserFindFirst.mockResolvedValue({ id: "user-1" });
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        status: 0,
        receipt: { bundle_id: "com.scamdunk.app", in_app: [] },
        latest_receipt_info: [
          {
            product_id: "com.scamdunk.pro",
            transaction_id: "transaction-owned",
            original_transaction_id: "original-owned",
            expires_date_ms: String(Date.now() + 86_400_000),
          },
        ],
      }),
    }) as typeof fetch;

    const { POST } = await import("@/app/api/billing/apple/validate/route");
    const response = await POST(
      new NextRequest("http://localhost/api/billing/apple/validate", {
        method: "POST",
        body: JSON.stringify({ receiptData: "receipt" }),
      }),
    );

    expect(response.status).toBe(409);
    expect(mockUserFindFirst).toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
    delete process.env.APPLE_SHARED_SECRET;
    delete process.env.APPLE_BUNDLE_ID;
    delete process.env.APPLE_PRO_PRODUCT_ID;
    delete process.env.APPLE_PRO_MAX_PRODUCT_ID;
  });

  test("maps an Apple ownership race to a conflict instead of a server error", async () => {
    process.env.APPLE_SHARED_SECRET = "test-secret";
    process.env.APPLE_BUNDLE_ID = "com.scamdunk.app";
    process.env.APPLE_PRO_PRODUCT_ID = "com.scamdunk.pro";
    process.env.APPLE_PRO_MAX_PRODUCT_ID = "com.scamdunk.pro.max";
    mockAuthenticateMobileRequest.mockResolvedValue("user-3");
    mockUserFindUnique.mockResolvedValue({
      plan: "FREE",
      billingProvider: "NONE",
      appleOriginalTransactionId: null,
      subscriptionStore: null,
    });
    mockUserFindFirst.mockResolvedValue(null);
    mockUserUpdate.mockRejectedValue({ code: "P2002" });
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        status: 0,
        receipt: { bundle_id: "com.scamdunk.app", in_app: [] },
        latest_receipt_info: [
          {
            product_id: "com.scamdunk.pro",
            transaction_id: "transaction-race",
            original_transaction_id: "original-race",
            expires_date_ms: String(Date.now() + 86_400_000),
          },
        ],
      }),
    }) as typeof fetch;

    try {
      const { POST } = await import("@/app/api/billing/apple/validate/route");
      const response = await POST(
        new NextRequest("http://localhost/api/billing/apple/validate", {
          method: "POST",
          body: JSON.stringify({ receiptData: "receipt" }),
        }),
      );

      expect(response.status).toBe(409);
    } finally {
      global.fetch = originalFetch;
      delete process.env.APPLE_SHARED_SECRET;
      delete process.env.APPLE_BUNDLE_ID;
      delete process.env.APPLE_PRO_PRODUCT_ID;
      delete process.env.APPLE_PRO_MAX_PRODUCT_ID;
    }
  });

  test("treats incomplete Apple product configuration as unavailable", async () => {
    expect(
      isAppleBillingConfigured({
        sharedSecret: "secret",
        bundleId: "com.scamdunk.app",
        proProductId: "com.scamdunk.pro",
        proMaxProductId: "",
      }),
    ).toBe(false);
  });
});
