import { NextRequest, NextResponse } from "next/server";

const mockGetAdminSession = jest.fn();
const mockVerifyIngestionTarget = jest.fn();
const mockUnsafeResponse = jest.fn();
const mockIngest = jest.fn();

jest.mock("@/lib/admin/auth", () => ({
  getAdminSession: mockGetAdminSession,
}));
jest.mock("@/lib/db", () => ({ prisma: {} }));
jest.mock("@/lib/server/ingestion-safety", () => ({
  verifyIngestionTarget: mockVerifyIngestionTarget,
  unsafeIngestionTargetResponse: mockUnsafeResponse,
}));
jest.mock("@/lib/social-scan/cli-ingest", () => {
  const actual = jest.requireActual("@/lib/social-scan/cli-ingest");
  return { ...actual, ingestCliSocialScan: mockIngest };
});

import { POST } from "@/app/api/admin/social-scan/ingest/route";

describe("CLI social ingest route gates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SOCIAL_SCAN_INGEST_KEY;
    mockGetAdminSession.mockResolvedValue(null);
    mockVerifyIngestionTarget.mockReturnValue({ ok: true });
    mockUnsafeResponse.mockReturnValue(
      NextResponse.json({ error: "unsafe target" }, { status: 503 }),
    );
  });

  test("rejects unauthenticated requests before target or database work", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/admin/social-scan/ingest", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(401);
    expect(mockVerifyIngestionTarget).not.toHaveBeenCalled();
    expect(mockIngest).not.toHaveBeenCalled();
  });

  test("rejects an unsafe storage target before parsing or database work", async () => {
    process.env.SOCIAL_SCAN_INGEST_KEY = "fixture-key";
    mockVerifyIngestionTarget.mockReturnValue({ ok: false });
    const response = await POST(
      new NextRequest("http://localhost/api/admin/social-scan/ingest", {
        method: "POST",
        headers: { authorization: "Bearer fixture-key" },
        body: "not-json",
      }),
    );
    expect(response.status).toBe(503);
    expect(mockUnsafeResponse).toHaveBeenCalledTimes(1);
    expect(mockIngest).not.toHaveBeenCalled();
  });
});


describe("local fallback producer through actual route", () => {
  test("accepts mapped raw mentions using the dedicated credential", async () => {
    const { source, targets } = await import("./fixtures/social-fallback");
    const { retainAndPublishSocialFallback } = await import("../../evaluation/scripts/social-fallback-publication");
    jest.clearAllMocks();
    process.env.SOCIAL_SCAN_INGEST_KEY = "fixture-key";
    mockGetAdminSession.mockResolvedValue(null);
    mockVerifyIngestionTarget.mockReturnValue({ ok: true });
    mockIngest.mockImplementation(async (_client, payload) => ({
      scanRunId: payload.scanId, status: "PARTIAL", totalMentions: 1,
      mentionsIngested: 1, tickersWithMentions: 1, tickersScanned: 0, idempotent: false,
    }));
    const result = await retainAndPublishSocialFallback(source, targets, {
      appUrl: "https://fixture.test", ingestKey: "fixture-key", retain: jest.fn(),
      fetcher: (url, init) => POST(new NextRequest(String(url), init)),
    });
    expect(result.state).toBe("PUBLISHED");
    expect(mockIngest.mock.calls[0][1].results[0].platforms[0].mentions[0]).toMatchObject({
      title: "🚀 原文", postDate: null,
    });
    expect(mockIngest.mock.calls[0][2]).toEqual({ owner: "cli:api-key" });
    delete process.env.SOCIAL_SCAN_INGEST_KEY;
  });

  test.each(["2094-01-11", "2 days ago", "unknown-date", "2094-01-11T10:00:00+99:00"])("imprecise provider date %s is retained raw and published as unknown", async (date) => {
    const { source, targets } = await import("./fixtures/social-fallback");
    const { retainAndPublishSocialFallback } = await import("../../evaluation/scripts/social-fallback-publication");
    const invalid = JSON.parse(JSON.stringify(source));
    invalid.results[0].platforms[0].mentions[0].postDate = date;
    jest.clearAllMocks();
    process.env.SOCIAL_SCAN_INGEST_KEY = "fixture-key";
    mockGetAdminSession.mockResolvedValue(null);
    mockVerifyIngestionTarget.mockReturnValue({ ok: true });
    mockIngest.mockImplementation(async (_client, payload) => ({
      scanRunId: payload.scanId, status: "PARTIAL", totalMentions: 1,
      mentionsIngested: 1, tickersWithMentions: 1, tickersScanned: 0, idempotent: false,
    }));
    const retain = jest.fn();
    const result = await retainAndPublishSocialFallback(invalid, targets, {
      appUrl: "https://fixture.test", ingestKey: "fixture-key", retain,
      fetcher: (url, init) => POST(new NextRequest(String(url), init)),
    });
    expect(result).toMatchObject({ state: "PUBLISHED", attempts: 1 });
    expect(retain.mock.calls[0][0]).toEqual(invalid);
    expect(mockIngest.mock.calls[0][1].results[0].platforms[0].mentions[0].postDate).toBeNull();
    delete process.env.SOCIAL_SCAN_INGEST_KEY;
  });
});
