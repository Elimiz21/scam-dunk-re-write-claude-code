import { normalizeMarketObservation } from "@/lib/admin/market-observation";

describe("market observation contract", () => {
  it("preserves measured zero values", () => {
    expect(
      normalizeMarketObservation({
        lastPrice: 0,
        previousClose: 0,
        priceChangePct: 0,
        volume: 0,
        avgDailyVolume: 0,
        volumeRatio: 0,
        isLegitimate: false,
        isInsufficient: false,
        priceDataSource: "FMP",
        sourceObservedAt: "2026-09-15T20:00:00.000Z",
        sourceVersion: "fmp-stable/profile+historical-price-eod/full",
      }),
    ).toEqual({
      lastPrice: 0,
      previousClose: 0,
      priceChangePct: 0,
      volume: 0,
      avgVolume: 0,
      volumeRatio: 0,
      isLegitimate: false,
      isInsufficient: false,
      dataSource: "FMP",
      sourceObservedAt: new Date("2026-09-15T20:00:00.000Z"),
      sourceVersion: "fmp-stable/profile+historical-price-eod/full",
    });
  });

  it("keeps absent quality and source measurements unknown", () => {
    expect(normalizeMarketObservation({})).toEqual({
      lastPrice: null,
      previousClose: null,
      priceChangePct: null,
      volume: null,
      avgVolume: null,
      volumeRatio: null,
      isLegitimate: null,
      isInsufficient: null,
      dataSource: null,
      sourceObservedAt: null,
      sourceVersion: null,
    });
  });

  it("rejects invalid observation timestamps instead of substituting scan time", () => {
    expect(() =>
      normalizeMarketObservation({ sourceObservedAt: "2026-09-31" }),
    ).toThrow("Invalid sourceObservedAt");
    expect(() =>
      normalizeMarketObservation({
        sourceObservedAt: "2026-02-30T00:00:00.000Z",
      }),
    ).toThrow("Invalid sourceObservedAt");
    expect(() =>
      normalizeMarketObservation({ sourceObservedAt: "September 15, 2026" }),
    ).toThrow("Invalid sourceObservedAt");
  });
});
