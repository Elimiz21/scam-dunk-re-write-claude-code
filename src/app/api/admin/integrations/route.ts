/**
 * Admin Integrations API
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasRole } from "@/lib/admin/auth";
import { getIntegrations, updateIntegrationConfig, getIntegrationHealthSummary } from "@/lib/admin/integrations";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [integrations, healthSummary] = await Promise.all([
      getIntegrations(),
      getIntegrationHealthSummary(),
    ]);

    return NextResponse.json({
      integrations,
      healthSummary,
    });
  } catch (error) {
    console.error("Get integrations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch integrations" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasRole(session, ["OWNER", "ADMIN"])) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { name, ...updates } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Integration name required" }, { status: 400 });
    }

    const integration = await updateIntegrationConfig(name, updates);

    // Log the action
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "INTEGRATION_UPDATED",
        resource: name,
        details: JSON.stringify(updates),
      },
    });

    return NextResponse.json({ integration });
  } catch (error) {
    console.error("Update integration error:", error);
    return NextResponse.json(
      { error: "Failed to update integration" },
      { status: 500 }
    );
  }
}
