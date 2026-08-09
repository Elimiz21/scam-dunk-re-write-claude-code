import {
  parseWhatsAppStockScan,
  WHATSAPP_INVALID_INPUT_REPLY,
} from "@/lib/whatsapp/parser";

describe("parseWhatsAppStockScan", () => {
  it.each([
    ["AAPL", "AAPL"],
    ["aapl", "AAPL"],
    ["  scan   aapl  ", "AAPL"],
    ["BRK.B", "BRK.B"],
    ["BF-B", "BF-B"],
    ["ＡＡＰＬ", "AAPL"],
  ])("accepts the supported scan grammar: %s", (input, ticker) => {
    expect(parseWhatsAppStockScan(input)).toEqual({ ok: true, ticker });
  });

  it.each([
    "",
    "scan",
    "scanAAPL",
    "AAPL MSFT",
    "AAPL,",
    "$AAPL",
    "scan AAPL now",
    "AAPL\nMSFT",
    "ABCDEFGHIJK",
  ])("rejects input outside the two-form scan grammar: %p", (input) => {
    expect(parseWhatsAppStockScan(input)).toEqual({
      ok: false,
      reply: WHATSAPP_INVALID_INPUT_REPLY,
    });
  });
});
