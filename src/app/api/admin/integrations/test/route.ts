/**
 * Admin Integration Test API
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { testIntegration, testAllIntegrations } from "@/lib/admin/integrations";

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name } = await request.json();

    if (name === "ALL") {
      const results = await testAllIntegrations();
      return NextResponse.json({ results });
    }

    if (!name) {
      return NextResponse.json({ error: "Integration name required" }, { status: 400 });
    }

    const result = await testIntegration(name);

    return NextResponse.json({ result });
  } catch (error) {
    console.error("Test integration error:", error);
    return NextResponse.json(
      { error: "Failed to test integration" },
      { status: 500 }
    );
  }
}
