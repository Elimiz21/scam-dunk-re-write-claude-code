/**
 * Admin Scan Status API
 *
 * Fetches the latest scan-status and daily-report files from Supabase storage
 * to show detailed pipeline execution status on the admin dashboard.
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { getSupabaseClient, EVALUATION_BUCKET } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseClient();

    // List scan-status files (newest first)
    const { data: statusFiles, error: statusListError } = await supabase.storage
      .from(EVALUATION_BUCKET)
      .list("", {
        search: "scan-status-",
        sortBy: { column: "name", order: "desc" },
        limit: 7,
      });

    if (statusListError) {
      console.error("Error listing scan-status files:", statusListError);
      return NextResponse.json({
        available: false,
        error: "Could not list scan status files from storage",
      });
    }

    if (!statusFiles || statusFiles.length === 0) {
      // Fall back to daily-report files if no scan-status exists yet
      return await fallbackToDailyReport(supabase);
    }

    // Fetch the latest scan-status
    const latestFile = statusFiles[0];
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(EVALUATION_BUCKET)
      .download(latestFile.name);

    if (downloadError || !fileData) {
      console.error("Error downloading scan-status:", downloadError);
      return await fallbackToDailyReport(supabase);
    }

    const scanStatus = JSON.parse(await fileData.text());

    // Build history (last 7 days)
    const history = statusFiles.map((f) => {
      const dateMatch = f.name.match(/scan-status-(\d{4}-\d{2}-\d{2})/);
      return {
        date: dateMatch ? dateMatch[1] : "unknown",
        filename: f.name,
      };
    });

    return NextResponse.json({
      available: true,
      source: "scan-status",
      ...scanStatus,
      history,
    });
  } catch (error) {
    console.error("Scan status error:", error);
    return NextResponse.json(
      { available: false, error: "Failed to fetch scan status" },
      { status: 500 }
    );
  }
}

// Fall back to daily-report when scan-status files don't exist yet
async function fallbackToDailyReport(supabase: ReturnType<typeof getSupabaseClient>) {
  const { data: reportFiles } = await supabase.storage
    .from(EVALUATION_BUCKET)
    .list("", {
      search: "daily-report-",
      sortBy: { column: "name", order: "desc" },
      limit: 7,
    });

  if (!reportFiles || reportFiles.length === 0) {
    return NextResponse.json({
      available: false,
      error: "No scan status or daily report files found. The pipeline may not have run yet.",
    });
  }

  const latestFile = reportFiles[0];
  const { data: fileData } = await supabase.storage
    .from(EVALUATION_BUCKET)
    .download(latestFile.name);

  if (!fileData) {
    return NextResponse.json({
      available: false,
      error: "Could not download daily report",
    });
  }

  const report = JSON.parse(await fileData.text());
  const dateMatch = latestFile.name.match(/daily-report-(\d{4}-\d{2}-\d{2})/);

  const history = reportFiles.map((f) => {
    const m = f.name.match(/daily-report-(\d{4}-\d{2}-\d{2})/);
    return { date: m ? m[1] : "unknown", filename: f.name };
  });

  return NextResponse.json({
    available: true,
    source: "daily-report",
    date: dateMatch ? dateMatch[1] : report.date,
    pipelineStatus: "completed",
    summary: {
      totalStocks: report.totalStocksScanned || 0,
      processed: report.totalStocksScanned || 0,
      riskCounts: report.byRiskLevel || { LOW: 0, MEDIUM: 0, HIGH: 0, INSUFFICIENT: 0 },
      highRiskBeforeFilters: report.highRiskBeforeFilters || 0,
      filteredByMarketCap: report.filteredByMarketCap || 0,
      filteredByVolume: report.filteredByVolume || 0,
      filteredByNews: report.filteredByNews || 0,
      remainingSuspicious: report.remainingSuspicious || 0,
      newSchemes: report.newSchemes || 0,
      activeSchemes: report.activeSchemes || 0,
    },
    durationMinutes: report.processingTimeMinutes || null,
    history,
  });
}
