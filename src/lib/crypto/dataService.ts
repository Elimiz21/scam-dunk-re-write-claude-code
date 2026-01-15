/**
 * Crypto Data Service
 *
 * Integrates with CoinGecko API for market data.
 * Free tier: 30 calls/min
 *
 * API Documentation: https://docs.coingecko.com/
 */

import {
  CryptoQuote,
  CryptoPriceHistory,
  CryptoMarketData,
  ESTABLISHED_CRYPTOS,
} from "./types";

// CoinGecko API base URL (free tier)
const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";

// Cache for API responses (5 minute TTL)
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Rate limiting
let lastApiCall = 0;
const MIN_API_INTERVAL = 2100; // ~30 calls/min = 2 seconds between calls

/**
 * Wait for rate limit
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  if (timeSinceLastCall < MIN_API_INTERVAL) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_API_INTERVAL - timeSinceLastCall)
    );
  }
  lastApiCall = Date.now();
}

/**
 * Get cached data if available and not expired
 */
function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  return null;
}

/**
 * Set cache
 */
function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Search for a coin by symbol or name
 * Returns the best match (prioritizes exact symbol matches)
 */
export async function searchCoin(query: string): Promise<string | null> {
  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = getCached<string>(cacheKey);
  if (cached !== null) return cached;

  await waitForRateLimit();

  try {
    const response = await fetch(
      `${COINGECKO_API_BASE}/search?query=${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      console.error(`CoinGecko search error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const coins = data.coins || [];

    if (coins.length === 0) return null;

    // Find exact symbol match first
    const queryLower = query.toLowerCase();
    const exactMatch = coins.find(
      (c: { symbol: string }) => c.symbol.toLowerCase() === queryLower
    );

    const result = exactMatch ? exactMatch.id : coins[0].id;
    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Error searching coin:", error);
    return null;
  }
}

/**
 * Fetch market data for a cryptocurrency
 */
export async function fetchCryptoQuote(coinId: string): Promise<CryptoQuote | null> {
  const cacheKey = `quote:${coinId}`;
  const cached = getCached<CryptoQuote>(cacheKey);
  if (cached) return cached;

  await waitForRateLimit();

  try {
    const response = await fetch(
      `${COINGECKO_API_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`
    );

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Coin not found: ${coinId}`);
        return null;
      }
      console.error(`CoinGecko quote error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const marketData = data.market_data;

    if (!marketData) return null;

    const quote: CryptoQuote = {
      id: data.id,
      symbol: data.symbol.toUpperCase(),
      name: data.name,
      currentPrice: marketData.current_price?.usd || 0,
      marketCap: marketData.market_cap?.usd || 0,
      marketCapRank: data.market_cap_rank,
      fullyDilutedValuation: marketData.fully_diluted_valuation?.usd || null,
      totalVolume24h: marketData.total_volume?.usd || 0,
      priceChange24h: marketData.price_change_24h || 0,
      priceChangePercentage24h: marketData.price_change_percentage_24h || 0,
      priceChangePercentage7d: marketData.price_change_percentage_7d || null,
      priceChangePercentage30d: marketData.price_change_percentage_30d || null,
      circulatingSupply: marketData.circulating_supply,
      totalSupply: marketData.total_supply,
      maxSupply: marketData.max_supply,
      ath: marketData.ath?.usd || 0,
      athChangePercentage: marketData.ath_change_percentage?.usd || 0,
      athDate: marketData.ath_date?.usd || null,
      atl: marketData.atl?.usd || 0,
      atlChangePercentage: marketData.atl_change_percentage?.usd || 0,
      atlDate: marketData.atl_date?.usd || null,
      lastUpdated: data.last_updated,
    };

    setCache(cacheKey, quote);
    return quote;
  } catch (error) {
    console.error("Error fetching crypto quote:", error);
    return null;
  }
}

/**
 * Fetch price history for a cryptocurrency
 * Uses CoinGecko market_chart endpoint
 */
export async function fetchCryptoPriceHistory(
  coinId: string,
  days: number = 30
): Promise<CryptoPriceHistory[]> {
  const cacheKey = `history:${coinId}:${days}`;
  const cached = getCached<CryptoPriceHistory[]>(cacheKey);
  if (cached) return cached;

  await waitForRateLimit();

  try {
    const response = await fetch(
      `${COINGECKO_API_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`
    );

    if (!response.ok) {
      console.error(`CoinGecko price history error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    // CoinGecko returns arrays of [timestamp, value]
    const prices: [number, number][] = data.prices || [];
    const marketCaps: [number, number][] = data.market_caps || [];
    const volumes: [number, number][] = data.total_volumes || [];

    const history: CryptoPriceHistory[] = prices.map(
      ([timestamp, price], index) => ({
        timestamp,
        price,
        marketCap: marketCaps[index]?.[1] || 0,
        volume: volumes[index]?.[1] || 0,
      })
    );

    setCache(cacheKey, history);
    return history;
  } catch (error) {
    console.error("Error fetching price history:", error);
    return [];
  }
}

/**
 * Main function to fetch all market data for a crypto asset
 */
export async function fetchCryptoMarketData(
  symbol: string
): Promise<CryptoMarketData> {
  // First, search for the coin to get its CoinGecko ID
  const coinId = await searchCoin(symbol);

  if (!coinId) {
    return {
      quote: null,
      priceHistory: [],
      securityData: null,
      dataAvailable: false,
    };
  }

  // Fetch quote and price history
  const [quote, priceHistory] = await Promise.all([
    fetchCryptoQuote(coinId),
    fetchCryptoPriceHistory(coinId, 30),
  ]);

  return {
    quote,
    priceHistory,
    securityData: null, // Security data fetched separately via securityService
    dataAvailable: !!quote,
  };
}

/**
 * Check if a cryptocurrency is considered established/legitimate
 */
export function isEstablishedCrypto(coinId: string): boolean {
  return ESTABLISHED_CRYPTOS.includes(coinId.toLowerCase());
}

/**
 * Calculate price change over a period
 */
export function calculateCryptoPriceChange(
  priceHistory: CryptoPriceHistory[],
  days: number
): number | null {
  if (priceHistory.length < 2) return null;

  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;

  // Find the first price point at or before the cutoff
  const startPoint = priceHistory.find((p) => p.timestamp <= cutoff);
  const endPoint = priceHistory[priceHistory.length - 1];

  if (!startPoint || !endPoint) return null;

  return ((endPoint.price - startPoint.price) / startPoint.price) * 100;
}

/**
 * Calculate volume ratio (recent vs average)
 */
export function calculateCryptoVolumeRatio(
  priceHistory: CryptoPriceHistory[],
  recentDays: number = 7
): number | null {
  if (priceHistory.length < 14) return null;

  const now = Date.now();
  const recentCutoff = now - recentDays * 24 * 60 * 60 * 1000;

  const recentVolumes = priceHistory
    .filter((p) => p.timestamp >= recentCutoff)
    .map((p) => p.volume);

  const olderVolumes = priceHistory
    .filter((p) => p.timestamp < recentCutoff)
    .map((p) => p.volume);

  if (recentVolumes.length === 0 || olderVolumes.length === 0) return null;

  const avgRecent =
    recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
  const avgOlder = olderVolumes.reduce((a, b) => a + b, 0) / olderVolumes.length;

  if (avgOlder === 0) return null;

  return avgRecent / avgOlder;
}

/**
 * Detect spike then drop pattern
 */
export function detectCryptoSpikeThenDrop(
  priceHistory: CryptoPriceHistory[]
): boolean {
  if (priceHistory.length < 14) return false;

  // Get prices for the last 30 days
  const prices = priceHistory.map((p) => p.price);
  const maxPrice = Math.max(...prices);
  const maxIndex = prices.indexOf(maxPrice);

  // Check if there was a significant run-up to the peak
  const prePeakPrices = prices.slice(0, maxIndex);
  if (prePeakPrices.length < 3) return false;

  const startPrice = prePeakPrices[0];
  const runUp = ((maxPrice - startPrice) / startPrice) * 100;

  // Check if there was a significant drop after the peak
  const postPeakPrices = prices.slice(maxIndex);
  if (postPeakPrices.length < 2) return false;

  const currentPrice = prices[prices.length - 1];
  const dropFromPeak = ((maxPrice - currentPrice) / maxPrice) * 100;

  // Pattern: rose 50%+ then dropped 40%+ from peak
  return runUp >= 50 && dropFromPeak >= 40;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateCryptoRSI(
  priceHistory: CryptoPriceHistory[],
  period: number = 14
): number | null {
  if (priceHistory.length < period + 1) return null;

  const prices = priceHistory.map((p) => p.price);
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains.push(change);
      losses.push(0);
    } else {
      gains.push(0);
      losses.push(Math.abs(change));
    }
  }

  // Calculate average gain and loss over the period
  const recentGains = gains.slice(-period);
  const recentLosses = losses.slice(-period);

  const avgGain = recentGains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = recentLosses.reduce((a, b) => a + b, 0) / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Calculate volatility (standard deviation of daily returns)
 */
export function calculateCryptoVolatility(
  priceHistory: CryptoPriceHistory[]
): number | null {
  if (priceHistory.length < 7) return null;

  const prices = priceHistory.map((p) => p.price);
  const returns: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const dailyReturn = (prices[i] - prices[i - 1]) / prices[i - 1];
    returns.push(dailyReturn);
  }

  if (returns.length === 0) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const squaredDiffs = returns.map((r) => Math.pow(r - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;

  return Math.sqrt(variance) * 100; // Return as percentage
}
