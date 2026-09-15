import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PersonalDashboardPreviews } from "@/components/dashboard/PersonalDashboardPreviews";
import type { RecentScanDto, WatchlistEntryDto } from "@/components/dashboard/types";

const watchlist: WatchlistEntryDto[] = ["OWN1", "OWN2", "OWN3", "OWN4"].map((ticker, index) => ({
  id: String(index), ticker, addedAt: "2026-09-15T00:00:00Z", lastDataAt: null, lastScanAt: null, monitors: [],
}));
const recentScans: RecentScanDto[] = ["SCAN1", "SCAN2", "SCAN3", "SCAN4"].map((ticker, index) => ({
  id: `scan-${index}`, ticker, source: "MANUAL", riskLabel: "Caution", score: 3, signalCount: 1,
  scannedAt: "2026-09-15T00:00:00Z", watchlistAddedAt: null, socialEvidenceAvailable: false,
}));

describe("personal Home previews", () => {
  test("shows three saved tickers and three personal scans with real destination links", () => {
    const html = renderToStaticMarkup(createElement(PersonalDashboardPreviews, { watchlist, recentScans }));
    expect(html).toContain("Your watchlist");
    expect(html).toContain("Recent scans");
    for (const ticker of ["OWN1", "OWN2", "OWN3", "SCAN1", "SCAN2", "SCAN3"]) expect(html).toContain(ticker);
    expect(html).not.toContain("OWN4");
    expect(html).not.toContain("SCAN4");
    expect(html).toContain('href="/watchlist"');
    expect(html).toContain('href="/recent-scans?scan=scan-0"');
    expect(html).toContain("Not scanned yet");
    expect(html).not.toContain("High risk");
  });

  test("gives empty accounts actions without seeding them with market-wide stocks", () => {
    const html = renderToStaticMarkup(createElement(PersonalDashboardPreviews, { watchlist: [], recentScans: [] }));
    expect(html).toContain("Your watchlist is empty");
    expect(html).toContain("No scans yet");
    expect(html).toContain("Add a stock");
    expect(html).toContain('href="/check"');
    expect(html).not.toContain("High risk");
  });
});
