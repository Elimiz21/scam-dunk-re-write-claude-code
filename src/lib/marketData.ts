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

// Zod schemas for external API response validation
const FMPProfileSchema = z.array(z.object({
  companyName: z.string().optional(),
  exchange: z.string().optional(),
  price: z.number().optional(),
  marketCap: z.number().optional(),
  averageVolume: z.number().optional(),
  volume: z.number().optional(),
  sector: z.string().optional(),
  industry: z.string().optional(),
})).min(1);

const FMPHistoricalSchema = z.array(z.object({
  date: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
}));

const AlphaVantageQuoteSchema = z.object({
  "Global Quote": z.object({
    "05. price": z.string(),
    "06. volume": z.string(),
  }),
});

const AlphaVantageTimeSeriesSchema = z.object({
  "Time Series (Daily)": z.record(z.object({
    "1. open": z.string(),
    "2. high": z.string(),
    "3. low": z.string(),
    "4. close": z.string(),
    "5. volume": z.string(),
  })),
});

// Known OTC exchanges
const OTC_EXCHANGES = ["OTC", "OTCQX", "OTCQB", "PINK", "OTC Markets", "OTHER_OTC"];

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

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`FMP quote API returned ${response.status}`);
      return null;
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
      avgDollarVolume30d: (profile.averageVolume || profile.volume || 0) * (profile.price || 0),
    };
  } catch (error) {
    console.error("Error fetching FMP quote:", error);
    return null;
  }
}

/**
 * Fetch daily price history from FMP (using stable API)
 */
async function fetchFMPPriceHistory(ticker: string): Promise<PriceHistory[]> {
  // Get 100 days of historical data for pattern analysis
  const url = `${FMP_BASE_URL}/historical-price-eod/full?symbol=${ticker}&apikey=${config.fmpApiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`FMP history API returned ${response.status}`);
      return [];
    }
    const raw = await response.json();

    const parsed = FMPHistoricalSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("FMP history response validation failed:", parsed.error.message);
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
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`FMP profile API returned ${response.status}`);
      return null;
    }
    const raw = await response.json();

    const parsed = FMPProfileSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("FMP profile response validation failed:", parsed.error.message);
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

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Alpha Vantage quote API returned ${response.status}`);
      return null;
    }
    const raw = await response.json();

    // Check for API errors
    if (raw["Error Message"] || raw["Note"]) {
      console.error("Alpha Vantage API error:", raw["Error Message"] || raw["Note"]);
      return null;
    }

    const parsed = AlphaVantageQuoteSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("Alpha Vantage quote response validation failed:", parsed.error.message);
      return null;
    }

    const quote = parsed.data["Global Quote"];
    const lastPrice = parseFloat(quote["05. price"]);
    const volume = parseInt(quote["06. volume"], 10);

    return {
      ticker: ticker.toUpperCase(),
      companyName: ticker.toUpperCase(),
      exchange: "Unknown",
      lastPrice,
      marketCap: 0,
      avgVolume30d: volume,
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
    if (!response.ok) {
      console.error(`Alpha Vantage overview API returned ${response.status}`);
      return null;
    }
    const data = await response.json();

    if (data["Error Message"] || !data["Name"]) {
      return null;
    }

    return {
      companyName: String(data["Name"] || ticker),
      exchange: String(data["Exchange"] || "Unknown"),
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
    if (!response.ok) {
      console.error(`Alpha Vantage history API returned ${response.status}`);
      return [];
    }
    const raw = await response.json();

    if (raw["Error Message"] || raw["Note"]) {
      console.error("Alpha Vantage API error:", raw["Error Message"] || raw["Note"]);
      return [];
    }

    const parsed = AlphaVantageTimeSeriesSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("Alpha Vantage history response validation failed:", parsed.error.message);
      return [];
    }

    const timeSeries = parsed.data["Time Series (Daily)"];
    const history: PriceHistory[] = [];
    const dates = Object.keys(timeSeries).sort();

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
    const response = await fetch(url, {
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
async function fetchCoinGeckoPriceHistory(ticker: string): Promise<PriceHistory[]> {
  const coinId = getCoinGeckoId(ticker);
  if (!coinId) {
    return [];
  }

  const url = `${COINGECKO_BASE_URL}/coins/${coinId}/ohlc?vs_currency=usd&days=90`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`CoinGecko OHLC API error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!data || !Array.isArray(data)) {
      return [];
    }

    // CoinGecko returns [timestamp, open, high, low, close]
    const history: PriceHistory[] = data.map(
      (candle: [number, number, number, number, number]) => ({
        date: new Date(candle[0]).toISOString().split("T")[0],
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: 0, // OHLC endpoint doesn't include volume
      })
    );

    return history;
  } catch (error) {
    console.error("Error fetching CoinGecko price history:", error);
    return [];
  }
}

/**
 * Fetch market data from CoinGecko for cryptocurrencies
 */
async function fetchMarketDataFromCoinGecko(ticker: string): Promise<MarketData> {
  const apiStartTime = Date.now();

  try {
    // Fetch quote and price history in parallel
    const [quote, priceHistory] = await circuitBreakers.coinGecko.execute(() =>
      Promise.all([fetchCoinGeckoQuote(ticker), fetchCoinGeckoPriceHistory(ticker)])
    );

    if (!quote) {
      const responseTime = Date.now() - apiStartTime;
      await logApiUsage({
        service: "COINGECKO",
        endpoint: "coins+ohlc",
        responseTime,
        statusCode: 404,
        errorMessage: "No quote data available",
      });
      return {
        quote: null,
        priceHistory: [],
        isOTC: true, // Treat crypto as high-risk category
        dataAvailable: false,
      };
    }

    const responseTime = Date.now() - apiStartTime;
    await logApiUsage({
      service: "COINGECKO",
      endpoint: "coins+ohlc",
      responseTime,
      statusCode: 200,
    });

    return {
      quote,
      priceHistory,
      isOTC: true, // Treat crypto as high-risk category (similar to OTC stocks)
      dataAvailable: true,
    };
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      console.warn(`CoinGecko circuit breaker open, skipping request for ${ticker}`);
      return { quote: null, priceHistory: [], isOTC: true, dataAvailable: false };
    }
    const responseTime = Date.now() - apiStartTime;
    await logApiUsage({
      service: "COINGECKO",
      endpoint: "coins+ohlc",
      responseTime,
      statusCode: 500,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    console.error("Error fetching market data from CoinGecko:", error);
    return {
      quote: null,
      priceHistory: [],
      isOTC: true,
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
  assetType?: "stock" | "crypto"
): Promise<MarketData> {
  const normalizedTicker = ticker.toUpperCase().trim();

  // Check cache first
  const cached = cache.get(normalizedTicker);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Determine if this is a crypto ticker
  const isCrypto = assetType === "crypto" || isCryptoTicker(normalizedTicker);

  // Handle cryptocurrency using CoinGecko
  if (isCrypto) {
    console.log(`Fetching crypto data for ${normalizedTicker} from CoinGecko`);
    const coinGeckoResult = await fetchMarketDataFromCoinGecko(normalizedTicker);
    if (coinGeckoResult.dataAvailable) {
      cacheSet(normalizedTicker, { data: coinGeckoResult, timestamp: Date.now() });
      return coinGeckoResult;
    }
    // If CoinGecko fails for crypto, return no data (don't try stock APIs)
    console.error(`CoinGecko failed for crypto ${normalizedTicker}`);
    return {
      quote: null,
      priceHistory: [],
      isOTC: true,
      dataAvailable: false,
    };
  }

  // For stocks: Try FMP first (primary), then Alpha Vantage (fallback)
  if (config.fmpApiKey) {
    const fmpResult = await fetchMarketDataFromFMP(normalizedTicker);
    if (fmpResult.dataAvailable) {
      cacheSet(normalizedTicker, { data: fmpResult, timestamp: Date.now() });
      return fmpResult;
    }
  }

  // Fallback to Alpha Vantage
  if (config.alphaVantageApiKey) {
    const avResult = await fetchMarketDataFromAlphaVantage(normalizedTicker);
    if (avResult.dataAvailable) {
      cacheSet(normalizedTicker, { data: avResult, timestamp: Date.now() });
      return avResult;
    }
  }

  // No API configured or all sources failed
  console.error("No market data API configured or all sources failed");
  return {
    quote: null,
    priceHistory: [],
    isOTC: false,
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
      Promise.all([fetchFMPQuote(ticker), fetchFMPPriceHistory(ticker)])
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
    const isOTC = OTC_EXCHANGES.some(exc =>
      quote.exchange.toUpperCase().includes(exc.toUpperCase())
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
      dataAvailable: true,
    };
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      console.warn(`FMP circuit breaker open, skipping request for ${ticker}`);
      return { quote: null, priceHistory: [], isOTC: false, dataAvailable: false };
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
async function fetchMarketDataFromAlphaVantage(ticker: string): Promise<MarketData> {
  const apiStartTime = Date.now();
  let apiCallCount = 0;

  try {
    // Fetch quote and price history in parallel
    // Note: Be careful of rate limits (5 calls/min on free tier)
    const [quote, priceHistory] = await circuitBreakers.alphaVantage.execute(() =>
      Promise.all([fetchQuote(ticker), fetchPriceHistory(ticker)])
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
    await new Promise(resolve => setTimeout(resolve, 200));
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
    const isOTC = OTC_EXCHANGES.some(exc =>
      quote.exchange.toUpperCase().includes(exc.toUpperCase())
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
      dataAvailable: true,
    };
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      console.warn(`Alpha Vantage circuit breaker open, skipping request for ${ticker}`);
      return { quote: null, priceHistory: [], isOTC: false, dataAvailable: false };
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
    const { checkRegulatoryDatabase, syncOTCMarketsFlags } = await import('@/lib/regulatoryDatabase');
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
 * Check SEC RSS feed for recent trading suspensions
 */
async function checkSECFeed(ticker: string): Promise<boolean> {
  try {
    const response = await fetch(
      "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=34-&dateb=&owner=include&count=100&output=atom"
    );
    if (!response.ok) return false;
    const text = await response.text();
    return text.toUpperCase().includes(ticker);
  } catch {
    return false;
  }
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
  highestSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
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
    const { checkRegulatoryDatabase, syncOTCMarketsFlags } = await import('@/lib/regulatoryDatabase');

    // Sync OTC Markets data first (adds flags to DB if found)
    await syncOTCMarketsFlags(normalizedTicker).catch(() => {});

    // Then check all flags from the database
    const result = await checkRegulatoryDatabase(normalizedTicker);

    // Also fetch OTC profile for additional context
    let otcProfile = undefined;
    try {
      const { fetchOTCProfile } = await import('@/lib/otcMarkets');
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
