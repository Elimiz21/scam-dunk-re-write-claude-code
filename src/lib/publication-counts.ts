const schemaVersion = "scamdunk.coverage-counts/v1";
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** Preserve an explicitly reconciled class exclusion, never infer it from a gap. */
export function sourceExcludedCount(summary: any): number | null {
  if (!summary || ![summary.totalStocks, summary.evaluated, summary.skippedNoData].every(count)) return null;
  const ledger = summary.coverageAccounting?.processing;
  if (!ledger) return summary.evaluated + summary.skippedNoData === summary.totalStocks ? 0 : null;
  const excluded = ledger.excluded?.total;
  return count(excluded) && ledger.reconciles === true &&
    ledger.processed?.total === summary.evaluated && ledger.skippedNoData?.total === summary.skippedNoData &&
    ledger.unprocessed?.total === 0 && ledger.unaccounted?.total === 0 &&
    summary.evaluated + summary.skippedNoData + excluded === summary.totalStocks ? excluded : null;
}

export function coverageCountMetadata(excluded: number) {
  if (!count(excluded)) throw new Error("Invalid explicit exclusion count");
  return { schemaVersion, excluded };
}

export function publishedExcludedCount(byExchange: string): number | null {
  try {
    const metadata = JSON.parse(byExchange)._coverage;
    if (metadata === undefined) return 0; // Legacy zero-exclusion summaries still require reconciled totals.
    return metadata?.schemaVersion === schemaVersion && count(metadata.excluded) ? metadata.excluded : null;
  } catch { return null; }
}
