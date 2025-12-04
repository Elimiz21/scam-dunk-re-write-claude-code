/**
 * Unit tests for the risk scoring module
 */

import { computeRiskScore, SIGNAL_CODES, getSignalsByCategory } from "../lib/scoring";
import { MarketData, ScoringInput, PriceHistory, StockQuote } from "../lib/types";

// Helper to create mock market data
function createMockMarketData(
  overrides: Partial<{
    lastPrice: number;
    marketCap: number;
    avgDollarVolume30d: number;
    exchange: string;
    isOTC: boolean;
    dataAvailable: boolean;
    priceHistory: PriceHistory[];
  }> = {}
): MarketData {
  const defaultQuote: StockQuote = {
    ticker: "TEST",
    companyName: "Test Corp",
    exchange: overrides.exchange ?? "NYSE",
    lastPrice: overrides.lastPrice ?? 50,
    marketCap: overrides.marketCap ?? 1_000_000_000,
    avgVolume30d: 1_000_000,
    avgDollarVolume30d: overrides.avgDollarVolume30d ?? 50_000_000,
  };

  // Generate default stable price history
  const defaultHistory: PriceHistory[] = [];
  for (let i = 60; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    defaultHistory.push({
      date: date.toISOString().split("T")[0],
      open: 50,
      high: 51,
      low: 49,
      close: 50,
      volume: 1_000_000,
    });
  }

  return {
    quote: defaultQuote,
    priceHistory: overrides.priceHistory ?? defaultHistory,
    isOTC: overrides.isOTC ?? false,
    dataAvailable: overrides.dataAvailable ?? true,
  };
}

// Helper to create scoring input
function createScoringInput(
  marketData: MarketData,
  overrides: Partial<{
    pitchText: string;
    unsolicited: boolean;
    promisesHighReturns: boolean;
    urgencyPressure: boolean;
    secrecyInsideInfo: boolean;
  }> = {}
): ScoringInput {
  return {
    marketData,
    pitchText: overrides.pitchText ?? "Check out this stock, it looks promising.",
    context: {
      unsolicited: overrides.unsolicited ?? false,
      promisesHighReturns: overrides.promisesHighReturns ?? false,
      urgencyPressure: overrides.urgencyPressure ?? false,
      secrecyInsideInfo: overrides.secrecyInsideInfo ?? false,
    },
  };
}

describe("Risk Scoring Module", () => {
  describe("Structural Signals", () => {
    test("MICROCAP_PRICE: should trigger when price < $5", async () => {
      const marketData = createMockMarketData({ lastPrice: 2.5 });
      const input = createScoringInput(marketData);

      const result = await computeRiskScore(input);

      expect(result.signals.some((s) => s.code === SIGNAL_CODES.MICROCAP_PRICE)).toBe(true);
      const signal = result.signals.find((s) => s.code === SIGNAL_CODES.MICROCAP_PRICE);
      expect(signal?.weight).toBe(2);
      expect(signal?.category).toBe("STRUCTURAL");
    });

    test("MICROCAP_PRICE: should NOT trigger when price >= $5", async () => {
      const marketData = createMockMarketData({ lastPrice: 10 });
      const input = createScoringInput(marketData);

      const result = await computeRiskScore(input);

      expect(result.signals.some((s) => s.code === SIGNAL_CODES.MICROCAP_PRICE)).toBe(false);
    });

    test("SMALL_MARKET_CAP: should trigger when marketCap < $300M", async () => {
      const marketData = createMockMarketData({ marketCap: 100_000_000 });
      const input = createScoringInput(marketData);

      const result = await computeRiskScore(input);

      expect(result.signals.some((s) => s.code === SIGNAL_CODES.SMALL_MARKET_CAP)).toBe(true);
      const signal = result.signals.find((s) => s.code === SIGNAL_CODES.SMALL_MARKET_CAP);
      expect(signal?.weight).toBe(2);
    });

    test("MICRO_LIQUIDITY: should trigger when avgDollarVolume30d < $150k", async () => {
      const marketData = createMockMarketData({ avgDollarVolume30d: 100_000 });
      const input = createScoringInput(marketData);

      const result = await computeRiskScore(input);

      expect(result.signals.some((s) => s.code === SIGNAL_CODES.MICRO_LIQUIDITY)).toBe(true);
      const signal = result.signals.find((s) => s.code === SIGNAL_CODES.MICRO_LIQUIDITY);
      expect(signal?.weight).toBe(2);
    });

    test("OTC_EXCHANGE: should trigger for OTC stocks", async () => {
      const marketData = createMockMarketData({ isOTC: true, exchange: "OTC" });
      const input = createScoringInput(marketData);

      const result = await computeRiskScore(input);

      expect(result.signals.some((s) => s.code === SIGNAL_CODES.OTC_EXCHANGE)).toBe(true);
      const signal = result.signals.find((s) => s.code === SIGNAL_CODES.OTC_EXCHANGE);
      expect(signal?.weight).toBe(3);
    });
  });

  describe("Behavioral Signals", () => {
    test("UNSOLICITED: should trigger when context.unsolicited is true", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, { unsolicited: true });

      const result = await computeRiskScore(input);

      expect(result.signals.some((s) => s.code === SIGNAL_CODES.UNSOLICITED)).toBe(true);
      const signal = result.signals.find((s) => s.code === SIGNAL_CODES.UNSOLICITED);
      expect(signal?.weight).toBe(1);
      expect(signal?.category).toBe("BEHAVIORAL");
    });

    test("PROMISED_RETURNS: should trigger from context toggle", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, { promisesHighReturns: true });

      const result = await computeRiskScore(input);

      expect(result.signals.some((s) => s.code === SIGNAL_CODES.PROMISED_RETURNS)).toBe(true);
      const signal = result.signals.find((s) => s.code === SIGNAL_CODES.PROMISED_RETURNS);
      expect(signal?.weight).toBe(2);
    });

    test("PROMISED_RETURNS: should trigger from NLP keyword 'guaranteed return'", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, {
        pitchText: "This stock has a guaranteed return of 500%!",
      });

      const result = await computeRiskScore(input);

      expect(result.signals.some((s) => s.code === SIGNAL_CODES.PROMISED_RETURNS)).toBe(true);
    });

    test("URGENCY: should trigger from context toggle", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, { urgencyPressure: true });

      const result = await computeRiskScore(input);

      expect(result.signals.some((s) => s.code === SIGNAL_CODES.URGENCY)).toBe(true);
      expect(result.signals.find((s) => s.code === SIGNAL_CODES.URGENCY)?.weight).toBe(2);
    });

    test("URGENCY: should trigger from NLP keyword 'act now'", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, {
        pitchText: "Act now before it's too late!",
      });

      const result = await computeRiskScore(input);

      expect(result.signals.some((s) => s.code === SIGNAL_CODES.URGENCY)).toBe(true);
    });

    test("SECRECY: should trigger from context toggle", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, { secrecyInsideInfo: true });

      const result = await computeRiskScore(input);

      expect(result.signals.some((s) => s.code === SIGNAL_CODES.SECRECY)).toBe(true);
      expect(result.signals.find((s) => s.code === SIGNAL_CODES.SECRECY)?.weight).toBe(2);
    });

    test("SECRECY: should trigger from NLP keyword 'insider'", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, {
        pitchText: "I got this insider tip from someone at the company.",
      });

      const result = await computeRiskScore(input);

      expect(result.signals.some((s) => s.code === SIGNAL_CODES.SECRECY)).toBe(true);
    });

    test("SPECIFIC_RETURN_CLAIM: should trigger for '50% in 2 days' pattern", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, {
        pitchText: "This stock will go up 50% in 2 days!",
      });

      const result = await computeRiskScore(input);

      expect(result.signals.some((s) => s.code === SIGNAL_CODES.SPECIFIC_RETURN_CLAIM)).toBe(true);
      expect(result.signals.find((s) => s.code === SIGNAL_CODES.SPECIFIC_RETURN_CLAIM)?.weight).toBe(1);
    });
  });

  describe("Risk Level Calculation", () => {
    test("LOW: should return LOW for score <= 2", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, { unsolicited: true }); // weight 1

      const result = await computeRiskScore(input);

      expect(result.totalScore).toBeLessThanOrEqual(2);
      expect(result.riskLevel).toBe("LOW");
    });

    test("MEDIUM: should return MEDIUM for score 3-6", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, {
        unsolicited: true, // 1
        promisesHighReturns: true, // 2
      }); // total: 3

      const result = await computeRiskScore(input);

      expect(result.totalScore).toBeGreaterThanOrEqual(3);
      expect(result.totalScore).toBeLessThanOrEqual(6);
      expect(result.riskLevel).toBe("MEDIUM");
    });

    test("HIGH: should return HIGH for score >= 7", async () => {
      const marketData = createMockMarketData({
        lastPrice: 2, // MICROCAP_PRICE: 2
        marketCap: 50_000_000, // SMALL_MARKET_CAP: 2
        isOTC: true, // OTC_EXCHANGE: 3
      });
      const input = createScoringInput(marketData);
      // Total: 2 + 2 + 3 = 7

      const result = await computeRiskScore(input);

      expect(result.totalScore).toBeGreaterThanOrEqual(7);
      expect(result.riskLevel).toBe("HIGH");
    });

    test("HIGH: all behavioral flags should result in HIGH risk", async () => {
      const marketData = createMockMarketData({
        lastPrice: 2, // 2
        marketCap: 50_000_000, // 2
      });
      const input = createScoringInput(marketData, {
        unsolicited: true, // 1
        promisesHighReturns: true, // 2
        urgencyPressure: true, // 2
        secrecyInsideInfo: true, // 2
      });
      // Total: 2 + 2 + 1 + 2 + 2 + 2 = 11

      const result = await computeRiskScore(input);

      expect(result.totalScore).toBeGreaterThanOrEqual(7);
      expect(result.riskLevel).toBe("HIGH");
    });

    test("INSUFFICIENT: should return INSUFFICIENT for large liquid stocks with no behavioral flags", async () => {
      const marketData = createMockMarketData({
        lastPrice: 150,
        marketCap: 50_000_000_000, // $50B
        avgDollarVolume30d: 500_000_000, // $500M daily
        isOTC: false,
      });
      const input = createScoringInput(marketData);

      const result = await computeRiskScore(input);

      expect(result.riskLevel).toBe("INSUFFICIENT");
      expect(result.isInsufficient).toBe(true);
    });

    test("should NOT be INSUFFICIENT if behavioral flags present", async () => {
      const marketData = createMockMarketData({
        lastPrice: 150,
        marketCap: 50_000_000_000,
        avgDollarVolume30d: 500_000_000,
        isOTC: false,
      });
      const input = createScoringInput(marketData, { unsolicited: true });

      const result = await computeRiskScore(input);

      expect(result.riskLevel).not.toBe("INSUFFICIENT");
    });
  });

  describe("Score Calculation", () => {
    test("should correctly sum all signal weights", async () => {
      const marketData = createMockMarketData({
        lastPrice: 2, // 2
        marketCap: 50_000_000, // 2
        avgDollarVolume30d: 100_000, // 2
      });
      const input = createScoringInput(marketData, {
        unsolicited: true, // 1
      });
      // Expected total: 2 + 2 + 2 + 1 = 7

      const result = await computeRiskScore(input);

      expect(result.totalScore).toBe(7);
    });
  });

  describe("getSignalsByCategory", () => {
    test("should correctly categorize signals", async () => {
      const marketData = createMockMarketData({
        lastPrice: 2,
        isOTC: true,
      });
      const input = createScoringInput(marketData, {
        unsolicited: true,
        urgencyPressure: true,
      });

      const result = await computeRiskScore(input);
      const categorized = getSignalsByCategory(result.signals);

      expect(categorized.structural.length).toBeGreaterThan(0);
      expect(categorized.behavioral.length).toBe(2);
      expect(categorized.structural.every((s) => s.category === "STRUCTURAL")).toBe(true);
      expect(categorized.behavioral.every((s) => s.category === "BEHAVIORAL")).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test("should handle missing market data", async () => {
      const marketData: MarketData = {
        quote: null,
        priceHistory: [],
        isOTC: false,
        dataAvailable: false,
      };
      const input = createScoringInput(marketData);

      const result = await computeRiskScore(input);

      expect(result.riskLevel).toBe("INSUFFICIENT");
      expect(result.isInsufficient).toBe(true);
    });

    test("should handle empty pitch text", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, { pitchText: "" });

      const result = await computeRiskScore(input);

      // Should not throw, should return valid result
      expect(result.riskLevel).toBeDefined();
    });

    test("should be case-insensitive for NLP keywords", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, {
        pitchText: "GUARANTEED RETURN on this INSIDER TIP! ACT NOW!",
      });

      const result = await computeRiskScore(input);

      expect(result.signals.some((s) => s.code === SIGNAL_CODES.PROMISED_RETURNS)).toBe(true);
      expect(result.signals.some((s) => s.code === SIGNAL_CODES.SECRECY)).toBe(true);
      expect(result.signals.some((s) => s.code === SIGNAL_CODES.URGENCY)).toBe(true);
    });
  });
});
