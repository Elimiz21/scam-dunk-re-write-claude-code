import { createActivityTickerService } from "@/lib/activity-ticker";
import { coverageCountMetadata, sourceExcludedCount } from "@/lib/publication-counts";
import { SCORING_VERSION } from "@/lib/scoring/policy";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const activityTickerComponent = readFileSync(join(process.cwd(), "src/components/ActivityTicker.tsx"), "utf8");
const now = new Date("2026-10-26T06:25:00Z");
const cohort = [{ scoringVersion: SCORING_VERSION, _count: { _all: 9537 } }];
function summary() {
  return { scanDate: new Date("2026-10-23"), artifactRevisionId: "current-publication", artifactRevision: { status: "PUBLISHED" },
    byExchange: JSON.stringify({ NASDAQ: { total: 4696 }, _coverage: coverageCountMetadata(1178) }),
    totalStocks: 16834, evaluated: 9537, skippedNoData: 6119, lowRiskCount: 2045, mediumRiskCount: 7363, highRiskCount: 129, insufficientCount: 0 };
}
function fixture(row: any = summary(), versions: any[] = cohort) {
  const findFirst = jest.fn().mockResolvedValue(row);
  const findMany = jest.fn().mockResolvedValue([{ ...summary(), evaluated: 6420, highRiskCount: 520 }]);
  const groupBy = jest.fn().mockResolvedValue(versions);
  const service = createActivityTickerService({ dailyScanSummary: { findFirst, findMany, aggregate: jest.fn().mockResolvedValue({ _sum: { evaluated: 186345 } }) }, stockDailySnapshot: { groupBy } } as never);
  return { service, findFirst, findMany, groupBy };
}

describe("activity ticker service", () => {
  test("keeps the mobile ticker content inside the viewport", () => {
    expect(activityTickerComponent).toContain("flex min-w-0 flex-1 items-center justify-end");
    expect(activityTickerComponent).toContain("text-[10px]");
    expect(activityTickerComponent).toContain("sm:text-[11px]");
  });
  test("does not show scan date or live-status metadata in the ticker", () => {
    expect(activityTickerComponent).not.toContain("formatScanDate");
    expect(activityTickerComponent).not.toContain("not live");
    expect(activityTickerComponent).not.toContain("Data {state.data.latestScan.scanDate}");
  });
  test("reports the real complete cohort with explicit security-class exclusions instead of an older scan", async () => {
    const { service, findFirst, findMany, groupBy } = fixture();
    await expect(service.getActivityTicker({ now })).resolves.toMatchObject({ status: "AVAILABLE", latestScan: {
      scanDate: "2026-10-23T00:00:00.000Z", totalStocks: 16834, evaluated: 9537, skipped: 6119, excluded: 1178,
      highRisk: 129, caution: 7363, lowRisk: 2045, coveragePercent: 56.7 }, allTimeEvaluations: 186345 });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{artifactRevision:{is:{status:"PUBLISHED"}}}}));
    expect(groupBy).toHaveBeenCalledWith({by:["scoringVersion"],where:{artifactRevisionId:"current-publication",scanDate:new Date("2026-10-23")},_count:{_all:true}});
    expect(findMany).not.toHaveBeenCalled();
  });
  test("does not infer exclusions from a count gap or silently fall back to older totals", async () => {
    const row = { ...summary(), byExchange: "{}" };
    const { service, findMany, groupBy } = fixture(row);
    expect((await service.getActivityTicker({ now })).status).toBe("UNAVAILABLE");
    expect(findMany).not.toHaveBeenCalled(); expect(groupBy).not.toHaveBeenCalled();
  });
  test.each(["invalid-json", JSON.stringify({_coverage:{schemaVersion:"unknown",excluded:1178}}), JSON.stringify({_coverage:{schemaVersion:"scamdunk.coverage-counts/v1",excluded:-1}})])("rejects invalid published coverage metadata %s", async byExchange => {
    expect((await fixture({...summary(),byExchange}).service.getActivityTicker({now})).status).toBe("UNAVAILABLE");
  });
  test("accepts a current published zero-exclusion cohort without new coverage metadata", async () => {
    const row = { ...summary(), totalStocks: 15656, byExchange: "{}" };
    expect(await fixture(row).service.getActivityTicker({ now })).toMatchObject({status:"AVAILABLE",latestScan:{evaluated:9537,excluded:0,highRisk:129}});
  });
  test.each([null, {...summary(),artifactRevisionId:null,artifactRevision:null}, {...summary(),artifactRevision:{status:"FAILED"}}, {...summary(),scanDate:new Date("2026-10-22")}, {...summary(),highRiskCount:130}])("keeps absent, unpublished, stale or inconsistent latest totals unavailable %#", async row => {
    expect((await fixture(row).service.getActivityTicker({now})).status).toBe("UNAVAILABLE");
  });
  test.each([
    [{scoringVersion:null,_count:{_all:9537}}],
    [{scoringVersion:"rules-2026-10-25-v2",_count:{_all:9537}}],
    [{scoringVersion:SCORING_VERSION,_count:{_all:9536}},{scoringVersion:"old",_count:{_all:1}}],
    [{scoringVersion:SCORING_VERSION,_count:{_all:9536}}],
  ])("rejects incompatible, mixed or incomplete snapshot cohorts %#", async (...versions) => {
    expect((await fixture(summary(),versions).service.getActivityTicker({now})).status).toBe("UNAVAILABLE");
  });
  test("persists exclusions only from an explicit reconciled source ledger", () => {
    const source = {...summary(),coverageAccounting:{processing:{reconciles:true,processed:{total:9537},skippedNoData:{total:6119},excluded:{total:1178},unprocessed:{total:0},unaccounted:{total:0}}}};
    expect(sourceExcludedCount(source)).toBe(1178);
    expect(sourceExcludedCount(summary())).toBeNull();
    expect(sourceExcludedCount({...source,coverageAccounting:{processing:{...source.coverageAccounting.processing,unprocessed:{total:1}}}})).toBeNull();
    expect(sourceExcludedCount({...source,evaluated:9536})).toBeNull();
  });
});
