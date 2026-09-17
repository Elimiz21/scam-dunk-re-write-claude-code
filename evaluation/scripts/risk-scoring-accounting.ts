export interface RiskScoringOutcome {
  symbol: string;
  status: "evaluated" | "failed" | "excluded" | "unprocessed";
  reason: string;
}

export interface RiskScoringAccountingInput {
  listedRawSymbols: string[];
  otcProviderRawCount: number;
  otcDirectorySymbols: string[];
  otcEligibleSymbols: string[];
  listedOutcomes: RiskScoringOutcome[];
  otcOutcomes: RiskScoringOutcome[];
  publishedResultCount: number;
}

export function createListedRiskScoringOutcome(
  symbol: string,
  disposition:
    | "evaluated"
    | "no_data"
    | "processing_error"
    | "profile_otc_not_in_directory",
): RiskScoringOutcome {
  if (disposition === "evaluated") {
    return { symbol, status: "evaluated", reason: "evaluated" };
  }
  if (disposition === "profile_otc_not_in_directory") {
    return {
      symbol,
      status: "excluded",
      reason: "listed_profile_otc_not_in_directory",
    };
  }
  return { symbol, status: "failed", reason: disposition };
}

export function completeFailedOtcOutcomes(
  eligibleSymbols: string[],
  outcomes: RiskScoringOutcome[],
  retainedResultSymbols: string[],
  otcStatus: string,
): RiskScoringOutcome[] {
  if (otcStatus !== "failed") return outcomes;
  const eligible = new Set(eligibleSymbols);
  const retained = new Set(retainedResultSymbols);
  for (const symbol of retained) {
    if (!eligible.has(symbol)) throw new Error("unknown_otc_result_symbol");
  }
  const retainedOutcomes = outcomes.map((outcome) =>
    outcome.status === "evaluated" && !retained.has(outcome.symbol)
      ? {
          symbol: outcome.symbol,
          status: "unprocessed" as const,
          reason: "otc_evaluated_result_not_retained",
        }
      : outcome,
  );
  const accounted = new Set(
    retainedOutcomes.map((outcome) => outcome.symbol),
  );
  return [
    ...retainedOutcomes,
    ...eligibleSymbols
      .filter((symbol) => !accounted.has(symbol))
      .map((symbol) => ({
        symbol,
        status: "unprocessed" as const,
        reason: "otc_scan_incomplete",
      })),
  ];
}

function countReasons(outcomes: RiskScoringOutcome[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const outcome of outcomes) {
    counts[outcome.reason] = (counts[outcome.reason] ?? 0) + 1;
  }
  return counts;
}

function assertUniqueSymbols(
  outcomes: RiskScoringOutcome[],
  source: "listed" | "otc",
): void {
  const seen = new Set<string>();
  for (const outcome of outcomes) {
    if (seen.has(outcome.symbol)) {
      throw new Error(`duplicate_${source}_accounting_outcome`);
    }
    seen.add(outcome.symbol);
  }
}

export function buildRiskScoringAccounting(
  input: RiskScoringAccountingInput,
) {
  assertUniqueSymbols(input.listedOutcomes, "listed");
  assertUniqueSymbols(input.otcOutcomes, "otc");

  const listedSymbols = new Set(input.listedRawSymbols);
  const otcDirectory = new Set(input.otcDirectorySymbols);
  const otcEligible = new Set(input.otcEligibleSymbols);
  for (const symbol of otcEligible) {
    if (!otcDirectory.has(symbol)) {
      throw new Error("otc_eligible_symbol_outside_directory");
    }
  }
  const listedExpected = new Set(
    input.listedRawSymbols.filter((symbol) => !otcDirectory.has(symbol)),
  );
  for (const outcome of input.listedOutcomes) {
    if (!listedExpected.has(outcome.symbol)) {
      throw new Error("unknown_listed_accounting_outcome");
    }
  }
  for (const outcome of input.otcOutcomes) {
    if (!otcDirectory.has(outcome.symbol)) {
      throw new Error("unknown_otc_accounting_outcome");
    }
  }
  const listedOtcOverlap = input.listedRawSymbols.filter((symbol) =>
    otcDirectory.has(symbol),
  ).length;
  if (input.otcProviderRawCount < otcDirectory.size) {
    throw new Error("otc_provider_raw_count_below_directory_unique");
  }

  const listedOutcomes = input.listedOutcomes.filter((outcome) =>
    listedExpected.has(outcome.symbol),
  );
  const otcEligibleOutcomes = input.otcOutcomes.filter((outcome) =>
    otcEligible.has(outcome.symbol),
  );
  const otcDirectoryExcludedOutcomes = input.otcOutcomes.filter(
    (outcome) =>
      otcDirectory.has(outcome.symbol) &&
      !otcEligible.has(outcome.symbol) &&
      outcome.status === "excluded",
  );
  const otcDirectoryExcluded = otcDirectory.size - otcEligible.size;
  if (otcDirectoryExcludedOutcomes.length !== otcDirectoryExcluded) {
    throw new Error("otc_directory_exclusion_accounting_mismatch");
  }

  const listedEvaluated = listedOutcomes.filter(
    (outcome) => outcome.status === "evaluated",
  );
  const otcEvaluated = otcEligibleOutcomes.filter(
    (outcome) => outcome.status === "evaluated",
  );
  const listedFailed = listedOutcomes.filter(
    (outcome) => outcome.status === "failed",
  );
  const otcFailed = otcEligibleOutcomes.filter(
    (outcome) => outcome.status === "failed",
  );
  const listedExcluded = listedOutcomes.filter(
    (outcome) => outcome.status === "excluded",
  );
  const otcExcluded = otcEligibleOutcomes.filter(
    (outcome) => outcome.status === "excluded",
  );
  const listedUnprocessed = listedOutcomes.filter(
    (outcome) => outcome.status === "unprocessed",
  );
  const otcUnprocessed = otcEligibleOutcomes.filter(
    (outcome) => outcome.status === "unprocessed",
  );
  const eligibleTotal = listedExpected.size + otcEligible.size;
  const processedTotal = listedEvaluated.length + otcEvaluated.length;
  const skippedTotal = listedFailed.length + otcFailed.length;
  const excludedTotal = listedExcluded.length + otcExcluded.length;
  const unprocessedTotal =
    listedUnprocessed.length + otcUnprocessed.length;
  const unaccounted = {
    listed:
      listedExpected.size -
      listedEvaluated.length -
      listedFailed.length -
      listedExcluded.length -
      listedUnprocessed.length,
    otc:
      otcEligible.size -
      otcEvaluated.length -
      otcFailed.length -
      otcExcluded.length -
      otcUnprocessed.length,
    total:
      eligibleTotal -
      processedTotal -
      skippedTotal -
      excludedTotal -
      unprocessedTotal,
  };
  const resultCountMatches =
    input.publishedResultCount === processedTotal;
  const excludedOutcomes = [
    ...listedExcluded.map((outcome) => ({
      symbol: outcome.symbol,
      source: "listed" as const,
      reason: outcome.reason,
    })),
    ...otcExcluded.map((outcome) => ({
      symbol: outcome.symbol,
      source: "otc" as const,
      reason: outcome.reason,
    })),
  ];

  return {
    source: {
      listedRaw: input.listedRawSymbols.length,
      otcProviderRaw: input.otcProviderRawCount,
      otcProviderDuplicateRows:
        input.otcProviderRawCount - otcDirectory.size,
      otcDirectoryUnique: otcDirectory.size,
      listedOtcOverlap,
      uniqueDirectoryAndListed:
        listedSymbols.size + otcDirectory.size - listedOtcOverlap,
    },
    eligibility: {
      listed: listedExpected.size,
      otc: otcEligible.size,
      total: eligibleTotal,
      otcDirectoryExcluded,
      otcDirectoryExcludedByReason: countReasons(
        otcDirectoryExcludedOutcomes,
      ),
    },
    processing: {
      processed: {
        listed: listedEvaluated.length,
        otc: otcEvaluated.length,
        total: processedTotal,
      },
      skippedNoData: {
        listed: listedFailed.length,
        otc: otcFailed.length,
        total: skippedTotal,
        byReason: countReasons([...listedFailed, ...otcFailed]),
      },
      excluded: {
        listed: listedExcluded.length,
        otc: otcExcluded.length,
        total: excludedTotal,
        byReason: countReasons([...listedExcluded, ...otcExcluded]),
        outcomes: excludedOutcomes,
      },
      unprocessed: {
        listed: listedUnprocessed.length,
        otc: otcUnprocessed.length,
        total: unprocessedTotal,
        byReason: countReasons([
          ...listedUnprocessed,
          ...otcUnprocessed,
        ]),
      },
      unaccounted,
      publishedResultCount: input.publishedResultCount,
      resultCountMatches,
      reconciles:
        unaccounted.listed === 0 &&
        unaccounted.otc === 0 &&
        unaccounted.total === 0 &&
        resultCountMatches,
    },
  };
}

export type RiskScoringAccounting = ReturnType<
  typeof buildRiskScoringAccounting
>;
