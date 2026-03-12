/**
 * Admin Change Password API
 */

import { NextRequest } from "next/server";
import {
  requireAdminAuth,
  verifyPassword,
  hashPassword,
} from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import {
  apiSuccess,
  apiError,
  apiBadRequest,
  apiUnauthorized,
  apiNotFound,
} from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminAuth();

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return apiBadRequest("Current password and new password are required");
    }

    if (newPassword.length < 8) {
      return apiBadRequest("New password must be at least 8 characters");
    }

    if (currentPassword === newPassword) {
      return apiBadRequest(
        "New password must be different from current password",
      );
    }

    // Get the admin user with their hashed password
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: session.id },
    });

    if (!adminUser) {
      return apiNotFound("Admin user not found");
    }

    // Verify current password
    const isValid = await verifyPassword(
      currentPassword,
      adminUser.hashedPassword,
    );
    if (!isValid) {
      return apiUnauthorized("Current password is incorrect");
    }

    // Hash and save new password
    const hashedPassword = await hashPassword(newPassword);
    await prisma.adminUser.update({
      where: { id: session.id },
      data: { hashedPassword },
    });

    // Audit log
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "PASSWORD_CHANGED",
        details: JSON.stringify({ changedAt: new Date().toISOString() }),
      },
    });

    return apiSuccess({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return apiUnauthorized();
    }
    console.error("Change password error:", error);
    return apiError("Failed to change password");
  }
}
