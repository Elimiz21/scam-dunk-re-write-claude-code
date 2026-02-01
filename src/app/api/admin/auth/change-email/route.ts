/**
 * Admin Change Email API
 * Only OWNER role can change their own email
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth, verifyPassword } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminAuth();

    // Only OWNER can change email
    if (session.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only the owner can change their email" },
        { status: 403 }
      );
    }

    const { newEmail, password } = await request.json();

    if (!newEmail || !password) {
      return NextResponse.json(
        { error: "New email and current password are required" },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Verify current password
    const adminUser = await prisma.adminUser.findUnique({
      where: { id: session.id },
    });

    if (!adminUser) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 404 }
      );
    }

    const isValid = await verifyPassword(password, adminUser.hashedPassword);
    if (!isValid) {
      return NextResponse.json(
        { error: "Password is incorrect" },
        { status: 401 }
      );
    }

    // Check if email is already in use
    const existing = await prisma.adminUser.findUnique({
      where: { email: newEmail.toLowerCase() },
    });

    if (existing && existing.id !== session.id) {
      return NextResponse.json(
        { error: "Email is already in use by another admin" },
        { status: 409 }
      );
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

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Change email error:", error);
    return NextResponse.json(
      { error: "Failed to change email" },
      { status: 500 }
    );
  }
}
