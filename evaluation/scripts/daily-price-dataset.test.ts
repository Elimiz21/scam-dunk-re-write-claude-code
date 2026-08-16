import {
  DAILY_PRICE_DATASET_SCHEMA_VERSION,
  DailyPriceDatasetError,
  buildDailyPriceDatasetArtifacts,
  loadValidatedDailyPriceDataset,
  sha256Json,
} from "./daily-price-dataset";

const RUN_ID = "2026-08-16T21-00-00Z-fixture";
const NOW = new Date("2026-08-16T22:00:00.000Z");

function bars(symbol: string, count = 100) {
  return Array.from({ length: count }, (_, index) => ({
    symbol,
    date: new Date(Date.UTC(2026, 4, index + 9)).toISOString().slice(0, 10),
    open: 10 + index,
    high: 11 + index,
    low: 9 + index,
    close: 10.5 + index,
    volume: 1000 + index,
    adjustmentBasis: "split_adjusted" as const,
    sourceVendor: "licensed-local-feed",
    vendorAsOf: "2026-08-16T20:30:00.000Z",
    ingestionRunId: RUN_ID,
  }));
}

function fixture() {
  return buildDailyPriceDatasetArtifacts({
    runId: RUN_ID,
    bars: [...bars("ABC"), ...bars("XYZ")],
    expectedSymbols: ["ABC", "XYZ"],
    vendorAsOf: "2026-08-16T20:30:00.000Z",
    generatedAt: "2026-08-16T21:00:00.000Z",
    sourceVendor: "licensed-local-feed",
    adjustmentBasis: "split_adjusted",
  });
}

function fetcherFor(artifacts: ReturnType<typeof fixture>) {
  const manifestText = JSON.stringify(artifacts.manifest);
  const pointerText = JSON.stringify({
    schemaVersion: DAILY_PRICE_DATASET_SCHEMA_VERSION,
    runId: artifacts.manifest.runId,
    manifestPath: artifacts.manifestPath,
    manifestSha256: sha256Json(artifacts.manifest),
    promotedAt: "2026-08-16T21:01:00.000Z",
  });

  return async (objectPath: string) => {
    if (objectPath === "v1/current.json") return pointerText;
    if (objectPath === artifacts.manifestPath) return manifestText;
    if (objectPath === artifacts.scanWindowPath)
      return JSON.stringify(artifacts.scanWindow);
    throw new Error(`unexpected object ${objectPath}`);
  };
}

describe("daily price dataset contract", () => {
  it("promotes an immutable 100-bar artifact and resolves every expected symbol", async () => {
    const artifacts = fixture();

    const dataset = await loadValidatedDailyPriceDataset({
      fetchObject: fetcherFor(artifacts),
      expectedSymbols: ["abc", "XYZ"],
      now: NOW,
      maxAgeHours: 36,
    });

    expect(dataset.runId).toBe(RUN_ID);
    expect(dataset.getWindow("ABC")).toHaveLength(100);
    expect(dataset.getWindow("xyz")[99].close).toBe(109.5);
    expect(dataset.callBudget).toEqual({ storageObjectsRead: 3, fmpHistoryCalls: 0 });
  });

  it("rejects a stale manifest before a scan can use it", async () => {
    const artifacts = fixture();
    artifacts.manifest.freshness.vendorAsOf = "2026-08-14T20:30:00.000Z";

    await expect(
      loadValidatedDailyPriceDataset({
        fetchObject: fetcherFor(artifacts),
        expectedSymbols: ["ABC", "XYZ"],
        now: NOW,
        maxAgeHours: 24,
      }),
    ).rejects.toMatchObject<Partial<DailyPriceDatasetError>>({
      code: "STALE_MANIFEST",
    });
  });

  it("rejects current metadata when the materialized bars end before the declared trading date", async () => {
    const artifacts = fixture();
    artifacts.scanWindow.windows.ABC = artifacts.scanWindow.windows.ABC.map((bar) => ({
      ...bar,
      date: new Date(new Date(`${bar.date}T00:00:00.000Z`).getTime() - 86_400_000).toISOString().slice(0, 10),
    }));
    artifacts.scanWindow.windows.XYZ = artifacts.scanWindow.windows.XYZ.map((bar) => ({
      ...bar,
      date: new Date(new Date(`${bar.date}T00:00:00.000Z`).getTime() - 86_400_000).toISOString().slice(0, 10),
    }));
    artifacts.manifest.assets.scanWindow.sha256 = sha256Json(artifacts.scanWindow);
    artifacts.manifest.assets.scanWindow.bytes = Buffer.byteLength(JSON.stringify(artifacts.scanWindow), "utf8");

    await expect(
      loadValidatedDailyPriceDataset({
        fetchObject: fetcherFor(artifacts),
        expectedSymbols: ["ABC", "XYZ"],
        now: NOW,
        maxAgeHours: 36,
      }),
    ).rejects.toMatchObject<Partial<DailyPriceDatasetError>>({
      code: "STALE_MANIFEST",
    });
  });

  it("rejects a future-dated materialized window", async () => {
    const artifacts = fixture();
    for (const window of Object.values(artifacts.scanWindow.windows)) {
      for (const bar of window) {
        bar.date = new Date(new Date(`${bar.date}T00:00:00.000Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
      }
    }
    artifacts.manifest.freshness.latestTradingDate = "2026-08-17";
    artifacts.manifest.assets.scanWindow.sha256 = sha256Json(artifacts.scanWindow);
    artifacts.manifest.assets.scanWindow.bytes = Buffer.byteLength(JSON.stringify(artifacts.scanWindow), "utf8");

    await expect(
      loadValidatedDailyPriceDataset({
        fetchObject: fetcherFor(artifacts),
        expectedSymbols: ["ABC", "XYZ"],
        now: NOW,
        maxAgeHours: 36,
      }),
    ).rejects.toMatchObject<Partial<DailyPriceDatasetError>>({
      code: "STALE_MANIFEST",
    });
  });

  it("refuses an invalid adjustment basis before an artifact can be promoted", () => {
    let captured: unknown;
    try {
      buildDailyPriceDatasetArtifacts({
        runId: RUN_ID,
        bars: bars("ABC").map((bar) => ({ ...bar, adjustmentBasis: "unknown" as any })),
        expectedSymbols: ["ABC"],
        vendorAsOf: "2026-08-16T20:30:00.000Z",
        generatedAt: "2026-08-16T21:00:00.000Z",
        sourceVendor: "licensed-local-feed",
        adjustmentBasis: "unknown" as any,
      });
    } catch (error) {
      captured = error;
    }
    expect(captured).toMatchObject({ code: "MANIFEST_INVALID" });
  });

  it("rejects an empty canonical symbol before publication", () => {
    let captured: unknown;
    try {
      buildDailyPriceDatasetArtifacts({
        runId: RUN_ID,
        bars: bars("ABC"),
        expectedSymbols: ["   "],
        vendorAsOf: "2026-08-16T20:30:00.000Z",
        generatedAt: "2026-08-16T21:00:00.000Z",
        sourceVendor: "licensed-local-feed",
        adjustmentBasis: "split_adjusted",
      });
    } catch (error) {
      captured = error;
    }
    expect(captured).toMatchObject({ code: "MANIFEST_INVALID" });
  });

  it("rejects partial coverage instead of falling back to FMP history", async () => {
    const artifacts = fixture();

    await expect(
      loadValidatedDailyPriceDataset({
        fetchObject: fetcherFor(artifacts),
        expectedSymbols: ["ABC", "XYZ", "MISSING"],
        now: NOW,
        maxAgeHours: 36,
      }),
    ).rejects.toMatchObject<Partial<DailyPriceDatasetError>>({
      code: "SYMBOL_RESOLUTION_INVALID",
    });
  });

  it("rejects a corrupt scan-window checksum", async () => {
    const artifacts = fixture();
    const originalFetcher = fetcherFor(artifacts);

    await expect(
      loadValidatedDailyPriceDataset({
        fetchObject: async (objectPath) => {
          const text = await originalFetcher(objectPath);
          return objectPath === artifacts.scanWindowPath
            ? text.replace('"close":10.5', '"close":999.5')
            : text;
        },
        expectedSymbols: ["ABC", "XYZ"],
        now: NOW,
        maxAgeHours: 36,
      }),
    ).rejects.toMatchObject<Partial<DailyPriceDatasetError>>({
      code: "CHECKSUM_MISMATCH",
    });
  });

  it("rejects a manifest that points outside its immutable run", async () => {
    const artifacts = fixture();
    artifacts.manifest.assets.scanWindow.path = "v1/runs/other/scan-window.json";

    await expect(
      loadValidatedDailyPriceDataset({
        fetchObject: fetcherFor(artifacts),
        expectedSymbols: ["ABC", "XYZ"],
        now: NOW,
        maxAgeHours: 36,
      }),
    ).rejects.toMatchObject<Partial<DailyPriceDatasetError>>({
      code: "MANIFEST_INVALID",
    });
  });
});
