/**
 * Browser Agent Platform Config API
 * GET: Fetch all platform configs
 * PATCH: Update a platform config (enable/disable, update targets, reset failures)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasRole } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const VALID_PLATFORMS = [
  "discord",
  "reddit",
  "twitter",
  "instagram",
  "facebook",
  "tiktok",
];

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Initialize platform configs if they don't exist
    await initializePlatformConfigs();

    const platforms = await prisma.browserPlatformConfig.findMany({
      orderBy: { platform: "asc" },
    });

    return NextResponse.json({ platforms });
  } catch (error) {
    console.error("Get platform configs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch platform configs" },
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
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { platform, action, ...updates } = body;

    if (!platform || !VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json(
        { error: "Valid platform required" },
        { status: 400 }
      );
    }

    // Ensure config exists
    await initializePlatformConfigs();

    if (action === "toggle") {
      const current = await prisma.browserPlatformConfig.findUnique({
        where: { platform },
      });

      const updated = await prisma.browserPlatformConfig.update({
        where: { platform },
        data: {
          isEnabled: !current?.isEnabled,
          autoDisabled: false,
          autoDisabledAt: null,
          consecutiveFailures: 0,
        },
      });

      await prisma.adminAuditLog.create({
        data: {
          adminUserId: session.id,
          action: "BROWSER_PLATFORM_TOGGLED",
          resource: platform,
          details: JSON.stringify({ isEnabled: updated.isEnabled }),
        },
      });

      return NextResponse.json({ platform: updated });
    }

    if (action === "reset_failures") {
      const updated = await prisma.browserPlatformConfig.update({
        where: { platform },
        data: {
          consecutiveFailures: 0,
          autoDisabled: false,
          autoDisabledAt: null,
        },
      });

      return NextResponse.json({ platform: updated });
    }

    if (action === "update_targets") {
      const updated = await prisma.browserPlatformConfig.update({
        where: { platform },
        data: {
          monitorTargets: JSON.stringify(updates.targets || {}),
        },
      });

      await prisma.adminAuditLog.create({
        data: {
          adminUserId: session.id,
          action: "BROWSER_TARGETS_UPDATED",
          resource: platform,
          details: JSON.stringify(updates.targets),
        },
      });

      return NextResponse.json({ platform: updated });
    }

    if (action === "update_config") {
      const data: Record<string, unknown> = {};
      if (updates.dailyPageLimit !== undefined)
        data.dailyPageLimit = updates.dailyPageLimit;
      if (updates.notes !== undefined) data.notes = updates.notes;

      const updated = await prisma.browserPlatformConfig.update({
        where: { platform },
        data,
      });

      await prisma.adminAuditLog.create({
        data: {
          adminUserId: session.id,
          action: "BROWSER_CONFIG_UPDATED",
          resource: platform,
          details: JSON.stringify(updates),
        },
      });

      return NextResponse.json({ platform: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Update platform config error:", error);
    return NextResponse.json(
      { error: "Failed to update platform config" },
      { status: 500 }
    );
  }
}

async function initializePlatformConfigs() {
  const defaults: Record<string, { dailyPageLimit: number }> = {
    discord: { dailyPageLimit: 100 },
    reddit: { dailyPageLimit: 150 },
    twitter: { dailyPageLimit: 75 },
    instagram: { dailyPageLimit: 75 },
    facebook: { dailyPageLimit: 50 },
    tiktok: { dailyPageLimit: 50 },
  };

  for (const [platform, config] of Object.entries(defaults)) {
    const existing = await prisma.browserPlatformConfig.findUnique({
      where: { platform },
    });

    if (!existing) {
      await prisma.browserPlatformConfig.create({
        data: {
          platform,
          isEnabled: false,
          dailyPageLimit: config.dailyPageLimit,
        },
      });
    }
  }
}
