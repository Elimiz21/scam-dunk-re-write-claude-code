import { classifyEvidenceOutcomes } from "./evidence-outcomes";

it("does not treat failed evidence sources as confirmed empty evidence", () => {
  expect(classifyEvidenceOutcomes([{ success: true, data: [] }, { success: false, data: [], error: { source: "news", message: "timeout" } }]).complete).toBe(false);
});
