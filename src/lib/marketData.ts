/**
 * Market Data Module
 *
 * This module provides stock market data for risk analysis.
 * Currently uses stub/mock data. Replace with actual API integration
 * (e.g., Alpha Vantage, Polygon.io, Yahoo Finance) for production.
 *
 * Required environment variables:
 * - MARKET_DATA_API_KEY: API key for the market data provider
 * - MARKET_DATA_API_URL: Base URL for the market data API
 */

import { MarketData, StockQuote, PriceHistory } from "./types";

// Known major exchanges
const MAJOR_EXCHANGES = ["NYSE", "NASDAQ", "NYSE American", "BATS", "IEX"];
const OTC_EXCHANGES = ["OTC", "OTCQX", "OTCQB", "PINK", "OTC Markets"];

// Mock data for development/testing
const MOCK_STOCKS: Record<string, StockQuote> = {
  AAPL: {
    ticker: "AAPL",
    companyName: "Apple Inc.",
    exchange: "NASDAQ",
    lastPrice: 178.50,
    marketCap: 2_800_000_000_000,
    avgVolume30d: 55_000_000,
    avgDollarVolume30d: 9_817_500_000,
  },
  MSFT: {
    ticker: "MSFT",
    companyName: "Microsoft Corporation",
    exchange: "NASDAQ",
    lastPrice: 375.20,
    marketCap: 2_790_000_000_000,
    avgVolume30d: 22_000_000,
    avgDollarVolume30d: 8_254_400_000,
  },
  // Penny stock example
  ABCD: {
    ticker: "ABCD",
    companyName: "ABCD Holdings Inc.",
    exchange: "OTC",
    lastPrice: 0.45,
    marketCap: 15_000_000,
    avgVolume30d: 500_000,
    avgDollarVolume30d: 225_000,
  },
  // Small cap example
  SCAM: {
    ticker: "SCAM",
    companyName: "Suspicious Corp",
    exchange: "PINK",
    lastPrice: 2.50,
    marketCap: 50_000_000,
    avgVolume30d: 2_000_000,
    avgDollarVolume30d: 5_000_000,
  },
  // Recent spike example
  PUMP: {
    ticker: "PUMP",
    companyName: "Pump Industries Ltd",
    exchange: "OTCQB",
    lastPrice: 3.75,
    marketCap: 75_000_000,
    avgVolume30d: 800_000,
    avgDollarVolume30d: 3_000_000,
  },
};

// Generate mock price history with optional spike pattern
function generateMockPriceHistory(
  basePrice: number,
  days: number = 60,
  includeSpike: boolean = false
): PriceHistory[] {
  const history: PriceHistory[] = [];
  const today = new Date();
  let price = basePrice * (includeSpike ? 0.5 : 0.9); // Start lower if spike

  for (let i = days; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);

    // If including spike, create a pattern
    if (includeSpike && i <= 10 && i > 5) {
      // Spike up
      price *= 1.15;
    } else if (includeSpike && i <= 5) {
      // Drop after spike
      price *= 0.9;
    } else {
      // Normal random movement
      const change = (Math.random() - 0.5) * 0.04;
      price *= 1 + change;
    }

    const dayVolume = Math.floor(Math.random() * 1000000) + 100000;

    history.push({
      date: date.toISOString().split("T")[0],
      open: price * (1 + (Math.random() - 0.5) * 0.02),
      high: price * (1 + Math.random() * 0.03),
      low: price * (1 - Math.random() * 0.03),
      close: price,
      volume: dayVolume,
    });
  }

  return history;
}

/**
 * Fetch market data for a given ticker
 *
 * @param ticker - Stock ticker symbol (e.g., "AAPL")
 * @returns MarketData object with quote, price history, and exchange info
 *
 * TODO: Replace with actual API call in production
 * Example providers:
 * - Polygon.io: https://polygon.io/docs/stocks
 * - Alpha Vantage: https://www.alphavantage.co/documentation/
 * - Yahoo Finance (unofficial): Various npm packages available
 */
export async function fetchMarketData(ticker: string): Promise<MarketData> {
  const normalizedTicker = ticker.toUpperCase().trim();

  // Check if we have mock data for this ticker
  const mockQuote = MOCK_STOCKS[normalizedTicker];

  if (mockQuote) {
    const includeSpike = normalizedTicker === "PUMP" || normalizedTicker === "SCAM";
    const priceHistory = generateMockPriceHistory(mockQuote.lastPrice, 60, includeSpike);

    return {
      quote: mockQuote,
      priceHistory,
      isOTC: OTC_EXCHANGES.includes(mockQuote.exchange),
      dataAvailable: true,
    };
  }

  // For unknown tickers, simulate API call that returns no data
  // In production, this would be an actual API call

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Generate random data for unknown tickers to simulate real behavior
  // In production, return dataAvailable: false for truly unknown tickers
  const isOTC = Math.random() < 0.3;
  const basePrice = isOTC ? Math.random() * 5 + 0.1 : Math.random() * 200 + 10;
  const marketCap = isOTC ? Math.random() * 100_000_000 : Math.random() * 50_000_000_000 + 500_000_000;

  const simulatedQuote: StockQuote = {
    ticker: normalizedTicker,
    companyName: `${normalizedTicker} Corporation`,
    exchange: isOTC ? "OTC" : Math.random() < 0.5 ? "NYSE" : "NASDAQ",
    lastPrice: basePrice,
    marketCap: marketCap,
    avgVolume30d: Math.floor(Math.random() * 5_000_000) + 100_000,
    avgDollarVolume30d: Math.floor(Math.random() * 500_000_000) + 1_000_000,
  };

  return {
    quote: simulatedQuote,
    priceHistory: generateMockPriceHistory(basePrice, 60, false),
    isOTC: isOTC,
    dataAvailable: true,
  };
}

/**
 * Check if a stock is on any regulatory alert/suspension list
 *
 * @param ticker - Stock ticker symbol
 * @returns true if the stock is on an alert list
 *
 * TODO: Implement actual alert list checking
 * Potential sources:
 * - SEC trading suspensions: https://www.sec.gov/litigation/suspensions.htm
 * - FINRA alerts: https://www.finra.org/investors/alerts
 */
export async function checkAlertList(ticker: string): Promise<boolean> {
  // Mock implementation - in production, check actual regulatory lists
  const MOCK_ALERT_LIST = ["ALRT", "SUSP", "WARN"];
  return MOCK_ALERT_LIST.includes(ticker.toUpperCase());
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
