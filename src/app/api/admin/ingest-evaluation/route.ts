/**
 * Admin Ingest Evaluation API - Import daily evaluation data into history tables
 * Fetches data from Supabase Storage
 *
 * The heavy lifting is delegated to src/lib/admin/ingest-evaluation-core.ts
 * so the same logic can be reused by the cron auto-ingest route.
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { EVALUATION_BUCKET } from "@/lib/supabase";
import { getEvaluationStorageServerClient } from "@/lib/server/evaluation-storage";
import { ingestDate } from "@/lib/admin/ingest-evaluation-core";
import {
  unsafeIngestionTargetResponse,
  verifyIngestionTarget,
} from "@/lib/server/ingestion-safety";
import { listAllEvaluationFiles } from "@/lib/admin/evaluation-storage-listing";
import { readPublishedArtifactManifest } from "@/lib/admin/artifact-storage";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 minutes for large imports (enhanced pipeline produces ~6,500 stocks)

export async function POST(request: Request) {
  if (!verifyIngestionTarget().ok) return unsafeIngestionTargetResponse();

  const startTime = Date.now();
  let sessionId: string | null = null;
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    sessionId = session.id;

    const body = await request.json();
    const { date } = body; // Format: YYYY-MM-DD

    if (!date) {
      return NextResponse.json(
        { error: "Date required (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    console.log(`[ingest] Starting ingestion for ${date}...`);

    const result = await ingestDate(date);

    if (!result.success) {
      if (sessionId) {
        await prisma.adminAuditLog.create({
          data: {
            adminUserId: sessionId,
            action: "INGEST_EVALUATION",
            details: JSON.stringify({
              date,
              status: "FAILED",
              error: result.error || "Unknown error",
              durationMs: result.durationMs,
            }),
          },
        });
      }
      return NextResponse.json(
        {
          error: `Evaluation file not found or invalid for ${date}`,
          details: result.error || "Unknown error",
          hint: "Make sure the file exists in Supabase Storage and is valid JSON",
        },
        { status: 404 },
      );
    }

    if (sessionId) {
      await prisma.adminAuditLog.create({
        data: {
          adminUserId: sessionId,
          action: "INGEST_EVALUATION",
          details: JSON.stringify({
            date,
            status: "SUCCESS",
            stocksCreated: result.stocksCreated,
            stocksUpdated: result.stocksUpdated,
            snapshotsCreated: result.snapshotsCreated,
            alertsCreated: result.alertsCreated,
            promotedStocksCreated: result.promotedStocksCreated,
            totalProcessed: result.totalProcessed,
            skipped: result.skipped,
            durationMs: result.durationMs,
          }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      date,
      stocksCreated: result.stocksCreated,
      stocksUpdated: result.stocksUpdated,
      snapshotsCreated: result.snapshotsCreated,
      alertsCreated: result.alertsCreated,
      promotedStocksCreated: result.promotedStocksCreated,
      totalProcessed: result.totalProcessed,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("Ingest evaluation error:", error);
    if (sessionId) {
      try {
        await prisma.adminAuditLog.create({
          data: {
            adminUserId: sessionId,
            action: "INGEST_EVALUATION",
            details: JSON.stringify({
              status: "FAILED",
              error: error instanceof Error ? error.message : String(error),
              durationMs: Date.now() - startTime,
            }),
          },
        });
      } catch (logError) {
        console.error("Failed to log ingestion error:", logError);
      }
    }
    return NextResponse.json(
      { error: "Failed to ingest evaluation data", details: String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // List with the server-only client so this also works with a private bucket.
    let files: { name: string }[] = [];
    try {
      const bucket = getEvaluationStorageServerClient().storage.from(
        EVALUATION_BUCKET,
      );
      files = await listAllEvaluationFiles((path, options) =>
        bucket.list(path, options),
      );
      if (files.some((file) => file.name === "revisions")) {
        const dateFolders = await listAllEvaluationFiles(
          (path, options) => bucket.list(path, options),
          "revisions",
        );
        for (const folder of dateFolders) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(folder.name)) continue;
          const manifest = await readPublishedArtifactManifest(
            folder.name,
            async (objectPath) => {
              const { data, error } = await bucket.download(objectPath);
              if (error) {
                if (/not.?found|404/i.test(error.message)) return null;
                throw new Error(
                  `Failed to read ${objectPath}: ${error.message}`,
                );
              }
              return Buffer.from(await data.arrayBuffer());
            },
          );
          for (const artifact of manifest?.artifacts ?? []) {
            if (!files.some((file) => file.name === artifact.logicalName)) {
              files.push({ name: artifact.logicalName });
            }
          }
        }
      }
    } catch (error) {
      return NextResponse.json(
        {
          error: "Storage listing error",
          details: error instanceof Error ? error.message : String(error),
          errorType: "FETCH_ERROR",
        },
        { status: 500 },
      );
    }

    // Extract dates from evaluation files
    // Supports both enhanced format (enhanced-evaluation-YYYY-MM-DD.json)
    // and legacy format (fmp-evaluation-YYYY-MM-DD.json)
    const evaluationFiles = files
      .filter(
        (f) =>
          (f.name.startsWith("fmp-evaluation-") ||
            f.name.startsWith("enhanced-evaluation-")) &&
          f.name.endsWith(".json"),
      )
      .map((f) => ({
        filename: f.name,
        date: f.name
          .replace("enhanced-evaluation-", "")
          .replace("fmp-evaluation-", "")
          .replace(".json", ""),
      }))
      // Deduplicate dates (prefer enhanced over legacy if both exist)
      .filter((f, i, arr) => arr.findIndex((x) => x.date === f.date) === i);

    // Extract dates from summary files (format: fmp-summary-YYYY-MM-DD.json)
    const summaryFiles = files
      .filter(
        (f) => f.name.startsWith("fmp-summary-") && f.name.endsWith(".json"),
      )
      .map((f) => ({
        filename: f.name,
        date: f.name.replace("fmp-summary-", "").replace(".json", ""),
      }));

    // Extract dates from promoted stocks files (format: promoted-stocks-YYYY-MM-DD.json)
    const promotedFiles = files
      .filter(
        (f) =>
          f.name.startsWith("promoted-stocks-") && f.name.endsWith(".json"),
      )
      .map((f) => ({
        filename: f.name,
        date: f.name.replace("promoted-stocks-", "").replace(".json", ""),
      }));

    // Extract dates from comparison files (format: comparison-YYYY-MM-DD.json)
    const comparisonFiles = files
      .filter(
        (f) => f.name.startsWith("comparison-") && f.name.endsWith(".json"),
      )
      .map((f) => ({
        filename: f.name,
        date: f.name.replace("comparison-", "").replace(".json", ""),
      }));

    // Get unique dates from evaluation files (required for ingestion)
    const evaluationDates = evaluationFiles.map((f) => f.date);
    const summaryDates = new Set(summaryFiles.map((f) => f.date));
    const promotedDates = new Set(promotedFiles.map((f) => f.date));
    const comparisonDates = new Set(comparisonFiles.map((f) => f.date));

    // Get all unique dates across all file types
    const allDates = new Set([
      ...evaluationDates,
      ...promotedFiles.map((f) => f.date),
      ...comparisonFiles.map((f) => f.date),
    ]);

    // Build available dates with file status
    const availableDates = Array.from(allDates)
      .map((date) => ({
        date,
        hasEvaluation: evaluationDates.includes(date),
        hasSummary: summaryDates.has(date),
        hasPromoted: promotedDates.has(date),
        hasComparison: comparisonDates.has(date),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Get already ingested dates from DailyScanSummary
    const ingestedSummaries = await prisma.dailyScanSummary.findMany({
      select: { scanDate: true },
      orderBy: { scanDate: "desc" },
    });
    const ingestedDates = ingestedSummaries.map(
      (s) => s.scanDate.toISOString().split("T")[0],
    );

    const lastIngestion = await prisma.adminAuditLog.findFirst({
      where: { action: "INGEST_EVALUATION" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, details: true },
    });

    return NextResponse.json({
      availableDates: availableDates.map((d) => d.date),
      ingestedDates,
      pendingDates: availableDates
        .filter((d) => !ingestedDates.includes(d.date))
        .map((d) => d.date),
      fileStatus: availableDates,
      lastIngestion: lastIngestion
        ? {
            createdAt: lastIngestion.createdAt,
            details: lastIngestion.details,
          }
        : null,
      debug: {
        filesFound: files.length,
        evaluationFiles: evaluationFiles.length,
        enhancedEvaluationFiles: files.filter((f) =>
          f.name.startsWith("enhanced-evaluation-"),
        ).length,
        legacyEvaluationFiles: files.filter((f) =>
          f.name.startsWith("fmp-evaluation-"),
        ).length,
        summaryFiles: summaryFiles.length,
        promotedFiles: promotedFiles.length,
        comparisonFiles: comparisonFiles.length,
        allFileNames: files.map((f) => f.name),
      },
    });
  } catch (error) {
    console.error("List evaluations error:", error);
    return NextResponse.json(
      {
        error: "Failed to list evaluations",
        details: String(error),
      },
      { status: 500 },
    );
  }
}
