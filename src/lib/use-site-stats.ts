"use client";

import { useEffect, useState } from "react";
import { SITE_STATS } from "@/lib/site-stats";

export interface LiveSiteStats {
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
 * Live scan statistics for public/marketing surfaces. Renders the static
 * SITE_STATS floors immediately and swaps in fresh numbers from
 * /api/stats/site (recomputed after each daily scan) once loaded — no layout
 * shift, graceful degradation if the API is unreachable.
 */
export function useLiveSiteStats() {
  const [live, setLive] = useState<LiveSiteStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats/site")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && !data.error) setLive(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    live,
    /** Four headline tiles, static floors until live data arrives. */
    tiles: {
      stocksPerDay: live?.stocksPerDay
        ? floorPlus(live.stocksPerDay, 100)
        : SITE_STATS.stocksPerDay,
      totalScans: live?.totalScans
        ? floorPlus(live.totalScans, 1000)
        : SITE_STATS.scansPerformed,
      dumpsConfirmed6mo: live ? String(live.dumpsConfirmed6mo) : "400+",
      pumpingNow: live ? String(live.pumpingNow) : "60+",
    },
  };
}
