/**
 * Admin Change Password API
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAdminAuth,
  verifyPassword,
  hashPassword,
} from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminAuth();

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 },
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must be different from current password" },
        { status: 400 },
      );
    }

    // Get the admin user with their hashed password
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: session.id },
    });

    if (!adminUser) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 404 },
      );
    }

    // Verify current password
    const isValid = await verifyPassword(
      currentPassword,
      adminUser.hashedPassword,
    );
    if (!isValid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 },
      );
    }

    // Hash and save new password
    const hashedPassword = await hashPassword(newPassword);
    const changed = await prisma.$transaction(async (tx) => {
      const updated = await tx.adminUser.updateMany({
        where: { id: session.id, hashedPassword: adminUser.hashedPassword },
        data: { hashedPassword },
      });
      if (updated.count !== 1) return false;
      await tx.adminSession.deleteMany({ where: { adminUserId: session.id } });
      // Keep credential mutation, revocation and audit atomic.
      await tx.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "PASSWORD_CHANGED",
        details: JSON.stringify({ changedAt: new Date().toISOString() }),
      },
      });
      return true;
    });
    if (!changed) {
      return NextResponse.json({ error: "Credentials changed. Sign in again before retrying." }, { status: 409 });
    }

    return NextResponse.json({ success: true, requiresReauthentication: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 },
    );
  }
}
