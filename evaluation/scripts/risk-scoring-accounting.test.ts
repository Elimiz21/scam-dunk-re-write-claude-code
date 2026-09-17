const accountingModule = require("./risk-scoring-accounting");

function symbols(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    `${prefix}${String(index).padStart(5, "0")}`,
  );
}

describe("risk scoring accounting", () => {
  test("emits an explicit exclusion when a listed profile resolves to OTC", () => {
    expect(
      accountingModule.createListedRiskScoringOutcome(
        "OTCX",
        "profile_otc_not_in_directory",
      ),
    ).toEqual({
      symbol: "OTCX",
      status: "excluded",
      reason: "listed_profile_otc_not_in_directory",
    });
  });

  test("reconciles the September 16 overlap, exclusions, and silent OTC skip shape", () => {
    expect(typeof accountingModule.buildRiskScoringAccounting).toBe("function");

    const listedRawSymbols = symbols("L", 6970);
    const listedOtcOverlap = listedRawSymbols.slice(0, 31);
    const otcOnlyDirectory = symbols("O", 14241 - listedOtcOverlap.length);
    const otcDirectorySymbols = [...listedOtcOverlap, ...otcOnlyDirectory];
    const otcEligibleSymbols = [
      ...listedOtcOverlap.slice(0, 22),
      ...otcOnlyDirectory.slice(0, 9989 - 22),
    ];
    const otcDirectory = new Set(otcDirectorySymbols);
    const otcEligible = new Set(otcEligibleSymbols);
    const listedExpectedSymbols = listedRawSymbols.filter(
      (symbol) => !otcDirectory.has(symbol),
    );

    const listedOutcomes = [
      ...listedExpectedSymbols.slice(0, 6544).map((symbol) => ({
        symbol,
        status: "evaluated",
        reason: "evaluated",
      })),
      ...listedExpectedSymbols.slice(6544, 6544 + 389).map((symbol) => ({
        symbol,
        status: "failed",
        reason: "no_data",
      })),
      ...listedExpectedSymbols.slice(6544 + 389).map((symbol) => ({
        symbol,
        status: "excluded",
        reason: "listed_profile_otc_not_in_directory",
      })),
    ];

    const eligibleOutcomes = [
      ...otcEligibleSymbols.slice(0, 2664).map((symbol) => ({
        symbol,
        status: "evaluated",
        reason: "evaluated",
      })),
      ...otcEligibleSymbols.slice(2664, 2664 + 7323).map((symbol) => ({
        symbol,
        status: "failed",
        reason: "stale_prices",
      })),
      ...otcEligibleSymbols.slice(2664 + 7323).map((symbol) => ({
        symbol,
        status: "excluded",
        reason: "duplicate_identifier",
      })),
    ];
    const directoryExcluded = otcDirectorySymbols.filter(
      (symbol) => !otcEligible.has(symbol),
    );
    const directoryReasonCounts = [
      ["inactive", 4051],
      ["fund_or_unknown_type", 46],
      ["invalid_identity", 11],
      ["unsupported_instrument", 144],
    ] as const;
    let directoryIndex = 0;
    const directoryExcludedOutcomes = directoryReasonCounts.flatMap(
      ([reason, count]) =>
        directoryExcluded
          .slice(directoryIndex, (directoryIndex += count))
          .map((symbol) => ({ symbol, status: "excluded", reason })),
    );

    const accounting = accountingModule.buildRiskScoringAccounting({
      listedRawSymbols,
      otcProviderRawCount: 14423,
      otcDirectorySymbols,
      otcEligibleSymbols,
      listedOutcomes,
      otcOutcomes: [...eligibleOutcomes, ...directoryExcludedOutcomes],
      publishedResultCount: 9208,
    });

    expect(accounting.source).toEqual({
      listedRaw: 6970,
      otcProviderRaw: 14423,
      otcProviderDuplicateRows: 182,
      otcDirectoryUnique: 14241,
      listedOtcOverlap: 31,
      uniqueDirectoryAndListed: 21180,
    });
    expect(accounting.eligibility).toEqual({
      listed: 6939,
      otc: 9989,
      total: 16928,
      otcDirectoryExcluded: 4252,
      otcDirectoryExcludedByReason: {
        inactive: 4051,
        fund_or_unknown_type: 46,
        invalid_identity: 11,
        unsupported_instrument: 144,
      },
    });
    expect(accounting.processing).toEqual({
      processed: { listed: 6544, otc: 2664, total: 9208 },
      skippedNoData: {
        listed: 389,
        otc: 7323,
        total: 7712,
        byReason: { no_data: 389, stale_prices: 7323 },
      },
      excluded: {
        listed: 6,
        otc: 2,
        total: 8,
        byReason: {
          listed_profile_otc_not_in_directory: 6,
          duplicate_identifier: 2,
        },
        outcomes: [
          ...listedExpectedSymbols.slice(-6).map((symbol) => ({
            symbol,
            source: "listed",
            reason: "listed_profile_otc_not_in_directory",
          })),
          ...otcEligibleSymbols.slice(-2).map((symbol) => ({
            symbol,
            source: "otc",
            reason: "duplicate_identifier",
          })),
        ],
      },
      unprocessed: {
        listed: 0,
        otc: 0,
        total: 0,
        byReason: {},
      },
      unaccounted: { listed: 0, otc: 0, total: 0 },
      publishedResultCount: 9208,
      resultCountMatches: true,
      reconciles: true,
    });
  });

  test("reports an unaccounted eligible symbol instead of hiding it", () => {
    const accounting = accountingModule.buildRiskScoringAccounting({
      listedRawSymbols: ["LISTED"],
      otcProviderRawCount: 1,
      otcDirectorySymbols: ["OTC"],
      otcEligibleSymbols: ["OTC"],
      listedOutcomes: [],
      otcOutcomes: [{ symbol: "OTC", status: "evaluated", reason: "evaluated" }],
      publishedResultCount: 1,
    });

    expect(accounting.processing.unaccounted).toEqual({
      listed: 1,
      otc: 0,
      total: 1,
    });
    expect(accounting.processing.reconciles).toBe(false);
  });

  test("leaves a missing eligible OTC outcome visibly unaccounted", () => {
    const accounting = accountingModule.buildRiskScoringAccounting({
      listedRawSymbols: [],
      otcProviderRawCount: 1,
      otcDirectorySymbols: ["OTC"],
      otcEligibleSymbols: ["OTC"],
      listedOutcomes: [],
      otcOutcomes: [],
      publishedResultCount: 0,
    });

    expect(accounting.processing.unaccounted).toEqual({
      listed: 0,
      otc: 1,
      total: 1,
    });
    expect(accounting.processing.reconciles).toBe(false);
  });

  test("a partial failed OTC scan never counts an unretained evaluated outcome as published", () => {
    const outcomes = [
      { symbol: "DONE", status: "evaluated", reason: "evaluated" },
    ];

    const completed = accountingModule.completeFailedOtcOutcomes(
      ["DONE", "PENDING"],
      outcomes,
      [],
      "failed",
    );
    expect(completed).toEqual([
      {
        symbol: "DONE",
        status: "unprocessed",
        reason: "otc_evaluated_result_not_retained",
      },
      {
        symbol: "PENDING",
        status: "unprocessed",
        reason: "otc_scan_incomplete",
      },
    ]);
    const accounting = accountingModule.buildRiskScoringAccounting({
      listedRawSymbols: [],
      otcProviderRawCount: 2,
      otcDirectorySymbols: ["DONE", "PENDING"],
      otcEligibleSymbols: ["DONE", "PENDING"],
      listedOutcomes: [],
      otcOutcomes: completed,
      publishedResultCount: 0,
    });
    expect(accounting.processing.unprocessed).toEqual({
      listed: 0,
      otc: 2,
      total: 2,
      byReason: {
        otc_evaluated_result_not_retained: 1,
        otc_scan_incomplete: 1,
      },
    });
    expect(accounting.processing.reconciles).toBe(true);
    expect(
      accountingModule.completeFailedOtcOutcomes(
        ["DONE", "PENDING"],
        outcomes,
        ["DONE"],
        "degraded",
      ),
    ).toEqual(outcomes);
  });

  test("rejects duplicate outcomes", () => {
    expect(() =>
      accountingModule.buildRiskScoringAccounting({
        listedRawSymbols: ["LISTED"],
        otcProviderRawCount: 0,
        otcDirectorySymbols: [],
        otcEligibleSymbols: [],
        listedOutcomes: [
          { symbol: "LISTED", status: "evaluated", reason: "evaluated" },
          { symbol: "LISTED", status: "failed", reason: "no_data" },
        ],
        otcOutcomes: [],
        publishedResultCount: 1,
      }),
    ).toThrow("duplicate_listed_accounting_outcome");
  });

  test("preserves listed accounting when a failed OTC scan has no directory", () => {
    const accounting = accountingModule.buildRiskScoringAccounting({
      listedRawSymbols: ["LISTED"],
      otcProviderRawCount: 0,
      otcDirectorySymbols: [],
      otcEligibleSymbols: [],
      listedOutcomes: [
        { symbol: "LISTED", status: "evaluated", reason: "evaluated" },
      ],
      otcOutcomes: [],
      publishedResultCount: 1,
    });

    expect(accounting.eligibility).toEqual({
      listed: 1,
      otc: 0,
      total: 1,
      otcDirectoryExcluded: 0,
      otcDirectoryExcludedByReason: {},
    });
    expect(accounting.processing.reconciles).toBe(true);
  });

  test("rejects unknown outcomes and eligible symbols outside the directory", () => {
    expect(() =>
      accountingModule.buildRiskScoringAccounting({
        listedRawSymbols: ["LISTED"],
        otcProviderRawCount: 0,
        otcDirectorySymbols: [],
        otcEligibleSymbols: [],
        listedOutcomes: [
          { symbol: "UNKNOWN", status: "evaluated", reason: "evaluated" },
        ],
        otcOutcomes: [],
        publishedResultCount: 1,
      }),
    ).toThrow("unknown_listed_accounting_outcome");
    expect(() =>
      accountingModule.buildRiskScoringAccounting({
        listedRawSymbols: [],
        otcProviderRawCount: 0,
        otcDirectorySymbols: [],
        otcEligibleSymbols: ["UNKNOWN"],
        listedOutcomes: [],
        otcOutcomes: [],
        publishedResultCount: 0,
      }),
    ).toThrow("otc_eligible_symbol_outside_directory");
    expect(() =>
      accountingModule.buildRiskScoringAccounting({
        listedRawSymbols: [],
        otcProviderRawCount: 1,
        otcDirectorySymbols: ["OTC"],
        otcEligibleSymbols: ["OTC"],
        listedOutcomes: [],
        otcOutcomes: [
          { symbol: "UNKNOWN", status: "failed", reason: "provider_error" },
        ],
        publishedResultCount: 0,
      }),
    ).toThrow("unknown_otc_accounting_outcome");
  });

  test("marks a published result count mismatch unreconciled", () => {
    const accounting = accountingModule.buildRiskScoringAccounting({
      listedRawSymbols: ["LISTED"],
      otcProviderRawCount: 0,
      otcDirectorySymbols: [],
      otcEligibleSymbols: [],
      listedOutcomes: [
        { symbol: "LISTED", status: "evaluated", reason: "evaluated" },
      ],
      otcOutcomes: [],
      publishedResultCount: 0,
    });

    expect(accounting.processing.resultCountMatches).toBe(false);
    expect(accounting.processing.reconciles).toBe(false);
  });
});
