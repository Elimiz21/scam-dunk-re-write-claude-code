/**
 * Admin Pipeline Health API
 *
 * Fetches the latest pipeline-validation report from Supabase storage
 * to show pipeline output health on the admin dashboard.
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

    // List files in the bucket matching pipeline-validation-*
    const { data: files, error: listError } = await supabase.storage
      .from(EVALUATION_BUCKET)
      .list("", {
        search: "pipeline-validation-",
        sortBy: { column: "name", order: "desc" },
        limit: 7,
      });

    if (listError) {
      console.error("Error listing pipeline validation files:", listError);
      return NextResponse.json({
        status: "unknown",
        error: "Could not list validation files from storage",
        history: [],
      });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({
        status: "unknown",
        error: "No pipeline validation reports found. The pipeline may not have run yet with validation enabled.",
        history: [],
      });
    }

    // Fetch the latest validation report
    const latestFile = files[0];
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(EVALUATION_BUCKET)
      .download(latestFile.name);

    if (downloadError || !fileData) {
      console.error("Error downloading validation file:", downloadError);
      return NextResponse.json({
        status: "unknown",
        error: "Could not download latest validation report",
        history: [],
      });
    }

    const latestReport = JSON.parse(await fileData.text());

    // Build history from file names (extract dates)
    const history = files.map((f) => {
      const dateMatch = f.name.match(/pipeline-validation-(\d{4}-\d{2}-\d{2})/);
      return {
        date: dateMatch ? dateMatch[1] : "unknown",
        filename: f.name,
      };
    });

    return NextResponse.json({
      ...latestReport,
      history,
    });
  } catch (error) {
    console.error("Pipeline health error:", error);
    return NextResponse.json(
      { status: "unknown", error: "Failed to fetch pipeline health", history: [] },
      { status: 500 }
    );
  }
}
