/**
 * Crypto Risk Scoring Module
 *
 * Implements deterministic risk scoring for cryptocurrencies.
 * Analyzes market data, smart contract security, and behavioral signals.
 * The LLM is NOT involved in scoring - only in generating narrative text.
 */

import {
  CryptoRiskSignal,
  CryptoScoringInput,
  CryptoScoringResult,
  CryptoMarketData,
  GoPlusTokenSecurity,
  CryptoSignalCategory,
  ESTABLISHED_CRYPTOS,
} from "./types";
import { RiskLevel } from "../types";
import {
  calculateCryptoPriceChange,
  calculateCryptoVolumeRatio,
  detectCryptoSpikeThenDrop,
  calculateCryptoRSI,
  calculateCryptoVolatility,
} from "./dataService";
import {
  isHoneypot,
  calculateHolderConcentration,
  getLiquidityInfo,
  calculateSecurityScore,
} from "./securityService";

// Signal code constants for crypto
export const CRYPTO_SIGNAL_CODES = {
  // Structural/Market Signals
  MICRO_MARKET_CAP: "MICRO_MARKET_CAP",
  LOW_VOLUME: "LOW_VOLUME",
  NEW_TOKEN: "NEW_TOKEN",
  LOW_HOLDER_COUNT: "LOW_HOLDER_COUNT",
  UNRANKED: "UNRANKED",

  // Pattern Signals
  PRICE_SPIKE_24H: "PRICE_SPIKE_24H",
  PRICE_SPIKE_7D: "PRICE_SPIKE_7D",
  VOLUME_EXPLOSION: "VOLUME_EXPLOSION",
  SPIKE_THEN_DROP: "SPIKE_THEN_DROP",
  EXTREME_VOLATILITY: "EXTREME_VOLATILITY",
  OVERBOUGHT_RSI: "OVERBOUGHT_RSI",
  NEAR_ATH: "NEAR_ATH",
  DOWN_FROM_ATH: "DOWN_FROM_ATH",

  // Contract Security Signals
  NOT_OPEN_SOURCE: "NOT_OPEN_SOURCE",
  HONEYPOT: "HONEYPOT",
  MINTABLE: "MINTABLE",
  HIDDEN_OWNER: "HIDDEN_OWNER",
  SELF_DESTRUCT: "SELF_DESTRUCT",
  PROXY_CONTRACT: "PROXY_CONTRACT",
  OWNER_CAN_CHANGE_BALANCE: "OWNER_CAN_CHANGE_BALANCE",
  CAN_RECLAIM_OWNERSHIP: "CAN_RECLAIM_OWNERSHIP",
  HIGH_BUY_TAX: "HIGH_BUY_TAX",
  HIGH_SELL_TAX: "HIGH_SELL_TAX",
  BLACKLIST_FUNCTION: "BLACKLIST_FUNCTION",
  TRADING_COOLDOWN: "TRADING_COOLDOWN",

  // Liquidity/Distribution Signals
  LP_NOT_LOCKED: "LP_NOT_LOCKED",
  LOW_LP_LOCKED: "LOW_LP_LOCKED",
  LOW_LIQUIDITY: "LOW_LIQUIDITY",
  HIGH_HOLDER_CONCENTRATION: "HIGH_HOLDER_CONCENTRATION",
  HIGH_CREATOR_HOLDINGS: "HIGH_CREATOR_HOLDINGS",
  HIGH_OWNER_HOLDINGS: "HIGH_OWNER_HOLDINGS",

  // Behavioral Signals (same as stocks)
  UNSOLICITED: "UNSOLICITED",
  PROMISED_RETURNS: "PROMISED_RETURNS",
  URGENCY: "URGENCY",
  SECRECY: "SECRECY",
  SPECIFIC_RETURN_CLAIM: "SPECIFIC_RETURN_CLAIM",
} as const;

// Thresholds for crypto signals
const THRESHOLDS = {
  // Market thresholds
  microMarketCap: 10_000_000, // $10M
  lowVolume24h: 100_000, // $100K daily volume
  lowHolderCount: 500,

  // Price pattern thresholds
  spike24hMedium: 30, // 30% in 24h
  spike24hHigh: 50, // 50% in 24h
  spike7dMedium: 100, // 100% in 7d
  spike7dHigh: 200, // 200% in 7d
  volumeExplosionMedium: 3, // 3x average
  volumeExplosionHigh: 5, // 5x average
  highVolatility: 10, // 10% daily volatility
  extremeVolatility: 20, // 20% daily volatility

  // Security thresholds
  highTax: 10, // 10%+ tax
  extremeTax: 25, // 25%+ tax
  highHolderConcentration: 50, // 50%+ held by top 10
  extremeHolderConcentration: 70, // 70%+ held by top 10
  highCreatorHoldings: 20, // 20%+ held by creator
  lowLiquidity: 50_000, // $50K liquidity
  lowLpLocked: 50, // Less than 50% LP locked
};

// Keywords for behavioral NLP analysis (same as stocks)
const BEHAVIORAL_KEYWORDS = {
  promisedReturns: [
    "guaranteed", "guaranteed return", "guaranteed profit",
    "100x", "1000x", "10000x", "moon", "mooning", "to the moon",
    "lambo", "millionaire", "get rich", "easy money",
    "can't lose", "risk-free", "sure thing", "ape in",
    "next bitcoin", "next ethereum", "next shiba",
  ],
  urgency: [
    "act now", "act fast", "limited time", "presale ending",
    "buy now", "last chance", "don't miss", "hurry",
    "launching soon", "few hours left", "selling out",
    "fomo", "before it moons", "early bird",
  ],
  secrecy: [
    "insider", "insider info", "alpha", "secret gem",
    "don't tell", "exclusive", "private group",
    "before announcement", "devs are doxxed", "trust me bro",
  ],
  specificReturnPattern: /(\d{1,5})\s*x\s*(in|within|over)?\s*(\d+)?\s*(day|week|month|hour)/i,
};

/**
 * Analyze pitch text for behavioral red flags
 */
function analyzePitchText(pitchText: string): {
  hasPromisedReturns: boolean;
  hasUrgency: boolean;
  hasSecrecy: boolean;
  hasSpecificReturnClaim: boolean;
} {
  const lowerText = pitchText.toLowerCase();

  const hasPromisedReturns = BEHAVIORAL_KEYWORDS.promisedReturns.some((kw) =>
    lowerText.includes(kw.toLowerCase())
  );

  const hasUrgency = BEHAVIORAL_KEYWORDS.urgency.some((kw) =>
    lowerText.includes(kw.toLowerCase())
  );

  const hasSecrecy = BEHAVIORAL_KEYWORDS.secrecy.some((kw) =>
    lowerText.includes(kw.toLowerCase())
  );

  const hasSpecificReturnClaim =
    BEHAVIORAL_KEYWORDS.specificReturnPattern.test(pitchText);

  return {
    hasPromisedReturns,
    hasUrgency,
    hasSecrecy,
    hasSpecificReturnClaim,
  };
}

/**
 * Generate market/structural signals from crypto data
 */
function getMarketSignals(marketData: CryptoMarketData): CryptoRiskSignal[] {
  const signals: CryptoRiskSignal[] = [];
  const { quote } = marketData;

  if (!quote) return signals;

  // Micro market cap
  if (quote.marketCap < THRESHOLDS.microMarketCap) {
    const mcapK = (quote.marketCap / 1_000).toFixed(0);
    signals.push({
      code: CRYPTO_SIGNAL_CODES.MICRO_MARKET_CAP,
      category: "STRUCTURAL",
      description: `Very small market cap ($${mcapK}K) - highly susceptible to manipulation and rug pulls`,
      weight: 3,
    });
  }

  // Low 24h volume
  if (quote.totalVolume24h < THRESHOLDS.lowVolume24h) {
    const volK = (quote.totalVolume24h / 1_000).toFixed(0);
    signals.push({
      code: CRYPTO_SIGNAL_CODES.LOW_VOLUME,
      category: "STRUCTURAL",
      description: `Very low trading volume ($${volK}K/day) - difficult to sell, easy to manipulate`,
      weight: 2,
    });
  }

  // Unranked (no market cap rank)
  if (!quote.marketCapRank || quote.marketCapRank > 2000) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.UNRANKED,
      category: "STRUCTURAL",
      description: "Token is unranked or very low ranked - may be new, obscure, or unverified",
      weight: 1,
    });
  }

  return signals;
}

/**
 * Generate pattern signals from price history
 */
function getPatternSignals(marketData: CryptoMarketData): CryptoRiskSignal[] {
  const signals: CryptoRiskSignal[] = [];
  const { quote, priceHistory } = marketData;

  // 24h price change from quote
  if (quote) {
    const change24h = Math.abs(quote.priceChangePercentage24h);
    if (change24h >= THRESHOLDS.spike24hHigh) {
      signals.push({
        code: CRYPTO_SIGNAL_CODES.PRICE_SPIKE_24H,
        category: "PATTERN",
        description: `Extreme price movement of ${quote.priceChangePercentage24h.toFixed(0)}% in 24 hours - high volatility warning`,
        weight: 3,
      });
    } else if (change24h >= THRESHOLDS.spike24hMedium) {
      signals.push({
        code: CRYPTO_SIGNAL_CODES.PRICE_SPIKE_24H,
        category: "PATTERN",
        description: `Significant price movement of ${quote.priceChangePercentage24h.toFixed(0)}% in 24 hours`,
        weight: 2,
      });
    }

    // 7d price change from quote
    if (quote.priceChangePercentage7d !== null) {
      const change7d = Math.abs(quote.priceChangePercentage7d);
      if (change7d >= THRESHOLDS.spike7dHigh) {
        signals.push({
          code: CRYPTO_SIGNAL_CODES.PRICE_SPIKE_7D,
          category: "PATTERN",
          description: `Extreme price movement of ${quote.priceChangePercentage7d.toFixed(0)}% in 7 days - classic pump pattern`,
          weight: 4,
        });
      } else if (change7d >= THRESHOLDS.spike7dMedium) {
        signals.push({
          code: CRYPTO_SIGNAL_CODES.PRICE_SPIKE_7D,
          category: "PATTERN",
          description: `Significant price movement of ${quote.priceChangePercentage7d.toFixed(0)}% in 7 days`,
          weight: 3,
        });
      }
    }

    // ATH analysis
    if (quote.athChangePercentage > -5) {
      signals.push({
        code: CRYPTO_SIGNAL_CODES.NEAR_ATH,
        category: "PATTERN",
        description: "Price is near all-time high - potential for significant pullback",
        weight: 2,
      });
    } else if (quote.athChangePercentage < -90) {
      signals.push({
        code: CRYPTO_SIGNAL_CODES.DOWN_FROM_ATH,
        category: "PATTERN",
        description: `Price is ${Math.abs(quote.athChangePercentage).toFixed(0)}% down from ATH - may indicate dead project`,
        weight: 2,
      });
    }
  }

  // Analysis from price history
  if (priceHistory.length >= 14) {
    // Volume explosion
    const volumeRatio = calculateCryptoVolumeRatio(priceHistory);
    if (volumeRatio !== null) {
      if (volumeRatio >= THRESHOLDS.volumeExplosionHigh) {
        signals.push({
          code: CRYPTO_SIGNAL_CODES.VOLUME_EXPLOSION,
          category: "PATTERN",
          description: `Trading volume is ${volumeRatio.toFixed(1)}x the average - coordinated buying likely`,
          weight: 3,
        });
      } else if (volumeRatio >= THRESHOLDS.volumeExplosionMedium) {
        signals.push({
          code: CRYPTO_SIGNAL_CODES.VOLUME_EXPLOSION,
          category: "PATTERN",
          description: `Trading volume is ${volumeRatio.toFixed(1)}x the average - unusual activity`,
          weight: 2,
        });
      }
    }

    // Spike then drop (classic rug pattern)
    if (detectCryptoSpikeThenDrop(priceHistory)) {
      signals.push({
        code: CRYPTO_SIGNAL_CODES.SPIKE_THEN_DROP,
        category: "PATTERN",
        description: "Price spiked 50%+ then crashed 40%+ - classic pump-and-dump or rug pull pattern",
        weight: 4,
      });
    }

    // Volatility
    const volatility = calculateCryptoVolatility(priceHistory);
    if (volatility !== null) {
      if (volatility >= THRESHOLDS.extremeVolatility) {
        signals.push({
          code: CRYPTO_SIGNAL_CODES.EXTREME_VOLATILITY,
          category: "PATTERN",
          description: `Extreme volatility (${volatility.toFixed(1)}% daily swings) - high risk of sudden losses`,
          weight: 2,
        });
      } else if (volatility >= THRESHOLDS.highVolatility) {
        signals.push({
          code: CRYPTO_SIGNAL_CODES.EXTREME_VOLATILITY,
          category: "PATTERN",
          description: `High volatility (${volatility.toFixed(1)}% daily swings)`,
          weight: 1,
        });
      }
    }

    // RSI overbought
    const rsi = calculateCryptoRSI(priceHistory);
    if (rsi !== null && rsi > 80) {
      signals.push({
        code: CRYPTO_SIGNAL_CODES.OVERBOUGHT_RSI,
        category: "PATTERN",
        description: `RSI at ${rsi.toFixed(0)} indicates extremely overbought - pullback likely`,
        weight: 2,
      });
    } else if (rsi !== null && rsi > 70) {
      signals.push({
        code: CRYPTO_SIGNAL_CODES.OVERBOUGHT_RSI,
        category: "PATTERN",
        description: `RSI at ${rsi.toFixed(0)} indicates overbought conditions`,
        weight: 1,
      });
    }
  }

  return signals;
}

/**
 * Generate contract security signals from GoPlus data
 */
function getContractSecuritySignals(
  securityData: GoPlusTokenSecurity | null
): CryptoRiskSignal[] {
  const signals: CryptoRiskSignal[] = [];

  if (!securityData) return signals;

  // Critical security issues (highest weights)
  if (isHoneypot(securityData)) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.HONEYPOT,
      category: "CONTRACT",
      description: "HONEYPOT DETECTED - You may not be able to sell this token",
      weight: 10, // Critical - almost certainly a scam
    });
  }

  if (securityData.ownerChangeBalance) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.OWNER_CAN_CHANGE_BALANCE,
      category: "CONTRACT",
      description: "Owner can modify token balances - extreme rug pull risk",
      weight: 8,
    });
  }

  if (securityData.hiddenOwner) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.HIDDEN_OWNER,
      category: "CONTRACT",
      description: "Contract has hidden owner functions - ownership may not actually be renounced",
      weight: 6,
    });
  }

  if (securityData.canTakeBackOwnership) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.CAN_RECLAIM_OWNERSHIP,
      category: "CONTRACT",
      description: "Owner can reclaim ownership after renouncing - false sense of security",
      weight: 5,
    });
  }

  // High risk issues
  if (securityData.isMintable) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.MINTABLE,
      category: "CONTRACT",
      description: "Owner can mint unlimited tokens - supply can be inflated at any time",
      weight: 4,
    });
  }

  if (securityData.selfDestruct) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.SELF_DESTRUCT,
      category: "CONTRACT",
      description: "Contract can self-destruct - all tokens could become worthless",
      weight: 4,
    });
  }

  if (!securityData.isOpenSource) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.NOT_OPEN_SOURCE,
      category: "CONTRACT",
      description: "Contract source code is not verified - cannot audit for malicious code",
      weight: 3,
    });
  }

  if (securityData.isProxy) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.PROXY_CONTRACT,
      category: "CONTRACT",
      description: "Upgradeable proxy contract - functionality can change at any time",
      weight: 3,
    });
  }

  // Tax issues
  if (securityData.sellTax >= THRESHOLDS.extremeTax) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.HIGH_SELL_TAX,
      category: "CONTRACT",
      description: `Extreme sell tax of ${securityData.sellTax.toFixed(1)}% - you lose a significant portion when selling`,
      weight: 4,
    });
  } else if (securityData.sellTax >= THRESHOLDS.highTax) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.HIGH_SELL_TAX,
      category: "CONTRACT",
      description: `High sell tax of ${securityData.sellTax.toFixed(1)}%`,
      weight: 2,
    });
  }

  if (securityData.buyTax >= THRESHOLDS.extremeTax) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.HIGH_BUY_TAX,
      category: "CONTRACT",
      description: `Extreme buy tax of ${securityData.buyTax.toFixed(1)}%`,
      weight: 3,
    });
  } else if (securityData.buyTax >= THRESHOLDS.highTax) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.HIGH_BUY_TAX,
      category: "CONTRACT",
      description: `High buy tax of ${securityData.buyTax.toFixed(1)}%`,
      weight: 1,
    });
  }

  // Other trading restrictions
  if (securityData.isBlacklisted) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.BLACKLIST_FUNCTION,
      category: "CONTRACT",
      description: "Blacklist function detected - addresses can be blocked from trading",
      weight: 2,
    });
  }

  if (securityData.tradingCooldown) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.TRADING_COOLDOWN,
      category: "CONTRACT",
      description: "Trading cooldown enabled - may restrict your ability to sell quickly",
      weight: 1,
    });
  }

  return signals;
}

/**
 * Generate liquidity and distribution signals
 */
function getLiquiditySignals(
  securityData: GoPlusTokenSecurity | null
): CryptoRiskSignal[] {
  const signals: CryptoRiskSignal[] = [];

  if (!securityData) return signals;

  // LP lock status
  if (securityData.isInDex && !securityData.isLpLocked) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.LP_NOT_LOCKED,
      category: "LIQUIDITY",
      description: "Liquidity pool is NOT locked - developer can pull liquidity at any time (rug pull)",
      weight: 5,
    });
  } else if (
    securityData.isInDex &&
    securityData.lpLockedPercent > 0 &&
    securityData.lpLockedPercent < THRESHOLDS.lowLpLocked
  ) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.LOW_LP_LOCKED,
      category: "LIQUIDITY",
      description: `Only ${securityData.lpLockedPercent.toFixed(1)}% of liquidity is locked - partial rug risk`,
      weight: 3,
    });
  }

  // Liquidity amount
  const liquidityInfo = getLiquidityInfo(securityData);
  if (liquidityInfo.isLow && liquidityInfo.totalLiquidity > 0) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.LOW_LIQUIDITY,
      category: "LIQUIDITY",
      description: `Low liquidity ($${(liquidityInfo.totalLiquidity / 1000).toFixed(0)}K) - large trades will cause significant slippage`,
      weight: 2,
    });
  } else if (liquidityInfo.totalLiquidity === 0 && securityData.isInDex) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.LOW_LIQUIDITY,
      category: "LIQUIDITY",
      description: "Unable to verify liquidity - exercise extreme caution",
      weight: 2,
    });
  }

  // Holder concentration
  const concentration = calculateHolderConcentration(securityData);
  if (concentration >= THRESHOLDS.extremeHolderConcentration) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.HIGH_HOLDER_CONCENTRATION,
      category: "DISTRIBUTION",
      description: `Top holders control ${concentration.toFixed(0)}% of supply - extreme manipulation risk`,
      weight: 4,
    });
  } else if (concentration >= THRESHOLDS.highHolderConcentration) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.HIGH_HOLDER_CONCENTRATION,
      category: "DISTRIBUTION",
      description: `Top holders control ${concentration.toFixed(0)}% of supply - whale manipulation risk`,
      weight: 3,
    });
  }

  // Creator/owner holdings
  if (securityData.creatorPercent >= THRESHOLDS.highCreatorHoldings) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.HIGH_CREATOR_HOLDINGS,
      category: "DISTRIBUTION",
      description: `Creator holds ${securityData.creatorPercent.toFixed(1)}% of tokens - can dump on market`,
      weight: 3,
    });
  }

  if (securityData.ownerPercent >= THRESHOLDS.highCreatorHoldings) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.HIGH_OWNER_HOLDINGS,
      category: "DISTRIBUTION",
      description: `Owner holds ${securityData.ownerPercent.toFixed(1)}% of tokens - concentration risk`,
      weight: 2,
    });
  }

  // Low holder count
  if (securityData.holderCount > 0 && securityData.holderCount < THRESHOLDS.lowHolderCount) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.LOW_HOLDER_COUNT,
      category: "DISTRIBUTION",
      description: `Only ${securityData.holderCount} holders - very limited adoption`,
      weight: 2,
    });
  }

  return signals;
}

/**
 * Generate behavioral signals from user input and pitch text
 */
function getBehavioralSignals(
  context: CryptoScoringInput["context"],
  pitchText: string
): CryptoRiskSignal[] {
  const signals: CryptoRiskSignal[] = [];
  const nlpResults = pitchText
    ? analyzePitchText(pitchText)
    : {
        hasPromisedReturns: false,
        hasUrgency: false,
        hasSecrecy: false,
        hasSpecificReturnClaim: false,
      };

  if (context.unsolicited) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.UNSOLICITED,
      category: "BEHAVIORAL",
      description: "You received this tip without asking - unsolicited crypto tips are extremely common in scams",
      weight: 1,
    });
  }

  if (context.promisesHighReturns || nlpResults.hasPromisedReturns) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.PROMISED_RETURNS,
      category: "BEHAVIORAL",
      description: "The pitch promises guaranteed returns or '100x gains' - classic scam language",
      weight: 2,
    });
  }

  if (context.urgencyPressure || nlpResults.hasUrgency) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.URGENCY,
      category: "BEHAVIORAL",
      description: "The pitch creates urgency to buy immediately - designed to prevent research",
      weight: 2,
    });
  }

  if (context.secrecyInsideInfo || nlpResults.hasSecrecy) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.SECRECY,
      category: "BEHAVIORAL",
      description: "The pitch claims secret 'alpha' or insider information - almost always fabricated",
      weight: 2,
    });
  }

  if (nlpResults.hasSpecificReturnClaim) {
    signals.push({
      code: CRYPTO_SIGNAL_CODES.SPECIFIC_RETURN_CLAIM,
      category: "BEHAVIORAL",
      description: "The pitch promises specific multiplier gains (e.g., '100x') - no one can guarantee returns",
      weight: 1,
    });
  }

  return signals;
}

/**
 * Calculate risk level from total score and signals
 */
function calculateRiskLevel(
  totalScore: number,
  signals: CryptoRiskSignal[]
): RiskLevel {
  // Check for critical signals - automatic HIGH
  const criticalCodes: string[] = [
    CRYPTO_SIGNAL_CODES.HONEYPOT,
    CRYPTO_SIGNAL_CODES.OWNER_CAN_CHANGE_BALANCE,
  ];

  const hasCritical = signals.some((s) =>
    criticalCodes.includes(s.code)
  );

  if (hasCritical) return "HIGH";

  // Standard scoring thresholds (slightly higher for crypto due to inherent volatility)
  if (totalScore >= 10) return "HIGH";
  if (totalScore >= 5) return "MEDIUM";
  return "LOW";
}

/**
 * Check if result should be INSUFFICIENT
 */
function checkIsInsufficient(marketData: CryptoMarketData): boolean {
  return !marketData.dataAvailable || !marketData.quote;
}

/**
 * Check if crypto is considered legitimate/established
 */
function checkIsLegitimate(
  marketData: CryptoMarketData,
  signals: CryptoRiskSignal[]
): boolean {
  if (!marketData.quote) return false;

  const { quote } = marketData;

  // Check if it's an established cryptocurrency
  const isEstablished = ESTABLISHED_CRYPTOS.includes(quote.id.toLowerCase());

  // Or high market cap with good rank
  const isLargeCap = quote.marketCap > 1_000_000_000; // > $1B
  const isHighVolume = quote.totalVolume24h > 10_000_000; // > $10M daily
  const isTopRanked = quote.marketCapRank !== null && quote.marketCapRank <= 100;

  // No critical red flags
  const hasNoRedFlags = signals.filter((s) => s.weight >= 3).length === 0;

  return (isEstablished || (isLargeCap && isHighVolume && isTopRanked)) && hasNoRedFlags;
}

/**
 * Main scoring function for crypto
 */
export async function computeCryptoRiskScore(
  input: CryptoScoringInput
): Promise<CryptoScoringResult> {
  const { marketData, pitchText, context } = input;
  const signals: CryptoRiskSignal[] = [];

  // Collect all signals
  signals.push(...getMarketSignals(marketData));
  signals.push(...getPatternSignals(marketData));

  // Contract security signals (if security data available)
  if (marketData.securityData?.tokenSecurity) {
    signals.push(...getContractSecuritySignals(marketData.securityData.tokenSecurity));
    signals.push(...getLiquiditySignals(marketData.securityData.tokenSecurity));
  }

  // Behavioral signals
  signals.push(...getBehavioralSignals(context, pitchText));

  // Calculate total score
  const totalScore = signals.reduce((sum, signal) => sum + signal.weight, 0);

  // Determine risk level
  const riskLevel = calculateRiskLevel(totalScore, signals);

  // Check if insufficient data
  const isInsufficient = checkIsInsufficient(marketData);

  // Check if legitimate
  const isLegitimate = checkIsLegitimate(marketData, signals);

  return {
    signals,
    totalScore,
    riskLevel: isInsufficient ? "INSUFFICIENT" : riskLevel,
    isInsufficient,
    isLegitimate,
  };
}

/**
 * Get signals grouped by category for narrative generation
 */
export function getCryptoSignalsByCategory(signals: CryptoRiskSignal[]): {
  structural: CryptoRiskSignal[];
  pattern: CryptoRiskSignal[];
  contract: CryptoRiskSignal[];
  liquidity: CryptoRiskSignal[];
  distribution: CryptoRiskSignal[];
  behavioral: CryptoRiskSignal[];
} {
  return {
    structural: signals.filter((s) => s.category === "STRUCTURAL"),
    pattern: signals.filter((s) => s.category === "PATTERN"),
    contract: signals.filter((s) => s.category === "CONTRACT"),
    liquidity: signals.filter((s) => s.category === "LIQUIDITY"),
    distribution: signals.filter((s) => s.category === "DISTRIBUTION"),
    behavioral: signals.filter((s) => s.category === "BEHAVIORAL"),
  };
}
