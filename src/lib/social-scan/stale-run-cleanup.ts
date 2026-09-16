import type { PrismaClient } from "@prisma/client";

const STALE_AFTER_MS = 10 * 60 * 1000;
const TRANSACTION_TIMEOUT_MS = 8_000;

const PARTIAL_RECOVERY_ERROR =
  "Scan stopped before terminal publication; retained evidence was recovered during stale-run cleanup. Coverage remains incomplete.";
const EMPTY_TIMEOUT_ERROR =
  "Scan timed out — no status update received within 10 minutes and no retained evidence was found.";

interface LockedStaleRun {
  id: string;
  errors: string | null;
  platformsUsed: string | null;
}

interface RetainedEvidenceSummary {
  scanRunId: string;
  totalMentions: number;
  tickers: string[];
  platforms: string[];
}

export interface StaleRunCleanupResult {
  expired: number;
  partial: number;
  timedOut: number;
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function appendRecoveryError(
  existing: string | null,
  message: string,
): string {
  let values: unknown[] = [];
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      values = Array.isArray(parsed) ? [...parsed] : [parsed];
    } catch {
      values = [existing];
    }
  }
  if (!values.includes(message)) values.push(message);
  return JSON.stringify(values);
}

function recoveredMetadata(
  existing: string | null,
  evidence: RetainedEvidenceSummary,
  recoveredAt: Date,
): string {
  let parsed: unknown = null;
  let invalidRaw: string | null = null;
  if (existing) {
    try {
      parsed = JSON.parse(existing);
    } catch {
      invalidRaw = existing;
    }
  }

  const tickers = uniqueStrings(evidence.tickers).map((ticker) =>
    ticker.toUpperCase(),
  );
  const platforms = uniqueStrings(evidence.platforms);
  const hasExplicitCoverage = Boolean(
    parsed &&
      !Array.isArray(parsed) &&
      typeof parsed === "object" &&
      Array.isArray((parsed as Record<string, unknown>).coverage) &&
      ((parsed as Record<string, unknown>).coverage as unknown[]).length > 0 &&
      Array.isArray((parsed as Record<string, unknown>).submittedTickers) &&
      ((parsed as Record<string, unknown>).submittedTickers as unknown[]).length >
        0,
  );
  const recovery = {
    reason: "STALE_RUN",
    recoveredAt: recoveredAt.toISOString(),
    coverageStatus: hasExplicitCoverage ? "PRESERVED" : "UNKNOWN",
    retainedMentions: evidence.totalMentions,
    retainedTickers: tickers,
    retainedPlatforms: platforms,
  };

  if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
    const metadata = { ...(parsed as Record<string, unknown>) };
    if (Object.prototype.hasOwnProperty.call(metadata, "staleRunRecovery")) {
      const history = Array.isArray(metadata.staleRunRecoveryHistory)
        ? [...metadata.staleRunRecoveryHistory]
        : metadata.staleRunRecoveryHistory === undefined
          ? []
          : [metadata.staleRunRecoveryHistory];
      history.push(metadata.staleRunRecovery);
      metadata.staleRunRecoveryHistory = history;
    }
    metadata.staleRunRecovery = recovery;
    return JSON.stringify(metadata);
  }

  if (Array.isArray(parsed)) {
    return JSON.stringify({
      scanners: parsed.filter(
        (value): value is string => typeof value === "string",
      ),
      legacyPlatformsUsed: parsed,
      staleRunRecovery: recovery,
    });
  }

  return JSON.stringify({
    ...(invalidRaw ? { legacyPlatformsUsedRaw: invalidRaw } : {}),
    ...(!invalidRaw && existing !== null
      ? { legacyPlatformsUsed: parsed }
      : {}),
    staleRunRecovery: recovery,
  });
}

/**
 * Recover stale social runs without losing evidence or racing active writers.
 * The row locks share the same fence used by mention persistence. SKIP LOCKED
 * leaves a run alone when a writer currently owns it; a later cleanup can retry.
 */
export async function reconcileStaleSocialRuns(
  client: Pick<PrismaClient, "$transaction">,
  options: { now?: Date } = {},
): Promise<StaleRunCleanupResult> {
  const now = options.now ?? new Date();
  const staleThreshold = new Date(now.getTime() - STALE_AFTER_MS);

  return client.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL statement_timeout = ${TRANSACTION_TIMEOUT_MS}`,
      );
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1000ms'");
      const staleRuns = await tx.$queryRawUnsafe<LockedStaleRun[]>(
        `SELECT "id", "errors", "platformsUsed"
         FROM "SocialScanRun"
         WHERE "status" = 'RUNNING' AND "updatedAt" < $1
         ORDER BY "updatedAt" ASC, "id" ASC
         FOR UPDATE SKIP LOCKED`,
        staleThreshold,
      );
      if (staleRuns.length === 0) {
        return { expired: 0, partial: 0, timedOut: 0 };
      }

      const summaries = await tx.$queryRawUnsafe<RetainedEvidenceSummary[]>(
        `SELECT "scanRunId",
                COUNT(*)::int AS "totalMentions",
                COALESCE(
                  array_agg(DISTINCT UPPER(BTRIM("ticker")) ORDER BY UPPER(BTRIM("ticker")))
                    FILTER (WHERE BTRIM("ticker") <> ''),
                  ARRAY[]::text[]
                ) AS "tickers",
                COALESCE(
                  array_agg(DISTINCT BTRIM("platform") ORDER BY BTRIM("platform"))
                    FILTER (WHERE BTRIM("platform") <> ''),
                  ARRAY[]::text[]
                ) AS "platforms"
         FROM "SocialMention"
         WHERE "scanRunId" = ANY($1::text[])
         GROUP BY "scanRunId"`,
        staleRuns.map((run) => run.id),
      );
      const summaryByRun = new Map(
        summaries.map((summary) => [summary.scanRunId, summary]),
      );

      let partial = 0;
      let timedOut = 0;
      for (const run of staleRuns) {
        const evidence = summaryByRun.get(run.id) ?? {
          scanRunId: run.id,
          totalMentions: 0,
          tickers: [],
          platforms: [],
        };
        const hasEvidence = evidence.totalMentions > 0;
        const update = await tx.socialScanRun.updateMany({
          where: {
            id: run.id,
            status: "RUNNING",
            updatedAt: { lt: staleThreshold },
          },
          data: {
            status: hasEvidence ? "PARTIAL" : "TIMED_OUT",
            totalMentions: evidence.totalMentions,
            tickersWithMentions: uniqueStrings(evidence.tickers).length,
            errors: appendRecoveryError(
              run.errors,
              hasEvidence ? PARTIAL_RECOVERY_ERROR : EMPTY_TIMEOUT_ERROR,
            ),
            platformsUsed: recoveredMetadata(run.platformsUsed, evidence, now),
          },
        });
        if (update.count !== 1) continue;
        if (hasEvidence) partial += 1;
        else timedOut += 1;
      }

      return { expired: partial + timedOut, partial, timedOut };
    },
    { maxWait: 1_000, timeout: TRANSACTION_TIMEOUT_MS },
  );
}
