/**
 * Real, defensible marketing statistics shown on public pages.
 *
 * Policy (approved Aug 2026): the agency design ships with real numbers, not
 * mock ones. Sources:
 * - scansPerformed / stocksPerDay: production DB (StockDailySnapshot count,
 *   TrackedStock universe). Rounded DOWN to a stable "+"-safe floor; refresh
 *   quarterly or wire to /api/homepage later.
 * - fraudLosses: FBI IC3 2024 Internet Crime Report — $6.57B reported losses
 *   to investment fraud, the largest crime category. External, citable.
 * - avgScanSeconds: median user-scan processing time from ScanHistory.
 */
export const SITE_STATS = {
  scansPerformed: "800,000+",
  scansPerformedLabel: "stock scans performed",
  fraudLosses: "$6.5B+",
  fraudLossesLabel: "reported investment-fraud losses, 2024",
  scanTime: "<15s",
  scanTimeLabel: "average scan time",
  stocksPerDay: "6,900+",
  trustLine: "US stocks scanned every trading day, so you don't have to.",
} as const;
