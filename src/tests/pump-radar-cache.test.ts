import { NextRequest } from "next/server";

import { GET } from "@/app/api/pump-radar/route";
import { auth } from "@/lib/auth";
import { getPumpRadar } from "@/lib/pump-radar";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/pump-radar", () => ({ getPumpRadar: jest.fn() }));

const payload = (asOf: string) => ({
  status: "AVAILABLE",
  asOf,
  publishedAt: `${asOf}T22:00:00.000Z`,
  executedAt: `${asOf}T21:00:00.000Z`,
  freshness: "FRESH",
  coverage: { total: 1, evaluated: 1, skipped: 0, evaluatedPercent: 100 },
  socialPublication: null,
  rows: [],
  notice: "fixture",
});

describe("Pump Radar response caching", () => {
  beforeEach(() => jest.clearAllMocks());

  test("never allows shared or browser caching across public and authenticated viewers", async () => {
    (auth as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ user: { id: "viewer-1" } });
    (getPumpRadar as jest.Mock)
      .mockResolvedValueOnce(payload("2026-08-29"))
      .mockResolvedValueOnce(payload("2026-09-16"));
    const request = () =>
      new NextRequest("http://localhost/api/pump-radar?limit=8");

    const publicResponse = await GET(request());
    const authenticatedResponse = await GET(request());

    for (const response of [publicResponse, authenticatedResponse]) {
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Cache-Control")).not.toMatch(
        /s-maxage|stale-while-revalidate/,
      );
    }
    await expect(authenticatedResponse.json()).resolves.toMatchObject({
      asOf: "2026-09-16",
    });
    expect(getPumpRadar).toHaveBeenNthCalledWith(1, {
      limit: 8,
      viewer: "PUBLIC",
    });
    expect(getPumpRadar).toHaveBeenNthCalledWith(2, {
      limit: 8,
      viewer: "AUTHENTICATED",
    });
  });
});
