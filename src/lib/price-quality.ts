import { marketSessionOnOrBefore } from "./market-publication-freshness";
import type { PriceHistory } from "./types";

export function assessPriceHistory(bars: PriceHistory[], evaluationDate: string): string | null {
  const expected = marketSessionOnOrBefore(evaluationDate);
  if (!expected) return "unsupported_calendar";
  if (bars.length < 30) return "insufficient_history";
  if (new Set(bars.map((bar) => bar.date)).size !== bars.length || bars.some((bar, index) =>
    !/^\d{4}-\d{2}-\d{2}$/.test(bar.date) || !Number.isFinite(Date.parse(bar.date)) || new Date(bar.date).toISOString().slice(0,10) !== bar.date ||
    bar.date > evaluationDate || (index > 0 && bar.date <= bars[index - 1].date) ||
    ![bar.open,bar.high,bar.low,bar.close,bar.volume].every(Number.isFinite) || Math.min(bar.open,bar.high,bar.low,bar.close) <= 0 ||
    bar.volume < 0 || bar.high < Math.max(bar.open,bar.close,bar.low) || bar.low > Math.min(bar.open,bar.close))) return "invalid_prices";
  if (bars.at(-1)!.date !== expected) return "stale_prices";
  if (bars.at(-1)!.volume <= 0 || bars.filter((bar) => bar.volume > 0 && Date.parse(expected) - Date.parse(bar.date) <= 45 * 86_400_000).length < 20 ||
    Date.parse(expected) - Date.parse(bars.at(-30)!.date) > 50 * 86_400_000 ||
    bars.slice(-30).some((bar,index,recent) => index > 0 && Date.parse(bar.date) - Date.parse(recent[index-1].date) > 7 * 86_400_000)) return "sparse_trading";
  if (bars.some((bar,index) => index > 0 && (bar.close / bars[index-1].close > 5 || bar.close / bars[index-1].close < .2))) return "corporate_action";
  return null;
}
