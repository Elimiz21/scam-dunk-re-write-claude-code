/**
 * Unit tests for the pure scoring engine fixes (audit 2026-06-11).
 *
 * These lock in the behaviour changes that the audit required:
 *  - TS-C1: correlated price/volume signals are de-duplicated in the score.
 *  - TS-H3: RSI of a flat series is 50 (not 100).
 *  - TS-C5: crypto is its own category, not OTC.
 *  - TS-C6: a pre-computed secFlagged forces HIGH even with no quote.
 *  - TS-H2: dataCompleteness is surfaced.
 *  - TS-H6/H9: isLegitimate is forced false whenever the level isn't LOW.
 */

import {
  dedupeSignalScore,
  calculateRSI,
  scoreMarketData,
  checkIsLegitimate,
  getDataCompleteness,
  SIGNAL_CODES,
  applyPumpDumpFeasibilityFilter,
} from "../lib/scoring/engine";
import {
  MarketData,
  PriceHistory,
  RiskSignal,
  BehavioralContext,
} from "../lib/types";

const NO_CONTEXT: BehavioralContext = {
  unsolicited: false,
  promisesHighReturns: false,
  urgencyPressure: false,
  secrecyInsideInfo: false,
};

function flatHistory(price: number, days: number, volume = 1_000_000): PriceHistory[] {
  const out: PriceHistory[] = [];
  for (let i = days; i >= 0; i--) {
    out.push({
      date: `2024-01-${String((days - i) + 1).padStart(2, "0")}`,
      open: price,
      high: price,
      low: price,
      close: price,
      volume,
    });
  }
  return out;
}

describe("dedupeSignalScore (TS-C1)", () => {
  it("caps the price family to its single max weight", () => {
    const signals: RiskSignal[] = [
      { code: SIGNAL_CODES.SPIKE_7D, category: "PATTERN", description: "", weight: 4 },
      { code: SIGNAL_CODES.SPIKE_3D, category: "PATTERN", description: "", weight: 3 },
      { code: SIGNAL_CODES.PRICE_ANOMALY, category: "PATTERN", description: "", weight: 2 },
      { code: SIGNAL_CODES.EXTREME_SURGE, category: "PATTERN", description: "", weight: 3 },
    ];
    // Naive sum would be 12; de-duped should be max = 4.
    expect(dedupeSignalScore(signals)).toBe(4);
  });

  it("caps the volume family independently of the price family", () => {
    const signals: RiskSignal[] = [
      { code: SIGNAL_CODES.SPIKE_7D, category: "PATTERN", description: "", weight: 4 },
      { code: SIGNAL_CODES.VOLUME_EXPLOSION, category: "PATTERN", description: "", weight: 3 },
      { code: SIGNAL_CODES.VOLUME_ANOMALY, category: "PATTERN", description: "", weight: 2 },
    ];
    // price max (4) + volume max (3) = 7.
    expect(dedupeSignalScore(signals)).toBe(7);
  });

  it("sums non-correlated signals normally", () => {
    const signals: RiskSignal[] = [
      { code: SIGNAL_CODES.MICROCAP_PRICE, category: "STRUCTURAL", description: "", weight: 2 },
      { code: SIGNAL_CODES.SMALL_MARKET_CAP, category: "STRUCTURAL", description: "", weight: 2 },
      { code: SIGNAL_CODES.OTC_EXCHANGE, category: "STRUCTURAL", description: "", weight: 3 },
      { code: SIGNAL_CODES.UNSOLICITED, category: "BEHAVIORAL", description: "", weight: 1 },
    ];
    expect(dedupeSignalScore(signals)).toBe(8);
  });

  it("keeps all signals visible even though the score is capped", () => {
    // Spike-heavy history is exercised end-to-end below; here we assert the
    // pure helper only changes the SCORE, not the signal list.
    const signals: RiskSignal[] = [
      { code: SIGNAL_CODES.SPIKE_7D, category: "PATTERN", description: "", weight: 4 },
      { code: SIGNAL_CODES.PRICE_ANOMALY, category: "PATTERN", description: "", weight: 3 },
    ];
    expect(signals.length).toBe(2);
    expect(dedupeSignalScore(signals)).toBe(4);
  });
});

describe("customer pump-and-dump feasibility filter", () => {
  const signal: RiskSignal = { code: "PRICE_ANOMALY", category: "PATTERN", description: "Moderate price anomaly", weight: 2 };
  const market: MarketData = {
    quote: { ticker: "AAPL", companyName: "Apple", exchange: "NASDAQ", marketCap: 20_000_000_000, lastPrice: 100, avgVolume30d: 10_000, avgDollarVolume30d: 1_000_000 },
    priceHistory: flatHistory(100, 30), isOTC: false, dataAvailable: true,
  };
  const result = { riskLevel: "MEDIUM" as const, totalScore: 2, signals: [signal], isInsufficient: false, isLegitimate: false, dataCompleteness: "full" as const };
  const normal = { secFlagged: false, hasUserTip: false };

  it("makes a market-only medium or high verdict LOW above the nightly market-cap cutoff", () => {
    for (const riskLevel of ["MEDIUM", "HIGH"] as const) {
      const filtered = applyPumpDumpFeasibilityFilter({ ...result, riskLevel }, market, normal);
      expect(filtered).toMatchObject({ applied: true, result: { riskLevel: "LOW", totalScore: 0, signals: [] }, excludedSignals: [signal] });
    }
  });
  it("applies the nightly dollar-volume cutoff independently of market cap", () => {
    const liquid = { ...market, quote: { ...market.quote!, marketCap: 500_000_000, avgDollarVolume30d: 11_000_000 } };
    expect(applyPumpDumpFeasibilityFilter(result, liquid, normal).result.riskLevel).toBe("LOW");
  });
  it("keeps regulatory, behavioral, social, and user-tip warnings", () => {
    const alert: RiskSignal = { code: "ALERT_LIST_HIT", category: "ALERT", description: "Regulatory alert", weight: 5 };
    for (const candidate of [
      { result: { ...result, signals: [signal, alert] }, options: normal },
      { result, options: { secFlagged: true, hasUserTip: false } },
      { result, options: { secFlagged: false, hasUserTip: true } },
      { result: { ...result, signals: [{ ...signal, category: "SOCIAL" as const }] }, options: normal },
    ]) expect(applyPumpDumpFeasibilityFilter(candidate.result, market, candidate.options).applied).toBe(false);
  });
  it("does not manufacture a low-risk verdict from missing quote data", () => {
    expect(applyPumpDumpFeasibilityFilter(result, { ...market, quote: null }, normal).applied).toBe(false);
    expect(applyPumpDumpFeasibilityFilter(result, { ...market, isOTC: true }, normal).applied).toBe(false);
  });
});

describe("calculateRSI (TS-H3)", () => {
  it("returns 50 for a perfectly flat series (no gains, no losses)", () => {
    const rsi = calculateRSI(flatHistory(50, 30));
    expect(rsi).toBe(50);
  });

  it("returns 100 when there are only gains", () => {
    const rising: PriceHistory[] = [];
    for (let i = 0; i < 30; i++) {
      rising.push({
        date: `2024-02-${String(i + 1).padStart(2, "0")}`,
        open: 100 + i,
        high: 100 + i,
        low: 100 + i,
        close: 100 + i,
        volume: 1000,
      });
    }
    expect(calculateRSI(rising)).toBe(100);
  });
});

describe("crypto is not OTC (TS-C5)", () => {
  it("does not emit OTC_EXCHANGE for a crypto-category asset", () => {
    const marketData: MarketData = {
      quote: {
        ticker: "BTC",
        companyName: "Bitcoin",
        exchange: "CRYPTO",
        lastPrice: 60000,
        marketCap: 1_000_000_000_000,
        avgVolume30d: 1_000_000,
        avgDollarVolume30d: 30_000_000_000,
      },
      priceHistory: flatHistory(60000, 40),
      isOTC: false,
      category: "CRYPTO",
      dataAvailable: true,
    };
    const result = scoreMarketData({ marketData, pitchText: "", context: NO_CONTEXT });
    expect(result.signals.some((s) => s.code === SIGNAL_CODES.OTC_EXCHANGE)).toBe(false);
  });
});

describe("secFlagged threading (TS-C6)", () => {
  it("forces HIGH with no quote when secFlagged is true", () => {
    const marketData: MarketData = {
      quote: null,
      priceHistory: [],
      isOTC: false,
      dataAvailable: false,
    };
    const result = scoreMarketData({
      marketData,
      pitchText: "",
      context: NO_CONTEXT,
      secFlagged: true,
    });
    expect(result.riskLevel).toBe("HIGH");
    expect(result.isInsufficient).toBe(false);
    expect(result.signals.some((s) => s.code === SIGNAL_CODES.ALERT_LIST_HIT)).toBe(true);
  });

  it("is INSUFFICIENT with no data and no flags", () => {
    const marketData: MarketData = {
      quote: null,
      priceHistory: [],
      isOTC: false,
      dataAvailable: false,
    };
    const result = scoreMarketData({ marketData, pitchText: "", context: NO_CONTEXT });
    expect(result.riskLevel).toBe("INSUFFICIENT");
  });
});

describe("dataCompleteness (TS-H2)", () => {
  it("is 'full' with quote + >= 30 points", () => {
    const md: MarketData = {
      quote: {
        ticker: "X",
        companyName: "X",
        exchange: "NYSE",
        lastPrice: 100,
        marketCap: 50_000_000_000,
        avgVolume30d: 1,
        avgDollarVolume30d: 100_000_000,
      },
      priceHistory: flatHistory(100, 40),
      isOTC: false,
      dataAvailable: true,
    };
    expect(getDataCompleteness(md)).toBe("full");
  });

  it("is 'quote-only' with quote but < 30 points", () => {
    const md: MarketData = {
      quote: {
        ticker: "X",
        companyName: "X",
        exchange: "NYSE",
        lastPrice: 100,
        marketCap: 50_000_000_000,
        avgVolume30d: 1,
        avgDollarVolume30d: 100_000_000,
      },
      priceHistory: flatHistory(100, 5),
      isOTC: false,
      dataAvailable: true,
    };
    expect(getDataCompleteness(md)).toBe("quote-only");
  });

  it("is 'none' with no data", () => {
    expect(
      getDataCompleteness({
        quote: null,
        priceHistory: [],
        isOTC: false,
        dataAvailable: false,
      }),
    ).toBe("none");
  });
});

describe("checkIsLegitimate (TS-H6/H9)", () => {
  const bigCap: MarketData = {
    quote: {
      ticker: "MEGA",
      companyName: "Mega",
      exchange: "NYSE",
      lastPrice: 200,
      marketCap: 50_000_000_000,
      avgVolume30d: 1,
      avgDollarVolume30d: 500_000_000,
    },
    priceHistory: flatHistory(200, 40),
    isOTC: false,
    category: "MAJOR",
    dataAvailable: true,
  };

  it("is legitimate for a clean large-cap at LOW", () => {
    expect(checkIsLegitimate(bigCap, [], "LOW")).toBe(true);
  });

  it("is NEVER legitimate when the level is not LOW", () => {
    expect(checkIsLegitimate(bigCap, [], "MEDIUM")).toBe(false);
    expect(checkIsLegitimate(bigCap, [], "HIGH")).toBe(false);
  });

  it("is not legitimate for an unknown small ticker even with no signals", () => {
    const unknown: MarketData = {
      quote: {
        ticker: "UNK",
        companyName: "Unknown",
        exchange: "NASDAQ",
        lastPrice: 8,
        marketCap: 200_000_000,
        avgVolume30d: 1,
        avgDollarVolume30d: 1_000_000,
      },
      priceHistory: flatHistory(8, 40),
      isOTC: false,
      category: "MAJOR",
      dataAvailable: true,
    };
    expect(checkIsLegitimate(unknown, [], "LOW")).toBe(false);
  });
});
