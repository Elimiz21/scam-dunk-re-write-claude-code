import { formatNumber, formatPrice } from "../lib/utils";

describe("formatNumber", () => {
  test("formats billions", () => {
    expect(formatNumber(1_500_000_000)).toBe("$1.5B");
    expect(formatNumber(50_000_000_000)).toBe("$50.0B");
  });

  test("formats millions", () => {
    expect(formatNumber(1_500_000)).toBe("$1.5M");
    expect(formatNumber(250_000_000)).toBe("$250.0M");
  });

  test("formats thousands", () => {
    expect(formatNumber(1_500)).toBe("$1.5K");
    expect(formatNumber(50_000)).toBe("$50.0K");
  });

  test("formats small numbers with two decimals", () => {
    expect(formatNumber(500)).toBe("$500.00");
    expect(formatNumber(0.5)).toBe("$0.50");
    expect(formatNumber(99.99)).toBe("$99.99");
  });

  test("handles zero", () => {
    expect(formatNumber(0)).toBe("$0.00");
  });

  test("handles exact boundaries", () => {
    expect(formatNumber(1_000)).toBe("$1.0K");
    expect(formatNumber(1_000_000)).toBe("$1.0M");
    expect(formatNumber(1_000_000_000)).toBe("$1.0B");
  });
});

describe("formatPrice", () => {
  test("formats prices with two decimal places", () => {
    expect(formatPrice(10)).toBe("$10.00");
    expect(formatPrice(3.14159)).toBe("$3.14");
    expect(formatPrice(0)).toBe("$0.00");
    expect(formatPrice(1000.5)).toBe("$1000.50");
  });
});
