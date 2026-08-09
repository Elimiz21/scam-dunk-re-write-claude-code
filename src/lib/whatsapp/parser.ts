export const WHATSAPP_INVALID_INPUT_REPLY =
  "Send one stock ticker only, for example AAPL or scan AAPL.";

export type WhatsAppStockScanParseResult =
  | { ok: true; ticker: string }
  | { ok: false; reply: typeof WHATSAPP_INVALID_INPUT_REPLY };

const STOCK_SCAN_PATTERN = /^(?:scan )?([A-Za-z][A-Za-z0-9.-]{0,9})$/i;

/**
 * Parses the only two inbound WhatsApp forms supported by the MVP. This is
 * deliberately isolated from the web scanner's broader free-text contract.
 */
export function parseWhatsAppStockScan(
  input: string,
): WhatsAppStockScanParseResult {
  const normalized = input.normalize("NFKC").replace(/\s+/g, " ").trim();

  if (!normalized || Array.from(normalized).length > 16) {
    return { ok: false, reply: WHATSAPP_INVALID_INPUT_REPLY };
  }

  const match = normalized.match(STOCK_SCAN_PATTERN);
  if (!match || /^scan(?:$|[A-Za-z])/i.test(normalized)) {
    return { ok: false, reply: WHATSAPP_INVALID_INPUT_REPLY };
  }

  return { ok: true, ticker: match[1].toUpperCase() };
}
