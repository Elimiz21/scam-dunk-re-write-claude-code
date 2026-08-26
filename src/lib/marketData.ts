/**
 * Market Data Module
 *
 * This module provides real stock market data for risk analysis.
 *
 * Primary: Financial Modeling Prep (FMP) API
 * - Documentation: https://site.financialmodelingprep.com/developer/docs
 * - Rate Limits: 300 requests/min (Starter plan)
 *
 * Fallback: Alpha Vantage API (Legacy)
 * - Documentation: https://www.alphavantage.co/documentation/
 * - Rate Limits: 5 API requests per minute, 500 requests per day (free tier)
 */

import { z } from "zod";
import { MarketData, StockQuote, PriceHistory } from "./types";
import { config } from "./config";
import { logApiUsage } from "./admin/metrics";
import { circuitBreakers, CircuitBreakerOpenError } from "./circuit-breaker";

// Pure price/volume math + anomaly detection now lives in the dependency-free
// scoring engine (single source of truth shared with the eval harness — audit
// TS-C7). Re-export here so existing call sites that import these from
// "@/lib/marketData" keep working unchanged.
export {
  calculatePriceChange,
  calculateVolumeRatio,
  detectSpikeThenDrop,
  detectSpikeThenDropDetailed,
  calculateRSI,
  calculateSurgeMetrics,
  calculateVolatility,
  detectPriceAnomaly,
  detectVolumeAnomaly,
  runAnomalyDetection,
} from "./scoring/engine";
export type {
  AnomalySignal,
  AnomalyCode,
  AnomalyDetectionResult,
} from "./scoring/engine";

// Fetch timeout for all external market-data providers (audit TS-M5).
const FETCH_TIMEOUT_MS = 9000;

/**
 * fetch() with an AbortController timeout. Throws on timeout/abort so the
 * circuit breaker can count it as a failure; callers convert to null/[] at the
 * boundary.
 */
async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Zod schemas for external API response validation
const FMPProfileSchema = z
  .array(
    z.object({
      companyName: z.string().optional(),
      exchange: z.string().optional(),
      price: z.number().optional(),
      marketCap: z.number().optional(),
      averageVolume: z.number().optional(),
      volume: z.number().optional(),
      sector: z.string().optional(),
      industry: z.string().optional(),
    }),
  )
  .min(1);

const FMPHistoricalSchema = z.array(
  z.object({
    date: z.string(),
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number(),
  }),
);

const AlphaVantageQuoteSchema = z.object({
  "Global Quote": z.object({
    "05. price": z.string(),
    "06. volume": z.string(),
  }),
});

const AlphaVantageTimeSeriesSchema = z.object({
  "Time Series (Daily)": z.record(
    z.object({
      "1. open": z.string(),
      "2. high": z.string(),
      "3. low": z.string(),
      "4. close": z.string(),
      "5. volume": z.string(),
    }),
  ),
});

// Known OTC exchanges
const OTC_EXCHANGES = [
  "OTC",
  "OTCQX",
  "OTCQB",
  "PINK",
  "OTC Markets",
  "OTHER_OTC",
];

// Known crypto symbols mapped to CoinGecko IDs
const CRYPTO_ID_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  DOGE: "dogecoin",
  SHIB: "shiba-inu",
  ADA: "cardano",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  MATIC: "matic-network",
  LINK: "chainlink",
  UNI: "uniswap",
  ATOM: "cosmos",
  LTC: "litecoin",
  TRX: "tron",
  NEAR: "near",
  APT: "aptos",
  FIL: "filecoin",
  ARB: "arbitrum",
};

// Bounded in-memory cache with LRU eviction to prevent memory leaks
const CACHE_MAX_SIZE = 1000;
const cache: Map<string, { data: MarketData; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function cacheSet(key: string, value: { data: MarketData; timestamp: number }) {
  // Delete first so re-insertion moves key to end (most recent) in Map iteration order
  cache.delete(key);
  if (cache.size >= CACHE_MAX_SIZE) {
    // Evict oldest entry (first key in Map iteration order)
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

// API base URLs
// Note: FMP and Alpha Vantage require API keys as query parameters (no header auth support).
// These calls are server-side only, so keys are not exposed to clients.
// Risk is limited to server log exposure — ensure logs do not capture full request URLs.
const FMP_BASE_URL = "https://financialmodelingprep.com/stable";
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";
const COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3";

// ============================================================================
// FINANCIAL MODELING PREP (PRIMARY)
// ============================================================================

/**
 * Fetch stock quote from FMP (using stable API)
 */
async function fetchFMPQuote(ticker: string): Promise<StockQuote | null> {
  const url = `${FMP_BASE_URL}/profile?symbol=${ticker}&apikey=${config.fmpApiKey}`;

  // Note: throws on timeout/non-OK so the circuit breaker counts the failure
  // (audit TS-M5). The fetchMarketDataFromFMP boundary converts to no-data.
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`FMP quote API returned ${response.status}`);
  }
  const raw = await response.json();

  const parsed = FMPProfileSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("FMP quote response validation failed:", parsed.error.message);
    return null;
  }

  const profile = parsed.data[0];
  return {
    ticker: ticker.toUpperCase(),
    companyName: profile.companyName || ticker.toUpperCase(),
    exchange: profile.exchange || "Unknown",
    lastPrice: profile.price || 0,
    marketCap: profile.marketCap || 0,
    avgVolume30d: profile.averageVolume || profile.volume || 0,
    avgDollarVolume30d:
      (profile.averageVolume || profile.volume || 0) * (profile.price || 0),
  };
}

/**
 * Fetch daily price history from FMP (using stable API)
 */
async function fetchFMPPriceHistory(ticker: string): Promise<PriceHistory[]> {
  // Get 100 days of historical data for pattern analysis
  const url = `${FMP_BASE_URL}/historical-price-eod/full?symbol=${ticker}&apikey=${config.fmpApiKey}`;

  // History is best-effort: a plan-gated 403 or timeout must degrade to
  // "quote-only" (not abort the parallel quote fetch or open the breaker), so
  // this fetcher swallows errors and returns [] rather than throwing.
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.error(`FMP history API returned ${response.status}`);
      return [];
    }
    const raw = await response.json();

    const parsed = FMPHistoricalSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(
        "FMP history response validation failed:",
        parsed.error.message,
      );
      return [];
    }

    // FMP stable API returns data in descending order (newest first), we need ascending
    const history: PriceHistory[] = parsed.data
      .slice(0, 100)
      .reverse()
      .map((day) => ({
        date: day.date,
        open: day.open,
        high: day.high,
        low: day.low,
        close: day.close,
        volume: day.volume,
      }));

    return history;
  } catch (error) {
    console.error("Error fetching FMP price history:", error);
    return [];
  }
}

/**
 * Fetch company profile from FMP for additional details (using stable API)
 * Note: The stable profile endpoint already returns all needed data in fetchFMPQuote
 * This is kept for additional sector/industry info if not included in initial quote
 */
async function fetchFMPProfile(ticker: string): Promise<{
  companyName: string;
  exchange: string;
  marketCap: number;
  sector: string;
  industry: string;
} | null> {
  const url = `${FMP_BASE_URL}/profile?symbol=${ticker}&apikey=${config.fmpApiKey}`;

  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.error(`FMP profile API returned ${response.status}`);
      return null;
    }
    const raw = await response.json();

    const parsed = FMPProfileSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(
        "FMP profile response validation failed:",
        parsed.error.message,
      );
      return null;
    }

    const profile = parsed.data[0];
    return {
      companyName: profile.companyName || ticker,
      exchange: profile.exchange || "Unknown",
      marketCap: profile.marketCap || 0,
      sector: profile.sector || "Unknown",
      industry: profile.industry || "Unknown",
    };
  } catch (error) {
    console.error("Error fetching FMP profile:", error);
    return null;
  }
}

// ============================================================================
// ALPHA VANTAGE (FALLBACK/LEGACY)
// ============================================================================

/**
 * Fetch stock quote from Alpha Vantage GLOBAL_QUOTE endpoint
 */
async function fetchQuote(ticker: string): Promise<StockQuote | null> {
  const url = `${ALPHA_VANTAGE_BASE_URL}?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${config.alphaVantageApiKey}`;

  // Throws on timeout/non-OK so the circuit breaker counts the failure
  // (audit TS-M5); the AV boundary converts to no-data.
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Alpha Vantage quote API returned ${response.status}`);
  }
  const raw = await response.json();

  // Check for API errors
  if (raw["Error Message"] || raw["Note"]) {
    console.error(
      "Alpha Vantage API error:",
      raw["Error Message"] || raw["Note"],
    );
    return null;
  }

  const parsed = AlphaVantageQuoteSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      "Alpha Vantage quote response validation failed:",
      parsed.error.message,
    );
    return null;
  }

  const quote = parsed.data["Global Quote"];
  const lastPrice = parseFloat(quote["05. price"]);
  const volume = parseInt(quote["06. volume"], 10);

  // Reject non-numeric AV payloads ("N/A"/"--") instead of letting NaN silently
  // suppress downstream signals as a false LOW (audit TS-M14).
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) {
    console.error(`Alpha Vantage returned non-numeric price for ${ticker}`);
    return null;
  }
  const safeVolume = Number.isFinite(volume) ? volume : 0;

  return {
    ticker: ticker.toUpperCase(),
    companyName: ticker.toUpperCase(),
    exchange: "Unknown",
    lastPrice,
    marketCap: 0,
    avgVolume30d: safeVolume,
    avgDollarVolume30d: safeVolume * lastPrice,
  };
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
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.error(`Alpha Vantage overview API returned ${response.status}`);
      return null;
    }
    const data = await response.json();

    if (data["Error Message"] || !data["Name"]) {
      return null;
    }

    const marketCap = parseInt(data["MarketCapitalization"] || "0", 10);
    return {
      companyName: String(data["Name"] || ticker),
      exchange: String(data["Exchange"] || "Unknown"),
      // Leave non-numeric / missing cap as 0; the engine treats 0 as UNKNOWN
      // and skips the structural cap signal rather than scoring worst-case.
      marketCap: Number.isFinite(marketCap) ? marketCap : 0,
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

  // Best-effort (returns [] on failure) so a throttled history call degrades to
  // quote-only rather than aborting the parallel quote fetch.
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.error(`Alpha Vantage history API returned ${response.status}`);
      return [];
    }
    const raw = await response.json();

    if (raw["Error Message"] || raw["Note"]) {
      console.error(
        "Alpha Vantage API error:",
        raw["Error Message"] || raw["Note"],
      );
      return [];
    }

    const parsed = AlphaVantageTimeSeriesSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(
        "Alpha Vantage history response validation failed:",
        parsed.error.message,
      );
      return [];
    }

    const timeSeries = parsed.data["Time Series (Daily)"];
    const history: PriceHistory[] = [];
    const dates = Object.keys(timeSeries).sort();

    for (const date of dates) {
      const dayData = timeSeries[date];
      const close = parseFloat(dayData["4. close"]);
      const volume = parseInt(dayData["5. volume"], 10);
      // Drop non-numeric rows ("N/A"/"--") rather than poisoning the series
      // with NaN, which would corrupt every downstream calculation (TS-M14).
      if (!Number.isFinite(close) || close <= 0) continue;
      history.push({
        date,
        open: parseFloat(dayData["1. open"]),
        high: parseFloat(dayData["2. high"]),
        low: parseFloat(dayData["3. low"]),
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      });
    }

    return history;
  } catch (error) {
    console.error("Error fetching price history:", error);
    return [];
  }
}

// ============================================================================
// COINGECKO (CRYPTOCURRENCY)
// ============================================================================

/**
 * Check if a ticker is a known cryptocurrency
 */
function isCryptoTicker(ticker: string): boolean {
  return ticker.toUpperCase() in CRYPTO_ID_MAP;
}

/**
 * Get CoinGecko ID from ticker symbol
 */
function getCoinGeckoId(ticker: string): string | null {
  return CRYPTO_ID_MAP[ticker.toUpperCase()] || null;
}

/**
 * Fetch cryptocurrency quote from CoinGecko
 */
async function fetchCoinGeckoQuote(ticker: string): Promise<StockQuote | null> {
  const coinId = getCoinGeckoId(ticker);
  if (!coinId) {
    console.error(`Unknown crypto ticker: ${ticker}`);
    return null;
  }

  const url = `${COINGECKO_BASE_URL}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`;

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`CoinGecko API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const marketData = data.market_data;

    if (!marketData) {
      return null;
    }

    return {
      ticker: ticker.toUpperCase(),
      companyName: data.name || ticker.toUpperCase(),
      exchange: "CRYPTO",
      lastPrice: marketData.current_price?.usd || 0,
      marketCap: marketData.market_cap?.usd || 0,
      avgVolume30d: marketData.total_volume?.usd || 0,
      avgDollarVolume30d: marketData.total_volume?.usd || 0,
    };
  } catch (error) {
    console.error("Error fetching CoinGecko quote:", error);
    return null;
  }
}

/**
 * Fetch cryptocurrency price history from CoinGecko
 */
async function fetchCoinGeckoPriceHistory(
  ticker: string,
): Promise<PriceHistory[]> {
  const coinId = getCoinGeckoId(ticker);
  if (!coinId) {
    return [];
  }

  // Use market_chart (daily) instead of /ohlc: ohlc?days=90 returns coarse
  // 4-day candles (~23 points) which fell below the 30-point pattern-detection
  // gate AND carried no volume. market_chart gives daily prices + real volumes
  // and >= 30 points so pattern + anomaly detection actually run (audit TS-C5).
  const url = `${COINGECKO_BASE_URL}/coins/${coinId}/market_chart?vs_currency=usd&days=90&interval=daily`;

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`CoinGecko market_chart API error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    // market_chart returns { prices: [[ts, price], ...], total_volumes: [[ts, vol], ...] }
    const prices: [number, number][] = Array.isArray(data?.prices)
      ? data.prices
      : [];
    const volumes: [number, number][] = Array.isArray(data?.total_volumes)
      ? data.total_volumes
      : [];

    if (prices.length === 0) return [];

    // Index volumes by day so we can attach the real measured volume.
    const volumeByDate = new Map<string, number>();
    for (const [ts, vol] of volumes) {
      volumeByDate.set(new Date(ts).toISOString().split("T")[0], vol);
    }

    // One point per day (market_chart with interval=daily already returns daily
    // candles, but de-dup defensively in case a trailing intraday point sneaks in).
    const byDate = new Map<string, { close: number; ts: number }>();
    for (const [ts, price] of prices) {
      const date = new Date(ts).toISOString().split("T")[0];
      const existing = byDate.get(date);
      if (!existing || ts > existing.ts) byDate.set(date, { close: price, ts });
    }

    const history: PriceHistory[] = Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, { close }]) => ({
        date,
        // market_chart only exposes close prices; approximate OHLC with close.
        open: close,
        high: close,
        low: close,
        close,
        volume: volumeByDate.get(date) ?? 0,
      }));

    return history;
  } catch (error) {
    console.error("Error fetching CoinGecko price history:", error);
    return [];
  }
}

/**
 * Fetch market data from CoinGecko for cryptocurrencies
 */
async function fetchMarketDataFromCoinGecko(
  ticker: string,
): Promise<MarketData> {
  const apiStartTime = Date.now();

  try {
    // Fetch quote and price history in parallel
    const [quote, priceHistory] = await circuitBreakers.coinGecko.execute(() =>
      Promise.all([
        fetchCoinGeckoQuote(ticker),
        fetchCoinGeckoPriceHistory(ticker),
      ]),
    );

    if (!quote) {
      const responseTime = Date.now() - apiStartTime;
      await logApiUsage({
        service: "COINGECKO",
        endpoint: "coins+market_chart",
        responseTime,
        statusCode: 404,
        errorMessage: "No quote data available",
      });
      return {
        quote: null,
        priceHistory: [],
        // Crypto is its own category — NOT OTC. Marking it isOTC:true made
        // OTC_EXCHANGE mislabel BTC as an OTC penny stock (audit TS-C5).
        isOTC: false,
        category: "CRYPTO",
        dataAvailable: false,
      };
    }

    const responseTime = Date.now() - apiStartTime;
    await logApiUsage({
      service: "COINGECKO",
      endpoint: "coins+market_chart",
      responseTime,
      statusCode: 200,
    });

    return {
      quote,
      priceHistory,
      isOTC: false,
      category: "CRYPTO",
      dataAvailable: true,
    };
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      console.warn(
        `CoinGecko circuit breaker open, skipping request for ${ticker}`,
      );
      return {
        quote: null,
        priceHistory: [],
        isOTC: false,
        category: "CRYPTO",
        dataAvailable: false,
      };
    }
    const responseTime = Date.now() - apiStartTime;
    await logApiUsage({
      service: "COINGECKO",
      endpoint: "coins+market_chart",
      responseTime,
      statusCode: 500,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    console.error("Error fetching market data from CoinGecko:", error);
    return {
      quote: null,
      priceHistory: [],
      isOTC: false,
      category: "CRYPTO",
      dataAvailable: false,
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
 * Fetch market data for a given ticker
 * Uses FMP as primary source for stocks, CoinGecko for crypto,
 * falls back to Alpha Vantage if FMP fails
 *
 * @param ticker - Stock ticker symbol (e.g., "AAPL") or crypto symbol (e.g., "BTC")
 * @param assetType - Optional asset type hint ("stock" or "crypto")
 * @returns MarketData object with quote, price history, and exchange info
 */
export async function fetchMarketData(
  ticker: string,
  assetType?: "stock" | "crypto",
): Promise<MarketData> {
  const normalizedTicker = ticker.toUpperCase().trim();

  // Cache key includes assetType so a stock scan and a crypto scan of the same
  // symbol (e.g. SOL the NYSE stock vs SOL/Solana) never poison each other
  // (audit TS-C4). Undefined assetType keys as "auto".
  const cacheKey = `${assetType ?? "auto"}:${normalizedTicker}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Crypto routing: ONLY treat as crypto when explicitly asked, or when no
  // asset type was supplied and the symbol is a known coin. An explicit
  // assetType:"stock" is NEVER routed to CoinGecko — real NYSE tickers that
  // collide with coin symbols (SOL, APT, LINK) stay on the stock path (TS-C4).
  const isCrypto =
    assetType === "crypto" ||
    (assetType === undefined && isCryptoTicker(normalizedTicker));

  if (isCrypto) {
    console.log(`Fetching crypto data for ${normalizedTicker} from CoinGecko`);
    const coinGeckoResult =
      await fetchMarketDataFromCoinGecko(normalizedTicker);
    if (coinGeckoResult.dataAvailable) {
      cacheSet(cacheKey, {
        data: coinGeckoResult,
        timestamp: Date.now(),
      });
      return coinGeckoResult;
    }
    // If CoinGecko fails for crypto, return no data (don't try stock APIs)
    console.error(`CoinGecko failed for crypto ${normalizedTicker}`);
    return {
      quote: null,
      priceHistory: [],
      isOTC: false,
      category: "CRYPTO",
      dataAvailable: false,
    };
  }

  // For stocks: Try FMP first (primary), then Alpha Vantage (fallback)
  if (config.fmpApiKey) {
    const fmpResult = await fetchMarketDataFromFMP(normalizedTicker);
    if (fmpResult.dataAvailable) {
      cacheSet(cacheKey, { data: fmpResult, timestamp: Date.now() });
      return fmpResult;
    }
  }

  // Fallback to Alpha Vantage
  if (config.alphaVantageApiKey) {
    const avResult = await fetchMarketDataFromAlphaVantage(normalizedTicker);
    if (avResult.dataAvailable) {
      cacheSet(cacheKey, { data: avResult, timestamp: Date.now() });
      return avResult;
    }
  }

  // No API configured or all sources failed
  console.error("No market data API configured or all sources failed");
  return {
    quote: null,
    priceHistory: [],
    isOTC: false,
    category: "UNKNOWN",
    dataAvailable: false,
  };
}

/**
 * Fetch market data from Financial Modeling Prep
 */
async function fetchMarketDataFromFMP(ticker: string): Promise<MarketData> {
  const apiStartTime = Date.now();

  try {
    // Fetch quote and price history in parallel (FMP has generous rate limits)
    const [quote, priceHistory] = await circuitBreakers.fmp.execute(() =>
      Promise.all([fetchFMPQuote(ticker), fetchFMPPriceHistory(ticker)]),
    );

    if (!quote) {
      const responseTime = Date.now() - apiStartTime;
      await logApiUsage({
        service: "FMP",
        endpoint: "quote+historical",
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

    // Optionally fetch profile for more details (outside circuit breaker — supplementary enrichment)
    const profile = await fetchFMPProfile(ticker);
    if (profile) {
      quote.companyName = profile.companyName;
      quote.exchange = profile.exchange;
      quote.marketCap = profile.marketCap;
    }

    // Calculate 30-day average volume from history
    const avgVolume30d = calculateAvgVolume30d(priceHistory);
    quote.avgVolume30d = avgVolume30d;
    quote.avgDollarVolume30d = avgVolume30d * quote.lastPrice;

    // Determine if OTC
    const isOTC = OTC_EXCHANGES.some((exc) =>
      quote.exchange.toUpperCase().includes(exc.toUpperCase()),
    );

    const responseTime = Date.now() - apiStartTime;
    await logApiUsage({
      service: "FMP",
      endpoint: "quote+historical+profile",
      responseTime,
      statusCode: 200,
    });

    return {
      quote,
      priceHistory,
      isOTC,
      category: isOTC ? "OTC" : "MAJOR",
      dataAvailable: true,
    };
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      console.warn(`FMP circuit breaker open, skipping request for ${ticker}`);
      return {
        quote: null,
        priceHistory: [],
        isOTC: false,
        dataAvailable: false,
      };
    }
    const responseTime = Date.now() - apiStartTime;
    await logApiUsage({
      service: "FMP",
      endpoint: "quote+historical",
      responseTime,
      statusCode: 500,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    console.error("Error fetching market data from FMP:", error);
    return {
      quote: null,
      priceHistory: [],
      isOTC: false,
      dataAvailable: false,
    };
  }
}

/**
 * Fetch market data from Alpha Vantage (legacy/fallback)
 */
async function fetchMarketDataFromAlphaVantage(
  ticker: string,
): Promise<MarketData> {
  const apiStartTime = Date.now();
  let apiCallCount = 0;

  try {
    // Fetch quote and price history in parallel
    // Note: Be careful of rate limits (5 calls/min on free tier)
    const [quote, priceHistory] = await circuitBreakers.alphaVantage.execute(
      () => Promise.all([fetchQuote(ticker), fetchPriceHistory(ticker)]),
    );
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
    await new Promise((resolve) => setTimeout(resolve, 200));
    const overview = await fetchCompanyOverview(ticker);
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
    const isOTC = OTC_EXCHANGES.some((exc) =>
      quote.exchange.toUpperCase().includes(exc.toUpperCase()),
    );

    // Log successful API usage
    const responseTime = Date.now() - apiStartTime;
    await logApiUsage({
      service: "ALPHA_VANTAGE",
      endpoint: `${apiCallCount} calls`,
      responseTime,
      statusCode: 200,
    });

    return {
      quote,
      priceHistory,
      isOTC,
      category: isOTC ? "OTC" : "MAJOR",
      dataAvailable: true,
    };
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      console.warn(
        `Alpha Vantage circuit breaker open, skipping request for ${ticker}`,
      );
      return {
        quote: null,
        priceHistory: [],
        isOTC: false,
        dataAvailable: false,
      };
    }
    const responseTime = Date.now() - apiStartTime;
    await logApiUsage({
      service: "ALPHA_VANTAGE",
      endpoint: `${apiCallCount} calls`,
      responseTime,
      statusCode: 500,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    console.error("Error fetching market data from Alpha Vantage:", error);
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
 * This now checks against our local database that is updated nightly
 * from multiple sources: SEC, FINRA, NYSE, NASDAQ, OTC Markets.
 *
 * Also falls back to live SEC RSS feed check if database is empty.
 *
 * @param ticker - Stock ticker symbol
 * @returns Object with flag status and detailed information
 */
export async function checkAlertList(ticker: string): Promise<boolean> {
  const normalizedTicker = ticker.toUpperCase().trim();

  try {
    // First, check our local regulatory database
    const { checkRegulatoryDatabase, syncOTCMarketsFlags } =
      await import("@/lib/regulatoryDatabase");
    const regulatoryCheck = await checkRegulatoryDatabase(normalizedTicker);

    if (regulatoryCheck.isFlagged) {
      return true;
    }

    // Live OTC Markets check — fetch real-time data and sync to DB
    // This runs in parallel with the SEC check for speed
    const [otcResult, secResult] = await Promise.allSettled([
      syncOTCMarketsFlags(normalizedTicker).then((r) => r.added > 0),
      checkSECFeed(normalizedTicker),
    ]);

    if (otcResult.status === "fulfilled" && otcResult.value) return true;
    if (secResult.status === "fulfilled" && secResult.value) return true;

    return false;
  } catch (error) {
    // If we can't check the alert list, return false (don't block the analysis)
    console.error("Error checking alert list:", error);
    return false;
  }
}

/**
 * Check SEC RSS feed for recent trading suspensions.
 *
 * Previously this did `text.toUpperCase().includes(ticker)` against the ENTIRE
 * EDGAR XML, so short tickers ("GE" in "EXCHANGE", "ON"/"IT"/"ALL") matched
 * arbitrary markup and force-flagged real symbols as HIGH — and without a
 * compliant User-Agent EDGAR 403s the request so the check was often silently
 * dead (audit TS-C3).
 *
 * Now it sends a compliant User-Agent and whole-word matches the ticker against
 * PARSED <entry><title> text only. The structured regulatory DB
 * (checkRegulatoryDatabase) remains the primary source; this is a best-effort
 * supplement.
 */
async function checkSECFeed(ticker: string): Promise<boolean> {
  const normalized = ticker.toUpperCase().trim();
  // Don't whole-word match against arbitrary 1-char tokens.
  if (normalized.length < 2) return false;

  try {
    const response = await fetchWithTimeout(
      "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=34-&dateb=&owner=include&count=100&output=atom",
      {
        headers: {
          // SEC requires a descriptive User-Agent with contact info.
          "User-Agent": "ScamDunk/1.0 (compliance@scamdunk.app)",
          Accept: "application/atom+xml",
        },
      },
    );
    if (!response.ok) return false;
    const text = await response.text();

    // Extract <title> values from each <entry> and whole-word match the ticker
    // against the title text only.
    const wordBoundary = new RegExp(`\\b${escapeRegExp(normalized)}\\b`);
    const entries = text.split("<entry>").slice(1);
    for (const entry of entries) {
      const titleMatch = entry.match(/<title[^>]*>([^<]+)<\/title>/);
      if (!titleMatch) continue;
      const title = titleMatch[1].toUpperCase();
      // Only treat as a hit if the title is actually a suspension notice.
      const isSuspension =
        title.includes("SUSPENSION") || title.includes("SUSPEND");
      if (isSuspension && wordBoundary.test(title)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Enhanced regulatory check with detailed flag information
 * Use this for detailed reporting to users
 */
export async function checkRegulatoryFlags(ticker: string): Promise<{
  isFlagged: boolean;
  flags: Array<{
    source: string;
    flagType: string;
    title: string | null;
    description: string | null;
    flagDate: Date;
    severity: string;
    sourceUrl: string | null;
  }>;
  highestSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  sources: string[];
  otcProfile?: {
    tierCode: string | null;
    tierName: string | null;
    caveatEmptor: boolean;
    shellRisk: boolean;
    complianceStatus: string | null;
  };
}> {
  const normalizedTicker = ticker.toUpperCase().trim();

  try {
    const { checkRegulatoryDatabase, syncOTCMarketsFlags } =
      await import("@/lib/regulatoryDatabase");

    // Sync OTC Markets data first (adds flags to DB if found)
    await syncOTCMarketsFlags(normalizedTicker).catch(() => {});

    // Then check all flags from the database
    const result = await checkRegulatoryDatabase(normalizedTicker);

    // Also fetch OTC profile for additional context
    let otcProfile = undefined;
    try {
      const { fetchOTCProfile } = await import("@/lib/otcMarkets");
      const profile = await fetchOTCProfile(normalizedTicker);
      if (profile) {
        otcProfile = {
          tierCode: profile.tierCode,
          tierName: profile.tierName,
          caveatEmptor: profile.caveatEmptor,
          shellRisk: profile.shellRisk,
          complianceStatus: profile.complianceStatus,
        };
      }
    } catch {
      // OTC profile is optional enrichment — don't fail the check
    }

    return { ...result, otcProfile };
  } catch (error) {
    console.error("Error checking regulatory flags:", error);
    return {
      isFlagged: false,
      flags: [],
      highestSeverity: null,
      sources: [],
    };
  }
}
