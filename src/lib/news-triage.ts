export const NEWS_TRIAGE_STATES = ["CLEARED", "RETAINED", "NO_EVIDENCE", "DEFERRED", "ERROR", "UNAVAILABLE", "UNKNOWN"] as const;
export type NewsTriage = typeof NEWS_TRIAGE_STATES[number];
export interface NewsTriageInput {
  newsTriage?: string;
  hasLegitimateNews?: boolean;
  newsAnalysis?: string | null;
  signals?: Array<{ category?: string; code?: string }>;
}

/** Preserve legacy clearance explicitly; missing retrieval evidence stays unknown. */
export function resolveNewsTriage(row: NewsTriageInput): NewsTriage {
  if (NEWS_TRIAGE_STATES.includes(row.newsTriage as NewsTriage)) return row.newsTriage as NewsTriage;
  if (row.hasLegitimateNews === true) return "CLEARED";
  if (/^DEFERRED:/i.test(row.newsAnalysis ?? "")) return "DEFERRED";
  if (/^ERROR:/i.test(row.newsAnalysis ?? "")) return "ERROR";
  if (/^SKIPPED:/i.test(row.newsAnalysis ?? "")) return "UNAVAILABLE";
  // Legacy empty arrays do not establish that retrieval succeeded.
  return "UNKNOWN";
}

export function hasIndependentWarning(row: NewsTriageInput): boolean {
  return !!row.signals?.some((signal) => signal.category === "ALERT" || signal.category === "BEHAVIORAL");
}

export function reviewedAlertEligible(row: NewsTriageInput & { riskLevel?: string }): boolean {
  return row.riskLevel === "HIGH" && (resolveNewsTriage(row) === "RETAINED" || hasIndependentWarning(row));
}
