const promotedFind = jest.fn();
const promotedUpdate = jest.fn();
const stored: Array<Record<string, any>> = [];
jest.mock("@/lib/db", () => ({ prisma: {
  promotedStock: { findMany: (...args: unknown[]) => promotedFind(...args), update: (...args: unknown[]) => promotedUpdate(...args), findFirst: jest.fn(async () => stored[0]), count: jest.fn(async () => stored.length) },
  dailyScanSummary: { findMany: jest.fn(async () => []) },
  trackedStock: { findUnique: jest.fn(async () => ({ id: "stock", symbol: "TEST" })) },
  stockDailySnapshot: { findMany: jest.fn(async () => []) },
  stockRiskAlert: { findMany: jest.fn(async () => []) },
} }));
jest.mock("@/lib/config", () => ({ config: { fmpApiKey: "offline-test" } }));
jest.mock("@/lib/admin/auth", () => ({ getAdminSession: jest.fn(async () => ({ id: "admin" })) }));
jest.mock("@/lib/cache", () => ({ cached: async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn() }));
import { trackPromotedStocks, computeOutcome } from "@/lib/promoted-stocks/tracker";
import { GET as marketAnalysis } from "@/app/api/admin/market-analysis/route";
import { GET as stockLookup } from "@/app/api/admin/stock-lookup/route";

const originalFetch = global.fetch;
const base = { id: "unknown", symbol: "TEST", addedDate: new Date("2026-09-01"), peakPrice: 20, peakDate: null, lastUpdateDate: null, currentGainPct: 900, maxGainPct: 1900, outcome: "PUMPING", currentPrice: 10, isActive: true };
beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-09-16T20:00:00Z"), doNotFake: ["setTimeout", "clearTimeout"] });
  stored.splice(0); jest.clearAllMocks();
  promotedFind.mockImplementation(async () => stored);
  promotedUpdate.mockImplementation(async ({ where, data }) => Object.assign(stored.find((row) => row.id === where.id)!, data));
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => [{ date: "2026-09-16", close: 10, high: 20 }, { date: "2026-09-02", close: 5, high: 6 }] })) as unknown as typeof fetch;
});
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });

test.each([null, undefined, 0, -1])("tracker leaves unusable entry %s untouched without buying later data", async (entryPrice) => {
  const row = { ...base, entryPrice }; stored.push(row);
  const before = { ...row };
  await trackPromotedStocks();
  expect(row).toEqual(before);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(promotedUpdate).not.toHaveBeenCalled();
});

test.each([false, true])("mixed symbol rows preserve unknown baseline when delisted=%s", async (delisted) => {
  stored.push({ ...base, entryPrice: null }, { ...base, id: "positive", entryPrice: 2 });
  if (delisted) global.fetch = jest.fn(async (url) => ({ ok: true, url: String(url), json: async () => String(url).includes("/profile?") ? [{ isActivelyTrading: false }] : [{ date: "2026-09-02", close: 5, high: 6 }] })) as unknown as typeof fetch;
  // Force an old series for the terminal branch.
  if (delisted) jest.setSystemTime(new Date("2026-10-16T20:00:00Z"));
  const before = { ...stored[0] };
  const result = await trackPromotedStocks();
  expect(stored[0]).toEqual(before);
  expect(stored[1].entryPrice).toBe(2);
  expect(stored[1].currentGainPct).toBe(delisted ? -100 : 400);
  expect(result.entryPricesBackfilled).toBe(0);
});

test.each([null, 0, -1])("both admin APIs mask stored performance claims for entry %s", async (entryPrice) => {
  stored.push({ ...base, entryPrice });
  const market = await (await marketAnalysis(new Request("https://offline.test/api/admin/market-analysis"))).json();
  const lookup = await (await stockLookup(new Request("https://offline.test/api/admin/stock-lookup?symbol=TEST"))).json();
  expect(market.promotedStocks[0]).toMatchObject({ entryPrice, currentGainPct: null, maxGainPct: null, outcome: null });
  expect(lookup.promotion).toMatchObject({ entryPrice, currentGainPct: null, outcome: null });
  expect(stored[0]).toMatchObject({ currentGainPct: 900, maxGainPct: 1900, outcome: "PUMPING" });
});

test("positive entry still exposes supported performance", async () => {
  stored.push({ ...base, entryPrice: 2 });
  const market = await (await marketAnalysis(new Request("https://offline.test/api/admin/market-analysis"))).json();
  expect(market.promotedStocks[0]).toMatchObject({ entryPrice: 2, currentGainPct: 900, maxGainPct: 1900, outcome: "PUMPING" });
});

test.each([0, -1, Number.NaN])("outcome calculator refuses unusable denominator %s", (entryPrice) => {
  expect(computeOutcome({ entryPrice, currentPrice: 10, peakPrice: 20, daysSinceAdded: 2 })).toMatchObject({ outcome: "UNKNOWN" });
});

import { formatEntryPrice, normalizeEntryPrice } from "@/lib/promoted-stocks/entry-price";
test("renders missing price as Unknown and preserves observed zero", () => {
  expect(formatEntryPrice(null)).toBe("Unknown");
  expect(formatEntryPrice(0)).toBe("$0.00");
  expect(formatEntryPrice(2.5)).toBe("$2.50");
});
test.each([Number.NaN, Infinity, -Infinity, -1, "2.5"])("rejects invalid source price %s", (value) => {
  expect(() => normalizeEntryPrice(value)).toThrow("Invalid promoted entry price");
});
