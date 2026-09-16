import { expectedMarketDate, isCurrentMarketPublication } from "@/lib/market-publication-freshness";

describe("expected market publication", () => {
  it.each([
    ["2026-09-08T06:59:59Z", "2026-09-04"],
    ["2026-09-08T07:00:00Z", "2026-09-04"],
    ["2026-09-09T06:59:59Z", "2026-09-04"],
    ["2026-09-09T07:00:00Z", "2026-09-08"],
    ["2026-09-05T07:00:00Z", "2026-09-04"],
    ["2026-04-06T07:00:00Z", "2026-04-02"],
    ["2026-11-28T07:00:00Z", "2026-11-27"],
    ["2028-01-01T07:00:00Z", "2027-12-31"],
  ])("at %s expects market date %s", (now, expected) => {
    expect(expectedMarketDate(new Date(now))).toBe(expected);
  });

  it("keeps Friday current through Labor Day but detects a missed Tuesday publication", () => {
    expect(isCurrentMarketPublication(new Date("2026-09-04"), new Date("2026-09-08T22:00:00Z"))).toBe(true);
    expect(isCurrentMarketPublication(new Date("2026-09-04"), new Date("2026-09-09T07:00:00Z"))).toBe(false);
  });

  it("accepts an early completed publication but rejects future market dates", () => {
    expect(isCurrentMarketPublication(new Date("2026-09-08"), new Date("2026-09-09T06:00:00Z"))).toBe(true);
    expect(isCurrentMarketPublication(new Date("2026-09-10"), new Date("2026-09-09T06:00:00Z"))).toBe(false);
  });

  it("does not certify freshness outside the explicitly supported calendar", () => {
    expect(expectedMarketDate(new Date("2030-02-05T08:00:00Z"))).toBeNull();
    expect(isCurrentMarketPublication(new Date("2030-02-04"), new Date("2030-02-05T08:00:00Z"))).toBe(false);
    expect(expectedMarketDate(new Date("invalid"))).toBeNull();
  });
});
