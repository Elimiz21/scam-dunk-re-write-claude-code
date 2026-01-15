/**
 * Unit tests for the crypto risk scoring module
 */

import {
  computeCryptoRiskScore,
  CRYPTO_SIGNAL_CODES,
  getCryptoSignalsByCategory,
} from "../lib/crypto/scoring";
import {
  CryptoMarketData,
  CryptoScoringInput,
  CryptoPriceHistory,
  CryptoQuote,
  CryptoSecurityData,
  GoPlusTokenSecurity,
} from "../lib/crypto/types";

// Helper to create mock crypto quote
function createMockCryptoQuote(
  overrides: Partial<CryptoQuote> = {}
): CryptoQuote {
  return {
    id: "test-token",
    symbol: "TEST",
    name: "Test Token",
    currentPrice: overrides.currentPrice ?? 1.5,
    marketCap: overrides.marketCap ?? 100_000_000,
    marketCapRank: overrides.marketCapRank ?? 500,
    fullyDilutedValuation: overrides.fullyDilutedValuation ?? 150_000_000,
    totalVolume24h: overrides.totalVolume24h ?? 5_000_000,
    priceChange24h: overrides.priceChange24h ?? 0.05,
    priceChangePercentage24h: overrides.priceChangePercentage24h ?? 3.5,
    priceChangePercentage7d: overrides.priceChangePercentage7d ?? 15,
    priceChangePercentage30d: overrides.priceChangePercentage30d ?? 25,
    circulatingSupply: overrides.circulatingSupply ?? 100_000_000,
    totalSupply: overrides.totalSupply ?? 150_000_000,
    maxSupply: overrides.maxSupply ?? 200_000_000,
    ath: overrides.ath ?? 5,
    athChangePercentage: overrides.athChangePercentage ?? -70,
    athDate: overrides.athDate ?? "2024-01-01",
    atl: overrides.atl ?? 0.1,
    atlChangePercentage: overrides.atlChangePercentage ?? 1400,
    atlDate: overrides.atlDate ?? "2023-01-01",
    lastUpdated: overrides.lastUpdated ?? new Date().toISOString(),
    ...overrides,
  };
}

// Helper to create mock price history
function createMockPriceHistory(days: number = 30): CryptoPriceHistory[] {
  const history: CryptoPriceHistory[] = [];
  const now = Date.now();
  for (let i = days; i >= 0; i--) {
    history.push({
      timestamp: now - i * 24 * 60 * 60 * 1000,
      price: 1.5,
      marketCap: 100_000_000,
      volume: 5_000_000,
    });
  }
  return history;
}

// Helper to create mock GoPlus security data
function createMockSecurityData(
  overrides: Partial<GoPlusTokenSecurity> = {}
): GoPlusTokenSecurity {
  return {
    isOpenSource: overrides.isOpenSource ?? true,
    isProxy: overrides.isProxy ?? false,
    isMintable: overrides.isMintable ?? false,
    canTakeBackOwnership: overrides.canTakeBackOwnership ?? false,
    ownerChangeBalance: overrides.ownerChangeBalance ?? false,
    hiddenOwner: overrides.hiddenOwner ?? false,
    selfDestruct: overrides.selfDestruct ?? false,
    externalCall: overrides.externalCall ?? false,
    isHoneypot: overrides.isHoneypot ?? false,
    buyTax: overrides.buyTax ?? 0,
    sellTax: overrides.sellTax ?? 0,
    cannotBuy: overrides.cannotBuy ?? false,
    cannotSellAll: overrides.cannotSellAll ?? false,
    tradingCooldown: overrides.tradingCooldown ?? false,
    isAntiWhale: overrides.isAntiWhale ?? false,
    slippageModifiable: overrides.slippageModifiable ?? false,
    isBlacklisted: overrides.isBlacklisted ?? false,
    holderCount: overrides.holderCount ?? 5000,
    totalSupply: overrides.totalSupply ?? "100000000",
    creatorAddress: overrides.creatorAddress ?? "0x1234",
    creatorPercent: overrides.creatorPercent ?? 5,
    ownerAddress: overrides.ownerAddress ?? "0x5678",
    ownerPercent: overrides.ownerPercent ?? 0,
    lpHolderCount: overrides.lpHolderCount ?? 10,
    lpTotalSupply: overrides.lpTotalSupply ?? "1000000",
    isLpLocked: overrides.isLpLocked ?? true,
    lpLockedPercent: overrides.lpLockedPercent ?? 80,
    trustList: overrides.trustList ?? false,
    isInDex: overrides.isInDex ?? true,
    dexInfo: overrides.dexInfo ?? [{ name: "Uniswap", liquidity: "500000", pair: "TEST/ETH" }],
    topHolders: overrides.topHolders ?? [
      { address: "0xabc", percent: 10, isContract: false, isLocked: false },
      { address: "0xdef", percent: 8, isContract: false, isLocked: false },
    ],
  };
}

// Helper to create mock market data
function createMockMarketData(
  overrides: Partial<{
    quote: Partial<CryptoQuote>;
    priceHistory: CryptoPriceHistory[];
    securityData: Partial<GoPlusTokenSecurity>;
    dataAvailable: boolean;
  }> = {}
): CryptoMarketData {
  return {
    quote: overrides.quote !== null ? createMockCryptoQuote(overrides.quote) : null,
    priceHistory: overrides.priceHistory ?? createMockPriceHistory(),
    securityData: overrides.securityData !== null
      ? {
          tokenSecurity: createMockSecurityData(overrides.securityData),
          securityAvailable: true,
          chain: "ethereum",
          contractAddress: "0x123456789",
        }
      : null,
    dataAvailable: overrides.dataAvailable ?? true,
  };
}

// Helper to create scoring input
function createScoringInput(
  marketData: CryptoMarketData,
  overrides: Partial<{
    pitchText: string;
    unsolicited: boolean;
    promisesHighReturns: boolean;
    urgencyPressure: boolean;
    secrecyInsideInfo: boolean;
  }> = {}
): CryptoScoringInput {
  return {
    marketData,
    pitchText: overrides.pitchText ?? "",
    context: {
      unsolicited: overrides.unsolicited ?? false,
      promisesHighReturns: overrides.promisesHighReturns ?? false,
      urgencyPressure: overrides.urgencyPressure ?? false,
      secrecyInsideInfo: overrides.secrecyInsideInfo ?? false,
    },
  };
}

describe("Crypto Risk Scoring Module", () => {
  describe("Market/Structural Signals", () => {
    test("MICRO_MARKET_CAP: should trigger when marketCap < $10M", async () => {
      const marketData = createMockMarketData({
        quote: { marketCap: 5_000_000 },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.MICRO_MARKET_CAP)).toBe(true);
      const signal = result.signals.find((s) => s.code === CRYPTO_SIGNAL_CODES.MICRO_MARKET_CAP);
      expect(signal?.weight).toBe(3);
      expect(signal?.category).toBe("STRUCTURAL");
    });

    test("LOW_VOLUME: should trigger when totalVolume24h < $100K", async () => {
      const marketData = createMockMarketData({
        quote: { totalVolume24h: 50_000 },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.LOW_VOLUME)).toBe(true);
      const signal = result.signals.find((s) => s.code === CRYPTO_SIGNAL_CODES.LOW_VOLUME);
      expect(signal?.weight).toBe(2);
    });

    test("UNRANKED: should trigger when marketCapRank > 2000 or null", async () => {
      const marketData = createMockMarketData({
        quote: { marketCapRank: null },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.UNRANKED)).toBe(true);
    });
  });

  describe("Pattern Signals", () => {
    test("PRICE_SPIKE_24H: should trigger for >50% 24h change", async () => {
      const marketData = createMockMarketData({
        quote: { priceChangePercentage24h: 75 },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.PRICE_SPIKE_24H)).toBe(true);
      const signal = result.signals.find((s) => s.code === CRYPTO_SIGNAL_CODES.PRICE_SPIKE_24H);
      expect(signal?.weight).toBe(3);
    });

    test("PRICE_SPIKE_7D: should trigger for >200% 7d change", async () => {
      const marketData = createMockMarketData({
        quote: { priceChangePercentage7d: 250 },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.PRICE_SPIKE_7D)).toBe(true);
      const signal = result.signals.find((s) => s.code === CRYPTO_SIGNAL_CODES.PRICE_SPIKE_7D);
      expect(signal?.weight).toBe(4);
    });

    test("NEAR_ATH: should trigger when price is within 5% of ATH", async () => {
      const marketData = createMockMarketData({
        quote: { athChangePercentage: -3 },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.NEAR_ATH)).toBe(true);
    });

    test("DOWN_FROM_ATH: should trigger when price is >90% down from ATH", async () => {
      const marketData = createMockMarketData({
        quote: { athChangePercentage: -95 },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.DOWN_FROM_ATH)).toBe(true);
    });
  });

  describe("Contract Security Signals", () => {
    test("HONEYPOT: should trigger when isHoneypot is true", async () => {
      const marketData = createMockMarketData({
        securityData: { isHoneypot: true },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.HONEYPOT)).toBe(true);
      const signal = result.signals.find((s) => s.code === CRYPTO_SIGNAL_CODES.HONEYPOT);
      expect(signal?.weight).toBe(10);
      expect(result.riskLevel).toBe("HIGH");
    });

    test("OWNER_CAN_CHANGE_BALANCE: should trigger and result in HIGH risk", async () => {
      const marketData = createMockMarketData({
        securityData: { ownerChangeBalance: true },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.OWNER_CAN_CHANGE_BALANCE)).toBe(true);
      expect(result.riskLevel).toBe("HIGH");
    });

    test("MINTABLE: should trigger when isMintable is true", async () => {
      const marketData = createMockMarketData({
        securityData: { isMintable: true },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.MINTABLE)).toBe(true);
      const signal = result.signals.find((s) => s.code === CRYPTO_SIGNAL_CODES.MINTABLE);
      expect(signal?.weight).toBe(4);
    });

    test("NOT_OPEN_SOURCE: should trigger when isOpenSource is false", async () => {
      const marketData = createMockMarketData({
        securityData: { isOpenSource: false },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.NOT_OPEN_SOURCE)).toBe(true);
    });

    test("HIGH_SELL_TAX: should trigger when sellTax >= 25%", async () => {
      const marketData = createMockMarketData({
        securityData: { sellTax: 30 },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.HIGH_SELL_TAX)).toBe(true);
      const signal = result.signals.find((s) => s.code === CRYPTO_SIGNAL_CODES.HIGH_SELL_TAX);
      expect(signal?.weight).toBe(4);
    });
  });

  describe("Liquidity/Distribution Signals", () => {
    test("LP_NOT_LOCKED: should trigger when liquidity is not locked", async () => {
      const marketData = createMockMarketData({
        securityData: { isLpLocked: false, isInDex: true },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.LP_NOT_LOCKED)).toBe(true);
      const signal = result.signals.find((s) => s.code === CRYPTO_SIGNAL_CODES.LP_NOT_LOCKED);
      expect(signal?.weight).toBe(5);
    });

    test("HIGH_HOLDER_CONCENTRATION: should trigger when top holders have >70%", async () => {
      const marketData = createMockMarketData({
        securityData: {
          topHolders: [
            { address: "0x1", percent: 40, isContract: false, isLocked: false },
            { address: "0x2", percent: 35, isContract: false, isLocked: false },
          ],
        },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.HIGH_HOLDER_CONCENTRATION)).toBe(true);
    });

    test("HIGH_CREATOR_HOLDINGS: should trigger when creator holds >20%", async () => {
      const marketData = createMockMarketData({
        securityData: { creatorPercent: 25 },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.HIGH_CREATOR_HOLDINGS)).toBe(true);
    });
  });

  describe("Behavioral Signals", () => {
    test("UNSOLICITED: should trigger when context.unsolicited is true", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, { unsolicited: true });

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.UNSOLICITED)).toBe(true);
      expect(result.signals.find((s) => s.code === CRYPTO_SIGNAL_CODES.UNSOLICITED)?.category).toBe("BEHAVIORAL");
    });

    test("PROMISED_RETURNS: should trigger from context or NLP", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, {
        pitchText: "This coin is going to moon! 100x guaranteed!",
      });

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.PROMISED_RETURNS)).toBe(true);
    });

    test("URGENCY: should trigger from context or NLP", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, {
        pitchText: "Buy now before it moons! FOMO alert!",
      });

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.URGENCY)).toBe(true);
    });

    test("SECRECY: should trigger for 'alpha' keyword", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, {
        pitchText: "I got some alpha from the dev team about this token",
      });

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.SECRECY)).toBe(true);
    });
  });

  describe("Risk Level Calculation", () => {
    test("LOW: should return LOW for score < 5", async () => {
      const marketData = createMockMarketData({
        quote: { marketCap: 500_000_000, totalVolume24h: 10_000_000, marketCapRank: 100 },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.totalScore).toBeLessThan(5);
      expect(result.riskLevel).toBe("LOW");
    });

    test("MEDIUM: should return MEDIUM for score 5-9", async () => {
      const marketData = createMockMarketData({
        quote: { marketCap: 5_000_000 }, // 3 points
        securityData: { isOpenSource: false }, // 3 points
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.totalScore).toBeGreaterThanOrEqual(5);
      expect(result.totalScore).toBeLessThan(10);
      expect(result.riskLevel).toBe("MEDIUM");
    });

    test("HIGH: should return HIGH for score >= 10", async () => {
      const marketData = createMockMarketData({
        quote: { marketCap: 5_000_000 }, // 3
        securityData: {
          isOpenSource: false, // 3
          isMintable: true, // 4
        },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.totalScore).toBeGreaterThanOrEqual(10);
      expect(result.riskLevel).toBe("HIGH");
    });

    test("HIGH: honeypot should always result in HIGH", async () => {
      const marketData = createMockMarketData({
        quote: { marketCap: 1_000_000_000, marketCapRank: 50 },
        securityData: { isHoneypot: true },
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.riskLevel).toBe("HIGH");
    });
  });

  describe("Legitimacy Check", () => {
    test("should mark established cryptos as legitimate", async () => {
      const marketData: CryptoMarketData = {
        quote: {
          ...createMockCryptoQuote(),
          id: "bitcoin",
          symbol: "BTC",
          name: "Bitcoin",
          marketCap: 1_000_000_000_000,
          totalVolume24h: 50_000_000_000,
          marketCapRank: 1,
        },
        priceHistory: createMockPriceHistory(),
        securityData: null,
        dataAvailable: true,
      };
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.isLegitimate).toBe(true);
    });

    test("should NOT mark tokens with high-weight signals as legitimate", async () => {
      const marketData = createMockMarketData({
        quote: { marketCap: 5_000_000_000, marketCapRank: 50 },
        securityData: { isMintable: true }, // weight 4
      });
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.isLegitimate).toBe(false);
    });
  });

  describe("getCryptoSignalsByCategory", () => {
    test("should correctly categorize all signal types", async () => {
      const marketData = createMockMarketData({
        quote: { marketCap: 5_000_000 },
        securityData: {
          isOpenSource: false,
          isLpLocked: false,
          isInDex: true,
          topHolders: [{ address: "0x1", percent: 80, isContract: false, isLocked: false }],
        },
      });
      const input = createScoringInput(marketData, { unsolicited: true });

      const result = await computeCryptoRiskScore(input);
      const categorized = getCryptoSignalsByCategory(result.signals);

      expect(categorized.structural.length).toBeGreaterThan(0);
      expect(categorized.contract.length).toBeGreaterThan(0);
      expect(categorized.liquidity.length).toBeGreaterThan(0);
      expect(categorized.distribution.length).toBeGreaterThan(0);
      expect(categorized.behavioral.length).toBe(1);
    });
  });

  describe("Edge Cases", () => {
    test("should handle missing market data", async () => {
      const marketData: CryptoMarketData = {
        quote: null,
        priceHistory: [],
        securityData: null,
        dataAvailable: false,
      };
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      expect(result.riskLevel).toBe("INSUFFICIENT");
      expect(result.isInsufficient).toBe(true);
    });

    test("should handle missing security data", async () => {
      const marketData = createMockMarketData();
      marketData.securityData = null;
      const input = createScoringInput(marketData);

      const result = await computeCryptoRiskScore(input);

      // Should not crash and should not have contract signals
      expect(result.riskLevel).toBeDefined();
      const categorized = getCryptoSignalsByCategory(result.signals);
      expect(categorized.contract.length).toBe(0);
    });

    test("should be case-insensitive for NLP keywords", async () => {
      const marketData = createMockMarketData();
      const input = createScoringInput(marketData, {
        pitchText: "THIS IS GUARANTEED TO MOON! BUY NOW before it moons! I GOT ALPHA FROM INSIDER!",
      });

      const result = await computeCryptoRiskScore(input);

      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.PROMISED_RETURNS)).toBe(true);
      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.URGENCY)).toBe(true);
      expect(result.signals.some((s) => s.code === CRYPTO_SIGNAL_CODES.SECRECY)).toBe(true);
    });
  });
});
