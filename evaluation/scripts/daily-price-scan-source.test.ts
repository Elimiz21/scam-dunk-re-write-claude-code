import { buildDailyPriceDatasetArtifacts, loadValidatedDailyPriceDataset } from "./daily-price-dataset";
import { marketDataFromDailyPriceDataset } from "./daily-price-scan-source";

const runId = "2026-08-16T21-00-00Z-source";

async function datasetFixture() {
  const bars = Array.from({ length: 100 }, (_, index) => ({
    symbol: "ABC",
    date: new Date(Date.UTC(2026, 4, index + 9)).toISOString().slice(0, 10),
    open: 10 + index,
    high: 11 + index,
    low: 9 + index,
    close: 10.5 + index,
    volume: 1000 + index,
    adjustmentBasis: "split_adjusted" as const,
    sourceVendor: "licensed-local-feed",
    vendorAsOf: "2026-08-16T20:30:00.000Z",
    ingestionRunId: runId,
  }));
  const artifacts = buildDailyPriceDatasetArtifacts({
    runId,
    bars,
    expectedSymbols: ["ABC"],
    vendorAsOf: "2026-08-16T20:30:00.000Z",
    generatedAt: "2026-08-16T21:00:00.000Z",
    sourceVendor: "licensed-local-feed",
    adjustmentBasis: "split_adjusted",
  });
  return loadValidatedDailyPriceDataset({
    expectedSymbols: ["ABC"],
    maxAgeHours: 36,
    now: new Date("2026-08-16T22:00:00.000Z"),
    fetchObject: async (objectPath) => {
      if (objectPath === "v1/current.json") return JSON.stringify(artifacts.currentPointer);
      if (objectPath === artifacts.manifestPath) return JSON.stringify(artifacts.manifest);
      if (objectPath === artifacts.scanWindowPath) return JSON.stringify(artifacts.scanWindow);
      throw new Error(`unexpected path ${objectPath}`);
    },
  });
}

describe("daily scan price source", () => {
  it("builds Phase-1 market data from the validated dataset without a price-history provider", async () => {
    const marketData = marketDataFromDailyPriceDataset(
      { symbol: "ABC", name: "Alpha Corp", exchange: "NASDAQ", marketCap: 1_000_000 },
      await datasetFixture(),
    );

    expect(marketData.priceHistory).toHaveLength(100);
    expect(marketData.quote.lastPrice).toBe(109.5);
    expect(marketData.quote.avgVolume30d).toBe(1084.5);
    expect(marketData.dataAvailable).toBe(true);
  });
});
