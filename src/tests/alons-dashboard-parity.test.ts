import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DASHBOARD_NAV_ITEMS } from "@/components/dashboard/navigation";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Alon's authenticated dashboard journey", () => {
  test("keeps only the three approved primary destinations in order", () => {
    expect(DASHBOARD_NAV_ITEMS.map(({ label, href }) => ({ label, href }))).toEqual([
      { label: "Home", href: "/dashboard" },
      { label: "Watchlist", href: "/watchlist" },
      { label: "Pump Radar", href: "/pump-radar" },
    ]);
  });

  test("renders the sidebar as a persistent desktop rail below the header", () => {
    const layout = read("src/components/PageLayout.tsx");
    const sidebar = read("src/components/Sidebar.tsx");
    const scanWorkspace = read("src/app/HomeContent.tsx");

    expect(layout).toContain("max-w-[1600px]");
    expect(layout).toContain("dashboardShell = false");
    expect(sidebar).toContain("lg:sticky");
    expect(sidebar).toContain("lg:translate-x-0");
    expect(sidebar).not.toContain("New Scan");
    expect(sidebar).not.toContain("Account &amp; billing");
    expect(scanWorkspace).toContain("persistent");
    expect(read("src/app/(protected)/dashboard/page.tsx")).toContain("<PageLayout dashboardShell>");
  });

  test("uses Alon's compact, table-first dashboard as the signed-in home", () => {
    const dashboard = read("src/components/dashboard/DashboardHome.tsx");

    expect(dashboard).toContain("Welcome back");
    expect(dashboard).toContain("Market-wide · completed end-of-day");
    expect(dashboard).not.toContain("Live · scanning market-wide");
    expect(dashboard).toContain("DashboardScanEntry");
    expect(dashboard).toContain("UnifiedMarketTable");
    expect(dashboard).not.toContain("PersonalDashboardPreviews");
    expect(dashboard).not.toContain("<PumpRadar");
    expect(dashboard).toContain("text-[clamp(1.5rem,2.2vw,2rem)]");
    expect(dashboard).toContain("<UnifiedMarketTable data={state.data} onRefresh={load}");
  });

  test("matches the prototype's compact add bar and green heading accent", () => {
    const scanEntry = read("src/components/dashboard/DashboardScanEntry.tsx");
    const styles = read("src/app/globals.css");
    const news = read("src/app/news/news-client.tsx");

    expect(scanEntry).toContain('placeholder="Add a ticker to track (e.g., AAPL, TSLA)"');
    expect(scanEntry).toContain('className="mt-5 flex min-h-11');
    expect(styles).toContain(".text-brand-accent");
    expect(styles).toContain("color: hsl(var(--teal))");
    expect(news).toContain('text-brand-accent">updates.');
  });

  test("opens scan-history details in place instead of linking to a missing route", () => {
    const marketTable = read("src/components/dashboard/UnifiedMarketTable.tsx");

    expect(marketTable).toContain("/api/scans/");
    expect(marketTable).toContain("setHistoryDetail");
    expect(marketTable).not.toContain("/recent-scans/${scan.id}");
  });

  test("opens a personal Home scan link through the existing detail API", () => {
    const history = read("src/app/(protected)/recent-scans/page.tsx");
    expect(history).toContain('new URLSearchParams(window.location.search).get("scan")');
    expect(history).toContain("void openDetail(scanId)");
    expect(history).toContain("/api/scans/${encodeURIComponent(scanId)}");
  });

  test("announces table sorting and exposes watchlist action failures", () => {
    const marketTable = read("src/components/dashboard/UnifiedMarketTable.tsx");

    expect(marketTable).toContain("aria-sort");
    expect(marketTable).toContain("setActionError");
    expect(marketTable).toContain('role="alert"');
  });

  test("provides a dedicated authenticated Pump Radar page", () => {
    expect(
      existsSync(join(root, "src/app/(protected)/pump-radar/page.tsx")),
    ).toBe(true);
  });

  test("uses one full-analysis monitoring control inside Alon's inline interaction", () => {
    const watchlist = `${read("src/components/dashboard/WatchlistTable.tsx")}\n${read("src/components/dashboard/MonitorEditor.tsx")}`;

    expect(watchlist).toContain("Monitoring");
    expect(watchlist).toContain("full ScamDunk risk analysis");
    expect(watchlist).not.toContain("Price monitor");
    expect(watchlist).not.toContain("Monitor type");
    expect(watchlist).toContain("Save");
    expect(watchlist).toContain("Cancel");
  });

  test("refreshes the sidebar count immediately after a watchlist change", () => {
    expect(read("src/components/Sidebar.tsx")).toContain("scamdunk:watchlist-updated");
    expect(read("src/app/(protected)/watchlist/page.tsx")).toContain("scamdunk:watchlist-updated");
  });

  test("keeps the approved recent-scan ordering control", () => {
    const recentScans = `${read("src/components/dashboard/RecentScansTable.tsx")}\n${read("src/components/dashboard/view-model.ts")}`;

    expect(recentScans).toContain("Order by");
    expect(recentScans).toContain("Most recent");
    expect(recentScans).toContain("Highest risk");
    expect(recentScans).toContain("Date added to watchlist");
  });

  test("announces the authenticated account menu state", () => {
    const header = read("src/components/Header.tsx");

    expect(header).toContain('aria-label="Open account menu"');
    expect(header).toContain("aria-expanded={showUserMenu}");
    expect(header).toContain('aria-controls="account-menu"');
  });
});
