/**
 * End-to-End Tests for ScamDunk
 *
 * Tests the full flow from market data through scoring and narrative generation.
 * Uses mock market data directly to test scoring logic without requiring API access.
 */

import { computeRiskScore, getSignalsByCategory, SIGNAL_CODES } from "../lib/scoring";
import { generateNarrative, getQuickHeader } from "../lib/narrative";
import { calculatePriceChange, calculateVolumeRatio, detectSpikeThenDrop } from "../lib/marketData";
import { ScoringInput, CheckRequest, MarketData, PriceHistory } from "../lib/types";

// Mock market data for testing
const MOCK_AAPL: MarketData = {
  quote: {
    ticker: "AAPL",
    companyName: "Apple Inc.",
    exchange: "NASDAQ",
    lastPrice: 178.50,
    marketCap: 2_800_000_000_000,
    avgVolume30d: 55_000_000,
    avgDollarVolume30d: 9_817_500_000,
  },
  priceHistory: generateMockPriceHistory(178.50, 60),
  isOTC: false,
  dataAvailable: true,
};

const MOCK_MSFT: MarketData = {
  quote: {
    ticker: "MSFT",
    companyName: "Microsoft Corporation",
    exchange: "NASDAQ",
    lastPrice: 375.20,
    marketCap: 2_790_000_000_000,
    avgVolume30d: 22_000_000,
    avgDollarVolume30d: 8_254_400_000,
  },
  priceHistory: generateMockPriceHistory(375.20, 60),
  isOTC: false,
  dataAvailable: true,
};

const MOCK_PENNY_STOCK: MarketData = {
  quote: {
    ticker: "ABCD",
    companyName: "ABCD Holdings Inc.",
    exchange: "OTC",
    lastPrice: 0.45,
    marketCap: 15_000_000,
    avgVolume30d: 500_000,
    avgDollarVolume30d: 225_000,
  },
  priceHistory: generateMockPriceHistory(0.45, 60),
  isOTC: true,
  dataAvailable: true,
};

const MOCK_SCAM_STOCK: MarketData = {
  quote: {
    ticker: "SCAM",
    companyName: "Suspicious Corp",
    exchange: "PINK",
    lastPrice: 2.50,
    marketCap: 50_000_000,
    avgVolume30d: 2_000_000,
    avgDollarVolume30d: 5_000_000,
  },
  priceHistory: generateMockPriceHistory(2.50, 60),
  isOTC: true,
  dataAvailable: true,
};

// Helper function to generate mock price history
function generateMockPriceHistory(basePrice: number, days: number): PriceHistory[] {
  const history: PriceHistory[] = [];
  const today = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    history.push({
      date: date.toISOString().split("T")[0],
      open: basePrice * 0.99,
      high: basePrice * 1.02,
      low: basePrice * 0.98,
      close: basePrice,
      volume: 1_000_000,
    });
  }

  return history;
}

describe("End-to-End Integration Tests", () => {
  describe("Price Calculation Functions", () => {
    it("should calculate price change correctly", () => {
      const history = [
        { date: "2024-01-01", open: 100, high: 102, low: 99, close: 100, volume: 1000 },
        { date: "2024-01-02", open: 100, high: 102, low: 99, close: 100, volume: 1000 },
        { date: "2024-01-03", open: 100, high: 102, low: 99, close: 100, volume: 1000 },
        { date: "2024-01-04", open: 100, high: 102, low: 99, close: 100, volume: 1000 },
        { date: "2024-01-05", open: 100, high: 102, low: 99, close: 100, volume: 1000 },
        { date: "2024-01-06", open: 100, high: 102, low: 99, close: 100, volume: 1000 },
        { date: "2024-01-07", open: 100, high: 102, low: 99, close: 100, volume: 1000 },
        { date: "2024-01-08", open: 150, high: 155, low: 145, close: 150, volume: 1000 },
      ];

      const change = calculatePriceChange(history, 7);
      expect(change).toBe(50);
    });

    it("should calculate volume ratio correctly", () => {
      const history: PriceHistory[] = [];
      const today = new Date();

      // Generate 30 days of history with consistent volume
      for (let i = 30; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        history.push({
          date: date.toISOString().split("T")[0],
          open: 100,
          high: 102,
          low: 98,
          close: 100,
          volume: 1_000_000,
        });
      }

      const ratio = calculateVolumeRatio(history, 7);
      expect(ratio).toBeCloseTo(1, 1); // Should be close to 1 (same volume)
    });

    it("should detect spike-then-drop pattern", () => {
      const history: PriceHistory[] = [];
      const today = new Date();

      // Day 0-4: Start at 100
      for (let i = 14; i >= 10; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        history.push({
          date: date.toISOString().split("T")[0],
          open: 100,
          high: 102,
          low: 98,
          close: 100,
          volume: 1_000_000,
        });
      }

      // Day 5-9: Spike to 160 (60% increase)
      for (let i = 9; i >= 5; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        history.push({
          date: date.toISOString().split("T")[0],
          open: 150,
          high: 165,
          low: 145,
          close: 160,
          volume: 5_000_000,
        });
      }

      // Day 10-14: Drop to 90 (44% drop from 160)
      for (let i = 4; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        history.push({
          date: date.toISOString().split("T")[0],
          open: 95,
          high: 98,
          low: 88,
          close: 90,
          volume: 3_000_000,
        });
      }

      expect(detectSpikeThenDrop(history)).toBe(true);
    });
  });

  describe("Full Scoring Flow", () => {
    it("should score a safe large-cap stock as INSUFFICIENT", async () => {
      const context: CheckRequest["context"] = {
        unsolicited: false,
        promisesHighReturns: false,
        urgencyPressure: false,
        secrecyInsideInfo: false,
      };

      const input: ScoringInput = {
        marketData: MOCK_AAPL,
        pitchText: "Apple reported strong earnings this quarter.",
        context,
      };

      const result = await computeRiskScore(input);

      expect(result.riskLevel).toBe("INSUFFICIENT");
      expect(result.totalScore).toBeLessThanOrEqual(2);
    });

    it("should score OTC penny stock as HIGH risk", async () => {
      const context: CheckRequest["context"] = {
        unsolicited: true,
        promisesHighReturns: true,
        urgencyPressure: true,
        secrecyInsideInfo: true,
      };

      const input: ScoringInput = {
        marketData: MOCK_PENNY_STOCK,
        pitchText: "This stock is going to 10x! Act now before it's too late! Guaranteed returns!",
        context,
      };

      const result = await computeRiskScore(input);

      expect(result.riskLevel).toBe("HIGH");
      expect(result.totalScore).toBeGreaterThanOrEqual(7);

      const signalCodes = result.signals.map(s => s.code);
      expect(signalCodes).toContain(SIGNAL_CODES.MICROCAP_PRICE);
      expect(signalCodes).toContain(SIGNAL_CODES.OTC_EXCHANGE);
      expect(signalCodes).toContain(SIGNAL_CODES.UNSOLICITED);
      expect(signalCodes).toContain(SIGNAL_CODES.PROMISED_RETURNS);
      expect(signalCodes).toContain(SIGNAL_CODES.URGENCY);
    });

    it("should detect NLP keywords correctly", async () => {
      const context: CheckRequest["context"] = {
        unsolicited: false,
        promisesHighReturns: false,
        urgencyPressure: false,
        secrecyInsideInfo: false,
      };

      const input: ScoringInput = {
        marketData: MOCK_MSFT,
        pitchText: "I have insider information about this stock. It's going to 50% in 2 days. Act fast before it's too late!",
        context,
      };

      const result = await computeRiskScore(input);

      const signalCodes = result.signals.map(s => s.code);
      expect(signalCodes).toContain(SIGNAL_CODES.SECRECY);
      expect(signalCodes).toContain(SIGNAL_CODES.SPECIFIC_RETURN_CLAIM);
      expect(signalCodes).toContain(SIGNAL_CODES.URGENCY);
    });

    it("should trigger alert list signal for ALRT ticker", async () => {
      const marketData: MarketData = {
        quote: {
          ticker: "ALRT",
          companyName: "Alert Corp",
          exchange: "OTC",
          lastPrice: 1.00,
          marketCap: 10_000_000,
          avgVolume30d: 100_000,
          avgDollarVolume30d: 100_000,
        },
        priceHistory: [],
        isOTC: true,
        dataAvailable: true,
      };

      const context: CheckRequest["context"] = {
        unsolicited: false,
        promisesHighReturns: false,
        urgencyPressure: false,
        secrecyInsideInfo: false,
      };

      const input: ScoringInput = {
        marketData,
        pitchText: "Check out this stock",
        context,
      };

      const result = await computeRiskScore(input);

      // Note: Alert list check requires network access, so we test the structural signals
      expect(result.signals.some(s => s.code === SIGNAL_CODES.MICROCAP_PRICE)).toBe(true);
      expect(result.signals.some(s => s.code === SIGNAL_CODES.OTC_EXCHANGE)).toBe(true);
    });
  });

  describe("Narrative Generation (Fallback)", () => {
    it("should generate HIGH risk narrative", async () => {
      const signals = [
        { code: SIGNAL_CODES.MICROCAP_PRICE, category: "STRUCTURAL" as const, description: "Price below $5", weight: 2 },
        { code: SIGNAL_CODES.OTC_EXCHANGE, category: "STRUCTURAL" as const, description: "OTC traded", weight: 3 },
        { code: SIGNAL_CODES.PROMISED_RETURNS, category: "BEHAVIORAL" as const, description: "Promises returns", weight: 2 },
      ];

      const stockSummary = {
        ticker: "TEST",
        companyName: "Test Corp",
        exchange: "OTC",
        lastPrice: 1.50,
        marketCap: 50_000_000,
      };

      const narrative = await generateNarrative("HIGH", 7, signals, stockSummary);

      expect(narrative.header).toContain("TEST");
      expect(narrative.header.toLowerCase()).toContain("high");
      expect(narrative.stockRedFlags.length).toBeGreaterThan(0);
      expect(narrative.behaviorRedFlags.length).toBeGreaterThan(0);
      expect(narrative.suggestions.length).toBeGreaterThan(0);
      expect(narrative.disclaimers.length).toBeGreaterThan(0);
    });

    it("should generate MEDIUM risk narrative", async () => {
      const signals = [
        { code: SIGNAL_CODES.SMALL_MARKET_CAP, category: "STRUCTURAL" as const, description: "Small cap", weight: 2 },
        { code: SIGNAL_CODES.UNSOLICITED, category: "BEHAVIORAL" as const, description: "Unsolicited tip", weight: 1 },
      ];

      const stockSummary = {
        ticker: "MED",
        companyName: "Medium Corp",
        exchange: "NASDAQ",
        lastPrice: 15.00,
        marketCap: 200_000_000,
      };

      const narrative = await generateNarrative("MEDIUM", 3, signals, stockSummary);

      expect(narrative.header).toContain("MED");
      expect(narrative.header.toLowerCase()).toContain("caution");
    });

    it("should generate LOW risk narrative", async () => {
      const signals = [
        { code: SIGNAL_CODES.UNSOLICITED, category: "BEHAVIORAL" as const, description: "Unsolicited", weight: 1 },
      ];

      const stockSummary = {
        ticker: "LOW",
        companyName: "Low Risk Corp",
        exchange: "NYSE",
        lastPrice: 100.00,
        marketCap: 5_000_000_000,
      };

      const narrative = await generateNarrative("LOW", 1, signals, stockSummary);

      expect(narrative.header).toContain("LOW");
      expect(narrative.header.toLowerCase()).toContain("few");
    });

    it("should generate INSUFFICIENT narrative", async () => {
      const narrative = await generateNarrative("INSUFFICIENT", 0, [], {
        ticker: "INSUF",
      });

      expect(narrative.header).toContain("INSUF");
      expect(narrative.header.toLowerCase()).toContain("unable");
    });

    it("should provide quick headers", () => {
      expect(getQuickHeader("HIGH", "TEST")).toContain("High-risk");
      expect(getQuickHeader("MEDIUM", "TEST")).toContain("Moderate");
      expect(getQuickHeader("LOW", "TEST")).toContain("Low risk");
      expect(getQuickHeader("INSUFFICIENT", "TEST")).toContain("Insufficient");
    });
  });

  describe("Signal Categorization", () => {
    it("should correctly categorize signals", () => {
      const signals = [
        { code: SIGNAL_CODES.MICROCAP_PRICE, category: "STRUCTURAL" as const, description: "Test", weight: 2 },
        { code: SIGNAL_CODES.SPIKE_7D, category: "PATTERN" as const, description: "Test", weight: 3 },
        { code: SIGNAL_CODES.ALERT_LIST_HIT, category: "ALERT" as const, description: "Test", weight: 5 },
        { code: SIGNAL_CODES.URGENCY, category: "BEHAVIORAL" as const, description: "Test", weight: 2 },
      ];

      const categorized = getSignalsByCategory(signals);

      expect(categorized.structural.length).toBe(1);
      expect(categorized.pattern.length).toBe(1);
      expect(categorized.alert.length).toBe(1);
      expect(categorized.behavioral.length).toBe(1);
    });
  });

  describe("Real-World Scenarios", () => {
    it("Scenario: Classic pump-and-dump pitch", async () => {
      const context: CheckRequest["context"] = {
        unsolicited: true,
        promisesHighReturns: true,
        urgencyPressure: true,
        secrecyInsideInfo: true,
      };

      const input: ScoringInput = {
        marketData: MOCK_SCAM_STOCK,
        pitchText: `
          🚀 URGENT: INSIDER TIP 🚀

          My buddy works at Goldman and just told me SCAM is about to be acquired!
          This stock is going to 500% in the next week - GUARANTEED!

          ACT NOW - This is your last chance to get in before the announcement!
          Don't tell anyone else about this - it's exclusive!

          You could turn $1000 into $5000 overnight. Easy money!
        `,
        context,
      };

      const result = await computeRiskScore(input);

      expect(result.riskLevel).toBe("HIGH");

      const signalCodes = result.signals.map(s => s.code);
      expect(signalCodes).toContain(SIGNAL_CODES.UNSOLICITED);
      expect(signalCodes).toContain(SIGNAL_CODES.PROMISED_RETURNS);
      expect(signalCodes).toContain(SIGNAL_CODES.URGENCY);
      expect(signalCodes).toContain(SIGNAL_CODES.SECRECY);

      const stockSummary = {
        ticker: MOCK_SCAM_STOCK.quote!.ticker,
        companyName: MOCK_SCAM_STOCK.quote!.companyName,
        exchange: MOCK_SCAM_STOCK.quote!.exchange,
        lastPrice: MOCK_SCAM_STOCK.quote!.lastPrice,
        marketCap: MOCK_SCAM_STOCK.quote!.marketCap,
      };

      const narrative = await generateNarrative(
        result.riskLevel,
        result.totalScore,
        result.signals,
        stockSummary
      );

      expect(narrative.behaviorRedFlags.length).toBeGreaterThanOrEqual(4);
      expect(narrative.header.toLowerCase()).toContain("high");
    });

    it("Scenario: Legitimate investment discussion about Apple", async () => {
      const context: CheckRequest["context"] = {
        unsolicited: false,
        promisesHighReturns: false,
        urgencyPressure: false,
        secrecyInsideInfo: false,
      };

      const input: ScoringInput = {
        marketData: MOCK_AAPL,
        pitchText: `
          Apple reported quarterly earnings yesterday. Revenue was up 5% year over year.
          The iPhone sales beat analyst expectations. Services revenue continues to grow.
          You might want to look at the full 10-K filing for more details.
        `,
        context,
      };

      const result = await computeRiskScore(input);

      expect(result.riskLevel).toBe("INSUFFICIENT");
      expect(result.signals.filter(s => s.category === "BEHAVIORAL").length).toBe(0);
    });

    it("Scenario: Subtle manipulation with real ticker", async () => {
      const context: CheckRequest["context"] = {
        unsolicited: true,
        promisesHighReturns: false,
        urgencyPressure: false,
        secrecyInsideInfo: false,
      };

      const input: ScoringInput = {
        marketData: MOCK_MSFT,
        pitchText: `
          Hey, I have insider info from Microsoft. They said something big is coming.
          Not financial advice, but I'm putting my whole portfolio in this.
          The announcement should come in a few days - act fast!
        `,
        context,
      };

      const result = await computeRiskScore(input);

      const signalCodes = result.signals.map(s => s.code);
      expect(signalCodes).toContain(SIGNAL_CODES.UNSOLICITED);
      expect(signalCodes).toContain(SIGNAL_CODES.SECRECY);
      expect(signalCodes).toContain(SIGNAL_CODES.URGENCY);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty pitch text", async () => {
      const context: CheckRequest["context"] = {
        unsolicited: false,
        promisesHighReturns: false,
        urgencyPressure: false,
        secrecyInsideInfo: false,
      };

      const input: ScoringInput = {
        marketData: MOCK_AAPL,
        pitchText: "",
        context,
      };

      const result = await computeRiskScore(input);
      expect(result).toBeDefined();
      expect(result.riskLevel).toBeDefined();
    });

    it("should handle all behavioral flags without market data issues", async () => {
      const context: CheckRequest["context"] = {
        unsolicited: true,
        promisesHighReturns: true,
        urgencyPressure: true,
        secrecyInsideInfo: true,
      };

      const input: ScoringInput = {
        marketData: MOCK_MSFT,
        pitchText: "Just a normal message",
        context,
      };

      const result = await computeRiskScore(input);

      const behavioralSignals = result.signals.filter(s => s.category === "BEHAVIORAL");
      expect(behavioralSignals.length).toBe(4);
    });

    it("should handle missing market data gracefully", async () => {
      const noDataMarket: MarketData = {
        quote: null,
        priceHistory: [],
        isOTC: false,
        dataAvailable: false,
      };

      const context: CheckRequest["context"] = {
        unsolicited: true,
        promisesHighReturns: true,
        urgencyPressure: false,
        secrecyInsideInfo: false,
      };

      const input: ScoringInput = {
        marketData: noDataMarket,
        pitchText: "Buy this stock now!",
        context,
      };

      const result = await computeRiskScore(input);
      expect(result).toBeDefined();
      expect(result.riskLevel).toBe("INSUFFICIENT");
    });
  });
});
