import {
  clampIntParam,
  parsePage,
  parseLimit,
  parseDays,
  pickSortField,
  pickSortOrder,
} from "@/lib/admin/query-params";

const qp = (s: string) => new URLSearchParams(s);

describe("admin query-param clamping (R6)", () => {
  it("clampIntParam falls back on NaN and bounds the range", () => {
    expect(clampIntParam("abc", { def: 7, min: 1, max: 365 })).toBe(7);
    expect(clampIntParam(null, { def: 7, min: 1, max: 365 })).toBe(7);
    expect(clampIntParam("-5", { def: 7, min: 1, max: 365 })).toBe(1);
    expect(clampIntParam("99999", { def: 7, min: 1, max: 365 })).toBe(365);
    expect(clampIntParam("30", { def: 7, min: 1, max: 365 })).toBe(30);
  });

  it("parsePage never returns < 1 (no negative skip)", () => {
    expect(parsePage(qp("page=-3"))).toBe(1);
    expect(parsePage(qp("page=abc"))).toBe(1);
    expect(parsePage(qp("page=4"))).toBe(4);
  });

  it("parseLimit stays within [1, max]", () => {
    expect(parseLimit(qp("limit=0"))).toBe(1);
    expect(parseLimit(qp("limit=9999"))).toBe(100);
    expect(parseLimit(qp("limit=abc"))).toBe(20);
    expect(parseLimit(qp("limit=250"), 500)).toBe(250);
  });

  it("parseDays never yields NaN for Date math", () => {
    expect(parseDays(qp("days=abc"))).toBe(7);
    expect(parseDays(qp("days=-1"))).toBe(1);
    expect(Number.isFinite(parseDays(qp("days=xyz")))).toBe(true);
  });

  it("pickSortField whitelists and pickSortOrder normalizes", () => {
    const allowed = ["createdAt", "name"] as const;
    expect(pickSortField("name", allowed, "createdAt")).toBe("name");
    expect(pickSortField("DROP TABLE", allowed, "createdAt")).toBe("createdAt");
    expect(pickSortField(null, allowed, "createdAt")).toBe("createdAt");
    expect(pickSortOrder("asc")).toBe("asc");
    expect(pickSortOrder("sideways")).toBe("desc");
  });
});
