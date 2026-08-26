export type EvidenceFetchOutcome<T> = { success: true; data: T[] } | { success: false; data: T[]; error: { source: string; message: string } };

export function classifyEvidenceOutcomes(outcomes: EvidenceFetchOutcome<unknown>[]) {
  const failures = outcomes.filter((outcome): outcome is Extract<EvidenceFetchOutcome<unknown>, { success: false }> => !outcome.success).map((outcome) => outcome.error);
  return { complete: failures.length === 0, failures };
}
