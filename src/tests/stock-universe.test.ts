import { normalizeSupportedTicker } from "../lib/stock-universe";

describe("normalizeSupportedTicker", () => {
  test.each([
    ["aapl", "AAPL"],
    ["  $msft  ", "MSFT"],
    ["brk.b", "BRK.B"],
  ])("normalizes supported ticker input %s", (input, ticker) => {
    expect(normalizeSupportedTicker(input)).toEqual({ ok: true, ticker });
  });

  test.each([
    "BTC",
    "BTC-USD",
    "ETH/USD",
    "SPY",
    "QQQ",
    "AAPL 20270115C00150000",
    "AAPL 2027 CALL 150",
    "7203.T",
    "VOD.L",
    "NYSE:AAPL",
  ])("rejects unsupported asset input %s", (input) => {
    expect(normalizeSupportedTicker(input)).toEqual({
      ok: false,
      reason: "UNSUPPORTED_ASSET",
    });
  });

  test.each(["", "AAPL!", "TOO-LONG", "1234", "$", "AAPL/B"]) (
    "rejects invalid ticker syntax %s",
    (input) => {
      expect(normalizeSupportedTicker(input)).toEqual({
        ok: false,
        reason: "INVALID_TICKER",
      });
    },
  );
});
