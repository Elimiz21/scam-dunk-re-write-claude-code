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

  try {
    // Fetch quote and price history in parallel
    // Note: Be careful of rate limits (5 calls/min on free tier)
    const [quote, priceHistory] = await Promise.all([
      fetchQuote(normalizedTicker),
      fetchPriceHistory(normalizedTicker),
    ]);

    if (!quote) {
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

    return marketData;
  } catch (error) {
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
 * Detect spike-then-drop pattern
 * Returns true if price spiked 50%+ in 10 days then dropped 40%+ from local max
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

  // Check if there was a 50%+ spike
  const spikePercent = ((maxPrice - startPrice) / startPrice) * 100;
  if (spikePercent < 50) return false;

  // Check if there's been a 40%+ drop from max
  const currentPrice = recent[recent.length - 1].close;
  const dropPercent = ((maxPrice - currentPrice) / maxPrice) * 100;

  // Only count as spike-then-drop if max wasn't at the end (still dropping)
  return dropPercent >= 40 && maxIndex < recent.length - 2;
}
