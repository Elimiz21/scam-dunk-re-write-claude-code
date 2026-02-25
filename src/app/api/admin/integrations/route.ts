/**
 * Admin Integrations API
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasRole } from "@/lib/admin/auth";
import {
  getIntegrations,
  updateIntegrationConfig,
  updateIntegrationCredentials,
  clearIntegrationCredentials,
  getIntegrationHealthSummary,
} from "@/lib/admin/integrations";
import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';

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

/**
 * PATCH — update config (enable/disable, rate limit, budget)
 */
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

/**
 * PUT — set or clear API credentials (OWNER only)
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only OWNER can modify credentials
    if (!hasRole(session, ["OWNER"])) {
      return NextResponse.json(
        { error: "Only the owner can update API credentials" },
        { status: 403 }
      );
    }

    const { name, credentials, clear } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "Integration name required" }, { status: 400 });
    }

    if (clear) {
      const result = await clearIntegrationCredentials(name);

      await prisma.adminAuditLog.create({
        data: {
          adminUserId: session.id,
          action: "CREDENTIALS_CLEARED",
          resource: name,
          details: result.sync ? JSON.stringify({ sync: result.sync }) : undefined,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Credentials cleared",
        sync: result.sync,
      });
    }

    if (!credentials || typeof credentials !== "object") {
      return NextResponse.json({ error: "Credentials object required" }, { status: 400 });
    }

    const result = await updateIntegrationCredentials(name, credentials);

    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "CREDENTIALS_UPDATED",
        resource: name,
        details: JSON.stringify({
          fields: Object.keys(credentials),
          ...(result.sync ? { sync: result.sync } : {}),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Credentials saved",
      sync: result.sync,
    });
  } catch (error) {
    console.error("Update credentials error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update credentials" },
      { status: 500 }
    );
  }
}
