import { NextRequest } from "next/server";

const mockGetAdminSession = jest.fn();
const mockUpdateMany = jest.fn();
const mockPrisma = {
  socialScanRun: {
    updateMany: mockUpdateMany,
    findMany: jest.fn(),
  },
  socialMention: {
    findMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
};

jest.mock("@/lib/admin/auth", () => ({
  getAdminSession: mockGetAdminSession,
  hasRole: jest.fn(),
}));

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

jest.mock("@/lib/social-scan/orchestrate", () => ({
  runSocialScanAndStore: jest.fn(),
}));

import { GET as getSocialScans } from "@/app/api/admin/social-scan/route";
import { GET as cleanupSocialScans } from "@/app/api/cron/social-scan-cleanup/route";

const originalEnv = { ...process.env };

function setSafeEnvironment() {
  process.env = { ...originalEnv };
  delete process.env.VERCEL_ENV;
  process.env.INGESTION_LOCAL_FIXTURE = "true";
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.CRON_SECRET = "cleanup-secret";
}

describe("social scan cleanup separation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSafeEnvironment();
    mockGetAdminSession.mockResolvedValue({ id: "admin-1" });
    mockPrisma.socialScanRun.findMany.mockResolvedValue([]);
    mockPrisma.socialMention.findMany.mockResolvedValue([]);
    mockPrisma.socialMention.count.mockResolvedValue(0);
    mockPrisma.socialMention.aggregate.mockResolvedValue({
      _count: 0,
      _avg: { promotionScore: null },
    });
    mockPrisma.socialMention.groupBy.mockResolvedValue([]);
    mockUpdateMany.mockResolvedValue({ count: 2 });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("social GET is read-only and never expires scan rows", async () => {
    const response = await getSocialScans(
      new NextRequest("http://localhost/api/admin/social-scan"),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("cleanup rejects invalid credentials before database work", async () => {
    const response = await cleanupSocialScans(
      new Request("http://localhost/api/cron/social-scan-cleanup"),
    );

    expect(response.status).toBe(401);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("cleanup atomically expires only stale RUNNING scans", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-16T12:30:00.000Z"));
    try {
      const response = await cleanupSocialScans(
        new Request("http://localhost/api/cron/social-scan-cleanup", {
          headers: { authorization: "Bearer cleanup-secret" },
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ expired: 2 });
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          status: "RUNNING",
          updatedAt: { lt: new Date("2026-09-16T12:20:00.000Z") },
        },
        data: {
          status: "TIMED_OUT",
          errors: JSON.stringify([
            "Scan timed out — no status update received within 10 minutes",
          ]),
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test("cleanup reports a sanitized failure when the database update fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    mockUpdateMany.mockRejectedValue(new Error("secret database details"));
    try {
      const response = await cleanupSocialScans(
        new Request("http://localhost/api/cron/social-scan-cleanup", {
          headers: { authorization: "Bearer cleanup-secret" },
        }),
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: "CLEANUP_FAILED",
          message: "Social scan cleanup failed.",
        },
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
