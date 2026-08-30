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

  test("shows a functional watchlist count in the sidebar", () => {
    const source = read("src/components/Sidebar.tsx");
    expect(source).toContain("watchlistCount");
    expect(source).toContain("/api/watchlist");
    expect(source).toContain("watchlist-count");
  });

  test("supports last-scan status and manual rescans", () => {
    expect(read("src/components/dashboard/types.ts")).toContain("lastScanAt: string | null");
    expect(read("src/app/api/watchlist/route.ts")).toContain("prisma.scanHistory.findMany");
    const table = read("src/components/dashboard/WatchlistTable.tsx");
    expect(table).toContain("Scan now");
    expect(table).toContain("Scan again recommended");
  });

  test("prefills a rescan without silently submitting it", () => {
    expect(read("src/app/HomeContent.tsx")).toContain("URLSearchParams");
    expect(read("src/app/HomeContent.tsx")).toContain("initialTicker");
    const input = read("src/components/ScanInput.tsx");
    expect(input).toContain("initialTicker?: string");
    expect(input).toContain("setTicker(initialTicker.toUpperCase())");
  });

  test("keeps pricing visible in the authenticated sidebar and mounts the shared activity ticker", () => {
    const sidebar = read("src/components/Sidebar.tsx");
    expect(sidebar).toContain('href: "/pricing"');
    expect(sidebar).toContain('label: "Pricing"');

    const layout = read("src/components/PageLayout.tsx");
    expect(layout).toContain("ActivityTicker");
    expect(read("src/app/HomeContent.tsx")).toContain("ActivityTicker");
    expect(read("src/components/ActivityTicker.tsx")).toContain(
      "/api/activity-ticker",
    );
  });
});
