import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { parseRunMetadata } from "./coverage";
import { persistRowsBounded, sanitizeAndTruncateUnicode } from "./persistence";

const TRANSACTION_TIMEOUT_MS = 8_000;
const MAX_COUNTER = 10_000_000;

const validCalendarDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const optionalText = z.string().max(100_000).nullish();
const mentionSchema = z.object({
  platform: z.string().trim().min(1).max(100),
  source: z.string().max(1_000).optional().default(""),
  discoveredVia: z.string().max(200).optional().default("ingest"),
  title: optionalText,
  content: optionalText,
  url: optionalText,
  author: z.string().max(10_000).nullish(),
  postDate: z.string().datetime({ offset: true }).nullish(),
  engagement: z.record(z.number().finite()).optional().default({}),
  sentiment: z.enum(["bullish", "bearish", "neutral"]).nullish(),
  isPromotional: z.boolean().optional().default(false),
  promotionScore: z.number().int().min(0).max(100).optional().default(0),
  redFlags: z.array(z.string().max(10_000)).max(500).optional().default([]),
}).strict();

const tickerResultSchema = z.object({
  ticker: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9.\-]+$/),
  name: z.string().max(10_000).nullish(),
  platforms: z.array(z.object({
    mentions: z.array(mentionSchema).max(10_000).default([]),
  }).strict()).max(100).default([]),
}).strict();

const cliIngestSchema = z.object({
  scanId: z.string().trim().min(1).max(128).optional(),
  scanDate: z.string().refine(validCalendarDate, "Invalid scan date"),
  status: z.enum(["COMPLETED", "PARTIAL", "FAILED"]),
  tickersScanned: z.number().int().min(0).max(MAX_COUNTER).optional(),
  tickersWithMentions: z.number().int().min(0).max(MAX_COUNTER).optional(),
  totalMentions: z.number().int().min(0).max(MAX_COUNTER).optional(),
  platformsUsed: z.unknown().optional().default([]),
  results: z.array(tickerResultSchema).max(10_000).default([]),
  errors: z.array(z.string().max(10_000)).max(1_000).optional().default([]),
  duration: z.number().int().min(0).max(86_400_000).nullish(),
}).strict();

export type CliSocialIngestPayload = z.infer<typeof cliIngestSchema>;
export function parseCliSocialIngestPayload(input: unknown) {
  return cliIngestSchema.safeParse(input);
}

export class CliIngestConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliIngestConflictError";
  }
}

interface ExistingRun {
  id: string;
  status: string;
  triggeredBy: string | null;
  platformsUsed: string | null;
  tickersScanned: number;
  tickersWithMentions: number;
  totalMentions: number;
}
interface StoredSummary { totalMentions: number; tickers: string[]; platforms: string[] }

const payloadHash = (payload: CliSocialIngestPayload) =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");
const contentHash = (input: { url: string | null; title: string | null; content: string | null }) =>
  createHash("sha256").update(input.url || input.title || input.content || "").digest("hex");

function safeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : { legacyPlatformsUsed: value };
}

function readFingerprint(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const cli = parsed?.cliIngest;
    const fingerprint = cli && typeof cli === "object"
      ? (cli as Record<string, unknown>).payloadHash
      : null;
    return typeof fingerprint === "string" ? fingerprint : null;
  } catch { return null; }
}

const isCliOwner = (owner: string | null) =>
  owner === "cli" || owner?.startsWith("cli:") === true;

function buildRows(scanRunId: string, payload: CliSocialIngestPayload) {
  return payload.results.flatMap((result) => {
    const ticker = sanitizeAndTruncateUnicode(result.ticker.toUpperCase(), 32);
    const stockName = sanitizeAndTruncateUnicode(result.name || "", 500) || null;
    return result.platforms.flatMap((platform) => platform.mentions.map((mention) => {
      const title = sanitizeAndTruncateUnicode(mention.title || "", 500) || null;
      const content = sanitizeAndTruncateUnicode(mention.content || "", 2_000) || null;
      const url = sanitizeAndTruncateUnicode(mention.url || "", 2_000) || null;
      const engagement = Object.fromEntries(Object.entries(mention.engagement)
        .filter(([, value]) => Number.isFinite(value)).slice(0, 20));
      const redFlags = mention.redFlags.slice(0, 50)
        .map((flag) => sanitizeAndTruncateUnicode(flag, 500));
      return {
        scanRunId, ticker, stockName,
        platform: sanitizeAndTruncateUnicode(mention.platform, 100),
        source: sanitizeAndTruncateUnicode(mention.source, 1_000),
        discoveredVia: sanitizeAndTruncateUnicode(mention.discoveredVia, 200),
        title, content, url,
        author: sanitizeAndTruncateUnicode(mention.author || "", 500) || null,
        postDate: mention.postDate ? new Date(mention.postDate) : null,
        engagement: JSON.stringify(engagement),
        sentiment: mention.sentiment || null,
        isPromotional: mention.isPromotional,
        promotionScore: mention.promotionScore,
        redFlags: JSON.stringify(redFlags),
        contentHash: contentHash({ url, title, content }),
      };
    }));
  });
}

function searchedTickers(payload: CliSocialIngestPayload): string[] {
  const metadata = parseRunMetadata(payload.platformsUsed);
  return Array.from(new Set(metadata.coverage.flatMap((entry) => entry.searchedTickers))).sort();
}

function completeCoverage(payload: CliSocialIngestPayload): boolean {
  const metadata = parseRunMetadata(payload.platformsUsed);
  if (metadata.submittedTickers.length === 0 || metadata.coverage.length === 0) return false;
  const searched = new Set(searchedTickers(payload));
  return metadata.submittedTickers.every((ticker) => searched.has(ticker)) &&
    metadata.coverage.every((entry) => entry.status === "COMPLETED" &&
      entry.failedTickers.length === 0 && entry.skippedTickers.length === 0 &&
      entry.submittedTickers.every((ticker) => entry.searchedTickers.includes(ticker)));
}

function canonicalStatus(requested: CliSocialIngestPayload["status"], count: number, complete: boolean) {
  if (requested === "COMPLETED" && complete) return "COMPLETED" as const;
  if (requested === "FAILED" && count === 0) return "FAILED" as const;
  return "PARTIAL" as const;
}

async function storedSummary(tx: any, id: string): Promise<StoredSummary> {
  const summaries = (await tx.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS "totalMentions",
            COALESCE(array_agg(DISTINCT UPPER(BTRIM("ticker")) ORDER BY UPPER(BTRIM("ticker"))), ARRAY[]::text[]) AS "tickers",
            COALESCE(array_agg(DISTINCT BTRIM("platform") ORDER BY BTRIM("platform")), ARRAY[]::text[]) AS "platforms"
     FROM "SocialMention" WHERE "scanRunId" = $1`, id,
  )) as StoredSummary[];
  return summaries[0] ?? { totalMentions: 0, tickers: [], platforms: [] };
}

export async function ingestCliSocialScan(
  client: Pick<PrismaClient, "$transaction">,
  payload: CliSocialIngestPayload,
  options: { owner: string },
) {
  const fingerprint = payloadHash(payload);
  const id = payload.scanId || `cli-${fingerprint.slice(0, 32)}`;
  const rows = buildRows(id, payload);
  const deadlineAt = Date.now() + TRANSACTION_TIMEOUT_MS;
  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${TRANSACTION_TIMEOUT_MS}`);
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1000ms'");
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      `social-cli-ingest:${id}`,
    );
    const existing = await tx.$queryRawUnsafe<ExistingRun[]>(
      `SELECT "id", "status", "triggeredBy", "platformsUsed", "tickersScanned", "tickersWithMentions", "totalMentions"
       FROM "SocialScanRun" WHERE "id" = $1 FOR UPDATE`, id,
    );
    const current = existing[0];
    if (current) {
      if (!isCliOwner(current.triggeredBy)) throw new CliIngestConflictError("The scan run is owned by another social scan writer");
      if (current.status === "RUNNING") throw new CliIngestConflictError("The CLI scan run is active and cannot be replaced");
      if (readFingerprint(current.platformsUsed) !== fingerprint) throw new CliIngestConflictError("The CLI scan run is terminal with a different payload");
      return {
        scanRunId: id, mentionsIngested: 0,
        totalMentions: current.totalMentions,
        tickersWithMentions: current.tickersWithMentions,
        tickersScanned: current.tickersScanned,
        status: current.status, idempotent: true,
      };
    }

    await tx.socialScanRun.create({
      data: { id, scanDate: new Date(`${payload.scanDate}T00:00:00.000Z`), status: "RUNNING", triggeredBy: options.owner },
    });
    const persistence = await persistRowsBounded(rows, {
      createMany: (data) => tx.socialMention.createMany({ data, skipDuplicates: true }),
      chunkSize: 50, maxTransientRetries: 0, isolateInvalidRows: false, deadlineAt,
    });
    if (persistence.rejected || persistence.unprocessed || persistence.timedOut) {
      const reason = persistence.rejectedRows[0]?.reason || persistence.unprocessedRows[0]?.reason || "unknown persistence failure";
      throw new Error(`CLI social evidence persistence incomplete: ${reason}`);
    }

    const summary = await storedSummary(tx, id);
    const searched = searchedTickers(payload);
    const coverageComplete = completeCoverage(payload);
    const status = canonicalStatus(payload.status, summary.totalMentions, coverageComplete);
    const metadata = safeMetadata(payload.platformsUsed);
    metadata.persistence = {
      submitted: rows.length, inserted: summary.totalMentions,
      duplicates: Math.max(0, rows.length - summary.totalMentions),
      rejected: 0, unprocessed: 0, timedOut: false,
      transientRetries: persistence.transientRetries, lossTickers: [],
    };
    metadata.cliIngest = {
      version: 1, payloadHash: fingerprint, requestedStatus: payload.status,
      coverageStatus: coverageComplete ? "COMPLETE" : "UNKNOWN",
      retainedPlatforms: summary.platforms,
    };
    const finalized = await tx.socialScanRun.updateMany({
      where: { id, status: "RUNNING", triggeredBy: options.owner },
      data: {
        status, tickersScanned: searched.length,
        tickersWithMentions: summary.tickers.length,
        totalMentions: summary.totalMentions,
        platformsUsed: JSON.stringify(metadata),
        errors: JSON.stringify(payload.errors), duration: payload.duration ?? null,
      },
    });
    if (finalized.count !== 1) throw new CliIngestConflictError("The CLI scan run lost its RUNNING ownership fence");
    return {
      scanRunId: id, mentionsIngested: persistence.inserted,
      totalMentions: summary.totalMentions,
      tickersWithMentions: summary.tickers.length,
      tickersScanned: searched.length, status, idempotent: false,
    };
  }, { maxWait: 1_000, timeout: TRANSACTION_TIMEOUT_MS });
}
