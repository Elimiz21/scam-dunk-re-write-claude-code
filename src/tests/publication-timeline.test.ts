import { buildPublicationTimeline } from "@/components/dashboard/publication-timeline";

describe("publication timeline", () => {
  it("shows incomplete coverage without implying stale market data", () => {
    expect(buildPublicationTimeline({ publicationQuality: "DEGRADED" })).toContainEqual({ label: "Scan completeness", value: "Partial coverage" });
  });
  it("keeps market date, execution, publication and partial social update separate", () => {
    const timeline = buildPublicationTimeline({
      asOf: "2026-09-14T00:00:00Z", executedAt: "2026-09-14T23:20:00Z",
      publishedAt: "2026-09-16T07:10:00Z",
      socialPublication: { status: "PARTIAL", scanDate: "2026-09-14T23:50:00Z", updatedAt: "2026-09-15T00:10:00Z" },
    });
    expect(timeline).toEqual([
      { label: "Market data", value: "Sep 14, 2026" },
      { label: "Scan ran", value: "Sep 14, 2026, 11:20 PM UTC" },
      { label: "Published", value: "Sep 16, 2026, 7:10 AM UTC" },
      { label: "Scan completeness", value: "Not recorded" },
      { label: "Social scan (partial)", value: "Sep 14, 2026, 11:50 PM UTC" },
      { label: "Social updated", value: "Sep 15, 2026, 12:10 AM UTC" },
    ]);
  });
  it("never substitutes a market date for missing execution or publication", () => {
    expect(buildPublicationTimeline({ asOf: "2026-09-14", executedAt: null, publishedAt: "bad", socialPublication: null }))
      .toEqual([
        { label: "Market data", value: "Sep 14, 2026" },
        { label: "Scan ran", value: "Not recorded" },
        { label: "Published", value: "Not recorded" },
        { label: "Scan completeness", value: "Not recorded" },
        { label: "Social scan", value: "Not available" },
      ]);
  });
});
