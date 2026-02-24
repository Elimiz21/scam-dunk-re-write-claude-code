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

export async function GET(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedDate = searchParams.get("date"); // optional YYYY-MM-DD

    const supabase = getSupabaseClient();

    // List scan-status files (newest first)
    const { data: statusFiles, error: statusListError } = await supabase.storage
      .from(EVALUATION_BUCKET)
      .list("", {
        search: "scan-status-",
        sortBy: { column: "name", order: "desc" },
        limit: 30,
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
      return await fallbackToDailyReport(supabase, requestedDate);
    }

    // Build history from all found files
    const history = statusFiles.map((f) => {
      const dateMatch = f.name.match(/scan-status-(\d{4}-\d{2}-\d{2})/);
      return {
        date: dateMatch ? dateMatch[1] : "unknown",
        filename: f.name,
      };
    });

    // Pick the file for the requested date, or fall back to the latest
    let targetFile = statusFiles[0];
    if (requestedDate) {
      const match = statusFiles.find((f) => f.name.includes(requestedDate));
      if (match) {
        targetFile = match;
      } else {
        // Date not found in scan-status files — try daily-report fallback for that date
        return await fallbackToDailyReport(supabase, requestedDate, history);
      }
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from(EVALUATION_BUCKET)
      .download(targetFile.name);

    if (downloadError || !fileData) {
      console.error("Error downloading scan-status:", downloadError);
      return await fallbackToDailyReport(supabase, requestedDate, history);
    }

    const scanStatus = JSON.parse(await fileData.text());

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
async function fallbackToDailyReport(
  supabase: ReturnType<typeof getSupabaseClient>,
  requestedDate?: string | null,
  existingHistory?: Array<{ date: string; filename: string }>
) {
  const { data: reportFiles } = await supabase.storage
    .from(EVALUATION_BUCKET)
    .list("", {
      search: "daily-report-",
      sortBy: { column: "name", order: "desc" },
      limit: 30,
    });

  if (!reportFiles || reportFiles.length === 0) {
    return NextResponse.json({
      available: false,
      error: "No scan status or daily report files found. The pipeline may not have run yet.",
      history: existingHistory || [],
    });
  }

  // Pick the file for the requested date, or latest
  let targetFile = reportFiles[0];
  if (requestedDate) {
    const match = reportFiles.find((f) => f.name.includes(requestedDate));
    if (match) {
      targetFile = match;
    } else {
      return NextResponse.json({
        available: false,
        error: `No scan data found for ${requestedDate}`,
        history: existingHistory || reportFiles.map((f) => {
          const m = f.name.match(/daily-report-(\d{4}-\d{2}-\d{2})/);
          return { date: m ? m[1] : "unknown", filename: f.name };
        }),
      });
    }
  }

  const { data: fileData } = await supabase.storage
    .from(EVALUATION_BUCKET)
    .download(targetFile.name);

  if (!fileData) {
    return NextResponse.json({
      available: false,
      error: "Could not download daily report",
    });
  }

  const report = JSON.parse(await fileData.text());
  const dateMatch = targetFile.name.match(/daily-report-(\d{4}-\d{2}-\d{2})/);

  // Merge daily-report dates into the history if we have an existing one from scan-status
  const reportHistory = reportFiles.map((f) => {
    const m = f.name.match(/daily-report-(\d{4}-\d{2}-\d{2})/);
    return { date: m ? m[1] : "unknown", filename: f.name };
  });

  // Combine histories: scan-status dates + daily-report dates that aren't already listed
  const combinedHistory = existingHistory ? [...existingHistory] : [];
  for (const rh of reportHistory) {
    if (!combinedHistory.some((h) => h.date === rh.date)) {
      combinedHistory.push(rh);
    }
  }
  combinedHistory.sort((a, b) => b.date.localeCompare(a.date));

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
    history: combinedHistory,
  });
}
