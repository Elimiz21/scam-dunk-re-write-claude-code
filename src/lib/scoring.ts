/**
 * Risk Scoring Module
 *
 * Implements deterministic risk scoring based on market data and behavioral signals.
 * The LLM is NOT involved in scoring - only in generating narrative text.
 */

import {
  RiskSignal,
  RiskLevel,
  SignalCategory,
  ScoringInput,
  ScoringResult,
  MarketData,
} from "./types";
import {
  calculatePriceChange,
  calculateVolumeRatio,
  detectSpikeThenDrop,
  checkAlertList,
} from "./marketData";

// Signal code constants
export const SIGNAL_CODES = {
  // Structural
  MICROCAP_PRICE: "MICROCAP_PRICE",
  SMALL_MARKET_CAP: "SMALL_MARKET_CAP",
  MICRO_LIQUIDITY: "MICRO_LIQUIDITY",
  OTC_EXCHANGE: "OTC_EXCHANGE",
  // Pattern
  SPIKE_7D: "SPIKE_7D",
  VOLUME_EXPLOSION: "VOLUME_EXPLOSION",
  SPIKE_THEN_DROP: "SPIKE_THEN_DROP",
  // Alert
  ALERT_LIST_HIT: "ALERT_LIST_HIT",
  // Behavioral
  UNSOLICITED: "UNSOLICITED",
  PROMISED_RETURNS: "PROMISED_RETURNS",
  URGENCY: "URGENCY",
  SECRECY: "SECRECY",
  SPECIFIC_RETURN_CLAIM: "SPECIFIC_RETURN_CLAIM",
} as const;

// Thresholds from spec
const THRESHOLDS = {
  microCapPrice: 5,
  smallMarketCap: 300_000_000,
  microLiquidity: 150_000,
  spike7dMedium: 50,
  spike7dHigh: 100,
  volumeExplosionMedium: 5,
  volumeExplosionHigh: 10,
};

// Keywords for behavioral NLP analysis
const BEHAVIORAL_KEYWORDS = {
  promisedReturns: [
    "guaranteed",
    "guaranteed return",
    "guaranteed profit",
    "100%",
    "double your money",
    "triple your money",
    "10x",
    "100x",
    "1000%",
    "can't lose",
    "risk-free",
    "sure thing",
    "easy money",
    "get rich",
    "millionaire",
  ],
  urgency: [
    "act now",
    "act fast",
    "limited time",
    "expires",
    "today only",
    "last chance",
    "don't miss",
    "hurry",
    "urgent",
    "immediately",
    "before it's too late",
    "running out",
    "few hours",
    "few days",
  ],
  secrecy: [
    "insider",
    "insider info",
    "confidential",
    "secret",
    "don't tell",
    "keep quiet",
    "exclusive",
    "private tip",
    "behind closed doors",
    "not public",
    "before announcement",
  ],
  specificReturnPattern: /(\d{1,4})\s*%\s*(in|within|over)?\s*(\d+)?\s*(day|week|month|hour)/i,
};

/**
 * Analyze pitch text for behavioral red flags using simple NLP
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
 * Generate structural signals from market data
 */
function getStructuralSignals(marketData: MarketData): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const { quote, isOTC } = marketData;

  if (!quote) return signals;

  // MICROCAP_PRICE: price < 5
  if (quote.lastPrice < THRESHOLDS.microCapPrice) {
    signals.push({
      code: SIGNAL_CODES.MICROCAP_PRICE,
      category: "STRUCTURAL",
      description: `Stock price is below $5 ($${quote.lastPrice.toFixed(2)}), often associated with penny stocks and higher manipulation risk`,
      weight: 2,
    });
  }

  // SMALL_MARKET_CAP: marketCap < 300M
  if (quote.marketCap < THRESHOLDS.smallMarketCap) {
    const marketCapM = (quote.marketCap / 1_000_000).toFixed(1);
    signals.push({
      code: SIGNAL_CODES.SMALL_MARKET_CAP,
      category: "STRUCTURAL",
      description: `Small market cap ($${marketCapM}M) - small caps are more vulnerable to manipulation`,
      weight: 2,
    });
  }

  // MICRO_LIQUIDITY: avgDollarVolume30d < 150k
  if (quote.avgDollarVolume30d < THRESHOLDS.microLiquidity) {
    const volumeK = (quote.avgDollarVolume30d / 1_000).toFixed(0);
    signals.push({
      code: SIGNAL_CODES.MICRO_LIQUIDITY,
      category: "STRUCTURAL",
      description: `Very low trading liquidity ($${volumeK}K daily volume) - easier to manipulate prices`,
      weight: 2,
    });
  }

  // OTC_EXCHANGE
  if (isOTC) {
    signals.push({
      code: SIGNAL_CODES.OTC_EXCHANGE,
      category: "STRUCTURAL",
      description: `Traded on OTC markets (${quote.exchange}) - less regulatory oversight than major exchanges`,
      weight: 3,
    });
  }

  return signals;
}

/**
 * Generate pattern signals from price history
 */
function getPatternSignals(marketData: MarketData): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const { priceHistory } = marketData;

  if (priceHistory.length < 30) return signals;

  // SPIKE_7D: 7d price change
  const priceChange7d = calculatePriceChange(priceHistory, 7);
  if (priceChange7d !== null) {
    if (priceChange7d >= THRESHOLDS.spike7dHigh) {
      signals.push({
        code: SIGNAL_CODES.SPIKE_7D,
        category: "PATTERN",
        description: `Extreme price spike of ${priceChange7d.toFixed(0)}% in the last 7 days - classic pump pattern`,
        weight: 4,
      });
    } else if (priceChange7d >= THRESHOLDS.spike7dMedium) {
      signals.push({
        code: SIGNAL_CODES.SPIKE_7D,
        category: "PATTERN",
        description: `Significant price spike of ${priceChange7d.toFixed(0)}% in the last 7 days`,
        weight: 3,
      });
    }
  }

  // VOLUME_EXPLOSION
  const volumeRatio = calculateVolumeRatio(priceHistory, 7);
  if (volumeRatio !== null) {
    if (volumeRatio >= THRESHOLDS.volumeExplosionHigh) {
      signals.push({
        code: SIGNAL_CODES.VOLUME_EXPLOSION,
        category: "PATTERN",
        description: `Trading volume is ${volumeRatio.toFixed(1)}x the 30-day average - extreme unusual activity`,
        weight: 3,
      });
    } else if (volumeRatio >= THRESHOLDS.volumeExplosionMedium) {
      signals.push({
        code: SIGNAL_CODES.VOLUME_EXPLOSION,
        category: "PATTERN",
        description: `Trading volume is ${volumeRatio.toFixed(1)}x the 30-day average - unusual activity`,
        weight: 2,
      });
    }
  }

  // SPIKE_THEN_DROP
  if (detectSpikeThenDrop(priceHistory)) {
    signals.push({
      code: SIGNAL_CODES.SPIKE_THEN_DROP,
      category: "PATTERN",
      description: "Price spiked 50%+ then dropped 40%+ - classic pump-and-dump pattern",
      weight: 3,
    });
  }

  return signals;
}

/**
 * Generate behavioral signals from user input and pitch text analysis
 */
function getBehavioralSignals(
  context: ScoringInput["context"],
  pitchText: string
): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const nlpResults = pitchText ? analyzePitchText(pitchText) : {
    hasPromisedReturns: false,
    hasUrgency: false,
    hasSecrecy: false,
    hasSpecificReturnClaim: false,
  };

  // UNSOLICITED
  if (context.unsolicited) {
    signals.push({
      code: SIGNAL_CODES.UNSOLICITED,
      category: "BEHAVIORAL",
      description: "You received this tip without asking - unsolicited stock tips are a common scam tactic",
      weight: 1,
    });
  }

  // PROMISED_RETURNS (from toggle or NLP)
  if (context.promisesHighReturns || nlpResults.hasPromisedReturns) {
    signals.push({
      code: SIGNAL_CODES.PROMISED_RETURNS,
      category: "BEHAVIORAL",
      description: "The pitch promises high or guaranteed returns - no legitimate investment can guarantee returns",
      weight: 2,
    });
  }

  // URGENCY (from toggle or NLP)
  if (context.urgencyPressure || nlpResults.hasUrgency) {
    signals.push({
      code: SIGNAL_CODES.URGENCY,
      category: "BEHAVIORAL",
      description: "The pitch creates urgency or time pressure - scammers want you to act before you can think",
      weight: 2,
    });
  }

  // SECRECY (from toggle or NLP)
  if (context.secrecyInsideInfo || nlpResults.hasSecrecy) {
    signals.push({
      code: SIGNAL_CODES.SECRECY,
      category: "BEHAVIORAL",
      description: "The pitch suggests insider or secret information - this is likely illegal or fake",
      weight: 2,
    });
  }

  // SPECIFIC_RETURN_CLAIM (NLP only, optional +1)
  if (nlpResults.hasSpecificReturnClaim) {
    signals.push({
      code: SIGNAL_CODES.SPECIFIC_RETURN_CLAIM,
      category: "BEHAVIORAL",
      description: "The pitch claims specific percentage gains in a specific timeframe - a major red flag",
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
  signals: RiskSignal[],
  marketData: MarketData
): RiskLevel {
  // Check for alert list hit - automatic HIGH
  const hasAlertHit = signals.some(
    (s) => s.code === SIGNAL_CODES.ALERT_LIST_HIT
  );
  if (hasAlertHit) {
    return "HIGH";
  }

  // Standard scoring thresholds
  if (totalScore >= 7) return "HIGH";
  if (totalScore >= 3) return "MEDIUM";
  return "LOW";
}

/**
 * Check if result should be INSUFFICIENT
 */
function checkIsInsufficient(
  marketData: MarketData,
  signals: RiskSignal[]
): boolean {
  // No data available
  if (!marketData.dataAvailable || !marketData.quote) {
    return true;
  }

  // Large, liquid stock on major exchange with no behavioral flags
  const { quote } = marketData;
  const isLargeCap = quote.marketCap > 10_000_000_000; // > $10B
  const isHighLiquidity = quote.avgDollarVolume30d > 10_000_000; // > $10M daily
  const isMajorExchange = !marketData.isOTC;
  const behavioralSignals = signals.filter((s) => s.category === "BEHAVIORAL");

  if (isLargeCap && isHighLiquidity && isMajorExchange && behavioralSignals.length === 0) {
    return true;
  }

  return false;
}

/**
 * Main scoring function
 *
 * Computes all risk signals and returns deterministic scoring result.
 * This is called BEFORE the LLM - the LLM only generates narrative from these results.
 */
export async function computeRiskScore(input: ScoringInput): Promise<ScoringResult> {
  const { marketData, pitchText, context } = input;
  const signals: RiskSignal[] = [];

  // Collect all signals
  signals.push(...getStructuralSignals(marketData));
  signals.push(...getPatternSignals(marketData));
  signals.push(...getBehavioralSignals(context, pitchText));

  // Check alert list (async operation)
  if (marketData.quote) {
    const isOnAlertList = await checkAlertList(marketData.quote.ticker);
    if (isOnAlertList) {
      signals.push({
        code: SIGNAL_CODES.ALERT_LIST_HIT,
        category: "ALERT",
        description: "This stock appears on regulatory alert or suspension lists - extreme caution advised",
        weight: 5,
      });
    }
  }

  // Calculate total score
  const totalScore = signals.reduce((sum, signal) => sum + signal.weight, 0);

  // Determine risk level
  const riskLevel = calculateRiskLevel(totalScore, signals, marketData);

  // Check if insufficient
  const isInsufficient = checkIsInsufficient(marketData, signals);

  return {
    signals,
    totalScore,
    riskLevel: isInsufficient ? "INSUFFICIENT" : riskLevel,
    isInsufficient,
  };
}

/**
 * Get signals by category for narrative generation
 */
export function getSignalsByCategory(signals: RiskSignal[]): {
  structural: RiskSignal[];
  pattern: RiskSignal[];
  alert: RiskSignal[];
  behavioral: RiskSignal[];
} {
  return {
    structural: signals.filter((s) => s.category === "STRUCTURAL"),
    pattern: signals.filter((s) => s.category === "PATTERN"),
    alert: signals.filter((s) => s.category === "ALERT"),
    behavioral: signals.filter((s) => s.category === "BEHAVIORAL"),
  };
}
