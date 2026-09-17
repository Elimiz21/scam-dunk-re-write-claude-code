import { loadPublishedArtifactRevision } from "../../src/lib/admin/artifact-storage";

export interface PostScanArtifactSource<T> {
  stocks: T[];
  parentRevisionHash: string | null;
}

export function assertPostScanReportParent(input: {
  scanDate: string;
  candidate: Buffer;
  previousBytes?: Buffer;
  previousRevisionHash?: string;
}): void {
  if (input.previousBytes?.equals(input.candidate)) return;
  let report: { parentRevisionHash?: unknown };
  try {
    report = JSON.parse(input.candidate.toString("utf8"));
  } catch {
    throw new Error(`Post-scan output parent revision is stale or missing for ${input.scanDate}`);
  }
  if (
    typeof report.parentRevisionHash !== "string" ||
    !input.previousRevisionHash ||
    report.parentRevisionHash !== input.previousRevisionHash
  ) {
    throw new Error(`Post-scan output parent revision is stale or missing for ${input.scanDate}`);
  }
}

function parseArray<T>(bytes: Buffer, label: string): T[] {
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(value)) throw new Error("not an array");
    return value as T[];
  } catch {
    throw new Error(`Invalid post-scan artifact ${label}`);
  }
}

export async function loadPostScanHighRiskSource<T extends { riskLevel?: string }>(
  date: string,
  readObject: (objectPath: string) => Promise<Buffer | null>,
  authoritativeRevisionHash?: string,
): Promise<PostScanArtifactSource<T>> {
  const revision = await loadPublishedArtifactRevision(
    date,
    readObject,
    authoritativeRevisionHash,
  );
  if (revision) {
    const preferred = [
      `enhanced-high-risk-${date}.json`,
      `fmp-high-risk-${date}.json`,
    ].find((name) => revision.files.has(name));
    if (preferred) {
      return {
        stocks: parseArray<T>(revision.files.get(preferred)!, preferred),
        parentRevisionHash: revision.manifest.revisionHash,
      };
    }
    const evaluation = [
      `enhanced-evaluation-${date}.json`,
      `fmp-evaluation-${date}.json`,
    ].find((name) => revision.files.has(name));
    if (!evaluation) {
      throw new Error(`Verified revision ${revision.manifest.revisionHash} has no high-risk or evaluation artifact`);
    }
    return {
      stocks: parseArray<T>(revision.files.get(evaluation)!, evaluation).filter(
        (stock) => stock.riskLevel === "HIGH",
      ),
      parentRevisionHash: revision.manifest.revisionHash,
    };
  }

  for (const rootName of [
    `fmp-high-risk-${date}.json`,
    `enhanced-high-risk-${date}.json`,
  ]) {
    const bytes = await readObject(rootName);
    if (bytes) return { stocks: parseArray<T>(bytes, rootName), parentRevisionHash: null };
  }
  throw new Error(`Could not find evaluation data for ${date} in storage`);
}
