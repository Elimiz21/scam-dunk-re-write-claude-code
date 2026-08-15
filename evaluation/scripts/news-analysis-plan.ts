/**
 * Pure deterministic planning for Phase 3 news analysis.
 *
 * A group is only deduplicated when the exact instrument symbol differs by
 * casing or whitespace. We deliberately do not merge share classes or ticker
 * punctuation variants (for example BRK.A and BRK.B), because that could hide
 * a materially different instrument from the scam-detection pipeline.
 */
export interface NewsAnalysisCandidate {
  symbol: string;
  totalScore: number;
}

export interface NewsAnalysisCandidateGroup<T extends NewsAnalysisCandidate> {
  key: string;
  representative: T;
  equivalents: T[];
}

export interface NewsAnalysisPlan<T extends NewsAnalysisCandidate> {
  selected: Array<NewsAnalysisCandidateGroup<T>>;
  deferred: Array<NewsAnalysisCandidateGroup<T>>;
  batches: Array<Array<NewsAnalysisCandidateGroup<T>>>;
  modelCallUpperBound: number;
}

function canonicalInstrumentSymbol(symbol: string): string {
  return String(symbol || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function createNewsAnalysisPlan<T extends NewsAnalysisCandidate>(
  candidates: T[],
  maxCandidates: number,
  batchSize: number,
): NewsAnalysisPlan<T> {
  const groupsBySymbol = new Map<string, NewsAnalysisCandidateGroup<T>>();

  for (const candidate of candidates) {
    const key = canonicalInstrumentSymbol(candidate.symbol);
    const existing = groupsBySymbol.get(key);
    if (existing) {
      existing.equivalents.push(candidate);
      if (candidate.totalScore > existing.representative.totalScore) {
        existing.representative = candidate;
      }
    } else {
      groupsBySymbol.set(key, {
        key,
        representative: candidate,
        equivalents: [candidate],
      });
    }
  }

  const ranked = [...groupsBySymbol.values()].sort(
    (left, right) =>
      right.representative.totalScore - left.representative.totalScore ||
      left.key.localeCompare(right.key),
  );
  const selected = ranked.slice(0, maxCandidates);
  const deferred = ranked.slice(maxCandidates);
  const batches: Array<Array<NewsAnalysisCandidateGroup<T>>> = [];

  for (let start = 0; start < selected.length; start += batchSize) {
    batches.push(selected.slice(start, start + batchSize));
  }

  return {
    selected,
    deferred,
    batches,
    modelCallUpperBound: batches.length,
  };
}
