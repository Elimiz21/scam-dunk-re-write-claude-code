import { evidenceWindow, retrieveEvidence, retrievePagedEvidence, retrievalComplete, validClearance } from "./news-evidence";
const window = evidenceWindow("2026-10-23");
const retrieve = (source: string, value: unknown) => retrieveEvidence({ source, symbol: "TEST", window, available: true, retrieve: async () => value });
test("distinguishes empty success, malformed responses, provider errors and missing configuration", async () => {
  expect((await retrieve("news", [])).status).toBe("EMPTY");
  expect((await retrieve("news", { error: "denied" })).status).toBe("ERROR");
  const failed = await retrieveEvidence({ source: "news", symbol: "TEST", window, available: true, retrieve: async () => { throw new Error("secret URL must not leak"); } });
  expect(failed).toMatchObject({ status: "ERROR", errorCode: "RETRIEVAL_FAILED" });
  expect((await retrieveEvidence({ source: "news", symbol: "TEST", window, available: false, retrieve: jest.fn() })).status).toBe("UNAVAILABLE");
});
test("pagination retains consulted evidence and identifies failed or stalled traversal", async () => {
  const base = { source: "news", symbol: "TEST", window, available: true, pageSize: 1 };
  const complete = await retrievePagedEvidence({ ...base, retrieve: async (page) => page < 2 ? [{ date: "2026-10-23", title: String(page) }] : [] });
  expect(complete).toMatchObject({ status: "FOUND", requests: 3 });
  expect(complete.items).toHaveLength(2);
  const failed = await retrievePagedEvidence({ ...base, retrieve: async (page) => { if (page) throw new Error("timeout"); return [{ date: "2026-10-23" }]; } });
  expect(failed.status).toBe("ERROR"); expect(failed.items).toHaveLength(1);
  const stalled = await retrievePagedEvidence({ ...base, retrieve: async () => [{ date: "2026-10-23" }] });
  expect(stalled.errorCode).toBe("PAGINATION_STALLED");
});
test("future, old, invalid and undated evidence is retained but cannot support clearance", async () => {
  const source = await retrieve("news", [{ date: "2026-10-24" }, { date: "2026-10-15" }, { date: "2026-02-30" }, {}, { date: "2026-10-23" }]);
  expect(source.items.map((item) => item.eligible)).toEqual([false, false, false, false, true]);
  const sources = [source, await retrieve("sec_filings", []), await retrieve("press_releases", [])];
  expect(retrievalComplete(sources)).toBe(true);
  expect(validClearance([source.items[0].id], sources)).toBe(false);
  expect(validClearance([source.items[4].id], sources)).toBe(true);
  expect(validClearance(["invented"], sources)).toBe(false);
  expect(validClearance([], sources)).toBe(false);
  sources[1].status = "ERROR";
  expect(validClearance([source.items[4].id], sources)).toBe(false);
});
