const mockGetPendingDates = jest.fn();
const mockIngestDate = jest.fn();
const mockGetAdminSession = jest.fn();
const mockAuditCreate = jest.fn();

jest.mock("@/lib/admin/ingest-evaluation-core", () => ({
  getPendingDates: mockGetPendingDates,
  ingestDate: mockIngestDate,
}));

jest.mock("@/lib/admin/auth", () => ({
  getAdminSession: mockGetAdminSession,
}));

jest.mock("@/lib/db", () => ({
  prisma: { adminAuditLog: { create: mockAuditCreate } },
}));

jest.mock("@/lib/supabase", () => ({
  EVALUATION_BUCKET: "evaluation-data",
  supabase: { storage: { from: jest.fn() } },
}));

import { POST as manualIngest } from "@/app/api/admin/ingest-evaluation/route";
import { GET as cronIngest } from "@/app/api/cron/ingest-evaluation/route";
import {
  PRODUCTION_VERCEL_PROJECT_ID,
  PRODUCTION_SUPABASE_PROJECT_REF,
  verifyIngestionTarget,
} from "@/lib/server/ingestion-safety";

const originalEnv = { ...process.env };

function setLocalFixtureEnvironment() {
  delete process.env.VERCEL_ENV;
  process.env.INGESTION_LOCAL_FIXTURE = "true";
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
}

describe("ingestion target identity", () => {
  test.each([
    [
      "direct database URL",
      `postgresql://postgres:secret@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`,
    ],
    [
      "transaction pooler URL",
      `postgresql://postgres.${PRODUCTION_SUPABASE_PROJECT_REF}:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true`,
    ],
  ])("accepts production %s bound to the production storage project", (_name, databaseUrl) => {
    expect(
      verifyIngestionTarget({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
        DATABASE_URL: databaseUrl,
        NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      }),
    ).toEqual({ ok: true, projectRef: PRODUCTION_SUPABASE_PROJECT_REF });
  });

  test.each([
    [
      "database mismatch",
      {
        VERCEL_ENV: "production",
        VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
        DATABASE_URL:
          "postgresql://postgres:secret@db.aaaaaaaaaaaaaaaaaaaa.supabase.co:5432/postgres",
        NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      },
      "PROJECT_MISMATCH",
    ],
    [
      "storage mismatch",
      {
        VERCEL_ENV: "production",
        VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
        DATABASE_URL: `postgresql://postgres:secret@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`,
        NEXT_PUBLIC_SUPABASE_URL:
          "https://bbbbbbbbbbbbbbbbbbbb.supabase.co",
      },
      "PROJECT_MISMATCH",
    ],
    [
      "malformed database URL",
      {
        VERCEL_ENV: "production",
        VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
        DATABASE_URL: "not a URL",
        NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      },
      "UNPARSEABLE_IDENTITY",
    ],
  ])("rejects a production %s", (_name, env, code) => {
    expect(verifyIngestionTarget(env)).toEqual({ ok: false, code });
  });

  test("rejects Preview writes to the production project even when Preview is configured to expect it", () => {
    expect(
      verifyIngestionTarget({
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
        EXPECTED_PREVIEW_SUPABASE_PROJECT_REF:
          PRODUCTION_SUPABASE_PROJECT_REF,
        DATABASE_URL: `postgresql://postgres.${PRODUCTION_SUPABASE_PROJECT_REF}:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
        NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      }),
    ).toEqual({ ok: false, code: "PREVIEW_TARGETS_PRODUCTION" });
  });

  test("accepts Preview only when database and storage match its independent expected ref", () => {
    const previewRef = "cccccccccccccccccccc";
    expect(
      verifyIngestionTarget({
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
        EXPECTED_PREVIEW_SUPABASE_PROJECT_REF: previewRef,
        DATABASE_URL: `postgresql://postgres.${previewRef}:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
        NEXT_PUBLIC_SUPABASE_URL: `https://${previewRef}.supabase.co`,
      }),
    ).toEqual({ ok: true, projectRef: previewRef });
  });

  test("accepts an explicit loopback fixture outside Vercel", () => {
    expect(
      verifyIngestionTarget({
        INGESTION_LOCAL_FIXTURE: "true",
        DATABASE_URL:
          "postgresql://postgres:postgres@localhost:54322/postgres",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      }),
    ).toEqual({ ok: true, projectRef: "local-fixture" });
  });

  test("rejects a different Vercel project before trusting its database settings", () => {
    expect(
      verifyIngestionTarget({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_ID: "prj_wrong_project",
        DATABASE_URL: `postgresql://postgres:secret@db.${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`,
        NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      }),
    ).toEqual({ ok: false, code: "DEPLOYMENT_MISMATCH" });
  });

  test("never treats the local fixture flag as a production bypass", () => {
    expect(
      verifyIngestionTarget({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
        INGESTION_LOCAL_FIXTURE: "true",
        DATABASE_URL:
          "postgresql://postgres:postgres@localhost:54322/postgres",
        NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      }),
    ).toEqual({ ok: false, code: "UNPARSEABLE_IDENTITY" });
  });
});

describe("evaluation ingestion guards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    setLocalFixtureEnvironment();
    process.env.CRON_SECRET = "cron-test-secret";
    mockGetPendingDates.mockResolvedValue(["2026-08-14"]);
    mockIngestDate.mockResolvedValue({
      success: true,
      date: "2026-08-14",
      stocksCreated: 1,
      stocksUpdated: 0,
      snapshotsCreated: 1,
      alertsCreated: 0,
      promotedStocksCreated: 0,
      promotedStocksSkippedStale: 0,
      totalProcessed: 1,
      skipped: 0,
      durationMs: 5,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test.each([
    ["missing configured secret", undefined, undefined],
    ["empty configured secret", "", "Bearer anything"],
    ["missing authorization", "cron-test-secret", undefined],
    ["wrong authorization", "cron-test-secret", "Bearer wrong"],
    ["malformed authorization", "cron-test-secret", "Basic cron-test-secret"],
    ["multibyte token of a different byte length", "é", "Bearer ee"],
  ])("cron rejects %s before storage or database work", async (_name, secret, authorization) => {
    if (secret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = secret;
    const headers = authorization ? { authorization } : undefined;

    const response = await cronIngest(
      new Request("http://localhost/api/cron/ingest-evaluation", { headers }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Invalid cron credentials." },
    });
    expect(mockGetPendingDates).not.toHaveBeenCalled();
    expect(mockIngestDate).not.toHaveBeenCalled();
  });

  test("cron preserves the existing response after valid credentials and a safe fixture", async () => {
    const response = await cronIngest(
      new Request("http://localhost/api/cron/ingest-evaluation", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      processed: ["2026-08-14"],
      remaining: 0,
      totalPending: 1,
    });
    expect(mockGetPendingDates).toHaveBeenCalledTimes(1);
    expect(mockIngestDate).toHaveBeenCalledWith("2026-08-14");
  });

  test("cron rejects an unsafe target before storage or database work", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_ID = PRODUCTION_VERCEL_PROJECT_ID;
    process.env.DATABASE_URL =
      "postgresql://postgres:secret@db.aaaaaaaaaaaaaaaaaaaa.supabase.co:5432/postgres";
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;

    const response = await cronIngest(
      new Request("http://localhost/api/cron/ingest-evaluation", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "UNSAFE_INGESTION_TARGET",
        message: "Ingestion target identity could not be verified.",
      },
    });
    expect(mockGetPendingDates).not.toHaveBeenCalled();
    expect(mockIngestDate).not.toHaveBeenCalled();
  });

  test("manual ingestion rejects an unsafe target before auth, ingestion, or audit writes", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_ID = PRODUCTION_VERCEL_PROJECT_ID;
    process.env.DATABASE_URL = "malformed";
    mockGetAdminSession.mockResolvedValue({ id: "admin-1" });

    const response = await manualIngest(
      new Request("http://localhost/api/admin/ingest-evaluation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: "2026-08-14" }),
      }),
    );

    expect(response.status).toBe(503);
    expect(mockGetAdminSession).not.toHaveBeenCalled();
    expect(mockIngestDate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});
