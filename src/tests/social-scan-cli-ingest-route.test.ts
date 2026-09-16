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
