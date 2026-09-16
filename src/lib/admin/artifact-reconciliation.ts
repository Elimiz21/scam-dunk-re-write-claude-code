export interface HistoricalReconciliationEntry {
  scanDate: string;
  evaluationFile: string | null;
  summaryFile: string | null;
  action: "REGISTER_EXISTING_BYTES" | "BLOCKED_MISSING_ORIGINAL";
  reason: string | null;
}

export function buildHistoricalReconciliation(
  objectNames: readonly string[],
): HistoricalReconciliationEntry[] {
  const byDate = new Map<
    string,
    { evaluationFile: string | null; summaryFile: string | null }
  >();
  for (const name of objectNames) {
    const evaluation = /^(enhanced-evaluation|fmp-evaluation)-(\d{4}-\d{2}-\d{2})\.json$/.exec(
      name,
    );
    const summary = /^fmp-summary-(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
    const date = evaluation?.[2] ?? summary?.[1];
    if (!date) continue;
    const entry = byDate.get(date) ?? {
      evaluationFile: null,
      summaryFile: null,
    };
    if (evaluation) {
      if (
        !entry.evaluationFile ||
        name.startsWith("enhanced-evaluation-")
      ) {
        entry.evaluationFile = name;
      }
    } else {
      entry.summaryFile = name;
    }
    byDate.set(date, entry);
  }

  return Array.from(byDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([scanDate, files]) => {
      const reason = !files.evaluationFile
        ? "Missing retained evaluation artifact"
        : !files.summaryFile
          ? "Missing retained summary artifact"
          : null;
      return {
        scanDate,
        ...files,
        action: reason
          ? ("BLOCKED_MISSING_ORIGINAL" as const)
          : ("REGISTER_EXISTING_BYTES" as const),
        reason,
      };
    });
}
