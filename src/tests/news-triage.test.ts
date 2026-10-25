import { resolveNewsTriage, reviewedAlertEligible } from "@/lib/news-triage";

test.each(["CLEARED", "RETAINED", "NO_EVIDENCE", "DEFERRED", "ERROR", "UNAVAILABLE", "UNKNOWN"])("preserves %s triage", (newsTriage) => {
  expect(resolveNewsTriage({ newsTriage })).toBe(newsTriage);
});
test("legacy clearance survives without pretending legacy retrieval was complete", () => {
  expect(resolveNewsTriage({ hasLegitimateNews: true })).toBe("CLEARED");
  expect(resolveNewsTriage({ hasLegitimateNews: false, newsAnalysis: "No recent news found" })).toBe("UNKNOWN");
});
test.each(["CLEARED", "NO_EVIDENCE", "DEFERRED", "ERROR", "UNAVAILABLE", "UNKNOWN"])("%s raw HIGH is not a reviewed suspicious alert", (newsTriage) => {
  expect(reviewedAlertEligible({ riskLevel: "HIGH", newsTriage })).toBe(false);
});
test("reviewed suspicious alerts require retained HIGH or independent warnings", () => {
  expect(reviewedAlertEligible({ riskLevel: "HIGH", newsTriage: "RETAINED" })).toBe(true);
  expect(reviewedAlertEligible({ riskLevel: "LOW", newsTriage: "RETAINED" })).toBe(false);
  expect(reviewedAlertEligible({ riskLevel: "HIGH", newsTriage: "CLEARED", signals: [{ category: "ALERT" }] })).toBe(true);
  expect(reviewedAlertEligible({ riskLevel: "HIGH", newsTriage: "ERROR", signals: [{ category: "BEHAVIORAL" }] })).toBe(true);
});
