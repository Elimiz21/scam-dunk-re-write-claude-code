export type ArtifactQualityStatus = "VERIFIED" | "DEGRADED" | "UNKNOWN";

export function assessPublicationQuality(
  scanDate: string,
  files: Readonly<Record<string, Buffer>>,
): ArtifactQualityStatus {
  const statusName = `scan-status-${scanDate}.json`;
  const validationName = `pipeline-validation-${scanDate}.json`;
  if (!files[statusName] && !files[validationName]) return "UNKNOWN";
  if (!files[statusName] || !files[validationName]) {
    throw new Error(`Publication blocked for ${scanDate}: scan status and pipeline validation are both required`);
  }
  let scanStatus: any;
  let validation: any;
  try {
    scanStatus = JSON.parse(files[statusName].toString("utf8"));
    validation = JSON.parse(files[validationName].toString("utf8"));
  } catch {
    throw new Error(`Publication blocked for ${scanDate}: invalid pipeline quality artifact`);
  }
  if (scanStatus?.date !== scanDate || validation?.date !== scanDate) {
    throw new Error(`Publication blocked for ${scanDate}: quality artifact scan date does not match`);
  }
  const scoring = scanStatus?.phases?.phase1_riskScoring;
  if (scoring?.status === "degraded") {
    const { listedExpected, listedEvaluated, listedMissing } = scoring.details ?? {};
    if (
      !Number.isSafeInteger(listedExpected) ||
      !Number.isSafeInteger(listedEvaluated) ||
      !Number.isSafeInteger(listedMissing) ||
      listedExpected < 1 || listedEvaluated < 1 || listedMissing < 0 ||
      listedEvaluated + listedMissing !== listedExpected
    ) {
      throw new Error(`Publication blocked for ${scanDate}: degraded risk scoring lacks coherent listed coverage`);
    }
  } else if (scoring?.status !== "completed") {
    throw new Error(`Publication blocked for ${scanDate}: mandatory risk scoring did not complete`);
  }
  if (!["completed", "degraded"].includes(scanStatus?.pipelineStatus)) {
    throw new Error(`Publication blocked for ${scanDate}: pipeline status is ${scanStatus?.pipelineStatus ?? "unknown"}`);
  }
  if (!["healthy", "degraded"].includes(validation?.status)) {
    throw new Error(`Publication blocked for ${scanDate}: validation status is ${validation?.status ?? "unknown"}`);
  }
  if (!["completed", "degraded"].includes(validation?.scanPipelineStatus)) {
    throw new Error(`Publication blocked for ${scanDate}: validated scan status is ${validation?.scanPipelineStatus ?? "unknown"}`);
  }
  return scoring.status === "degraded" ||
    scanStatus.pipelineStatus === "degraded" ||
    validation.status === "degraded" ||
    validation.scanPipelineStatus === "degraded"
    ? "DEGRADED"
    : "VERIFIED";
}
