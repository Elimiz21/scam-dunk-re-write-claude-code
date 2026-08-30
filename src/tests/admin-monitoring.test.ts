import { NextRequest } from "next/server";

const mockGetAdminSession = jest.fn();
const mockPrisma = {
  dailyScanSummary: { findFirst: jest.fn() },
  monitorExecution: { groupBy: jest.fn(), count: jest.fn() },
  notificationDelivery: { groupBy: jest.fn() },
  socialScanRun: { findFirst: jest.fn() },
  integrationConfig: { findMany: jest.fn() },
};

jest.mock("@/lib/admin/auth", () => ({
  getAdminSession: mockGetAdminSession,
  hasRole: (session: { role: string }, roles: string[]) =>
    roles.includes(session.role),
}));

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { GET } from "@/app/api/admin/monitoring/route";

const now = new Date();

function setHealthyData() {
  mockPrisma.dailyScanSummary.findFirst.mockResolvedValue({
    scanDate: new Date(now.getTime() - 60 * 60 * 1000),
    createdAt: new Date(now.getTime() - 30 * 60 * 1000),
    totalStocks: 100,
    evaluated: 96,
    skippedNoData: 4,
  });
  mockPrisma.monitorExecution.groupBy
    .mockResolvedValueOnce([
      { status: "COMPLETED", _count: { _all: 2 } },
      { status: "SKIPPED", _count: { _all: 1 } },
    ])
    .mockResolvedValueOnce([
      { skipReason: "NO_CREDITS", _count: { _all: 1 } },
    ]);
  mockPrisma.monitorExecution.count.mockResolvedValue(2);
  mockPrisma.notificationDelivery.groupBy.mockResolvedValue([
    { channel: "EMAIL", status: "DELIVERED", _count: { _all: 2 } },
    { channel: "IN_APP", status: "PENDING", _count: { _all: 1 } },
  ]);
  mockPrisma.socialScanRun.findFirst.mockResolvedValue({
    scanDate: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    updatedAt: new Date(now.getTime() - 90 * 60 * 1000),
    status: "COMPLETED",
    tickersScanned: 20,
    tickersWithMentions: 5,
    totalMentions: 12,
  });
  mockPrisma.integrationConfig.findMany.mockResolvedValue([
    {
      name: "PAYPAL",
      isEnabled: true,
      status: "CONNECTED",
      lastCheckedAt: new Date(now.getTime() - 15 * 60 * 1000),
    },
    {
      name: "STRIPE",
      isEnabled: false,
      status: "UNKNOWN",
      lastCheckedAt: null,
    },
  ]);
}

describe("GET /api/admin/monitoring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAdminSession.mockResolvedValue(null);
    setHealthyData();
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
    delete process.env.PAYPAL_PLAN_ID;
    delete process.env.PAYPAL_WEBHOOK_ID;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRICE_PAID_PLAN_ID;
    delete process.env.STRIPE_PRO_MAX_PRICE_ID;
  });

  test("rejects unauthenticated requests before querying operational data", async () => {
    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockPrisma.dailyScanSummary.findFirst).not.toHaveBeenCalled();
  });

  test.each(["VIEWER", "ADMIN", "OWNER"])(
    "allows read-only monitoring access for %s",
    async (role) => {
      mockGetAdminSession.mockResolvedValue({
        id: `admin-${role.toLowerCase()}`,
        email: `${role.toLowerCase()}@example.com`,
        name: role,
        role,
      });

      const response = await GET();
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.overall.status).toBe("DEGRADED");
      expect(payload.publication.coverage).toEqual({
        total: 100,
        evaluated: 96,
        skipped: 4,
        evaluatedPercent: 96,
      });
      expect(payload.monitoring.executionCounts).toMatchObject({
        COMPLETED: 2,
        SKIPPED: 1,
      });
      expect(payload.monitoring.creditsCharged).toBe(2);
      expect(payload.monitoring.skipReasons).toEqual([
        { reason: "NO_CREDITS", count: 1 },
      ]);
      expect(payload.notifications.byStatus).toMatchObject({
        DELIVERED: 2,
        PENDING: 1,
      });
      expect(payload.socialScan.status).toBe("FRESH");
      expect(payload.billing.providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "PayPal", configured: false }),
          expect.objectContaining({ name: "Stripe", configured: false }),
        ]),
      );
    },
  );

  test("marks stale publication and social data without presenting them as healthy", async () => {
    mockGetAdminSession.mockResolvedValue({ role: "VIEWER" });
    mockPrisma.dailyScanSummary.findFirst.mockResolvedValue({
      scanDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      totalStocks: 100,
      evaluated: 80,
      skippedNoData: 20,
    });
    mockPrisma.socialScanRun.findFirst.mockResolvedValue({
      scanDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      status: "COMPLETED",
      tickersScanned: 20,
      tickersWithMentions: 2,
      totalMentions: 3,
    });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.overall.status).toBe("DEGRADED");
    expect(payload.publication.status).toBe("STALE");
    expect(payload.socialScan.status).toBe("STALE");
  });

  test("reports configured Stripe state instead of hardcoding it disabled", async () => {
    mockGetAdminSession.mockResolvedValue({ role: "VIEWER" });
    process.env.STRIPE_SECRET_KEY = "sk_test_configured";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_configured";
    process.env.STRIPE_PRICE_PAID_PLAN_ID = "price_pro";

    const response = await GET();
    const payload = await response.json();
    const stripe = payload.billing.providers.find(
      (provider: { name: string }) => provider.name === "Stripe",
    );

    expect(stripe).toMatchObject({
      configured: true,
      credentialsConfigured: true,
      planConfigured: true,
      webhookConfigured: true,
    });
    expect(payload.billing.plans.pro.stripePriceConfigured).toBe(true);
  });

  test("fails closed with unavailable summaries when operational reads fail", async () => {
    mockGetAdminSession.mockResolvedValue({ role: "ADMIN" });
    mockPrisma.dailyScanSummary.findFirst.mockRejectedValue(
      new Error("database offline"),
    );
    mockPrisma.monitorExecution.groupBy.mockRejectedValue(
      new Error("database offline"),
    );
    mockPrisma.monitorExecution.count.mockRejectedValue(
      new Error("database offline"),
    );
    mockPrisma.notificationDelivery.groupBy.mockRejectedValue(
      new Error("database offline"),
    );
    mockPrisma.socialScanRun.findFirst.mockRejectedValue(
      new Error("database offline"),
    );
    mockPrisma.integrationConfig.findMany.mockRejectedValue(
      new Error("database offline"),
    );

    const response = await GET();
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(503);
    expect(payload.overall.status).toBe("UNAVAILABLE");
    expect(payload.publication.status).toBe("UNAVAILABLE");
    expect(payload.monitoring.status).toBe("UNAVAILABLE");
    expect(payload.notifications.status).toBe("UNAVAILABLE");
    expect(payload.socialScan.status).toBe("UNAVAILABLE");
    expect(payload.billing.status).toBe("UNAVAILABLE");
    expect(serialized).not.toContain("database offline");
    expect(serialized).not.toContain("PAYPAL_CLIENT_SECRET");
    expect(serialized).not.toContain("super-secret");
  });

  test("does not return service keys or raw integration config", async () => {
    mockGetAdminSession.mockResolvedValue({ role: "OWNER" });
    process.env.PAYPAL_CLIENT_ID = "client-id";
    process.env.PAYPAL_CLIENT_SECRET = "super-secret";
    mockPrisma.integrationConfig.findMany.mockResolvedValue([
      {
        name: "PAYPAL",
        isEnabled: true,
        status: "CONNECTED",
        config: JSON.stringify({ clientSecret: "super-secret" }),
        apiKeyMasked: "client...id",
      },
    ]);

    const response = await GET();
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("client-id");
    expect(serialized).not.toContain("client...id");
  });
});
