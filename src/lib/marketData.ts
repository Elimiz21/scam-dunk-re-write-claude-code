/**
 * Market Data Module
 *
 * This module provides real stock market data for risk analysis using Alpha Vantage API.
 *
 * Alpha Vantage API Documentation: https://www.alphavantage.co/documentation/
 * Rate Limits: 5 API requests per minute, 500 requests per day (free tier)
 */

import { MarketData, StockQuote, PriceHistory } from "./types";
import { config } from "./config";
import { logApiUsage } from "./admin/metrics";

// Known OTC exchanges
const OTC_EXCHANGES = ["OTC", "OTCQX", "OTCQB", "PINK", "OTC Markets", "OTHER_OTC"];

// Simple in-memory cache to reduce API calls
const cache: Map<string, { data: MarketData; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Alpha Vantage base URL
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";

/**
 * Fetch stock quote from Alpha Vantage GLOBAL_QUOTE endpoint
 */
async function fetchQuote(ticker: string): Promise<StockQuote | null> {
  const url = `${ALPHA_VANTAGE_BASE_URL}?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${config.alphaVantageApiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    // Check for API errors
    if (data["Error Message"] || data["Note"]) {
      console.error("Alpha Vantage API error:", data["Error Message"] || data["Note"]);
      return null;
    }

    const quote = data["Global Quote"];
    if (!quote || !quote["05. price"]) {
      return null;
    }

    const lastPrice = parseFloat(quote["05. price"]);
    const volume = parseInt(quote["06. volume"], 10);

    return {
      ticker: ticker.toUpperCase(),
      companyName: ticker.toUpperCase(), // Alpha Vantage GLOBAL_QUOTE doesn't return company name
      exchange: "Unknown", // Will be updated from OVERVIEW endpoint
      lastPrice,
      marketCap: 0, // Will be updated from OVERVIEW endpoint
      avgVolume30d: volume, // Using current volume as approximation
      avgDollarVolume30d: volume * lastPrice,
    };
  } catch (error) {
    console.error("Error fetching quote:", error);
    return null;
  }
}

/**
 * Fetch company overview from Alpha Vantage OVERVIEW endpoint
 */
async function fetchCompanyOverview(ticker: string): Promise<{
  companyName: string;
  exchange: string;
  marketCap: number;
} | null> {
  const url = `${ALPHA_VANTAGE_BASE_URL}?function=OVERVIEW&symbol=${ticker}&apikey=${config.alphaVantageApiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data["Error Message"] || !data["Name"]) {
      return null;
    }

    return {
      companyName: data["Name"] || ticker,
      exchange: data["Exchange"] || "Unknown",
      marketCap: parseInt(data["MarketCapitalization"] || "0", 10),
    };
  } catch (error) {
    console.error("Error fetching company overview:", error);
    return null;
  }
}

/**
 * Fetch daily price history from Alpha Vantage TIME_SERIES_DAILY endpoint
 */
async function fetchPriceHistory(ticker: string): Promise<PriceHistory[]> {
  const url = `${ALPHA_VANTAGE_BASE_URL}?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=compact&apikey=${config.alphaVantageApiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data["Error Message"] || data["Note"]) {
      console.error("Alpha Vantage API error:", data["Error Message"] || data["Note"]);
      return [];
    }

    const timeSeries = data["Time Series (Daily)"];
    if (!timeSeries) {
      return [];
    }

    const history: PriceHistory[] = [];
    const dates = Object.keys(timeSeries).sort(); // Sort dates ascending

    for (const date of dates) {
      const dayData = timeSeries[date];
      history.push({
        date,
        open: parseFloat(dayData["1. open"]),
        high: parseFloat(dayData["2. high"]),
        low: parseFloat(dayData["3. low"]),
        close: parseFloat(dayData["4. close"]),
        volume: parseInt(dayData["5. volume"], 10),
      });
    }

    return history;
  } catch (error) {
    console.error("Error fetching price history:", error);
    return [];
  }
}

/**
 * Calculate 30-day average volume from price history
 */
function calculateAvgVolume30d(priceHistory: PriceHistory[]): number {
  if (priceHistory.length === 0) return 0;

  const last30Days = priceHistory.slice(-30);
  const totalVolume = last30Days.reduce((sum, day) => sum + day.volume, 0);
  return Math.floor(totalVolume / last30Days.length);
}

/**
 * Fetch market data for a given ticker using Alpha Vantage API
 *
 * @param ticker - Stock ticker symbol (e.g., "AAPL")
 * @returns MarketData object with quote, price history, and exchange info
 */
export async function fetchMarketData(ticker: string): Promise<MarketData> {
  const normalizedTicker = ticker.toUpperCase().trim();

  // Check cache first
  const cached = cache.get(normalizedTicker);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Check if API key is configured
  if (!config.alphaVantageApiKey) {
    console.error("Alpha Vantage API key not configured");
    return {
      quote: null,
      priceHistory: [],
      isOTC: false,
      dataAvailable: false,
    };
  }

  const apiStartTime = Date.now();
  let apiCallCount = 0;

  try {
    // Fetch quote and price history in parallel
    // Note: Be careful of rate limits (5 calls/min on free tier)
    const [quote, priceHistory] = await Promise.all([
      fetchQuote(normalizedTicker),
      fetchPriceHistory(normalizedTicker),
    ]);
    apiCallCount = 2;

    if (!quote) {
      const responseTime = Date.now() - apiStartTime;
      await logApiUsage({
        service: "ALPHA_VANTAGE",
        endpoint: "GLOBAL_QUOTE+TIME_SERIES_DAILY",
        responseTime,
        statusCode: 404,
        errorMessage: "No quote data available",
      });
      return {
        quote: null,
        priceHistory: [],
        isOTC: false,
        dataAvailable: false,
      };
    }

    // Fetch company overview for additional details
    // Adding a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
    const overview = await fetchCompanyOverview(normalizedTicker);
    apiCallCount = 3;

    // Update quote with overview data
    if (overview) {
      quote.companyName = overview.companyName;
      quote.exchange = overview.exchange;
      quote.marketCap = overview.marketCap;
    }

    // Calculate 30-day average volume
    const avgVolume30d = calculateAvgVolume30d(priceHistory);
    quote.avgVolume30d = avgVolume30d;
    quote.avgDollarVolume30d = avgVolume30d * quote.lastPrice;

    // Determine if OTC
    const isOTC = OTC_EXCHANGES.some(exc =>
      quote.exchange.toUpperCase().includes(exc.toUpperCase())
    );

    const marketData: MarketData = {
      quote,
      priceHistory,
      isOTC,
      dataAvailable: true,
    };

    // Cache the result
    cache.set(normalizedTicker, { data: marketData, timestamp: Date.now() });

    // Log successful API usage (Alpha Vantage free tier: no direct cost)
    const responseTime = Date.now() - apiStartTime;
    await logApiUsage({
      service: "ALPHA_VANTAGE",
      endpoint: `${apiCallCount} calls`,
      responseTime,
      statusCode: 200,
    });

    return marketData;
  } catch (error) {
    const responseTime = Date.now() - apiStartTime;
    await logApiUsage({
      service: "ALPHA_VANTAGE",
      endpoint: `${apiCallCount} calls`,
      responseTime,
      statusCode: 500,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    console.error("Error fetching market data:", error);
    return {
      quote: null,
      priceHistory: [],
      isOTC: false,
      dataAvailable: false,
    };
  }
}

/**
 * Check if a stock is on any regulatory alert/suspension list
 *
 * This checks the SEC's trading suspension list via their RSS feed.
 * Note: This is a simplified implementation. For production, consider:
 * - Caching the suspension list and refreshing periodically
 * - Checking multiple sources (SEC, FINRA, OTC Markets)
 *
 * @param ticker - Stock ticker symbol
 * @returns true if the stock is on an alert list
 */
export async function checkAlertList(ticker: string): Promise<boolean> {
  const normalizedTicker = ticker.toUpperCase().trim();

  try {
    // Fetch SEC trading suspensions RSS feed
    const response = await fetch("https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=34-&dateb=&owner=include&count=100&output=atom");
    const text = await response.text();

    // Simple check if ticker appears in recent suspension notices
    // This is a basic implementation - the SEC RSS contains trading suspension orders
    if (text.toUpperCase().includes(normalizedTicker)) {
      return true;
    }

    return false;
  } catch (error) {
    // If we can't check the alert list, return false (don't block the analysis)
    console.error("Error checking alert list:", error);
    return false;
  }
}

/**
 * Calculate price change percentage over a period
 */
export function calculatePriceChange(
  priceHistory: PriceHistory[],
  days: number
): number | null {
  if (priceHistory.length < days + 1) return null;

  const currentPrice = priceHistory[priceHistory.length - 1].close;
  const pastPrice = priceHistory[priceHistory.length - 1 - days].close;

  if (pastPrice === 0) return null;

  return ((currentPrice - pastPrice) / pastPrice) * 100;
}

/**
 * Calculate volume ratio compared to 30-day average
 */
export function calculateVolumeRatio(
  priceHistory: PriceHistory[],
  days: number = 7
): number | null {
  if (priceHistory.length < 30) return null;

  // Calculate 30-day average volume
  const last30Days = priceHistory.slice(-30);
  const avgVolume30d =
    last30Days.reduce((sum, day) => sum + day.volume, 0) / 30;

  // Calculate recent average volume
  const recentDays = priceHistory.slice(-days);
  const recentAvgVolume =
    recentDays.reduce((sum, day) => sum + day.volume, 0) / days;

  if (avgVolume30d === 0) return null;

  return recentAvgVolume / avgVolume30d;
}

/**
 * Detect spike-then-drop pattern (pump-and-dump)
 * Thresholds lowered based on research analysis for earlier detection
 * Returns true if price spiked 25%+ then dropped 20%+ from local max
 */
export function detectSpikeThenDrop(priceHistory: PriceHistory[]): boolean {
  if (priceHistory.length < 15) return false;

  // Look at last 15 days
  const recent = priceHistory.slice(-15);
  const startPrice = recent[0].close;

  // Find max price in the period
  let maxPrice = startPrice;
  let maxIndex = 0;
  for (let i = 0; i < recent.length; i++) {
    if (recent[i].high > maxPrice) {
      maxPrice = recent[i].high;
      maxIndex = i;
    }
  }

  // Check if there was a 25%+ spike (lowered from 50% for earlier detection)
  // Research: 20-30% rise is typical for smaller pump schemes
  const spikePercent = ((maxPrice - startPrice) / startPrice) * 100;
  if (spikePercent < 25) return false;

  // Check if there's been a 20%+ drop from max (lowered from 40%)
  // Research: 15-20% drop indicates dump phase has begun
  const currentPrice = recent[recent.length - 1].close;
  const dropPercent = ((maxPrice - currentPrice) / maxPrice) * 100;

  // Only count as spike-then-drop if max wasn't at the end (still dropping)
  return dropPercent >= 20 && maxIndex < recent.length - 2;
}

/**
 * Advanced Anomaly Detection Features
 * Ported from Python AI module for enhanced scam detection
 */

/**
 * Calculate Z-score for a value given mean and standard deviation
 */
function calculateZScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

/**
 * Calculate mean of an array
 */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Calculate standard deviation of an array
 */
function std(arr: number[]): number {
  if (arr.length === 0) return 0;
  const avg = mean(arr);
  const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

/**
 * Calculate RSI (Relative Strength Index)
 * RSI > 70 indicates overbought, RSI < 30 indicates oversold
 */
export function calculateRSI(priceHistory: PriceHistory[], period: number = 14): number | null {
  if (priceHistory.length < period + 1) return null;

  const changes: number[] = [];
  for (let i = 1; i < priceHistory.length; i++) {
    changes.push(priceHistory[i].close - priceHistory[i - 1].close);
  }

  const recentChanges = changes.slice(-period);
  const gains = recentChanges.filter(c => c > 0);
  const losses = recentChanges.filter(c => c < 0).map(c => Math.abs(c));

  const avgGain = gains.length > 0 ? mean(gains) : 0;
  const avgLoss = losses.length > 0 ? mean(losses) : 0;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Detect price anomaly using Z-score analysis
 * Returns anomaly details if current price is statistically unusual
 */
export function detectPriceAnomaly(priceHistory: PriceHistory[]): {
  isAnomaly: boolean;
  zScore: number;
  severity: "low" | "medium" | "high" | "extreme";
} {
  if (priceHistory.length < 30) {
    return { isAnomaly: false, zScore: 0, severity: "low" };
  }

  // Calculate daily returns
  const returns: number[] = [];
  for (let i = 1; i < priceHistory.length; i++) {
    const dailyReturn = (priceHistory[i].close - priceHistory[i - 1].close) / priceHistory[i - 1].close;
    returns.push(dailyReturn);
  }

  // Use rolling 30-day window for baseline
  const baselineReturns = returns.slice(-30, -1);
  const currentReturn = returns[returns.length - 1];

  const returnMean = mean(baselineReturns);
  const returnStd = std(baselineReturns);
  const zScore = calculateZScore(currentReturn, returnMean, returnStd);

  // Determine severity based on Z-score thresholds
  const absZ = Math.abs(zScore);
  let severity: "low" | "medium" | "high" | "extreme" = "low";
  let isAnomaly = false;

  if (absZ >= 4) {
    severity = "extreme";
    isAnomaly = true;
  } else if (absZ >= 3) {
    severity = "high";
    isAnomaly = true;
  } else if (absZ >= 2) {
    severity = "medium";
    isAnomaly = true;
  }

  return { isAnomaly, zScore, severity };
}

/**
 * Detect volume anomaly using Z-score analysis
 */
export function detectVolumeAnomaly(priceHistory: PriceHistory[]): {
  isAnomaly: boolean;
  zScore: number;
  multiplier: number;
} {
  if (priceHistory.length < 30) {
    return { isAnomaly: false, zScore: 0, multiplier: 1 };
  }

  const volumes = priceHistory.map(p => p.volume);
  const baselineVolumes = volumes.slice(-30, -1);
  const currentVolume = volumes[volumes.length - 1];

  const volMean = mean(baselineVolumes);
  const volStd = std(baselineVolumes);
  const zScore = calculateZScore(currentVolume, volMean, volStd);
  const multiplier = volMean > 0 ? currentVolume / volMean : 1;

  // Volume anomaly if Z-score > 2 or volume > 3x average
  const isAnomaly = zScore > 2 || multiplier > 3;

  return { isAnomaly, zScore, multiplier };
}

/**
 * Calculate surge metrics for different time periods
 */
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

  // Extreme surge: >100% in 7 days or >200% in 30 days
  if ((result.surge7d && result.surge7d > 100) || (result.surge30d && result.surge30d > 200)) {
    result.isExtremeSurge = true;
  }

  return result;
}

/**
 * Calculate volatility metrics
 */
export function calculateVolatility(priceHistory: PriceHistory[]): {
  dailyVolatility: number;
  isHighVolatility: boolean;
} {
  if (priceHistory.length < 14) {
    return { dailyVolatility: 0, isHighVolatility: false };
  }

  // Calculate daily returns
  const returns: number[] = [];
  for (let i = 1; i < priceHistory.length; i++) {
    const dailyReturn = (priceHistory[i].close - priceHistory[i - 1].close) / priceHistory[i - 1].close;
    returns.push(dailyReturn);
  }

  const recentReturns = returns.slice(-14);
  const dailyVolatility = std(recentReturns) * 100; // As percentage

  // High volatility if daily std > 5%
  const isHighVolatility = dailyVolatility > 5;

  return { dailyVolatility, isHighVolatility };
}

/**
 * Comprehensive anomaly detection combining multiple signals
 */
export function runAnomalyDetection(priceHistory: PriceHistory[]): {
  hasAnomalies: boolean;
  anomalyScore: number;
  signals: string[];
} {
  const signals: string[] = [];
  let anomalyScore = 0;

  // Price anomaly detection
  const priceAnomaly = detectPriceAnomaly(priceHistory);
  if (priceAnomaly.isAnomaly) {
    if (priceAnomaly.severity === "extreme") {
      signals.push(`Extreme price movement detected (Z-score: ${priceAnomaly.zScore.toFixed(1)})`);
      anomalyScore += 4;
    } else if (priceAnomaly.severity === "high") {
      signals.push(`Significant price anomaly detected (Z-score: ${priceAnomaly.zScore.toFixed(1)})`);
      anomalyScore += 3;
    } else if (priceAnomaly.severity === "medium") {
      signals.push(`Unusual price movement detected (Z-score: ${priceAnomaly.zScore.toFixed(1)})`);
      anomalyScore += 2;
    }
  }

  // Volume anomaly detection
  const volumeAnomaly = detectVolumeAnomaly(priceHistory);
  if (volumeAnomaly.isAnomaly) {
    signals.push(`Unusual trading volume: ${volumeAnomaly.multiplier.toFixed(1)}x normal`);
    anomalyScore += volumeAnomaly.multiplier > 5 ? 3 : 2;
  }

  // Surge detection
  const surgeMetrics = calculateSurgeMetrics(priceHistory);
  if (surgeMetrics.isExtremeSurge) {
    const surgeVal = surgeMetrics.surge7d || surgeMetrics.surge30d || 0;
    signals.push(`Extreme price surge: ${surgeVal.toFixed(0)}% gain`);
    anomalyScore += 3;
  }

  // RSI overbought detection
  const rsi = calculateRSI(priceHistory);
  if (rsi && rsi > 80) {
    signals.push(`Extremely overbought (RSI: ${rsi.toFixed(0)})`);
    anomalyScore += 2;
  } else if (rsi && rsi > 70) {
    signals.push(`Overbought conditions (RSI: ${rsi.toFixed(0)})`);
    anomalyScore += 1;
  }

  // Volatility detection
  const volatility = calculateVolatility(priceHistory);
  if (volatility.isHighVolatility) {
    signals.push(`High volatility: ${volatility.dailyVolatility.toFixed(1)}% daily swings`);
    anomalyScore += 1;
  }

  return {
    hasAnomalies: signals.length > 0,
    anomalyScore,
    signals,
  };
}
