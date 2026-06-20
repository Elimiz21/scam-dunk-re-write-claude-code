import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { MIN_PASSWORD_LENGTH, validatePasswordStrength } from "@/lib/config";

export const dynamic = "force-dynamic";

const updateProfileSchema = z.object({
  name: z.string().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  // Length floor enforced here; full complexity rules via
  // validatePasswordStrength below so this path matches register/reset (SEC-L6).
  newPassword: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    ),
});

// Update profile (name)
export async function PATCH(request: NextRequest) {
  try {
    // Support both session (web) and JWT (mobile) auth
    let userId: string | null = null;

    const session = await auth();
    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      userId = await authenticateMobileRequest(request);
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = updateProfileSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 },
      );
    }

    const { name } = validation.data;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { name: name || null },
      select: { id: true, name: true, email: true, plan: true },
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }
}

// Get user profile
export async function GET(request: NextRequest) {
  try {
    // Support both session (web) and JWT (mobile) auth
    let userId: string | null = null;

    const session = await auth();
    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      userId = await authenticateMobileRequest(request);
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, plan: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Get profile error:", error);
    return NextResponse.json(
      { error: "Failed to get profile" },
      { status: 500 },
    );
  }
}

// Change password
export async function PUT(request: NextRequest) {
  try {
    // Support both session (web) and JWT (mobile) auth
    let userId: string | null = null;

    const session = await auth();
    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      userId = await authenticateMobileRequest(request);
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = changePasswordSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 },
      );
    }

    const { currentPassword, newPassword } = validation.data;

    // Enforce the shared password policy (complexity), consistent with the
    // register/reset/admin-setup flows (audit SEC-L6).
    const strengthError = validatePasswordStrength(newPassword);
    if (strengthError) {
      return NextResponse.json({ error: strengthError }, { status: 400 });
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, hashedPassword: true },
    });

    if (!user || !user.hashedPassword) {
      return NextResponse.json(
        { error: "User not found or no password set" },
        { status: 400 },
      );
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.hashedPassword);
    if (!isValid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 },
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { hashedPassword },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Password change error:", error);
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 },
    );
  }
}
