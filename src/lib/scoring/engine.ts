/**
 * Pure Scoring Engine (dependency-free)
 *
 * Single source of truth for ScamDunk's deterministic risk scoring.
 *
 * This module has NO Prisma / fetch / network imports — it operates purely on
 * the `MarketData` + behavioral inputs that are handed to it. Both the
 * production scoring path (`src/lib/scoring.ts`) and the offline evaluation
 * harness import from here so calibration measured in eval matches production
 * (see audit finding TS-C7).
 *
 * The async alert-list lookup (Prisma / live regulatory feeds) lives in
 * `src/lib/scoring.ts`; this engine accepts the already-resolved `secFlagged`
 * boolean instead.
 */

import {
  RiskSignal,
  RiskLevel,
  ScoringInput,
  ScoringResult,
  MarketData,
  PriceHistory,
  MarketCategory,
  DataCompleteness,
} from "../types";

// ============================================================================
// SIGNAL CODES
// ============================================================================

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
  SPIKE_3D: "SPIKE_3D",
  VOLUME_SURGE_3D: "VOLUME_SURGE_3D",
  PRICE_ACCELERATION: "PRICE_ACCELERATION",
  VOLUME_ACCELERATION: "VOLUME_ACCELERATION",
  // Advanced Anomaly Detection (Z-score based)
  PRICE_ANOMALY: "PRICE_ANOMALY",
  VOLUME_ANOMALY: "VOLUME_ANOMALY",
  EXTREME_SURGE: "EXTREME_SURGE",
  OVERBOUGHT_RSI: "OVERBOUGHT_RSI",
  HIGH_VOLATILITY: "HIGH_VOLATILITY",
  // Alert
  ALERT_LIST_HIT: "ALERT_LIST_HIT",
  // Behavioral
  UNSOLICITED: "UNSOLICITED",
  PROMISED_RETURNS: "PROMISED_RETURNS",
  URGENCY: "URGENCY",
  SECRECY: "SECRECY",
  SPECIFIC_RETURN_CLAIM: "SPECIFIC_RETURN_CLAIM",
} as const;

// ============================================================================
// THRESHOLDS
//
// NOTE (calibration): the HIGH >= 5 / MEDIUM >= 2 cutoffs below were lowered
// from a previous HIGH >= 7 without de-duplicating correlated signals, which
// caused systemic over-flagging (audit TS-C1). The de-duplication added in
// `dedupeSignalScore()` now caps each correlated family's contribution to its
// single max weight, so a single market event can no longer stack 4-5 signals.
// These numeric cutoffs themselves still need to be re-derived on labelled
// data — DO NOT treat them as validated. They are intentionally left unchanged
// here so the de-dup change can be evaluated in isolation.
// ============================================================================

const THRESHOLDS = {
  microCapPrice: 5,
  smallMarketCap: 300_000_000,
  microLiquidity: 150_000,
  spike7dMedium: 25,
  spike7dHigh: 50,
  volumeExplosionMedium: 3,
  volumeExplosionHigh: 5,
};

const OTC_THRESHOLDS = {
  spike7dMedium: 10,
  spike7dHigh: 25,
  spike3dMedium: 8,
  spike3dHigh: 20,
  volumeExplosionMedium: 2,
  volumeExplosionHigh: 4,
  volumeSurge3d: 2,
  smallMarketCap: 300_000_000,
  microLiquidity: 150_000,
};

const MAJOR_THRESHOLDS = {
  ...THRESHOLDS,
  spike3dMedium: 15,
  spike3dHigh: 35,
  volumeSurge3d: 3,
};

// Magnitude floor (in %) below which the acceleration signals must not fire.
// Three consecutive +0.1% days is noise, not a pump (audit TS-C1).
const ACCELERATION_PRICE_FLOOR_PCT = 2;
const ACCELERATION_VOLUME_FLOOR_RATIO = 2; // latest day >= 2x the first day of the window

function getThresholds(isOTC: boolean) {
  if (isOTC) return OTC_THRESHOLDS;
  return MAJOR_THRESHOLDS;
}

// ============================================================================
// MARKET CATEGORY / DATA-COMPLETENESS HELPERS
// ============================================================================

/** Resolve the effective market category from explicit field or legacy isOTC. */
export function getMarketCategory(marketData: MarketData): MarketCategory {
  if (marketData.category) return marketData.category;
  return marketData.isOTC ? "OTC" : "MAJOR";
}

/** Number of usable daily price points required for pattern/anomaly detection. */
export const MIN_HISTORY_POINTS = 30;

/** Classify how complete the market data is (drives confidence surfacing). */
export function getDataCompleteness(marketData: MarketData): DataCompleteness {
  if (!marketData.dataAvailable || !marketData.quote) return "none";
  if (marketData.priceHistory.length < MIN_HISTORY_POINTS) return "quote-only";
  return "full";
}

// ============================================================================
// "UNKNOWN value" guards (audit TS-H1)
//
// Missing / zero price, market cap and dollar-volume must be treated as
// UNKNOWN — we skip the structural signal rather than scoring 0 as the
// worst-case (microcap / penny / illiquid), which fabricated up to +6 risk for
// any stock on a data gap.
// ============================================================================

function isKnownPositive(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

// ============================================================================
// PURE PRICE / VOLUME MATH (moved here from marketData.ts; re-exported there)
// ============================================================================

/** Calculate price change percentage over a period. */
export function calculatePriceChange(
  priceHistory: PriceHistory[],
  days: number,
): number | null {
  if (priceHistory.length < days + 1) return null;

  const currentPrice = priceHistory[priceHistory.length - 1].close;
  const pastPrice = priceHistory[priceHistory.length - 1 - days].close;

  if (pastPrice === 0) return null;

  return ((currentPrice - pastPrice) / pastPrice) * 100;
}

/**
 * Calculate volume ratio of recent activity vs a 30-day baseline.
 *
 * The baseline EXCLUDES the most recent 7 days so a genuine spike is not
 * diluted by the very days it occurred on (audit TS-M1). Falls back to the
 * full 30-day window when there is not enough history to carve out a baseline.
 */
export function calculateVolumeRatio(
  priceHistory: PriceHistory[],
  days: number = 7,
): number | null {
  if (priceHistory.length < 30) return null;

  // Baseline = the 30 days ending 7 days ago (spike-free where possible).
  const baseline =
    priceHistory.length >= 37
      ? priceHistory.slice(-37, -7)
      : priceHistory.slice(-30);
  const avgBaselineVolume =
    baseline.reduce((sum, day) => sum + day.volume, 0) / baseline.length;

  const recentDays = priceHistory.slice(-days);
  const recentAvgVolume =
    recentDays.reduce((sum, day) => sum + day.volume, 0) / days;

  if (avgBaselineVolume === 0) return null;

  return recentAvgVolume / avgBaselineVolume;
}

/**
 * Detect spike-then-drop (pump-and-dump): price spiked >= 25% then dropped
 * >= 20% from the local max, with the max not at the very end.
 *
 * Also returns the measured percentages so callers can interpolate them into
 * the user-facing description instead of overstating them (audit TS-M3).
 */
export function detectSpikeThenDropDetailed(priceHistory: PriceHistory[]): {
  detected: boolean;
  spikePercent: number;
  dropPercent: number;
} {
  if (priceHistory.length < 15) {
    return { detected: false, spikePercent: 0, dropPercent: 0 };
  }

  const recent = priceHistory.slice(-15);
  const startPrice = recent[0].close;

  let maxPrice = startPrice;
  let maxIndex = 0;
  for (let i = 0; i < recent.length; i++) {
    if (recent[i].high > maxPrice) {
      maxPrice = recent[i].high;
      maxIndex = i;
    }
  }

  const spikePercent =
    startPrice > 0 ? ((maxPrice - startPrice) / startPrice) * 100 : 0;
  const currentPrice = recent[recent.length - 1].close;
  const dropPercent =
    maxPrice > 0 ? ((maxPrice - currentPrice) / maxPrice) * 100 : 0;

  const detected =
    spikePercent >= 25 && dropPercent >= 20 && maxIndex < recent.length - 2;

  return { detected, spikePercent, dropPercent };
}

/** Boolean convenience wrapper (preserves the original public signature). */
export function detectSpikeThenDrop(priceHistory: PriceHistory[]): boolean {
  return detectSpikeThenDropDetailed(priceHistory).detected;
}

function calculateZScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length === 0) return 0;
  const avg = mean(arr);
  const squareDiffs = arr.map((value) => Math.pow(value - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

/**
 * Calculate RSI (Relative Strength Index).
 *
 * Standard Wilder-style averaging: gain/loss sums divided by `period` (not by
 * the count of up/down days). A perfectly flat series (no gains AND no losses)
 * returns the neutral 50 rather than a phantom 100 (audit TS-H3).
 */
export function calculateRSI(
  priceHistory: PriceHistory[],
  period: number = 14,
): number | null {
  if (priceHistory.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < priceHistory.length; i++) {
    changes.push(priceHistory[i].close - priceHistory[i - 1].close);
  }

  const recentChanges = changes.slice(-period);
  const gainSum = recentChanges
    .filter((c) => c > 0)
    .reduce((s, c) => s + c, 0);
  const lossSum = recentChanges
    .filter((c) => c < 0)
    .reduce((s, c) => s + Math.abs(c), 0);

  const avgGain = gainSum / period;
  const avgLoss = lossSum / period;

  // Flat series: neither overbought nor oversold.
  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Detect price anomaly using a z-score over the most recent few days.
 *
 * Inspecting only the single latest day (the previous behaviour) missed pumps
 * that peaked 2-3 days ago and fired on ~5% of ordinary days at the >= 2σ
 * cutoff (audit TS-M2). We now take the max |z| over the last `lookback` days
 * and require >= 2.5σ for the lowest severity.
 */
export function detectPriceAnomaly(
  priceHistory: PriceHistory[],
  lookback: number = 5,
): {
  isAnomaly: boolean;
  zScore: number;
  severity: "low" | "medium" | "high" | "extreme";
} {
  if (priceHistory.length < 30) {
    return { isAnomaly: false, zScore: 0, severity: "low" };
  }

  const returns: number[] = [];
  for (let i = 1; i < priceHistory.length; i++) {
    const prev = priceHistory[i - 1].close;
    returns.push(prev > 0 ? (priceHistory[i].close - prev) / prev : 0);
  }

  // Baseline excludes the recent window we are testing.
  const window = Math.min(lookback, returns.length - 1);
  const baselineReturns = returns.slice(0, returns.length - window);
  const recentReturns = returns.slice(-window);

  const returnMean = mean(baselineReturns);
  const returnStd = std(baselineReturns);

  // Pick the most extreme recent day.
  let zScore = 0;
  for (const r of recentReturns) {
    const z = calculateZScore(r, returnMean, returnStd);
    if (Math.abs(z) > Math.abs(zScore)) zScore = z;
  }

  const absZ = Math.abs(zScore);
  let severity: "low" | "medium" | "high" | "extreme" = "low";
  let isAnomaly = false;

  if (absZ >= 4) {
    severity = "extreme";
    isAnomaly = true;
  } else if (absZ >= 3) {
    severity = "high";
    isAnomaly = true;
  } else if (absZ >= 2.5) {
    severity = "medium";
    isAnomaly = true;
  }

  return { isAnomaly, zScore, severity };
}

/** Detect volume anomaly using a z-score over the most recent few days. */
export function detectVolumeAnomaly(
  priceHistory: PriceHistory[],
  lookback: number = 5,
): {
  isAnomaly: boolean;
  zScore: number;
  multiplier: number;
} {
  if (priceHistory.length < 30) {
    return { isAnomaly: false, zScore: 0, multiplier: 1 };
  }

  const volumes = priceHistory.map((p) => p.volume);
  const window = Math.min(lookback, volumes.length - 1);
  const baselineVolumes = volumes.slice(0, volumes.length - window);
  const recentVolumes = volumes.slice(-window);

  const volMean = mean(baselineVolumes);
  const volStd = std(baselineVolumes);

  let zScore = 0;
  for (const v of recentVolumes) {
    const z = calculateZScore(v, volMean, volStd);
    if (Math.abs(z) > Math.abs(zScore)) zScore = z;
  }
  const peakRecent = Math.max(...recentVolumes);
  const multiplier = volMean > 0 ? peakRecent / volMean : 1;

  // Require >= 2.5σ (was > 2) or > 3x average.
  const isAnomaly = zScore >= 2.5 || multiplier > 3;

  return { isAnomaly, zScore, multiplier };
}

/** Calculate surge metrics for different time periods. */
export function calculateSurgeMetrics(priceHistory: PriceHistory[]): {
  surge7d: number | null;
  surge30d: number | null;
  surge90d: number | null;
  isExtremeSurge: boolean;
} {
  const result = {
    surge7d: calculatePriceChange(priceHistory, 7),
    surge30d: calculatePriceChange(priceHistory, 30),
    surge90d: calculatePriceChange(priceHistory, 90),
    isExtremeSurge: false,
  };

  if (
    (result.surge7d !== null && result.surge7d > 100) ||
    (result.surge30d !== null && result.surge30d > 200)
  ) {
    result.isExtremeSurge = true;
  }

  return result;
}

/** Calculate volatility metrics. */
export function calculateVolatility(priceHistory: PriceHistory[]): {
  dailyVolatility: number;
  isHighVolatility: boolean;
} {
  if (priceHistory.length < 14) {
    return { dailyVolatility: 0, isHighVolatility: false };
  }

  const returns: number[] = [];
  for (let i = 1; i < priceHistory.length; i++) {
    const prev = priceHistory[i - 1].close;
    returns.push(prev > 0 ? (priceHistory[i].close - prev) / prev : 0);
  }

  const recentReturns = returns.slice(-14);
  const dailyVolatility = std(recentReturns) * 100;
  const isHighVolatility = dailyVolatility > 5;

  return { dailyVolatility, isHighVolatility };
}

// ============================================================================
// STRUCTURED ANOMALY DETECTION (audit TS-H4)
//
// `runAnomalyDetection` now returns structured objects keyed by `code` so
// downstream code matches on a stable code, not on prose that drifts between
// modules (the old "overbought" vs "Overbought" case bug dropped signals).
// ============================================================================

export type AnomalyCode =
  | "PRICE_ANOMALY"
  | "VOLUME_ANOMALY"
  | "EXTREME_SURGE"
  | "OVERBOUGHT_RSI"
  | "HIGH_VOLATILITY";

export interface AnomalySignal {
  code: AnomalyCode;
  severity: "low" | "medium" | "high" | "extreme";
  value: number;
  description: string;
}

export interface AnomalyDetectionResult {
  hasAnomalies: boolean;
  anomalyScore: number;
  signals: AnomalySignal[];
}

export function runAnomalyDetection(
  priceHistory: PriceHistory[],
): AnomalyDetectionResult {
  const signals: AnomalySignal[] = [];
  let anomalyScore = 0;

  // Price anomaly
  const priceAnomaly = detectPriceAnomaly(priceHistory);
  if (priceAnomaly.isAnomaly) {
    if (priceAnomaly.severity === "extreme") {
      signals.push({
        code: "PRICE_ANOMALY",
        severity: "extreme",
        value: priceAnomaly.zScore,
        description: `Extreme price movement detected (Z-score: ${priceAnomaly.zScore.toFixed(1)})`,
      });
      anomalyScore += 4;
    } else if (priceAnomaly.severity === "high") {
      signals.push({
        code: "PRICE_ANOMALY",
        severity: "high",
        value: priceAnomaly.zScore,
        description: `Significant price anomaly detected (Z-score: ${priceAnomaly.zScore.toFixed(1)})`,
      });
      anomalyScore += 3;
    } else if (priceAnomaly.severity === "medium") {
      signals.push({
        code: "PRICE_ANOMALY",
        severity: "medium",
        value: priceAnomaly.zScore,
        description: `Unusual price movement detected (Z-score: ${priceAnomaly.zScore.toFixed(1)})`,
      });
      anomalyScore += 2;
    }
  }

  // Volume anomaly
  const volumeAnomaly = detectVolumeAnomaly(priceHistory);
  if (volumeAnomaly.isAnomaly) {
    const isExtremeVol = volumeAnomaly.multiplier > 5;
    signals.push({
      code: "VOLUME_ANOMALY",
      severity: isExtremeVol ? "high" : "medium",
      value: volumeAnomaly.multiplier,
      description: `Unusual trading volume: ${volumeAnomaly.multiplier.toFixed(1)}x normal`,
    });
    anomalyScore += isExtremeVol ? 3 : 2;
  }

  // Surge
  const surgeMetrics = calculateSurgeMetrics(priceHistory);
  if (surgeMetrics.isExtremeSurge) {
    const surgeVal = surgeMetrics.surge7d ?? surgeMetrics.surge30d ?? 0;
    signals.push({
      code: "EXTREME_SURGE",
      severity: "high",
      value: surgeVal,
      description: `Extreme price surge: ${surgeVal.toFixed(0)}% gain`,
    });
    anomalyScore += 3;
  }

  // RSI overbought
  const rsi = calculateRSI(priceHistory);
  if (rsi !== null && rsi > 80) {
    signals.push({
      code: "OVERBOUGHT_RSI",
      severity: "high",
      value: rsi,
      description: `Extremely overbought (RSI: ${rsi.toFixed(0)})`,
    });
    anomalyScore += 2;
  } else if (rsi !== null && rsi > 70) {
    signals.push({
      code: "OVERBOUGHT_RSI",
      severity: "medium",
      value: rsi,
      description: `Overbought conditions (RSI: ${rsi.toFixed(0)})`,
    });
    anomalyScore += 1;
  }

  // Volatility
  const volatility = calculateVolatility(priceHistory);
  if (volatility.isHighVolatility) {
    signals.push({
      code: "HIGH_VOLATILITY",
      severity: "low",
      value: volatility.dailyVolatility,
      description: `High volatility: ${volatility.dailyVolatility.toFixed(1)}% daily swings`,
    });
    anomalyScore += 1;
  }

  return {
    hasAnomalies: signals.length > 0,
    anomalyScore,
    signals,
  };
}

// ============================================================================
// BEHAVIORAL NLP
// ============================================================================

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
  specificReturnPattern:
    /(\d{1,4})\s*%\s*(in|within|over)?\s*(\d+)?\s*(day|week|month|hour)/i,
};

function analyzePitchText(pitchText: string): {
  hasPromisedReturns: boolean;
  hasUrgency: boolean;
  hasSecrecy: boolean;
  hasSpecificReturnClaim: boolean;
} {
  const lowerText = pitchText.toLowerCase();

  const hasPromisedReturns = BEHAVIORAL_KEYWORDS.promisedReturns.some((kw) =>
    lowerText.includes(kw.toLowerCase()),
  );
  const hasUrgency = BEHAVIORAL_KEYWORDS.urgency.some((kw) =>
    lowerText.includes(kw.toLowerCase()),
  );
  const hasSecrecy = BEHAVIORAL_KEYWORDS.secrecy.some((kw) =>
    lowerText.includes(kw.toLowerCase()),
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

// ============================================================================
// SIGNAL GENERATORS
// ============================================================================

/**
 * Structural signals. Missing/zero price, marketCap and dollar-volume are
 * treated as UNKNOWN (signal skipped) rather than worst-case 0 (audit TS-H1).
 * OTC_EXCHANGE only fires for the OTC category — never for crypto (audit TS-C5).
 */
function getStructuralSignals(marketData: MarketData): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const { quote } = marketData;
  const category = getMarketCategory(marketData);

  if (!quote) return signals;

  if (isKnownPositive(quote.lastPrice) && quote.lastPrice < THRESHOLDS.microCapPrice) {
    signals.push({
      code: SIGNAL_CODES.MICROCAP_PRICE,
      category: "STRUCTURAL",
      description: `Stock price is below $5 ($${quote.lastPrice.toFixed(2)}), often associated with penny stocks and higher manipulation risk`,
      weight: 2,
    });
  }

  if (
    isKnownPositive(quote.marketCap) &&
    quote.marketCap < THRESHOLDS.smallMarketCap
  ) {
    const marketCapM = (quote.marketCap / 1_000_000).toFixed(1);
    signals.push({
      code: SIGNAL_CODES.SMALL_MARKET_CAP,
      category: "STRUCTURAL",
      description: `Small market cap ($${marketCapM}M) - small caps are more vulnerable to manipulation`,
      weight: 2,
    });
  }

  if (
    isKnownPositive(quote.avgDollarVolume30d) &&
    quote.avgDollarVolume30d < THRESHOLDS.microLiquidity
  ) {
    const volumeK = (quote.avgDollarVolume30d / 1_000).toFixed(0);
    signals.push({
      code: SIGNAL_CODES.MICRO_LIQUIDITY,
      category: "STRUCTURAL",
      description: `Very low trading liquidity ($${volumeK}K daily volume) - easier to manipulate prices`,
      weight: 2,
    });
  }

  if (category === "OTC") {
    signals.push({
      code: SIGNAL_CODES.OTC_EXCHANGE,
      category: "STRUCTURAL",
      description: `Traded on OTC markets (${quote.exchange}) - less regulatory oversight than major exchanges`,
      weight: 3,
    });
  }

  return signals;
}

/** Pattern signals from price/volume history. */
function getPatternSignals(marketData: MarketData): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const { priceHistory } = marketData;
  const isOTC = getMarketCategory(marketData) === "OTC";
  const t = getThresholds(isOTC);

  if (priceHistory.length < MIN_HISTORY_POINTS) return signals;

  // SPIKE_7D
  const priceChange7d = calculatePriceChange(priceHistory, 7);
  if (priceChange7d !== null) {
    if (priceChange7d >= t.spike7dHigh) {
      signals.push({
        code: SIGNAL_CODES.SPIKE_7D,
        category: "PATTERN",
        description: `Extreme price spike of ${priceChange7d.toFixed(0)}% in the last 7 trading days - classic pump pattern`,
        weight: 4,
      });
    } else if (priceChange7d >= t.spike7dMedium) {
      signals.push({
        code: SIGNAL_CODES.SPIKE_7D,
        category: "PATTERN",
        description: `Significant price spike of ${priceChange7d.toFixed(0)}% in the last 7 trading days`,
        weight: 3,
      });
    }
  }

  // VOLUME_EXPLOSION
  const volumeRatio = calculateVolumeRatio(priceHistory, 7);
  if (volumeRatio !== null) {
    if (volumeRatio >= t.volumeExplosionHigh) {
      signals.push({
        code: SIGNAL_CODES.VOLUME_EXPLOSION,
        category: "PATTERN",
        description: `Trading volume is ${volumeRatio.toFixed(1)}x the 30-day average - extreme unusual activity`,
        weight: 3,
      });
    } else if (volumeRatio >= t.volumeExplosionMedium) {
      signals.push({
        code: SIGNAL_CODES.VOLUME_EXPLOSION,
        category: "PATTERN",
        description: `Trading volume is ${volumeRatio.toFixed(1)}x the 30-day average - unusual activity`,
        weight: 2,
      });
    }
  }

  // SPIKE_THEN_DROP — interpolate the real measured percentages (audit TS-M3)
  const spikeDrop = detectSpikeThenDropDetailed(priceHistory);
  if (spikeDrop.detected) {
    signals.push({
      code: SIGNAL_CODES.SPIKE_THEN_DROP,
      category: "PATTERN",
      description: `Price spiked ${spikeDrop.spikePercent.toFixed(0)}% then dropped ${spikeDrop.dropPercent.toFixed(0)}% from its peak - classic pump-and-dump pattern`,
      weight: 3,
    });
  }

  const prices = priceHistory;

  // SPIKE_3D (signed: a crash is not a pump — audit TS-M4)
  {
    const recent = prices[prices.length - 1];
    const threeDaysAgo = prices[prices.length - 4];
    if (recent && threeDaysAgo && threeDaysAgo.close > 0) {
      const change3d =
        ((recent.close - threeDaysAgo.close) / threeDaysAgo.close) * 100;
      if (change3d >= t.spike3dHigh) {
        signals.push({
          code: SIGNAL_CODES.SPIKE_3D,
          category: "PATTERN",
          description: `Price surged ${change3d.toFixed(1)}% in 3 days`,
          weight: 3,
        });
      } else if (change3d >= t.spike3dMedium) {
        signals.push({
          code: SIGNAL_CODES.SPIKE_3D,
          category: "PATTERN",
          description: `Price surged ${change3d.toFixed(1)}% in 3 days`,
          weight: 2,
        });
      }
    }
  }

  // VOLUME_SURGE_3D
  {
    const vol3d = prices.slice(-3).reduce((s, p) => s + (p.volume || 0), 0) / 3;
    const vol30d =
      prices.slice(-30).reduce((s, p) => s + (p.volume || 0), 0) / 30;
    if (vol30d > 0) {
      const volRatio3d = vol3d / vol30d;
      if (volRatio3d >= t.volumeSurge3d) {
        signals.push({
          code: SIGNAL_CODES.VOLUME_SURGE_3D,
          category: "PATTERN",
          description: `3-day volume ${volRatio3d.toFixed(1)}x above 30-day average`,
          weight: 2,
        });
      }
    }
  }

  // PRICE_ACCELERATION — needs a real magnitude, not 3 consecutive +0.1% days.
  {
    const returns = prices
      .slice(-4)
      .map((p, i, arr) =>
        i > 0 ? (p.close - arr[i - 1].close) / arr[i - 1].close : 0,
      )
      .slice(1);
    const cumulativePct =
      prices.length >= 4 && prices[prices.length - 4].close > 0
        ? ((prices[prices.length - 1].close - prices[prices.length - 4].close) /
            prices[prices.length - 4].close) *
          100
        : 0;
    if (
      returns[2] > returns[1] &&
      returns[1] > returns[0] &&
      returns[2] > 0 &&
      cumulativePct >= ACCELERATION_PRICE_FLOOR_PCT
    ) {
      signals.push({
        code: SIGNAL_CODES.PRICE_ACCELERATION,
        category: "PATTERN",
        description: `Price gains accelerating over 3 consecutive days (${cumulativePct.toFixed(1)}% total)`,
        weight: 2,
      });
    }
  }

  // VOLUME_ACCELERATION — require a meaningful jump, not three tiny upticks.
  {
    const vols = prices.slice(-4).map((p) => p.volume || 0);
    if (
      vols[3] > vols[2] &&
      vols[2] > vols[1] &&
      vols[1] > vols[0] &&
      vols[0] > 0 &&
      vols[3] >= vols[0] * ACCELERATION_VOLUME_FLOOR_RATIO
    ) {
      signals.push({
        code: SIGNAL_CODES.VOLUME_ACCELERATION,
        category: "PATTERN",
        description: "Volume increasing for 3+ consecutive days",
        weight: 2,
      });
    }
  }

  return signals;
}

/** Advanced anomaly signals (Z-score etc.), matched on stable codes. */
function getAnomalySignals(marketData: MarketData): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const { priceHistory } = marketData;

  if (priceHistory.length < MIN_HISTORY_POINTS) return signals;

  const anomalyResult = runAnomalyDetection(priceHistory);
  if (!anomalyResult.hasAnomalies) return signals;

  for (const a of anomalyResult.signals) {
    switch (a.code) {
      case "PRICE_ANOMALY":
        signals.push({
          code: SIGNAL_CODES.PRICE_ANOMALY,
          category: "PATTERN",
          description:
            a.description +
            (a.severity === "medium"
              ? " - may indicate manipulation"
              : " - statistically unusual price behavior"),
          weight: a.severity === "extreme" ? 4 : a.severity === "high" ? 3 : 2,
        });
        break;
      case "VOLUME_ANOMALY":
        signals.push({
          code: SIGNAL_CODES.VOLUME_ANOMALY,
          category: "PATTERN",
          description: a.description + " - could signal coordinated buying",
          weight: 2,
        });
        break;
      case "EXTREME_SURGE":
        signals.push({
          code: SIGNAL_CODES.EXTREME_SURGE,
          category: "PATTERN",
          description: a.description + " - rapid appreciation without clear catalyst",
          weight: 3,
        });
        break;
      case "OVERBOUGHT_RSI":
        signals.push({
          code: SIGNAL_CODES.OVERBOUGHT_RSI,
          category: "PATTERN",
          description: a.description + " - price may be unsustainably high",
          weight: a.severity === "high" ? 2 : 1,
        });
        break;
      case "HIGH_VOLATILITY":
        signals.push({
          code: SIGNAL_CODES.HIGH_VOLATILITY,
          category: "PATTERN",
          description: a.description + " - erratic price movement increases risk",
          weight: 1,
        });
        break;
    }
  }

  return signals;
}

/** Behavioral signals from explicit context toggles and pitch-text NLP. */
function getBehavioralSignals(
  context: ScoringInput["context"],
  pitchText: string,
): RiskSignal[] {
  const signals: RiskSignal[] = [];
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
      code: SIGNAL_CODES.UNSOLICITED,
      category: "BEHAVIORAL",
      description:
        "You received this tip without asking - unsolicited stock tips are a common scam tactic",
      weight: 1,
    });
  }

  if (context.promisesHighReturns || nlpResults.hasPromisedReturns) {
    signals.push({
      code: SIGNAL_CODES.PROMISED_RETURNS,
      category: "BEHAVIORAL",
      description:
        "The pitch promises high or guaranteed returns - no legitimate investment can guarantee returns",
      weight: 2,
    });
  }

  if (context.urgencyPressure || nlpResults.hasUrgency) {
    signals.push({
      code: SIGNAL_CODES.URGENCY,
      category: "BEHAVIORAL",
      description:
        "The pitch creates urgency or time pressure - scammers want you to act before you can think",
      weight: 2,
    });
  }

  if (context.secrecyInsideInfo || nlpResults.hasSecrecy) {
    signals.push({
      code: SIGNAL_CODES.SECRECY,
      category: "BEHAVIORAL",
      description:
        "The pitch suggests insider or secret information - this is likely illegal or fake",
      weight: 2,
    });
  }

  if (nlpResults.hasSpecificReturnClaim) {
    signals.push({
      code: SIGNAL_CODES.SPECIFIC_RETURN_CLAIM,
      category: "BEHAVIORAL",
      description:
        "The pitch claims specific percentage gains in a specific timeframe - a major red flag",
      weight: 1,
    });
  }

  return signals;
}

// ============================================================================
// SIGNAL DE-DUPLICATION (audit TS-C1)
//
// Correlated signals all describe the SAME underlying market event, so summing
// them double-counts. We keep every signal VISIBLE in `signals[]` for
// transparency but, when totalling the score, each family contributes only its
// single MAX weight.
// ============================================================================

const PRICE_FAMILY = new Set<string>([
  SIGNAL_CODES.SPIKE_7D,
  SIGNAL_CODES.SPIKE_3D,
  SIGNAL_CODES.PRICE_ANOMALY,
  SIGNAL_CODES.EXTREME_SURGE,
  SIGNAL_CODES.PRICE_ACCELERATION,
]);

const VOLUME_FAMILY = new Set<string>([
  SIGNAL_CODES.VOLUME_EXPLOSION,
  SIGNAL_CODES.VOLUME_ANOMALY,
  SIGNAL_CODES.VOLUME_SURGE_3D,
  SIGNAL_CODES.VOLUME_ACCELERATION,
]);

/**
 * Compute the de-duplicated total score: each correlated family (price, volume)
 * contributes only its single highest weight; everything else sums normally.
 */
export function dedupeSignalScore(signals: RiskSignal[]): number {
  let total = 0;
  let priceMax = 0;
  let volumeMax = 0;

  for (const s of signals) {
    if (PRICE_FAMILY.has(s.code)) {
      priceMax = Math.max(priceMax, s.weight);
    } else if (VOLUME_FAMILY.has(s.code)) {
      volumeMax = Math.max(volumeMax, s.weight);
    } else {
      total += s.weight;
    }
  }

  return total + priceMax + volumeMax;
}

// ============================================================================
// RISK LEVEL / LEGITIMACY / INSUFFICIENCY
// ============================================================================

/**
 * Derive risk level from a (de-duplicated) score.
 *
 * Thresholds: HIGH >= 5, MEDIUM >= 2 — applied to the DE-DUPLICATED score (see
 * the THRESHOLDS note above; these cutoffs still need recalibration). An
 * alert-list hit always forces HIGH.
 */
export function calculateRiskLevel(
  dedupedScore: number,
  signals: RiskSignal[],
): RiskLevel {
  const hasAlertHit = signals.some(
    (s) => s.code === SIGNAL_CODES.ALERT_LIST_HIT,
  );
  if (hasAlertHit) return "HIGH";

  if (dedupedScore >= 5) return "HIGH";
  if (dedupedScore >= 2) return "MEDIUM";
  return "LOW";
}

/**
 * Shared legitimacy check used by BOTH the AI and TS paths (audit TS-H6/H9).
 *
 * A ticker is only "well-established / blue-chip" when it is a large-cap,
 * high-liquidity, major-exchange name with no disqualifying signal. Critically,
 * `riskLevel` is passed in and any non-LOW level forces `isLegitimate = false`
 * so we never present a HIGH-risk or unknown ticker as a confirmed blue-chip.
 */
export function checkIsLegitimate(
  marketData: MarketData,
  signals: RiskSignal[],
  riskLevel: RiskLevel,
): boolean {
  if (!marketData.quote) return false;
  if (riskLevel !== "LOW") return false;

  const { quote } = marketData;
  const category = getMarketCategory(marketData);
  const isLargeCap = quote.marketCap > 10_000_000_000; // > $10B
  const isHighLiquidity = quote.avgDollarVolume30d > 10_000_000; // > $10M daily
  const isMajorExchange = category === "MAJOR";

  // Any PATTERN signal also disqualifies (audit TS-H9): a $50B stock in a hot
  // earnings week should not be simultaneously HIGH and "well-established".
  const hasDisqualifyingSignals = signals.some(
    (s) =>
      s.category === "STRUCTURAL" ||
      s.category === "ALERT" ||
      s.category === "BEHAVIORAL" ||
      s.category === "PATTERN",
  );

  return (
    isLargeCap && isHighLiquidity && isMajorExchange && !hasDisqualifyingSignals
  );
}

/**
 * Only truly INSUFFICIENT when there is no usable data at all AND there is no
 * strong signal (alert-list hit or behavioral evidence) to act on. A
 * trading-suspended ticker (alert hit, no quote) must remain HIGH, and a strong
 * behavioral pitch on an unlisted ticker should not collapse to INSUFFICIENT.
 */
export function checkIsInsufficient(
  marketData: MarketData,
  signals: RiskSignal[],
): boolean {
  const hasData = marketData.dataAvailable && !!marketData.quote;
  if (hasData) return false;

  const hasAlertHit = signals.some(
    (s) => s.code === SIGNAL_CODES.ALERT_LIST_HIT,
  );
  const behavioralWeight = signals
    .filter((s) => s.category === "BEHAVIORAL")
    .reduce((sum, s) => sum + s.weight, 0);

  // Enough to act on even without market data.
  if (hasAlertHit || behavioralWeight >= 4) return false;

  return true;
}

// ============================================================================
// MAIN PURE SCORING ENTRYPOINT
// ============================================================================

/**
 * Pure, synchronous scoring. Performs no I/O — the caller passes in the
 * already-resolved `secFlagged` (regulatory/alert-list result). This is the
 * single source of truth shared by production and the evaluation harness.
 */
export function scoreMarketData(input: ScoringInput): ScoringResult {
  const { marketData, pitchText, context } = input;
  const signals: RiskSignal[] = [];

  signals.push(...getStructuralSignals(marketData));
  signals.push(...getPatternSignals(marketData));
  signals.push(...getAnomalySignals(marketData));
  signals.push(...getBehavioralSignals(context, pitchText));

  if (input.secFlagged) {
    signals.push({
      code: SIGNAL_CODES.ALERT_LIST_HIT,
      category: "ALERT",
      description:
        "This stock appears on regulatory alert or suspension lists - extreme caution advised",
      weight: 5,
    });
  }

  // De-duplicated total (correlated families capped to their max weight).
  const totalScore = dedupeSignalScore(signals);

  const riskLevel = calculateRiskLevel(totalScore, signals);
  const isInsufficient = checkIsInsufficient(marketData, signals);
  const isLegitimate = checkIsLegitimate(marketData, signals, riskLevel);
  const dataCompleteness = getDataCompleteness(marketData);

  return {
    signals,
    totalScore,
    riskLevel: isInsufficient ? "INSUFFICIENT" : riskLevel,
    isInsufficient,
    isLegitimate,
    dataCompleteness,
  };
}
