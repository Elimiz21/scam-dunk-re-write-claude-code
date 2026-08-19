import { evaluateScanPublication } from "./scan-publication";

function safeSegment(value: unknown, fallback: string): string {
  const normalized = typeof value === "string" ? value.trim().replace(/[^A-Za-z0-9._-]/g, "-") : "";
  return normalized || fallback;
}

/** One policy result for quarantine upload, promotion, and alert routing. */
export function buildPublicationWorkflowPlan(status: unknown, date: string, fallbackGeneration: string) {
  const evaluation = evaluateScanPublication(status, date);
  const generation = safeSegment((status as any)?.recovery?.generationId, safeSegment(fallbackGeneration, "invalid-generation"));
  const classification = evaluation.publishable ? "healthy" : "degraded";
  return {
    ...evaluation,
    classification,
    quarantinePrefix: `quarantine/${safeSegment(date, "invalid-date")}/${generation}`,
    promoteRoot: evaluation.publishable,
    sendDegradedAlert: !evaluation.publishable,
  };
}
