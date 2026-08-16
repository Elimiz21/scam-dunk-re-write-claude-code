import { MarketData, PriceHistory, StockQuote } from "./standalone-scorer";
import { ValidatedDailyPriceDataset } from "./daily-price-dataset";

export interface DailyScanStock {
  symbol: string;
  name?: string;
  exchange?: string;
  marketCap?: number;
  isOTC?: boolean;
}

export interface DailyScanMarketData extends MarketData {
  quote: StockQuote & { sector?: string; industry?: string };
}

/** Builds Phase-1 market data exclusively from the validated 100-bar dataset. */
export function marketDataFromDailyPriceDataset(
  stock: DailyScanStock,
  dataset: ValidatedDailyPriceDataset,
): DailyScanMarketData {
  const priceHistory: PriceHistory[] = dataset.getWindow(stock.symbol).map((bar) => ({
    date: bar.date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));
  const last = priceHistory[priceHistory.length - 1];
  const recent = priceHistory.slice(-30);
  const avgVolume30d = recent.reduce((total, bar) => total + bar.volume, 0) / recent.length;
  const exchange = stock.exchange || "Unknown";
  const isOTC = stock.isOTC === true || ["OTC", "OTCQX", "OTCQB", "PINK", "GREY"].some((name) => exchange.toUpperCase().includes(name));
  return {
    quote: {
      ticker: stock.symbol.trim().toUpperCase(),
      companyName: stock.name || stock.symbol,
      exchange,
      lastPrice: last.close,
      marketCap: Number.isFinite(stock.marketCap) ? Number(stock.marketCap) : 0,
      avgVolume30d,
      avgDollarVolume30d: avgVolume30d * last.close,
    },
    priceHistory,
    isOTC,
    dataAvailable: true,
  };
}
