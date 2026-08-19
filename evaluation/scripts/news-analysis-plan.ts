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
  replayMatched: string[];
  replayMissing: string[];
}

function canonicalInstrumentSymbol(symbol: string): string {
  return String(symbol || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function createNewsAnalysisPlan<T extends NewsAnalysisCandidate>(
  candidates: T[],
  maxCandidates: number,
  batchSize: number,
  replaySymbols: Iterable<string> = [],
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
  const replayKeys = [...new Set([...replaySymbols].map(canonicalInstrumentSymbol).filter(Boolean))];
  const replayMatched = replayKeys.filter((key) => groupsBySymbol.has(key));
  const replayMissing = replayKeys.filter((key) => !groupsBySymbol.has(key));
  const replayGroups = replayMatched.map((key) => groupsBySymbol.get(key)!);
  const normalGroups = ranked.filter((group) => !replayMatched.includes(group.key));
  const ordered = [...replayGroups, ...normalGroups];
  const selected = ordered.slice(0, Math.max(0, maxCandidates));
  const deferred = ordered.slice(Math.max(0, maxCandidates));
  const batches: Array<Array<NewsAnalysisCandidateGroup<T>>> = [];

  for (let start = 0; start < selected.length; start += batchSize) {
    batches.push(selected.slice(start, start + batchSize));
  }

  return {
    selected,
    deferred,
    batches,
    modelCallUpperBound: batches.length,
    replayMatched,
    replayMissing,
  };
}
