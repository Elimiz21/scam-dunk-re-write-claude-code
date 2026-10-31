import { act, createElement } from "react";
import { createRequire } from "node:module";
import type { Root } from "react-dom/client";
import { useLiveSiteStats } from "@/lib/use-site-stats";
import { ActivityTicker } from "@/components/ActivityTicker";

// Exercise real React effects and rendered values with the project's existing
// DOM dependency; no browser-environment package or runtime dependency is added.
const { JSDOM } = createRequire(require.resolve("isomorphic-dompurify"))("jsdom");
const initialTime = new Date("2026-10-31T13:00:00Z");
const available = (stocksPerDay = 7350) => ({
  status: "AVAILABLE", updatedAt: initialTime.toISOString(), lastScanDate: "2026-10-30",
  stocksPerDay, highRiskLastScan: 110, totalScans: 10000,
  dumpsConfirmed6mo: 479, dumpsConfirmed30d: 20, newFlagSymbols7d: 3, newFlagSymbols30d: 9, pumpingNow: 8,
});
const response = (data: unknown, ok = true) => ({ok, json: async () => data}) as Response;
const fetchMock = jest.fn();
let dom: any, container: HTMLElement, root: Root;
const savedDescriptors = new Map<string, PropertyDescriptor | undefined>();
const originalFetch = global.fetch;

function Harness() {
  return createElement("output", null, JSON.stringify(useLiveSiteStats()));
}
const rendered = () => JSON.parse(container.textContent || "null");
async function mount(component: typeof Harness | typeof ActivityTicker = Harness) {
  await act(async () => { root.render(createElement(component)); });
}
async function advance(ms: number) {
  await act(async () => { jest.advanceTimersByTime(ms); });
}

beforeAll(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", {url:"https://scamdunk.test",pretendToBeVisual:true});
  for (const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})) {
    savedDescriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  }
});
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(initialTime);
  fetchMock.mockReset(); global.fetch = fetchMock;
  // jsdom is loaded through its owning production dependency, outside Jest.
  // Route browser timers through this test clock for suspended-tab scenarios.
  dom.window.setTimeout = (...args:any[]) => (global.setTimeout as any)(...args);
  dom.window.clearTimeout = (id:any) => global.clearTimeout(id);
  dom.window.setInterval = (...args:any[]) => (global.setInterval as any)(...args);
  dom.window.clearInterval = (id:any) => global.clearInterval(id);
  container = document.createElement("div"); document.body.appendChild(container);
  root = require("react-dom/client").createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove(); jest.useRealTimers(); global.fetch = originalFetch;
});
afterAll(() => {
  dom.window.close();
  for (const [key,descriptor] of savedDescriptors) {
    if (descriptor) Object.defineProperty(globalThis,key,descriptor);
    else delete (globalThis as any)[key];
  }
});

test("renders measured zero without substituting a legacy marketing count", async () => {
  fetchMock.mockResolvedValue(response({...available(0),totalScans:0}));
  await mount();
  expect(rendered().tiles).toMatchObject({stocksPerDay:"0",totalScans:"0",dumpsConfirmed6mo:"479",pumpingNow:"8"});
});
test("an open homepage refreshes a corrected publication without remounting", async () => {
  fetchMock.mockResolvedValueOnce(response(available())).mockResolvedValueOnce(response(available(8123)));
  await mount(); expect(rendered().tiles.stocksPerDay).toBe("7,300+");
  await advance(60_000);
  expect(rendered().tiles.stocksPerDay).toBe("8,100+");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][1]).toMatchObject({cache:"no-store",headers:{Accept:"application/json"}});
});
test.each(["http","network","invalid"])("a failed %s refresh removes previously available counters", async failure => {
  fetchMock.mockResolvedValueOnce(response(available()));
  if (failure === "http") fetchMock.mockResolvedValueOnce(response({error:"unavailable"},false));
  if (failure === "network") fetchMock.mockRejectedValueOnce(new Error("offline"));
  if (failure === "invalid") fetchMock.mockResolvedValueOnce(response({error:"unavailable"}));
  await mount(); await advance(60_000);
  expect(rendered().live).toBeNull();
  expect(rendered().tiles.stocksPerDay).toBe("—");
  expect(rendered().tiles.totalScans).toBe("—");
});
test("a stale publication becomes unavailable while independent historical counts remain measured", async () => {
  fetchMock.mockResolvedValueOnce(response(available())).mockResolvedValueOnce(response({...available(),status:"UNAVAILABLE",lastScanDate:null,stocksPerDay:null,highRiskLastScan:null,totalScans:null}));
  await mount(); await advance(60_000);
  expect(rendered().tiles).toMatchObject({stocksPerDay:"—",totalScans:"—",dumpsConfirmed6mo:"479",pumpingNow:"8"});
});
test("resuming a sleeping tab retires old counters before its new request completes", async () => {
  let resolveRefresh: (value:Response)=>void;
  fetchMock.mockResolvedValueOnce(response(available())).mockImplementationOnce(()=>new Promise(resolve=>{resolveRefresh=resolve;}));
  await mount();
  await act(async () => {
    jest.setSystemTime(new Date(initialTime.getTime()+120_000));
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(rendered().tiles.stocksPerDay).toBe("—");
  await act(async () => { resolveRefresh!(response(available(8123))); });
  expect(rendered().tiles.stocksPerDay).toBe("8,100+");
});
test("a timed-out refresh cannot overwrite a later successful response", async () => {
  let resolveOld: (value:Response)=>void;
  fetchMock.mockResolvedValueOnce(response(available()))
    .mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}))
    .mockResolvedValueOnce(response(available(8500)));
  await mount(); await advance(60_000); await advance(15_000);
  expect(rendered().tiles.stocksPerDay).toBe("—");
  expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
  await advance(45_000); expect(rendered().tiles.stocksPerDay).toBe("8,500+");
  await act(async () => { resolveOld!(response(available(9999))); });
  expect(rendered().tiles.stocksPerDay).toBe("8,500+");
});
test("unmount aborts the request and removes polling and resume work", async () => {
  fetchMock.mockImplementationOnce(()=>new Promise(()=>{}));
  await mount(); const signal=fetchMock.mock.calls[0][1]?.signal;
  await act(async () => { root.unmount(); });
  expect(signal?.aborted).toBe(true);
  await advance(120_000);
  document.dispatchEvent(new dom.window.Event("visibilitychange"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

const tickerPayload = (evaluated = 7350) => ({
  status:"AVAILABLE",updatedAt:initialTime.toISOString(),allTimeEvaluations:10000,notice:"",
  latestScan:{scanDate:"2026-10-30",totalStocks:evaluated+2650,evaluated,skipped:1650,excluded:1000,highRisk:110,caution:5350,lowRisk:evaluated-5460,coveragePercent:Math.round(evaluated/(evaluated+2650)*1000)/10},
});
test("the activity ticker also removes counters when its next publication becomes unavailable", async () => {
  fetchMock.mockResolvedValueOnce(response(tickerPayload())).mockResolvedValueOnce(response({status:"UNAVAILABLE",updatedAt:initialTime.toISOString(),latestScan:null,allTimeEvaluations:null,notice:"Not current"}));
  await mount(ActivityTicker); expect(container.textContent).toContain("7,350");
  await advance(60_000);
  expect(container.textContent).not.toContain("7,350");
  expect(container.textContent).toContain("Market-wide scan totals are not available yet");
  expect(fetchMock.mock.calls[1][0]).toBe("/api/activity-ticker");
});
test("the activity ticker retires sleeping-tab counters and ignores a timed-out late response", async () => {
  let resolveOld: (value:Response)=>void;
  fetchMock.mockResolvedValueOnce(response(tickerPayload()))
    .mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}))
    .mockResolvedValueOnce(response(tickerPayload(8500)));
  await mount(ActivityTicker);
  await act(async () => {
    jest.setSystemTime(new Date(initialTime.getTime()+120_000));
    document.dispatchEvent(new dom.window.Event("visibilitychange"));
  });
  expect(container.textContent).not.toContain("7,350");
  expect(container.textContent).toContain("Activity totals temporarily unavailable");
  await advance(15_000); await advance(45_000);
  expect(container.textContent).toContain("8,500");
  await act(async () => { resolveOld!(response(tickerPayload(9999))); });
  expect(container.textContent).toContain("8,500");
  expect(container.textContent).not.toContain("9,999");
});
