import { normalizeSupportedTicker, hasUnsupportedInstrumentName } from "../lib/stock-universe";

describe("security-class names", () => {
  it.each([
    ["Example, Inc. Warrant", true],
    ["Example Units, each consisting of one share and one warrant", true],
    ["Example Series A Preferred Stock", true],
    ["Example 6.25% Notes due 2027", true],
    ["Preferred Bank", false],
    ["Unit Corporation", false],
    ["Rightside Group Ltd.", false],
    ["Apple Inc.", false],
  ])("classifies the explicit security label in %s", (name, unsupported) => {
    expect(hasUnsupportedInstrumentName(name)).toBe(unsupported);
  });
  it("keeps a directory class label when the issuer profile has a shorter name", () => {
    expect(hasUnsupportedInstrumentName("Example Inc.", "Example Inc. Warrant")).toBe(true);
    expect(hasUnsupportedInstrumentName("Preferred Bank", "Preferred Bank Common Stock")).toBe(false);
  });
});

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
    "ABC.V",
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
