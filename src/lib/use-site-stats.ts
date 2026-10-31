"use client";

import { useLivePublication } from "./use-live-publication";

export interface LiveSiteStats {
  status: "AVAILABLE" | "UNAVAILABLE";
  updatedAt: string;
  lastScanDate: string | null;
  stocksPerDay: number | null;
  highRiskLastScan: number | null;
  totalScans: number | null;
  dumpsConfirmed6mo: number;
  dumpsConfirmed30d: number;
  newFlagSymbols7d: number;
  newFlagSymbols30d: number;
  pumpingNow: number;
}

/** Round DOWN to a stable marketing floor: 6,567 → "6,500+", 826,848 → "826,000+". */
export function floorPlus(n: number, step: number): string {
  return `${(Math.floor(n / step) * step).toLocaleString("en-US")}+`;
}

/**
 * Verified scan statistics for public surfaces. Unknown, stale or incomplete
 * publication counters remain unavailable until the service verifies a current
 * cohort; independent historical tracker counts remain separate.
 */
export function useLiveSiteStats() {
  const { data: live } = useLivePublication<LiveSiteStats>("/api/stats/site");

  return {
    live,
    /** Unavailable values remain unavailable; zero is a measured count. */
    tiles: {
      stocksPerDay: live?.stocksPerDay == null ? "—" : live.stocksPerDay < 100 ? String(live.stocksPerDay) : floorPlus(live.stocksPerDay, 100),
      totalScans: live?.totalScans == null ? "—" : live.totalScans < 1000 ? String(live.totalScans) : floorPlus(live.totalScans, 1000),
      dumpsConfirmed6mo: live ? String(live.dumpsConfirmed6mo) : "—",
      pumpingNow: live ? String(live.pumpingNow) : "—",
    },
  };
}
