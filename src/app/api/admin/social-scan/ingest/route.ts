/**
 * Social Scan Ingest API
 *
 * Receives scan results from the CLI orchestrator and stores them in the database.
 * Called after the scan completes to persist results.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // ingest writes can take a while on big runs

// ── Request validation (SOC-H4) ──
const mentionSchema = z
  .object({
    platform: z.string(),
    source: z.string().optional().default(""),
    discoveredVia: z.string().optional().default("ingest"),
    title: z.string().nullish(),
    content: z.string().nullish(),
    url: z.string().nullish(),
    author: z.string().nullish(),
    postDate: z.string().nullish(),
    engagement: z.any().optional(),
    sentiment: z.string().nullish(),
    isPromotional: z.boolean().optional().default(false),
    promotionScore: z.number().optional().default(0),
    redFlags: z.array(z.string()).optional().default([]),
  })
  .passthrough();

const tickerResultSchema = z
  .object({
    ticker: z.string(),
    name: z.string().nullish(),
    platforms: z
      .array(z.object({ mentions: z.array(mentionSchema).optional().default([]) }).passthrough())
      .optional()
      .default([]),
  })
  .passthrough();

const ingestSchema = z.object({
  scanId: z.string().optional(),
  scanDate: z.string(),
  status: z.string().optional(),
  tickersScanned: z.number().optional(),
  tickersWithMentions: z.number().optional(),
  totalMentions: z.number().optional(),
  platformsUsed: z.any().optional(),
  results: z.array(tickerResultSchema).optional().default([]),
  errors: z.any().optional(),
  duration: z.number().nullish(),
});

/** sha256(url || title || content) — matches the DB unique key basis. */
function computeContentHash(m: {
  url?: string | null;
  title?: string | null;
  content?: string | null;
}): string {
  const basis = m.url || m.title || m.content || "";
  return crypto.createHash("sha256").update(basis).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      // Also accept a simple API key for CLI ingestion (timing-safe comparison)
      const authHeader = request.headers.get("authorization");
      const apiKey = process.env.SOCIAL_SCAN_INGEST_KEY;
      if (!apiKey || !authHeader) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const expected = Buffer.from(`Bearer ${apiKey}`, "utf8");
      const provided = Buffer.from(authHeader, "utf8");
      if (
        expected.length !== provided.length ||
        !crypto.timingSafeEqual(expected, provided)
      ) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Reject oversized request bodies (max 5MB)
    const MAX_BODY_SIZE = 5 * 1024 * 1024;
    const rawText = await request.text();
    if (rawText.length > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 },
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = ingestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;
    // Respect the caller-provided status; only default when absent (SOC-H4).
    const finalStatus = body.status || "COMPLETED";

    // Create or update the scan run.
    const scanRun = body.scanId
      ? await prisma.socialScanRun.upsert({
          where: { id: body.scanId },
          create: {
            id: body.scanId,
            scanDate: new Date(body.scanDate),
            status: finalStatus,
            tickersScanned: body.tickersScanned || 0,
            tickersWithMentions: body.tickersWithMentions || 0,
            totalMentions: body.totalMentions || 0,
            platformsUsed: JSON.stringify(body.platformsUsed || []),
            duration: body.duration ?? null,
            errors: JSON.stringify(body.errors || []),
            triggeredBy: session?.id || "cli",
          },
          update: {
            status: finalStatus,
            tickersScanned: body.tickersScanned || 0,
            tickersWithMentions: body.tickersWithMentions || 0,
            totalMentions: body.totalMentions || 0,
            platformsUsed: JSON.stringify(body.platformsUsed || []),
            duration: body.duration ?? null,
            errors: JSON.stringify(body.errors || []),
          },
        })
      : await prisma.socialScanRun.create({
          data: {
            scanDate: new Date(body.scanDate),
            status: finalStatus,
            tickersScanned: body.tickersScanned || 0,
            tickersWithMentions: body.tickersWithMentions || 0,
            totalMentions: body.totalMentions || 0,
            platformsUsed: JSON.stringify(body.platformsUsed || []),
            duration: body.duration ?? null,
            errors: JSON.stringify(body.errors || []),
            triggeredBy: session?.id || "cli",
          },
        });

    // Build all mention rows, then write in a single createMany with
    // skipDuplicates (SOC-H4) — idempotent so a CLI retry won't duplicate rows.
    const rows = [] as Array<{
      scanRunId: string;
      ticker: string;
      stockName: string | null;
      platform: string;
      source: string;
      discoveredVia: string;
      title: string | null;
      content: string | null;
      url: string | null;
      author: string | null;
      postDate: Date | null;
      engagement: string;
      sentiment: string | null;
      isPromotional: boolean;
      promotionScore: number;
      redFlags: string;
      contentHash: string;
    }>;
    for (const tickerResult of body.results) {
      for (const platform of tickerResult.platforms) {
        for (const mention of platform.mentions) {
          const title = mention.title || null;
          const content = mention.content || null;
          const url = mention.url || null;
          rows.push({
            scanRunId: scanRun.id,
            ticker: tickerResult.ticker,
            stockName: tickerResult.name || null,
            platform: mention.platform,
            source: mention.source,
            discoveredVia: mention.discoveredVia,
            title,
            content,
            url,
            author: mention.author || null,
            postDate: mention.postDate ? new Date(mention.postDate) : null,
            engagement: JSON.stringify(mention.engagement || {}),
            sentiment: mention.sentiment || null,
            isPromotional: mention.isPromotional || false,
            promotionScore: mention.promotionScore || 0,
            redFlags: JSON.stringify(mention.redFlags || []),
            contentHash: computeContentHash({ url, title, content }),
          });
        }
      }
    }

    let mentionsIngested = 0;
    if (rows.length > 0) {
      const result = await prisma.socialMention.createMany({
        data: rows,
        skipDuplicates: true,
      });
      mentionsIngested = result.count;
    }

    // Update scan run with the actual stored count, preserving status (SOC-H4).
    const storedCount = await prisma.socialMention.count({
      where: { scanRunId: scanRun.id },
    });
    await prisma.socialScanRun.update({
      where: { id: scanRun.id },
      data: { totalMentions: storedCount, status: finalStatus },
    });

    return NextResponse.json({
      scanRunId: scanRun.id,
      mentionsIngested,
      totalMentions: storedCount,
      status: finalStatus,
    });
  } catch (error) {
    console.error("Social scan ingest error:", error);
    return NextResponse.json(
      { error: "Failed to ingest scan results" },
      { status: 500 },
    );
  }
}
