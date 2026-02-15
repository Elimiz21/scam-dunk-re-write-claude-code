/**
 * Social Scan Ingest API
 *
 * Receives scan results from the CLI orchestrator and stores them in the database.
 * Called after the scan completes to persist results.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      // Also accept a simple API key for CLI ingestion
      const authHeader = request.headers.get("authorization");
      const apiKey = process.env.SOCIAL_SCAN_INGEST_KEY;
      if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Reject oversized request bodies (max 5MB)
    const MAX_BODY_SIZE = 5 * 1024 * 1024;
    const rawText = await request.text();
    if (rawText.length > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 }
      );
    }

    const body = JSON.parse(rawText);
    const { scanId, scanDate, status, tickersScanned, tickersWithMentions,
            totalMentions, platformsUsed, results, errors, duration } = body;

    // Create or update the scan run
    const scanRun = await prisma.socialScanRun.upsert({
      where: { id: scanId || "new" },
      create: {
        scanDate: new Date(scanDate),
        status: status || "COMPLETED",
        tickersScanned: tickersScanned || 0,
        tickersWithMentions: tickersWithMentions || 0,
        totalMentions: totalMentions || 0,
        platformsUsed: JSON.stringify(platformsUsed || []),
        duration: duration || null,
        errors: JSON.stringify(errors || []),
        triggeredBy: session?.id || "cli",
      },
      update: {
        status: status || "COMPLETED",
        tickersScanned: tickersScanned || 0,
        tickersWithMentions: tickersWithMentions || 0,
        totalMentions: totalMentions || 0,
        platformsUsed: JSON.stringify(platformsUsed || []),
        duration: duration || null,
        errors: JSON.stringify(errors || []),
      },
    });

    // Ingest all mentions
    let mentionsIngested = 0;
    if (results && Array.isArray(results)) {
      for (const tickerResult of results) {
        for (const platform of (tickerResult.platforms || [])) {
          for (const mention of (platform.mentions || [])) {
            await prisma.socialMention.create({
              data: {
                scanRunId: scanRun.id,
                ticker: tickerResult.ticker,
                stockName: tickerResult.name || null,
                platform: mention.platform,
                source: mention.source,
                discoveredVia: mention.discoveredVia,
                title: mention.title || null,
                content: mention.content || null,
                url: mention.url || null,
                author: mention.author || null,
                postDate: mention.postDate ? new Date(mention.postDate) : null,
                engagement: JSON.stringify(mention.engagement || {}),
                sentiment: mention.sentiment || null,
                isPromotional: mention.isPromotional || false,
                promotionScore: mention.promotionScore || 0,
                redFlags: JSON.stringify(mention.redFlags || []),
              },
            });
            mentionsIngested++;
          }
        }
      }
    }

    // Update scan run with final counts
    await prisma.socialScanRun.update({
      where: { id: scanRun.id },
      data: {
        totalMentions: mentionsIngested,
        status: "COMPLETED",
      },
    });

    return NextResponse.json({
      scanRunId: scanRun.id,
      mentionsIngested,
      status: "COMPLETED",
    });
  } catch (error) {
    console.error("Social scan ingest error:", error);
    return NextResponse.json(
      { error: "Failed to ingest scan results" },
      { status: 500 }
    );
  }
}
