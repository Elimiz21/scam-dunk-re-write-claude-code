import { computeRiskScore, PriceHistory } from "./standalone-scorer";

export type Request = (
  endpoint: string,
  params: Record<string, string>,
) => Promise<any>;
export interface OtcSecurity {
  symbol: string;
  companyName: string;
  exchangeShortName?: string;
  exchange?: string;
  isActivelyTrading?: boolean;
  isEtf?: boolean;
  isFund?: boolean;
}
export interface Outcome {
  symbol: string;
  status: "excluded" | "failed" | "evaluated";
  reason: string;
  attemptedAt?: string;
  evaluatedAt?: string;
  priceAsOf?: string;
  isin?: string;
}
const validDate = (s: string) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const isOtcExchange = (s: string) =>
  /^(OTC|OTCPK|OTCQX|OTCQB|PINK|PNK|GREY|GRAY|EXPERT|OTC MARKETS|OTHER OTC)$/i.test(
    s || "",
  );

/** A shared request gate bounds all concurrent workers, including retries. Errors never include URLs/keys. */
export class OtcClient {
  calls = 0;
  private nextAt = 0;
  private denied = false;
  private startedAt = Date.now();
  constructor(
    private key: string,
    private options: {
      spacingMs?: number;
      maxCalls?: number;
      maxDurationMs?: number;
      fetch?: typeof fetch;
    } = {},
  ) {}
  request: Request = async (endpoint, params) => {
    if (this.denied) throw new Error("entitlement");
    if (!this.key) throw new Error("missing_credential");
    for (let attempt = 0; attempt < 3; attempt++) {
      if (
        this.calls >= (this.options.maxCalls ?? 45000) ||
        Date.now() - this.startedAt >=
          (this.options.maxDurationMs ?? 150 * 60 * 1000)
      )
        throw new Error("budget_exhausted");
      this.calls++;
      const wait = Math.max(0, this.nextAt - Date.now());
      this.nextAt = Date.now() + wait + (this.options.spacingMs ?? 250);
      await delay(wait);
      try {
        const url = new URL(
          "https://financialmodelingprep.com/stable/" + endpoint,
        );
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
        url.searchParams.set("apikey", this.key);
        const response = await (this.options.fetch ?? fetch)(url, {
          signal: AbortSignal.timeout(20000),
        });
        if ([401, 402, 403].includes(response.status)) {
          this.denied = true;
          throw new Error("entitlement");
        }
        if (!response.ok) throw new Error("provider_http_" + response.status);
        const body = await response.json();
        if (!Array.isArray(body)) throw new Error("provider_invalid_response");
        return body;
      } catch (error) {
        if (error instanceof Error && error.message === "entitlement")
          throw error;
        if (attempt === 2) throw new Error("provider_error");
        await delay((this.options.spacingMs ?? 250) * 2 ** (attempt + 2));
      }
    }
  };
}

function exclusion(s: OtcSecurity): string | null {
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(s.symbol || "") || !s.companyName)
    return "invalid_identity";
  if (!isOtcExchange(s.exchangeShortName || s.exchange || "")) return "not_otc";
  if (s.isActivelyTrading !== true) return "inactive";
  if (s.isEtf !== false || s.isFund !== false) return "fund_or_unknown_type";
  if (
    /\b(warrants?|rights?|units?|preferred|preference|debentures?|notes?|bonds?|et[fn]|fund|trust)\b|\b[0-9.]+%/i.test(
      s.companyName,
    )
  )
    return "unsupported_instrument";
  // FINRA fifth-letter instruments: conservatively omit warrants, rights, units,
  // preferreds and miscellaneous issues. F/Y ordinary foreign shares/ADRs remain.
  if (s.symbol.length === 5 && /[WURPOMNLKJHV]$/.test(s.symbol))
    return "unsupported_instrument";
  return null;
}

export async function collectOtcUniverse(request: Request, pageSize = 10000) {
  const rows: OtcSecurity[] = [];
  const pageKeys = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const batch = await request("company-screener", {
      exchange: "OTC",
      limit: String(pageSize),
      page: String(page),
    });
    if (!Array.isArray(batch)) throw new Error("invalid_directory");
    const key = batch.map((s) => s.symbol).join("|");
    if (batch.length && pageKeys.has(key))
      throw new Error("pagination_repeated");
    pageKeys.add(key);
    rows.push(...batch);
    if (batch.length < pageSize) break;
    if (page === 19) throw new Error("pagination_limit");
  }
  if (!rows.length) throw new Error("empty_directory");
  const groups = new Map<string, OtcSecurity[]>();
  for (const row of rows)
    groups.set(row.symbol, [...(groups.get(row.symbol) || []), row]);
  const securities: OtcSecurity[] = [];
  const excluded: Outcome[] = [];
  for (const [symbol, group] of groups) {
    if (new Set(group.map((s) => JSON.stringify(s))).size > 1) {
      excluded.push({
        symbol,
        status: "excluded",
        reason: "conflicting_symbol",
      });
      continue;
    }
    const reason = exclusion(group[0]);
    if (reason) excluded.push({ symbol, status: "excluded", reason });
    else securities.push(group[0]);
  }
  return {
    symbols: [...groups.keys()],
    rawCount: rows.length,
    uniqueCount: groups.size,
    duplicates: rows.length - groups.size,
    securities: securities.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    excluded,
  };
}

export async function evaluateOtcSecurity(
  security: OtcSecurity,
  date: string,
  request: Request,
) {
  const outcome: Outcome = {
    symbol: security.symbol,
    status: "failed",
    reason: "provider_error",
    attemptedAt: new Date().toISOString(),
  };
  const fail = (reason: string) => ({
    outcome: { ...outcome, reason },
    result: undefined,
  });
  try {
    const profiles = await request("profile", { symbol: security.symbol });
    if (profiles.length !== 1) return fail("no_profile");
    const profile = profiles[0];
    if (
      profile.symbol !== security.symbol ||
      profile.companyName !== security.companyName
    )
      return fail("identity_changed");
    const reason = exclusion({
      ...profile,
      exchangeShortName: profile.exchange,
    });
    if (reason) return fail(reason);
    if (!profile.isin || profile.currency !== "USD")
      return fail("unsupported_identity_or_currency");
    outcome.isin = profile.isin;
    const from = new Date(Date.parse(date + "T00:00:00Z") - 210 * 86400000)
      .toISOString()
      .slice(0, 10);
    const raw = await request("historical-price-eod/full", {
      symbol: security.symbol,
      from,
      to: date,
    });
    if (raw.some((bar: any) => bar.symbol && bar.symbol !== security.symbol))
      return fail("identity_changed");
    const bars: PriceHistory[] = raw
      .map((b: any) => ({
        date: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-100);
    if (bars.length < 30) return fail("insufficient_history");
    if (
      new Set(bars.map((b) => b.date)).size !== bars.length ||
      bars.some(
        (b) =>
          !validDate(b.date) ||
          b.date > date ||
          ![b.open, b.high, b.low, b.close, b.volume].every(Number.isFinite) ||
          Math.min(b.open, b.high, b.low, b.close) <= 0 ||
          b.volume < 0 ||
          b.high < Math.max(b.open, b.close, b.low) ||
          b.low > Math.min(b.open, b.close),
      )
    )
      return fail("invalid_prices");
    outcome.priceAsOf = bars[bars.length - 1].date;
    if (outcome.priceAsOf !== date) return fail("stale_prices");
    if (
      bars.filter(
        (b) =>
          b.volume > 0 &&
          Date.parse(date) - Date.parse(b.date) <= 45 * 86400000,
      ).length < 20 ||
      Date.parse(date) - Date.parse(bars[bars.length - 30].date) >
        50 * 86400000 ||
      bars
        .slice(-30)
        .some(
          (b, i, recent) =>
            i > 0 &&
            Date.parse(b.date) - Date.parse(recent[i - 1].date) > 7 * 86400000,
        ) ||
      bars[bars.length - 1].volume <= 0
    )
      return fail("sparse_trading");
    const splits = await request("splits", { symbol: security.symbol });
    if (
      splits.some(
        (s: any) =>
          !validDate(s.date) ||
          (s.symbol && s.symbol !== security.symbol) ||
          !Number.isFinite(s.numerator) ||
          s.numerator <= 0 ||
          !Number.isFinite(s.denominator) ||
          s.denominator <= 0,
      )
    )
      return fail("invalid_corporate_actions");
    if (splits.some((s: any) => s.date >= bars[0].date && s.date <= date))
      return fail("corporate_action");
    // No history splicing or split-factor guessing. Large discontinuities are
    // held for corporate-action review even when the split endpoint is empty.
    if (
      bars.some(
        (b, i) =>
          i > 0 &&
          (b.close / bars[i - 1].close > 5 ||
            b.close / bars[i - 1].close < 0.2),
      )
    )
      return fail("unresolved_discontinuity");
    const lastPrice = bars[bars.length - 1].close;
    const avgVolume = bars.slice(-30).reduce((n, b) => n + b.volume, 0) / 30;
    if (!Number.isFinite(profile.marketCap) || profile.marketCap <= 0)
      return fail("missing_market_cap");
    const quote = {
      ticker: security.symbol,
      companyName: profile.companyName,
      exchange: profile.exchange,
      lastPrice,
      marketCap: profile.marketCap,
      avgVolume30d: avgVolume,
      avgDollarVolume30d: avgVolume * lastPrice,
    };
    const score = computeRiskScore({
      quote,
      priceHistory: bars,
      isOTC: true,
      dataAvailable: true,
    });
    if (score.riskLevel === "INSUFFICIENT" || score.isInsufficient)
      return fail("insufficient_scoring_data");
    const evaluatedAt = new Date().toISOString();
    const result = {
      symbol: security.symbol,
      name: profile.companyName,
      exchange: profile.exchange,
      sector: profile.sector || "Unknown",
      industry: profile.industry || "Unknown",
      marketCap: profile.marketCap,
      lastPrice,
      avgDailyVolume: avgVolume,
      avgDollarVolume: avgVolume * lastPrice,
      riskLevel: score.riskLevel,
      totalScore: score.totalScore,
      signals: score.signals,
      isInsufficient: false,
      isLegitimate: score.isLegitimate,
      evaluatedAt,
      priceAsOf: outcome.priceAsOf,
      securityIdentifier: profile.isin,
      marketTier: "UNKNOWN",
      source: "FMP",
      scanDate: date,
    };
    return {
      outcome: {
        ...outcome,
        status: "evaluated" as const,
        reason: "evaluated",
        evaluatedAt,
      },
      result,
    };
  } catch (error) {
    return fail(
      error instanceof Error &&
        ["budget_exhausted", "entitlement", "missing_credential"].includes(
          error.message,
        )
        ? error.message
        : "provider_error",
    );
  }
}

export async function runOtcScan(
  date: string,
  request: Request,
  options: { limit?: number; checkpoint?: (coverage: any) => void } = {},
) {
  if (!validDate(date)) throw new Error("invalid_scan_date");
  const startedAt = new Date().toISOString();
  const coverage = {
    schemaVersion: 1,
    source: "FMP company-screener/profile/historical-price-eod/full/splits",
    date,
    startedAt,
    completedAt: null as string | null,
    createdAt: startedAt,
    status: "running",
    scope:
      "Provider-listed active OTC equity candidates; common/ordinary shares and ADRs, heuristic class filtering; exact market tiers unknown. No claim of comprehensive OTC market coverage.",
    universeStatus: "pending",
    rawCount: 0,
    eligibleCount: 0,
    eligibleSymbols: [] as string[],
    directorySymbols: [] as string[],
    directoryRetrievedAt: null as string | null,
    evaluatedCount: 0,
    outcomes: [] as Outcome[],
    error: null as string | null,
  };
  const results: NonNullable<
    Awaited<ReturnType<typeof evaluateOtcSecurity>>["result"]
  >[] = [];
  try {
    const universe = await collectOtcUniverse(request);
    coverage.universeStatus = "refreshed";
    coverage.rawCount = universe.rawCount;
    coverage.eligibleCount = universe.securities.length;
    coverage.eligibleSymbols = universe.securities.map((s) => s.symbol);
    coverage.directorySymbols = universe.symbols;
    coverage.directoryRetrievedAt = new Date().toISOString();
    options.checkpoint?.(coverage);
    coverage.outcomes.push(...universe.excluded);
    let next = 0;
    const done = new Map<
      string,
      Awaited<ReturnType<typeof evaluateOtcSecurity>>
    >();
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < universe.securities.length) {
          const index = next++;
          const security = universe.securities[index];
          if (options.limit !== undefined && index >= options.limit) {
            coverage.outcomes.push({
              symbol: security.symbol,
              status: "excluded",
              reason: "test_limit",
            });
            continue;
          }
          const value = await evaluateOtcSecurity(security, date, request);
          done.set(security.symbol, value);
          coverage.outcomes.push(value.outcome);
          if (done.size % 100 === 0) options.checkpoint?.(coverage);
        }
      }),
    );
    const ids = new Map<string, string[]>();
    for (const [symbol, value] of done)
      if (value.outcome.isin)
        ids.set(value.outcome.isin, [
          ...(ids.get(value.outcome.isin) || []),
          symbol,
        ]);
    for (const value of done.values()) {
      if (value.outcome.isin && ids.get(value.outcome.isin)!.length > 1) {
        value.outcome.status = "excluded";
        value.outcome.reason = "duplicate_identifier";
        continue;
      }
      if (value.result) results.push(value.result);
    }
    coverage.evaluatedCount = results.length;
    coverage.status = coverage.outcomes.some(
      (s) =>
        s.status === "failed" ||
        s.reason === "test_limit" ||
        s.reason === "duplicate_identifier",
    )
      ? "degraded"
      : "completed";
  } catch (error) {
    coverage.status = "failed";
    coverage.universeStatus = "failed";
    coverage.error =
      error instanceof Error && /^[a-z_]+$/.test(error.message)
        ? error.message
        : "provider_error";
  }
  coverage.completedAt = new Date().toISOString();
  options.checkpoint?.(coverage);
  return { results, coverage };
}

/** The refreshed directory supersedes any legacy listed result for these symbols,
 * including failed/excluded OTC outcomes. Never retain a less-validated LOW. */
export function reconcileListedResults<T extends { symbol: string }>(
  listed: T[],
  directorySymbols: string[],
): T[] {
  const otc = new Set(directorySymbols);
  return listed.filter((result) => !otc.has(result.symbol));
}
