import { NextRequest } from "next/server";

const mockGetAdminSession = jest.fn();
const mockHasRole = jest.fn();
const mockUpdateMany = jest.fn();
const mockQueryRawUnsafe = jest.fn();
const mockExecuteRawUnsafe = jest.fn();
const mockRunSocialScanAndStore = jest.fn();
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
  adminAuditLog: { create: jest.fn() },
  $queryRawUnsafe: mockQueryRawUnsafe,
  $executeRawUnsafe: mockExecuteRawUnsafe,
  $transaction: jest.fn(),
};

jest.mock("@/lib/admin/auth", () => ({
  getAdminSession: mockGetAdminSession,
  hasRole: mockHasRole,
}));

jest.mock("@/lib/db", () => ({ prisma: mockPrisma }));

jest.mock("@/lib/social-scan/orchestrate", () => ({
  runSocialScanAndStore: mockRunSocialScanAndStore,
}));

import {
  GET as getSocialScans,
  POST as startSocialScan,
} from "@/app/api/admin/social-scan/route";
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
    mockHasRole.mockReturnValue(true);
    mockPrisma.socialScanRun.findMany.mockResolvedValue([]);
    mockPrisma.socialMention.findMany.mockResolvedValue([]);
    mockPrisma.socialMention.count.mockResolvedValue(0);
    mockPrisma.socialMention.aggregate.mockResolvedValue({
      _count: 0,
      _avg: { promotionScore: null },
    });
    mockPrisma.socialMention.groupBy.mockResolvedValue([]);
    mockUpdateMany.mockResolvedValue({ count: 2 });
    mockQueryRawUnsafe.mockResolvedValue([]);
    mockExecuteRawUnsafe.mockResolvedValue(0);
    mockPrisma.$transaction.mockImplementation(async (callback) =>
      callback(mockPrisma),
    );
    mockPrisma.adminAuditLog.create.mockResolvedValue({});
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

  test("social GET uses a stable id tie-breaker and degrades corrupt legacy JSON", async () => {
    mockPrisma.socialMention.findMany.mockResolvedValue([
      {
        id: "mention-1",
        engagement: '{"views":',
        redFlags: '["truncated"',
      },
    ]);
    mockPrisma.socialMention.count.mockResolvedValue(1);

    const response = await getSocialScans(
      new NextRequest("http://localhost/api/admin/social-scan"),
    );
    const body = await response.json();

    expect(body.readback).toEqual({ complete: false, corruptJsonFields: 2 });
    expect(body.mentions[0]).toMatchObject({ engagement: {}, redFlags: [] });
    expect(mockPrisma.socialMention.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { createdAt: "desc" },
          { promotionScore: "desc" },
          { id: "asc" },
        ],
      }),
    );
  });

  test("serializes active-run admission with a transaction advisory lock", async () => {
    const lock = jest.fn().mockResolvedValue([]);
    const findFirst = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({
      id: "run-locked",
      createdAt: new Date("2026-09-17T00:00:00.000Z"),
    });
    mockPrisma.$transaction.mockImplementation(async (callback) =>
      callback({
        $queryRawUnsafe: jest.fn(async (sql: string) => {
          if (sql.includes("pg_advisory_xact_lock")) {
            throw new Error("P2010: void result cannot be deserialized");
          }
          return [];
        }),
        $executeRawUnsafe: lock,
        socialScanRun: { findFirst, create },
      }),
    );
    mockRunSocialScanAndStore.mockResolvedValue({
      status: "COMPLETED",
      tickersScanned: 0,
      tickersWithMentions: 0,
      totalMentions: 0,
      platformsUsed: [],
      submittedTickers: [],
      searchedTickers: [],
      coverage: [],
      persistence: null,
      errors: [],
      duration: 1,
    });

    const response = await startSocialScan(
      new NextRequest("http://localhost/api/admin/social-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tickers: [], date: "2026-09-17" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(lock).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext('scamdunk_social_scan_singleton'))",
    );
    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(
      findFirst.mock.invocationCallOrder[0],
    );
    expect(findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0],
    );
  });

  test("cleanup rejects invalid credentials before database work", async () => {
    const response = await cleanupSocialScans(
      new Request("http://localhost/api/cron/social-scan-cleanup"),
    );

    expect(response.status).toBe(401);
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  test("cleanup atomically reconciles stale RUNNING scans", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-16T12:30:00.000Z"));
    try {
      mockQueryRawUnsafe
        .mockResolvedValueOnce([
          { id: "with-evidence", errors: null, platformsUsed: null },
          { id: "without-evidence", errors: null, platformsUsed: null },
        ])
        .mockResolvedValueOnce([
          {
            scanRunId: "with-evidence",
            totalMentions: 2,
            tickers: ["AAPL"],
            platforms: ["YouTube"],
          },
        ]);
      mockUpdateMany.mockResolvedValue({ count: 1 });
      const response = await cleanupSocialScans(
        new Request("http://localhost/api/cron/social-scan-cleanup", {
          headers: { authorization: "Bearer cleanup-secret" },
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        expired: 2,
        partial: 1,
        timedOut: 1,
      });
      expect(mockQueryRawUnsafe.mock.calls[0][0]).toContain(
        "FOR UPDATE SKIP LOCKED",
      );
      expect(mockUpdateMany.mock.calls.map(([input]) => input.data.status)).toEqual([
        "PARTIAL",
        "TIMED_OUT",
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  test("cleanup reports a sanitized failure when the database update fails", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    mockPrisma.$transaction.mockRejectedValue(
      new Error("secret database details"),
    );
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
