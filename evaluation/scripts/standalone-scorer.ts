/**
 * Standalone Scoring Module for Evaluation
 *
 * This is a self-contained version of the scoring logic that doesn't
 * depend on Next.js or database connections.
 */

// Types
export interface PriceHistory {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockQuote {
  ticker: string;
  companyName: string;
  exchange: string;
  lastPrice: number;
  marketCap: number;
  avgVolume30d: number;
  avgDollarVolume30d: number;
}

export interface MarketData {
  quote: StockQuote | null;
  priceHistory: PriceHistory[];
  isOTC: boolean;
  dataAvailable: boolean;
}

export interface RiskSignal {
  code: string;
  category: "STRUCTURAL" | "PATTERN" | "ALERT" | "BEHAVIORAL";
  weight: number;
  description: string;
}

export interface ScoringResult {
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT";
  totalScore: number;
  signals: RiskSignal[];
  isLegitimate: boolean;
  isInsufficient: boolean;
}

// Signal codes
export const SIGNAL_CODES = {
  MICROCAP_PRICE: "MICROCAP_PRICE",
  SMALL_MARKET_CAP: "SMALL_MARKET_CAP",
  MICRO_LIQUIDITY: "MICRO_LIQUIDITY",
  OTC_EXCHANGE: "OTC_EXCHANGE",
  SPIKE_7D: "SPIKE_7D",
  VOLUME_EXPLOSION: "VOLUME_EXPLOSION",
  SPIKE_THEN_DROP: "SPIKE_THEN_DROP",
  OVERBOUGHT_RSI: "OVERBOUGHT_RSI",
  HIGH_VOLATILITY: "HIGH_VOLATILITY",
} as const;

// Thresholds - Updated based on research analysis
const THRESHOLDS = {
  microCapPrice: 5,
  smallMarketCap: 300_000_000,
  microLiquidity: 150_000,
  spike7dMedium: 25,
  spike7dHigh: 50,
  volumeExplosionMedium: 3,
  volumeExplosionHigh: 5,
};

// Calculate price change percentage over a period
function calculatePriceChange(priceHistory: PriceHistory[], days: number): number | null {
  if (priceHistory.length < days + 1) return null;
  const currentPrice = priceHistory[priceHistory.length - 1].close;
  const pastPrice = priceHistory[priceHistory.length - 1 - days].close;
  if (pastPrice === 0) return null;
  return ((currentPrice - pastPrice) / pastPrice) * 100;
}

// Calculate volume ratio compared to 30-day average
function calculateVolumeRatio(priceHistory: PriceHistory[], days: number = 7): number | null {
  if (priceHistory.length < 30) return null;
  const last30Days = priceHistory.slice(-30);
  const avgVolume30d = last30Days.reduce((sum, day) => sum + day.volume, 0) / 30;
  const recentDays = priceHistory.slice(-days);
  const recentAvgVolume = recentDays.reduce((sum, day) => sum + day.volume, 0) / days;
  if (avgVolume30d === 0) return null;
  return recentAvgVolume / avgVolume30d;
}

// Detect spike-then-drop pattern
function detectSpikeThenDrop(priceHistory: PriceHistory[]): boolean {
  if (priceHistory.length < 15) return false;
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
  const spikePercent = ((maxPrice - startPrice) / startPrice) * 100;
  if (spikePercent < 25) return false;
  const currentPrice = recent[recent.length - 1].close;
  const dropPercent = ((maxPrice - currentPrice) / maxPrice) * 100;
  return dropPercent >= 20 && maxIndex < recent.length - 2;
}

// Calculate RSI
function calculateRSI(priceHistory: PriceHistory[], period: number = 14): number | null {
  if (priceHistory.length < period + 1) return null;
  const changes: number[] = [];
  for (let i = 1; i < priceHistory.length; i++) {
    changes.push(priceHistory[i].close - priceHistory[i - 1].close);
  }
  const recentChanges = changes.slice(-period);
  const gains = recentChanges.filter(c => c > 0);
  const losses = recentChanges.filter(c => c < 0).map(c => Math.abs(c));
  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;
  // If no movement (flat price data), RSI is neutral (50)
  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate volatility
function calculateVolatility(priceHistory: PriceHistory[]): { dailyVolatility: number; isHighVolatility: boolean } {
  if (priceHistory.length < 14) {
    return { dailyVolatility: 0, isHighVolatility: false };
  }
  const returns: number[] = [];
  for (let i = 1; i < priceHistory.length; i++) {
    const dailyReturn = (priceHistory[i].close - priceHistory[i - 1].close) / priceHistory[i - 1].close;
    returns.push(dailyReturn);
  }
  const recentReturns = returns.slice(-14);
  const mean = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
  const squareDiffs = recentReturns.map(r => Math.pow(r - mean, 2));
  const dailyVolatility = Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length) * 100;
  return { dailyVolatility, isHighVolatility: dailyVolatility > 5 };
}

// Check structural signals
function checkStructuralSignals(marketData: MarketData): RiskSignal[] {
  const signals: RiskSignal[] = [];
  if (!marketData.quote) return signals;

  const { quote } = marketData;

  // MICROCAP_PRICE
  if (quote.lastPrice < THRESHOLDS.microCapPrice) {
    signals.push({
      code: SIGNAL_CODES.MICROCAP_PRICE,
      category: "STRUCTURAL",
      weight: 2,
      description: `Stock price ($${quote.lastPrice.toFixed(2)}) is below $5 (penny stock territory)`,
    });
  }

  // SMALL_MARKET_CAP
  if (quote.marketCap > 0 && quote.marketCap < THRESHOLDS.smallMarketCap) {
    signals.push({
      code: SIGNAL_CODES.SMALL_MARKET_CAP,
      category: "STRUCTURAL",
      weight: 2,
      description: `Small market cap ($${(quote.marketCap / 1_000_000).toFixed(0)}M) - higher manipulation risk`,
    });
  }

  // MICRO_LIQUIDITY
  if (quote.avgDollarVolume30d < THRESHOLDS.microLiquidity) {
    signals.push({
      code: SIGNAL_CODES.MICRO_LIQUIDITY,
      category: "STRUCTURAL",
      weight: 2,
      description: `Very low daily trading volume ($${(quote.avgDollarVolume30d / 1000).toFixed(0)}K)`,
    });
  }

  // OTC_EXCHANGE
  if (marketData.isOTC) {
    signals.push({
      code: SIGNAL_CODES.OTC_EXCHANGE,
      category: "STRUCTURAL",
      weight: 3,
      description: "Traded on OTC/Pink Sheets - less regulated, higher risk",
    });
  }

  return signals;
}

// Check pattern signals
function checkPatternSignals(marketData: MarketData): RiskSignal[] {
  const signals: RiskSignal[] = [];
  if (marketData.priceHistory.length < 7) return signals;

  const priceHistory = marketData.priceHistory;

  // SPIKE_7D
  const priceChange7d = calculatePriceChange(priceHistory, 7);
  if (priceChange7d !== null) {
    if (Math.abs(priceChange7d) >= THRESHOLDS.spike7dHigh) {
      signals.push({
        code: SIGNAL_CODES.SPIKE_7D,
        category: "PATTERN",
        weight: 4,
        description: `Extreme price movement (${priceChange7d > 0 ? '+' : ''}${priceChange7d.toFixed(0)}%) in 7 days`,
      });
    } else if (Math.abs(priceChange7d) >= THRESHOLDS.spike7dMedium) {
      signals.push({
        code: SIGNAL_CODES.SPIKE_7D,
        category: "PATTERN",
        weight: 3,
        description: `Significant price movement (${priceChange7d > 0 ? '+' : ''}${priceChange7d.toFixed(0)}%) in 7 days`,
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
        weight: 3,
        description: `Extreme volume surge (${volumeRatio.toFixed(1)}x normal)`,
      });
    } else if (volumeRatio >= THRESHOLDS.volumeExplosionMedium) {
      signals.push({
        code: SIGNAL_CODES.VOLUME_EXPLOSION,
        category: "PATTERN",
        weight: 2,
        description: `Elevated trading volume (${volumeRatio.toFixed(1)}x normal)`,
      });
    }
  }

  // SPIKE_THEN_DROP
  if (detectSpikeThenDrop(priceHistory)) {
    signals.push({
      code: SIGNAL_CODES.SPIKE_THEN_DROP,
      category: "PATTERN",
      weight: 3,
      description: "Pump-and-dump pattern detected: rapid price increase followed by sharp decline",
    });
  }

  // OVERBOUGHT_RSI
  const rsi = calculateRSI(priceHistory);
  if (rsi !== null && rsi > 70) {
    signals.push({
      code: SIGNAL_CODES.OVERBOUGHT_RSI,
      category: "PATTERN",
      weight: rsi > 80 ? 2 : 1,
      description: `Overbought indicator (RSI: ${rsi.toFixed(0)})`,
    });
  }

  // HIGH_VOLATILITY
  const volatility = calculateVolatility(priceHistory);
  if (volatility.isHighVolatility) {
    signals.push({
      code: SIGNAL_CODES.HIGH_VOLATILITY,
      category: "PATTERN",
      weight: 1,
      description: `High price volatility (${volatility.dailyVolatility.toFixed(1)}% daily)`,
    });
  }

  return signals;
}

// Compute risk level from score
function computeRiskLevel(totalScore: number): "LOW" | "MEDIUM" | "HIGH" {
  if (totalScore >= 5) return "HIGH";
  if (totalScore >= 2) return "MEDIUM";
  return "LOW";
}

// Check if legitimate
function checkIsLegitimate(marketData: MarketData, signals: RiskSignal[]): boolean {
  if (!marketData.quote) return false;
  const { quote } = marketData;
  const isLargeCap = quote.marketCap > 10_000_000_000;
  const isHighLiquidity = quote.avgDollarVolume30d > 10_000_000;
  const isMajorExchange = !marketData.isOTC;
  const hasDisqualifyingSignals = signals.some(s =>
    s.category === "STRUCTURAL" || s.category === "ALERT" || s.category === "BEHAVIORAL"
  );
  return isLargeCap && isHighLiquidity && isMajorExchange && !hasDisqualifyingSignals;
}

// Main scoring function
export function computeRiskScore(marketData: MarketData): ScoringResult {
  // Check data availability
  if (!marketData.dataAvailable || !marketData.quote) {
    return {
      riskLevel: "INSUFFICIENT",
      totalScore: 0,
      signals: [],
      isLegitimate: false,
      isInsufficient: true,
    };
  }

  // Collect all signals
  const structuralSignals = checkStructuralSignals(marketData);
  const patternSignals = checkPatternSignals(marketData);
  const allSignals = [...structuralSignals, ...patternSignals];

  // Calculate total score
  const totalScore = allSignals.reduce((sum, s) => sum + s.weight, 0);

  // Determine risk level
  const riskLevel = computeRiskLevel(totalScore);

  // Check if legitimate
  const isLegitimate = checkIsLegitimate(marketData, allSignals);

  return {
    riskLevel,
    totalScore,
    signals: allSignals,
    isLegitimate,
    isInsufficient: false,
  };
}
