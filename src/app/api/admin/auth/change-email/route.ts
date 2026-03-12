/**
 * Admin Change Email API
 * Only OWNER role can change their own email
 */

import { NextRequest } from "next/server";
import { requireAdminAuth, verifyPassword } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import {
  apiSuccess,
  apiError,
  apiBadRequest,
  apiForbidden,
  apiUnauthorized,
  apiNotFound,
} from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminAuth();

    // Only OWNER can change email
    if (session.role !== "OWNER") {
      return apiForbidden("Only the owner can change their email");
    }

    const { newEmail, password } = await request.json();

    if (!newEmail || !password) {
      return apiBadRequest("New email and current password are required");
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return apiBadRequest("Invalid email address");
    }

    // Verify current password
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: session.id },
    });

    if (!adminUser) {
      return apiNotFound("Admin user not found");
    }

    const isValid = await verifyPassword(password, adminUser.hashedPassword);
    if (!isValid) {
      return apiUnauthorized("Password is incorrect");
    }

    // Check if email is already in use
    const existing = await prisma.adminUser.findUnique({
      where: { email: newEmail.toLowerCase() },
    });

    if (existing && existing.id !== session.id) {
      return apiError("Email is already in use by another admin", 409);
    }

    // Update email
    await prisma.adminUser.update({
      where: { id: session.id },
      data: { email: newEmail.toLowerCase() },
    });

    // Audit log
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "CONFIG_CHANGE",
        resource: "email",
        details: JSON.stringify({
          previousEmail: session.email,
          newEmail: newEmail.toLowerCase(),
          changedAt: new Date().toISOString(),
        }),
      },
    });

    return apiSuccess({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return apiUnauthorized();
    }
    console.error("Change email error:", error);
    return apiError("Failed to change email");
  }
}
