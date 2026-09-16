/// <reference types="jest" />
import {
  collectOtcUniverse,
  evaluateOtcSecurity,
  OtcClient,
  runOtcScan,
} from "./otc-daily";

const security = {
  symbol: "TEST",
  companyName: "Test Corp",
  exchangeShortName: "OTC",
  isActivelyTrading: true,
  isEtf: false,
  isFund: false,
};
const profile = {
  ...security,
  exchange: "OTC",
  isin: "US1234567890",
  price: 2,
  marketCap: 1000000,
  averageVolume: 1000,
  currency: "USD",
};
const bars = Array.from({ length: 40 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 7, 7 + i)).toISOString().slice(0, 10),
  open: 2,
  high: 2,
  low: 2,
  close: 2,
  volume: 1000,
}));
const request =
  (overrides: Record<string, unknown> = {}) =>
  async (endpoint: string) =>
    overrides[endpoint] ??
    { profile: [profile], "historical-price-eod/full": bars, splits: [] }[
      endpoint
    ];

test("directory pagination retains small stocks and excludes inactive or unsupported instruments", async () => {
  const pages = [
    [security, { ...security, symbol: "DEAD", isActivelyTrading: false }],
    [{ ...security, symbol: "WARRANT", companyName: "Test Warrants" }],
  ];
  const result = await collectOtcUniverse(
    async (_e, p) => pages[Number(p.page)],
    2,
  );
  expect(result.securities.map((s) => s.symbol)).toEqual(["TEST"]);
  expect(result.excluded.map((s) => s.reason)).toEqual([
    "inactive",
    "unsupported_instrument",
  ]);
  expect(result.rawCount).toBe(3);
});
test("repeated full pages cannot fabricate complete coverage", async () => {
  await expect(collectOtcUniverse(async () => [security], 1)).rejects.toThrow(
    /pagination/,
  );
});
test("conflicting duplicate symbols are quarantined", async () => {
  const result = await collectOtcUniverse(async () => [
    security,
    { ...security, companyName: "Different issuer" },
  ]);
  expect(result.securities).toHaveLength(0);
  expect(result.excluded.some((s) => s.reason === "conflicting_symbol")).toBe(
    true,
  );
});
test.each([
  ["stale_prices", { "historical-price-eod/full": bars.slice(0, -1) }],
  ["insufficient_history", { "historical-price-eod/full": bars.slice(-5) }],
  [
    "invalid_prices",
    {
      "historical-price-eod/full": [
        ...bars.slice(0, -1),
        { ...bars.at(-1), close: 0 },
      ],
    },
  ],
  [
    "corporate_action",
    { splits: [{ date: "2026-09-01", numerator: 1, denominator: 50 }] },
  ],
  ["identity_changed", { profile: [{ ...profile, symbol: "NEW" }] }],
  ["no_profile", { profile: [] }],
])("rejects %s instead of LOW", async (reason, overrides) => {
  const result = await evaluateOtcSecurity(
    security,
    "2026-09-15",
    request(overrides),
  );
  expect(result.outcome.reason).toBe(reason);
  expect(result.result).toBeUndefined();
});
test("successful evaluation has actual timestamp, security identifier and OTC structural score", async () => {
  const { result, outcome } = await evaluateOtcSecurity(
    security,
    "2026-09-15",
    request(),
  );
  expect(result?.riskLevel).not.toBe("INSUFFICIENT");
  expect(result?.signals.some((s) => s.code.includes("OTC"))).toBe(true);
  expect(outcome.isin).toBe("US1234567890");
  expect(Date.parse(result!.evaluatedAt)).toBeGreaterThan(
    Date.parse("2026-09-15"),
  );
});
test("provider failures are retained as failed outcomes", async () => {
  const report = await runOtcScan("2026-09-15", async (e) => {
    if (e === "company-screener") return [security];
    throw new Error("timeout");
  });
  expect(report.results).toHaveLength(0);
  expect(report.coverage.status).toBe("degraded");
  expect(report.coverage.outcomes[0].reason).toBe("provider_error");
});
test("request retries are bounded and auth failures are not retried", async () => {
  let calls = 0;
  const client = new OtcClient("private-key", {
    spacingMs: 0,
    maxCalls: 4,
    fetch: async () => {
      calls++;
      return new Response("{}", { status: 503 });
    },
  });
  await expect(client.request("profile", { symbol: "TEST" })).rejects.toThrow(
    /provider/,
  );
  expect(calls).toBe(3);
  const denied = new OtcClient("private-key", {
    spacingMs: 0,
    fetch: async () => new Response("{}", { status: 403 }),
  });
  await expect(denied.request("profile", {})).rejects.toThrow(/entitlement/);
  expect(denied.calls).toBe(1);
});

test.each([
  [{ date: "garbage" }],
  [{ date: "2026-02-30" }],
  [{ date: "2026-09-01", symbol: "OTHER" }],
  [{ date: "2026-09-01", numerator: 0, denominator: 1 }],
])("malformed corporate action data cannot pass as clean", async (splits) => {
  const value = await evaluateOtcSecurity(
    security,
    "2026-09-15",
    request({ splits: [splits] }),
  );
  expect(value.outcome.reason).toBe("invalid_corporate_actions");
  expect(value.result).toBeUndefined();
});
test("ambiguous security identifiers quarantine both symbols", async () => {
  const second = { ...security, symbol: "SECOND" };
  const value = await runOtcScan("2026-09-15", async (e, p) =>
    e === "company-screener"
      ? [security, second]
      : e === "profile"
        ? [{ ...profile, symbol: p.symbol }]
        : request()(e),
  );
  expect(value.results).toHaveLength(0);
  expect(
    value.coverage.outcomes.every((o) => o.reason === "duplicate_identifier"),
  ).toBe(true);
  expect(value.coverage.status).toBe("degraded");
});
test("empty directories fail explicitly and do not report completed", async () => {
  const value = await runOtcScan("2026-09-15", async () => []);
  expect(value.coverage.status).toBe("failed");
  expect(value.coverage.error).toBe("empty_directory");
});
test("a request budget terminates provider calls and retains failed outcomes", async () => {
  let count = 0;
  const client = new OtcClient("key", {
    spacingMs: 0,
    maxCalls: 1,
    fetch: async () => {
      count++;
      return new Response(JSON.stringify([security]));
    },
  });
  const value = await runOtcScan("2026-09-15", client.request);
  expect(count).toBe(1);
  expect(value.coverage.outcomes[0].reason).toBe("budget_exhausted");
  expect(value.coverage.status).toBe("degraded");
});
test.each(["2026-02-30", "2026-13-01"])(
  "rejects nonexistent scan date %s",
  async (date) => {
    await expect(runOtcScan(date, request())).rejects.toThrow(
      "invalid_scan_date",
    );
  },
);
test("widely spaced trading observations are not a daily history", async () => {
  const sparse = Array.from({ length: 40 }, (_, i) => ({
    ...bars[0],
    date: new Date(Date.parse("2026-09-15") - (39 - i) * 5 * 86400000)
      .toISOString()
      .slice(0, 10),
  }));
  const value = await evaluateOtcSecurity(
    security,
    "2026-09-15",
    request({ "historical-price-eod/full": sparse }),
  );
  expect(value.result).toBeUndefined();
  expect(value.outcome.reason).toBe("sparse_trading");
});
test("fresh directory removes stale listed successes even when OTC has no successful result", () => {
  const { reconcileListedResults } = require("./otc-daily");
  const listed = [
    { symbol: "TEST", riskLevel: "LOW" },
    { symbol: "AAPL", riskLevel: "LOW" },
  ];
  expect(reconcileListedResults(listed, ["TEST"])).toEqual([
    { symbol: "AAPL", riskLevel: "LOW" },
  ]);
});
test("entitlement failure opens a circuit for the rest of the run", async () => {
  let calls = 0;
  const client = new OtcClient("key", {
    spacingMs: 0,
    fetch: async () => {
      calls++;
      return new Response("{}", { status: 403 });
    },
  });
  await expect(client.request("profile", {})).rejects.toThrow("entitlement");
  await expect(client.request("profile", {})).rejects.toThrow("entitlement");
  expect(calls).toBe(1);
});
