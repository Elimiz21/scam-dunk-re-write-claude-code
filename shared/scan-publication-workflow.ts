import { evaluateScanPublication } from "./scan-publication";

export interface PublicationManifest {
  schemaVersion: 1;
  kind: "scan-publication-manifest";
  date: string;
  generationId: string;
  statusFile: string;
  journalFile: string;
  requiredFiles: string[];
  commitMarker: string;
}

export interface PublicationArtifacts {
  manifest?: unknown;
  validation?: unknown;
  quarantineReceipt?: unknown;
  availableFiles?: string[];
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeSegment(value: unknown, fallback: string): string {
  const normalized = typeof value === "string" ? value.trim().replace(/[^A-Za-z0-9._-]/g, "-") : "";
  return normalized || fallback;
}

function fileName(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._-]+$/.test(value) && value === value.trim();
}

function addUnique(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

/** Validate the immutable generation manifest used by ingestion and promotion. */
export function validatePublicationManifest(
  status: unknown,
  expectedDate: string,
  manifest: unknown,
  availableFiles?: string[],
): string[] {
  const reasons: string[] = [];
  if (!isRecord(status) || !isRecord(status.recovery)) return ["manifest-status-missing"];
  if (!isRecord(manifest)) return ["manifest-missing"];
  const generationId = status.recovery.generationId;
  const journalFile = status.recovery.journalFile;
  const enhancedFile = `enhanced-evaluation-${expectedDate}.json`;
  const statusFile = `scan-status-${expectedDate}.json`;
  const required = manifest.requiredFiles;
  if (manifest.schemaVersion !== 1 || manifest.kind !== "scan-publication-manifest") addUnique(reasons, "manifest-schema-invalid");
  if (manifest.date !== expectedDate) addUnique(reasons, "manifest-date-mismatch");
  if (manifest.generationId !== generationId || typeof generationId !== "string" || !generationId.trim()) addUnique(reasons, "manifest-generation-mismatch");
  if (!fileName(generationId)) addUnique(reasons, "manifest-generation-invalid");
  if (manifest.statusFile !== statusFile) addUnique(reasons, "manifest-status-path-mismatch");
  if (!fileName(journalFile) || manifest.journalFile !== journalFile) addUnique(reasons, "manifest-journal-path-mismatch");
  if (!Array.isArray(required) || required.some((file) => !fileName(file)) || new Set(required).size !== required.length) {
    addUnique(reasons, "manifest-required-files-invalid");
  } else {
    for (const file of [enhancedFile, statusFile, journalFile]) {
      if (!required.includes(file)) addUnique(reasons, `manifest-required-file-missing:${file}`);
    }
    if (availableFiles) for (const file of required) if (!availableFiles.includes(file)) addUnique(reasons, `local-file-missing:${file}`);
  }
  if (manifest.commitMarker !== `publication-manifest-${expectedDate}.json`) addUnique(reasons, "manifest-commit-marker-invalid");
  return reasons;
}

function validatePublicationArtifacts(status: unknown, date: string, artifacts: PublicationArtifacts): string[] {
  const reasons = validatePublicationManifest(status, date, artifacts.manifest, artifacts.availableFiles);
  const manifest = isRecord(artifacts.manifest) ? artifacts.manifest : null;
  const generation = isRecord(status) && isRecord(status.recovery) ? status.recovery.generationId : undefined;
  const expectedPrefix = `quarantine/${date}/${safeSegment(generation, "invalid-generation")}`;
  const validation = artifacts.validation;
  if (!isRecord(validation) || validation.date !== date || validation.status !== "healthy" || (Array.isArray(validation.missingFiles) && validation.missingFiles.length > 0)) reasons.push("validation-not-healthy");
  const receipt = artifacts.quarantineReceipt;
  if (!isRecord(receipt)) {
    reasons.push("quarantine-receipt-missing");
  } else {
    if (receipt.date !== date || receipt.generationId !== generation) reasons.push("quarantine-receipt-generation-mismatch");
    if (receipt.quarantinePrefix !== expectedPrefix) reasons.push("quarantine-receipt-prefix-mismatch");
    if (receipt.success !== true || !Array.isArray(receipt.uploadedFiles)) reasons.push("quarantine-receipt-incomplete");
    else {
      const required = Array.isArray(manifest?.requiredFiles) ? manifest.requiredFiles : [];
      for (const file of [...required, `publication-manifest-${date}.json`]) if (!receipt.uploadedFiles.includes(file)) reasons.push(`quarantine-receipt-missing:${file}`);
    }
  }
  return Array.from(new Set(reasons));
}

/** One policy result for quarantine upload, promotion, and alert routing. */
export function buildPublicationWorkflowPlan(status: unknown, date: string, fallbackGeneration: string, artifacts: PublicationArtifacts = {}) {
  const evaluation = evaluateScanPublication(status, date);
  const generation = safeSegment((status as any)?.recovery?.generationId, safeSegment(fallbackGeneration, "invalid-generation"));
  const reasons = [...evaluation.reasons, ...validatePublicationArtifacts(status, date, artifacts)];
  const publishable = reasons.length === 0;
  return {
    publishable,
    reasons: Array.from(new Set(reasons)),
    classification: publishable ? "healthy" : "degraded",
    quarantinePrefix: `quarantine/${safeSegment(date, "invalid-date")}/${generation}`,
    promoteRoot: publishable,
    sendDegradedAlert: !publishable,
    commitMarker: `publication-manifest-${safeSegment(date, "invalid-date")}.json`,
  };
}
