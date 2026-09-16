import { createHash } from "crypto";
import { normalizeStrictIsoTimestamp } from "@/lib/strict-timestamp";

export type ArtifactRevisionStatus =
  | "DISCOVERED"
  | "INGESTING"
  | "FAILED"
  | "PUBLISHED";
export type ArtifactPhaseStatus =
  | "PENDING"
  | "RUNNING"
  | "FAILED"
  | "COMPLETE";

export interface ArtifactDescriptor {
  logicalName: string;
  storagePath: string;
  sha256: string;
  byteLength: number;
  required: boolean;
}

export interface ArtifactManifest {
  schemaVersion: "scamdunk.artifact-manifest/v1";
  scanDate: string;
  producerRunId: string;
  /** Completion time reported by the producer run; null when not evidenced. */
  producerExecutedAt: string | null;
  revisionHash: string;
  requiredArtifacts: string[];
  artifacts: ArtifactDescriptor[];
}

export interface BuildArtifactManifestInput {
  scanDate: string;
  producerRunId: string;
  producerExecutedAt?: string | null;
  files: Record<string, Buffer>;
  required: string[];
  declaredArtifacts?: ArtifactDescriptor[];
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid scan date: ${value}`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid scan date: ${value}`);
  }
}

export function buildArtifactManifest(
  input: BuildArtifactManifestInput,
): ArtifactManifest {
  assertDate(input.scanDate);
  if (!input.producerRunId.trim()) throw new Error("producerRunId is required");
  let producerExecutedAt: string | null = null;
  if (input.producerExecutedAt != null) {
    producerExecutedAt = normalizeStrictIsoTimestamp(input.producerExecutedAt);
    if (!producerExecutedAt) {
      throw new Error("Invalid producerExecutedAt");
    }
  }

  const required = Array.from(new Set(input.required)).sort();
  for (const logicalName of required) {
    if (!(logicalName in input.files)) {
      throw new Error(`Missing required artifact: ${logicalName}`);
    }
  }

  const declared = new Map(
    input.declaredArtifacts?.map((artifact) => [artifact.logicalName, artifact]),
  );
  const artifacts = Object.entries(input.files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([logicalName, bytes]) => {
      const digest = sha256(bytes);
      const declaration = declared.get(logicalName);
      if (declaration && declaration.sha256 !== digest) {
        throw new Error(`Artifact hash mismatch: ${logicalName}`);
      }
      if (declaration && declaration.byteLength !== bytes.byteLength) {
        throw new Error(`Artifact length mismatch: ${logicalName}`);
      }
      return {
        logicalName,
        storagePath:
          declaration?.storagePath ??
          `revisions/${input.scanDate}/${digest}/${logicalName}`,
        sha256: digest,
        byteLength: bytes.byteLength,
        required: required.includes(logicalName),
      };
    });

  const revisionHash = sha256(
    JSON.stringify({
      schemaVersion: "scamdunk.artifact-manifest/v1",
      scanDate: input.scanDate,
      producerRunId: input.producerRunId,
      producerExecutedAt,
      requiredArtifacts: required,
      artifacts,
    }),
  );

  return {
    schemaVersion: "scamdunk.artifact-manifest/v1",
    scanDate: input.scanDate,
    producerRunId: input.producerRunId,
    producerExecutedAt,
    revisionHash,
    requiredArtifacts: required,
    artifacts,
  };
}

export interface PhaseClaim {
  state: "CLAIMED" | "COMPLETE" | "BUSY";
  leaseToken?: string;
}

export interface IngestionStore {
  ensureRevision(manifest: ArtifactManifest, phases: readonly string[]): Promise<void>;
  claimPhase(
    revisionHash: string,
    phase: string,
    workerId: string,
    leaseMs: number,
  ): Promise<PhaseClaim>;
  completePhase(
    revisionHash: string,
    phase: string,
    leaseToken: string,
  ): Promise<void>;
  failPhase(
    revisionHash: string,
    phase: string,
    leaseToken: string | undefined,
    error: string,
  ): Promise<void>;
  publishIfComplete(
    revisionHash: string,
    requiredPhases: readonly string[],
  ): Promise<boolean>;
}

export interface IngestionResult {
  revisionHash: string;
  status: "BUSY" | "PUBLISHED" | "INCOMPLETE";
}

export async function runResumableIngestion(input: {
  manifest: ArtifactManifest;
  workerId: string;
  phases: readonly string[];
  store: IngestionStore;
  handlers: Record<string, (() => Promise<unknown>) | undefined>;
  leaseMs?: number;
}): Promise<IngestionResult> {
  const leaseMs = input.leaseMs ?? 5 * 60_000;
  await input.store.ensureRevision(input.manifest, input.phases);

  for (const phase of input.phases) {
    const claim = await input.store.claimPhase(
      input.manifest.revisionHash,
      phase,
      input.workerId,
      leaseMs,
    );
    if (claim.state === "COMPLETE") continue;
    if (claim.state === "BUSY") {
      return { revisionHash: input.manifest.revisionHash, status: "BUSY" };
    }
    const handler = input.handlers[phase];
    if (!handler) {
      const message = `Missing handler for required phase ${phase}`;
      await input.store.failPhase(
        input.manifest.revisionHash,
        phase,
        claim.leaseToken,
        message,
      );
      throw new Error(message);
    }

    try {
      await handler();
      await input.store.completePhase(
        input.manifest.revisionHash,
        phase,
        claim.leaseToken!,
      );
    } catch (error) {
      await input.store.failPhase(
        input.manifest.revisionHash,
        phase,
        claim.leaseToken,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  const published = await input.store.publishIfComplete(
    input.manifest.revisionHash,
    input.phases,
  );
  return {
    revisionHash: input.manifest.revisionHash,
    status: published ? "PUBLISHED" : "INCOMPLETE",
  };
}

interface MemoryPhase {
  status: ArtifactPhaseStatus;
  leaseToken?: string;
  leaseExpiresAt?: number;
  attempts: number;
  error?: string;
}

interface MemoryRevision {
  manifest: ArtifactManifest;
  status: ArtifactRevisionStatus;
  phases: Map<string, MemoryPhase>;
}

/** Deterministic test/reference implementation of the persistence contract. */
export class InMemoryIngestionStore implements IngestionStore {
  private readonly revisions = new Map<string, MemoryRevision>();
  private leaseCounter = 0;

  getRevision(revisionHash: string): MemoryRevision | undefined {
    return this.revisions.get(revisionHash);
  }

  async ensureRevision(
    manifest: ArtifactManifest,
    phases: readonly string[],
  ): Promise<void> {
    const existing = this.revisions.get(manifest.revisionHash);
    if (existing) {
      if (JSON.stringify(existing.manifest) !== JSON.stringify(manifest)) {
        throw new Error("Revision hash collision or manifest mutation detected");
      }
      for (const phase of phases) {
        if (!existing.phases.has(phase)) {
          existing.phases.set(phase, { status: "PENDING", attempts: 0 });
        }
      }
      return;
    }
    this.revisions.set(manifest.revisionHash, {
      manifest,
      status: "DISCOVERED",
      phases: new Map(
        phases.map((phase) => [
          phase,
          { status: "PENDING" as const, attempts: 0 },
        ]),
      ),
    });
  }

  async claimPhase(
    revisionHash: string,
    phase: string,
    workerId: string,
    leaseMs: number,
  ): Promise<PhaseClaim> {
    const revision = this.requireRevision(revisionHash);
    const state = revision.phases.get(phase);
    if (!state) throw new Error(`Unknown phase ${phase}`);
    if (state.status === "COMPLETE") return { state: "COMPLETE" };
    const now = Date.now();
    if (state.status === "RUNNING" && (state.leaseExpiresAt ?? 0) > now) {
      return { state: "BUSY" };
    }
    const leaseToken = `${workerId}:${++this.leaseCounter}`;
    Object.assign(state, {
      status: "RUNNING" as const,
      leaseToken,
      leaseExpiresAt: now + leaseMs,
      attempts: state.attempts + 1,
      error: undefined,
    });
    revision.status = "INGESTING";
    return { state: "CLAIMED", leaseToken };
  }

  async completePhase(
    revisionHash: string,
    phase: string,
    leaseToken: string,
  ): Promise<void> {
    const state = this.requirePhase(revisionHash, phase);
    if (state.status !== "RUNNING" || state.leaseToken !== leaseToken) {
      throw new Error(`Lost lease for ${phase}`);
    }
    state.status = "COMPLETE";
    state.leaseToken = undefined;
    state.leaseExpiresAt = undefined;
  }

  async failPhase(
    revisionHash: string,
    phase: string,
    leaseToken: string | undefined,
    error: string,
  ): Promise<void> {
    const revision = this.requireRevision(revisionHash);
    const state = revision.phases.get(phase) ?? {
      status: "PENDING" as const,
      attempts: 0,
    };
    if (leaseToken && state.leaseToken !== leaseToken) {
      throw new Error(`Lost lease for ${phase}`);
    }
    state.status = "FAILED";
    state.error = error;
    state.leaseToken = undefined;
    state.leaseExpiresAt = undefined;
    revision.phases.set(phase, state);
    revision.status = "FAILED";
  }

  async publishIfComplete(
    revisionHash: string,
    requiredPhases: readonly string[],
  ): Promise<boolean> {
    const revision = this.requireRevision(revisionHash);
    if (
      requiredPhases.every(
        (phase) => revision.phases.get(phase)?.status === "COMPLETE",
      )
    ) {
      revision.status = "PUBLISHED";
      return true;
    }
    return false;
  }

  private requireRevision(revisionHash: string): MemoryRevision {
    const revision = this.revisions.get(revisionHash);
    if (!revision) throw new Error(`Unknown revision ${revisionHash}`);
    return revision;
  }

  private requirePhase(revisionHash: string, phase: string): MemoryPhase {
    const state = this.requireRevision(revisionHash).phases.get(phase);
    if (!state) throw new Error(`Unknown phase ${phase}`);
    return state;
  }
}
