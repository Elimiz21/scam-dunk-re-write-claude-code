import { hasIndependentWarning, type NewsTriageInput } from "../../src/lib/news-triage";

/** Size/liquidity limits apply only to the market-pattern review shortlist. */
export function shouldFilterBySize(stock: (NewsTriageInput & {marketCap?: number | null; avgDollarVolume?: number | null; avgDollarVolume30d?: number | null}) | null): {filtered: boolean; reason: string | null} {
  if (!stock || hasIndependentWarning(stock)) return {filtered: false, reason: null};
  if (stock.marketCap && stock.marketCap > 10_000_000_000) return {
    filtered: true, reason: `Outside the market-pattern shortlist: large market cap ($${(stock.marketCap / 1_000_000_000).toFixed(1)}B)`,
  };
  const dollarVolume = stock.avgDollarVolume30d ?? stock.avgDollarVolume ?? 0;
  if (dollarVolume > 10_000_000) return {
    filtered: true, reason: `Outside the market-pattern shortlist: high daily dollar volume ($${(dollarVolume / 1_000_000).toFixed(1)}M)`,
  };
  return {filtered: false, reason: null};
}
