/**
 * End-to-End Tests for ScamDunk
 *
 * Tests the full flow from market data fetching through scoring and narrative generation.
 */

import { fetchMarketData, checkAlertList, calculatePriceChange, calculateVolumeRatio, detectSpikeThenDrop } from "../lib/marketData";
import { computeRiskScore, getSignalsByCategory, SIGNAL_CODES } from "../lib/scoring";
import { generateNarrative, getQuickHeader } from "../lib/narrative";
import { ScoringInput, CheckRequest, MarketData } from "../lib/types";

describe("End-to-End Integration Tests", () => {
  describe("Market Data Module", () => {
    it("should fetch data for known mock ticker AAPL", async () => {
      const data = await fetchMarketData("AAPL");

      expect(data.dataAvailable).toBe(true);
      expect(data.quote).toBeDefined();
      expect(data.quote?.ticker).toBe("AAPL");
      expect(data.quote?.companyName).toBe("Apple Inc.");
      expect(data.quote?.exchange).toBe("NASDAQ");
      expect(data.isOTC).toBe(false);
      expect(data.priceHistory.length).toBeGreaterThan(0);
    });

    it("should fetch data for penny stock ABCD", async () => {
      const data = await fetchMarketData("ABCD");

      expect(data.dataAvailable).toBe(true);
      expect(data.quote?.lastPrice).toBeLessThan(5);
      expect(data.isOTC).toBe(true);
    });

    it("should fetch data for pump pattern stock PUMP", async () => {
      const data = await fetchMarketData("PUMP");

      expect(data.dataAvailable).toBe(true);
      expect(data.isOTC).toBe(true);
      expect(data.priceHistory.length).toBeGreaterThanOrEqual(60);
    });

    it("should generate random data for unknown tickers", async () => {
      const data = await fetchMarketData("RANDOMXYZ");

      expect(data.dataAvailable).toBe(true);
      expect(data.quote).toBeDefined();
      expect(data.quote?.ticker).toBe("RANDOMXYZ");
    });

    it("should check alert list correctly", async () => {
      expect(await checkAlertList("ALRT")).toBe(true);
      expect(await checkAlertList("SUSP")).toBe(true);
      expect(await checkAlertList("AAPL")).toBe(false);
    });

    it("should calculate price change correctly", () => {
      const history = [
        { date: "2024-01-01", open: 100, high: 102, low: 99, close: 100, volume: 1000 },
        { date: "2024-01-02", open: 100, high: 102, low: 99, close: 100, volume: 1000 },
        { date: "2024-01-03", open: 100, high: 102, low: 99, close: 100, volume: 1000 },
        { date: "2024-01-04", open: 100, high: 102, low: 99, close: 100, volume: 1000 },
        { date: "2024-01-05", open: 100, high: 102, low: 99, close: 100, volume: 1000 },
        { date: "2024-01-06", open: 100, high: 102, low: 99, close: 100, volume: 1000 },
        { date: "2024-01-07", open: 100, high: 102, low: 99, close: 100, volume: 1000 },
        { date: "2024-01-08", open: 150, high: 155, low: 145, close: 150, volume: 1000 }, // 50% up
      ];

      const change = calculatePriceChange(history, 7);
      expect(change).toBe(50);
    });
  });

  describe("Full Scoring Flow", () => {
    it("should score a safe large-cap stock as INSUFFICIENT", async () => {
      const marketData = await fetchMarketData("AAPL");
      const context: CheckRequest["context"] = {
        unsolicited: false,
        promisesHighReturns: false,
        urgencyPressure: false,
        secrecyInsideInfo: false,
      };

      const input: ScoringInput = {
        marketData,
        pitchText: "Apple reported strong earnings this quarter.",
        context,
      };

      const result = await computeRiskScore(input);

      expect(result.riskLevel).toBe("INSUFFICIENT");
      expect(result.totalScore).toBeLessThanOrEqual(2);
    });

    it("should score OTC penny stock as HIGH risk", async () => {
      const marketData = await fetchMarketData("ABCD");
      const context: CheckRequest["context"] = {
        unsolicited: true,
        promisesHighReturns: true,
        urgencyPressure: true,
        secrecyInsideInfo: true,
      };

      const input: ScoringInput = {
        marketData,
        pitchText: "This stock is going to 10x! Act now before it's too late! Guaranteed returns!",
        context,
      };

      const result = await computeRiskScore(input);

      expect(result.riskLevel).toBe("HIGH");
      expect(result.totalScore).toBeGreaterThanOrEqual(7);

      // Check for expected signals
      const signalCodes = result.signals.map(s => s.code);
      expect(signalCodes).toContain(SIGNAL_CODES.MICROCAP_PRICE);
      expect(signalCodes).toContain(SIGNAL_CODES.OTC_EXCHANGE);
      expect(signalCodes).toContain(SIGNAL_CODES.UNSOLICITED);
      expect(signalCodes).toContain(SIGNAL_CODES.PROMISED_RETURNS);
      expect(signalCodes).toContain(SIGNAL_CODES.URGENCY);
    });

    it("should detect NLP keywords correctly", async () => {
      const marketData = await fetchMarketData("MSFT");
      const context: CheckRequest["context"] = {
        unsolicited: false,
        promisesHighReturns: false,
        urgencyPressure: false,
        secrecyInsideInfo: false,
      };

      const input: ScoringInput = {
        marketData,
        pitchText: "I have insider information about this stock. It's going to 50% in 2 days. Act fast before it's too late!",
        context,
      };

      const result = await computeRiskScore(input);

      const signalCodes = result.signals.map(s => s.code);
      expect(signalCodes).toContain(SIGNAL_CODES.SECRECY); // "insider"
      expect(signalCodes).toContain(SIGNAL_CODES.SPECIFIC_RETURN_CLAIM); // "50% in 2 days"
      expect(signalCodes).toContain(SIGNAL_CODES.URGENCY); // "act fast"
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

      const signalCodes = result.signals.map(s => s.code);
      expect(signalCodes).toContain(SIGNAL_CODES.ALERT_LIST_HIT);
      expect(result.riskLevel).toBe("HIGH");
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
      // Fallback narrative uses "Unable to provide" instead of "insufficient"
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
      const marketData = await fetchMarketData("SCAM");
      const context: CheckRequest["context"] = {
        unsolicited: true,
        promisesHighReturns: true,
        urgencyPressure: true,
        secrecyInsideInfo: true,
      };

      const input: ScoringInput = {
        marketData,
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

      // Should be HIGH risk
      expect(result.riskLevel).toBe("HIGH");

      // Should detect multiple behavioral signals
      const signalCodes = result.signals.map(s => s.code);
      expect(signalCodes).toContain(SIGNAL_CODES.UNSOLICITED);
      expect(signalCodes).toContain(SIGNAL_CODES.PROMISED_RETURNS);
      expect(signalCodes).toContain(SIGNAL_CODES.URGENCY);
      expect(signalCodes).toContain(SIGNAL_CODES.SECRECY);

      // Generate narrative
      const stockSummary = {
        ticker: marketData.quote!.ticker,
        companyName: marketData.quote!.companyName,
        exchange: marketData.quote!.exchange,
        lastPrice: marketData.quote!.lastPrice,
        marketCap: marketData.quote!.marketCap,
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
      const marketData = await fetchMarketData("AAPL");
      const context: CheckRequest["context"] = {
        unsolicited: false,
        promisesHighReturns: false,
        urgencyPressure: false,
        secrecyInsideInfo: false,
      };

      const input: ScoringInput = {
        marketData,
        pitchText: `
          Apple reported quarterly earnings yesterday. Revenue was up 5% year over year.
          The iPhone sales beat analyst expectations. Services revenue continues to grow.
          You might want to look at the full 10-K filing for more details.
        `,
        context,
      };

      const result = await computeRiskScore(input);

      // Should be INSUFFICIENT (large cap, no red flags)
      expect(result.riskLevel).toBe("INSUFFICIENT");
      expect(result.signals.filter(s => s.category === "BEHAVIORAL").length).toBe(0);
    });

    it("Scenario: Subtle manipulation with real ticker", async () => {
      const marketData = await fetchMarketData("MSFT");
      const context: CheckRequest["context"] = {
        unsolicited: true,
        promisesHighReturns: false,
        urgencyPressure: false,
        secrecyInsideInfo: false,
      };

      const input: ScoringInput = {
        marketData,
        pitchText: `
          Hey, I have insider info from Microsoft. They said something big is coming.
          Not financial advice, but I'm putting my whole portfolio in this.
          The announcement should come in a few days - act fast!
        `,
        context,
      };

      const result = await computeRiskScore(input);

      // Should detect secrecy/insider info from NLP (needs keyword "insider")
      const signalCodes = result.signals.map(s => s.code);
      expect(signalCodes).toContain(SIGNAL_CODES.UNSOLICITED);
      expect(signalCodes).toContain(SIGNAL_CODES.SECRECY); // "insider info"
      expect(signalCodes).toContain(SIGNAL_CODES.URGENCY); // "act fast"
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty pitch text", async () => {
      const marketData = await fetchMarketData("AAPL");
      const context: CheckRequest["context"] = {
        unsolicited: false,
        promisesHighReturns: false,
        urgencyPressure: false,
        secrecyInsideInfo: false,
      };

      const input: ScoringInput = {
        marketData,
        pitchText: "",
        context,
      };

      const result = await computeRiskScore(input);
      expect(result).toBeDefined();
      expect(result.riskLevel).toBeDefined();
    });

    it("should handle ticker with different cases", async () => {
      const data1 = await fetchMarketData("aapl");
      const data2 = await fetchMarketData("AAPL");
      const data3 = await fetchMarketData("AaPl");

      expect(data1.quote?.ticker).toBe("AAPL");
      expect(data2.quote?.ticker).toBe("AAPL");
      expect(data3.quote?.ticker).toBe("AAPL");
    });

    it("should handle all behavioral flags without market data issues", async () => {
      const marketData = await fetchMarketData("MSFT");
      const context: CheckRequest["context"] = {
        unsolicited: true,
        promisesHighReturns: true,
        urgencyPressure: true,
        secrecyInsideInfo: true,
      };

      const input: ScoringInput = {
        marketData,
        pitchText: "Just a normal message",
        context,
      };

      const result = await computeRiskScore(input);

      // All behavioral flags should trigger their signals
      const behavioralSignals = result.signals.filter(s => s.category === "BEHAVIORAL");
      expect(behavioralSignals.length).toBe(4);
    });
  });
});
