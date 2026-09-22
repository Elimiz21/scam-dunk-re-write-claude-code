import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Alon prototype workflow integration", () => {
  test("keeps a market ticker above the landing hero image", () => {
    const source = read("src/components/landing/LandingOptionA.tsx");
    expect(source).toContain("market-bar");
    expect(source).toContain("hero-feed-line");
    expect(source).toContain("Market feed preview");
  });

  test("keeps Home's watchlist separate from Pump Radar findings", () => {
    const navigation = read("src/components/dashboard/navigation.ts");
    const marketTable = read("src/components/dashboard/UnifiedMarketTable.tsx");
    expect(navigation).not.toContain("Watchlist");
    expect(marketTable).toContain('["WATCHING", "Watching"]');
    expect(marketTable).toContain("includeRadarRows: false");
    expect(marketTable).not.toContain('["RADAR", "Radar suspects"]');
    expect(marketTable).toContain('["PUMP_SCORE", "Risk score"]');
  });

  test("supports last-scan status and manual rescans", () => {
    expect(read("src/components/dashboard/types.ts")).toContain("lastScanAt: string | null");
    expect(read("src/app/api/watchlist/route.ts")).toContain("prisma.scanHistory.findMany");
    const table = read("src/components/dashboard/WatchlistTable.tsx");
    expect(table).toContain("Rescan now");
    expect(table).toContain("Rescan recommended");
  });

  test("automatically starts a scan only when the dashboard explicitly requests it", () => {
    expect(read("src/app/HomeContent.tsx")).toContain("URLSearchParams");
    expect(read("src/app/HomeContent.tsx")).toContain("initialTicker");
    const input = read("src/components/ScanInput.tsx");
    expect(input).toContain("initialTicker?: string");
    expect(input).toContain("autoSubmit?: boolean");
    expect(input).toContain("autoSubmittedRef");
    expect(input).toContain("setTicker(initialTicker.toUpperCase())");
  });

  test("keeps pricing in the header and mounts the shared activity ticker", () => {
    const header = read("src/components/Header.tsx");
    expect(header).toContain('href: "/pricing"');
    expect(header).toContain("Subscription");

    const layout = read("src/components/PageLayout.tsx");
    expect(layout).toContain("ActivityTicker");
    expect(read("src/app/HomeContent.tsx")).toContain("ActivityTicker");
    expect(read("src/components/ActivityTicker.tsx")).toContain(
      "/api/activity-ticker",
    );
  });

  test("keeps publication-status wording off the public Pump Radar landing section", () => {
    const home = read("src/app/HomeContent.tsx");
    const radar = read("src/components/dashboard/PumpRadar.tsx");

    expect(home).not.toContain("Pump Radar shows market-wide findings");
    expect(radar).toContain("showPublicationStatus = fullPage");
    expect(radar).toContain("showPublicationStatus && <FreshnessNote");
  });
});
