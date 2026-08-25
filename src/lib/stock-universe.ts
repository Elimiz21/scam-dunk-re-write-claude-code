/**
 * V1 accepts US-listed common-stock ticker syntax only. The authoritative
 * market-data provider remains responsible for confirming that a symbol is
 * currently listed; this helper prevents clearly unsupported asset formats
 * from reaching a paid scan path.
 */

export type SupportedTickerResult =
  | { ok: true; ticker: string }
  | { ok: false; reason: "UNSUPPORTED_ASSET" | "INVALID_TICKER" };

const CRYPTO_SYMBOLS = new Set([
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "DOGE",
  "ADA",
  "AVAX",
  "DOT",
  "LINK",
  "LTC",
]);

// Common ETF symbols are rejected explicitly because their syntax is
// indistinguishable from a stock ticker.
const ETF_SYMBOLS = new Set([
  "DIA",
  "GLD",
  "IWM",
  "QQQ",
  "SLV",
  "SPY",
  "TLT",
  "USO",
  "VTI",
  "VOO",
  "VT",
  "XLE",
  "XLF",
  "XLK",
]);

// The current US symbol policy permits the class-B form used by BRK.B.
// Every other dotted suffix is rejected until an explicit production need
// and corresponding market-data support are established.
const SUPPORTED_US_SUFFIXES = new Set(["B"]);

const OPTION_CONTRACT_PATTERN =
  /\b\d{6,8}[CP]\d{6,8}\b|\b(?:CALL|PUT)\b|\b\d{6,8}[ -][CP][ -]?\d+/i;

export function normalizeSupportedTicker(input: string): SupportedTickerResult {
  if (typeof input !== "string") {
    return { ok: false, reason: "INVALID_TICKER" };
  }

  const raw = input.trim();
  if (!raw) {
    return { ok: false, reason: "INVALID_TICKER" };
  }

  const withoutCashMarker = raw.startsWith("$") ? raw.slice(1).trim() : raw;
  const ticker = withoutCashMarker.toUpperCase();

  const [, suffix] = ticker.split(".");
  const cryptoBaseSymbol = ticker.split(/[-/]/)[0];
  const isCryptoPair =
    CRYPTO_SYMBOLS.has(cryptoBaseSymbol) &&
    (ticker.includes("-") || ticker.includes("/"));
  const hasUnsupportedSuffix =
    suffix !== undefined && !SUPPORTED_US_SUFFIXES.has(suffix);

  if (
    CRYPTO_SYMBOLS.has(ticker) ||
    isCryptoPair ||
    OPTION_CONTRACT_PATTERN.test(ticker) ||
    hasUnsupportedSuffix ||
    /^\w+:\w+$/.test(ticker)
  ) {
    return { ok: false, reason: "UNSUPPORTED_ASSET" };
  }

  if (ETF_SYMBOLS.has(ticker)) {
    return { ok: false, reason: "UNSUPPORTED_ASSET" };
  }

  if (!/^[A-Z]{1,5}(?:\.[A-Z])?$/.test(ticker)) {
    return { ok: false, reason: "INVALID_TICKER" };
  }

  return { ok: true, ticker };
}
