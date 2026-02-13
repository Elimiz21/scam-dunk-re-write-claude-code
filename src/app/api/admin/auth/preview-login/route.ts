/**
 * Preview Login API
 * Creates a temporary admin account and logs in automatically.
 * ONLY works in Vercel preview deployments or local development.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, adminLogin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

const PREVIEW_EMAIL = "preview@scamdunk.com";
const PREVIEW_PASSWORD = "PreviewAdmin2026!";
const PREVIEW_NAME = "Preview Admin";

function isPreviewEnvironment(): boolean {
  // Vercel sets VERCEL_ENV to 'preview' on preview deployments
  if (process.env.VERCEL_ENV === "preview") return true;
  // Local development
  if (process.env.NODE_ENV === "development") return true;
  // Explicit opt-in via env var
  if (process.env.PREVIEW_ADMIN_ENABLED === "true") return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    // Security gate: only allow in preview/dev
    if (!isPreviewEnvironment()) {
      return NextResponse.json(
        { error: "Preview login is only available in preview deployments" },
        { status: 403 }
      );
    }

    // Check if preview admin already exists
    let admin = await prisma.adminUser.findUnique({
      where: { email: PREVIEW_EMAIL },
    });

    if (!admin) {
      // Create the preview admin account
      const hashedPassword = await hashPassword(PREVIEW_PASSWORD);
      admin = await prisma.adminUser.create({
        data: {
          email: PREVIEW_EMAIL,
          hashedPassword,
          name: PREVIEW_NAME,
          role: "OWNER",
          isActive: true,
        },
      });
    }

    // Log in as the preview admin
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    const result = await adminLogin(
      PREVIEW_EMAIL,
      PREVIEW_PASSWORD,
      ipAddress,
      userAgent
    );

    if (!result.success) {
      // If login fails (e.g. password changed), reset the account
      const hashedPassword = await hashPassword(PREVIEW_PASSWORD);
      await prisma.adminUser.update({
        where: { email: PREVIEW_EMAIL },
        data: { hashedPassword, isActive: true },
      });

      // Retry login
      const retryResult = await adminLogin(
        PREVIEW_EMAIL,
        PREVIEW_PASSWORD,
        ipAddress,
        userAgent
      );

      if (!retryResult.success) {
        return NextResponse.json(
          { error: "Preview login failed" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        admin: retryResult.admin,
        isPreview: true,
      });
    }

    return NextResponse.json({
      success: true,
      admin: result.admin,
      isPreview: true,
    });
  } catch (error) {
    console.error("Preview login error:", error);
    return NextResponse.json(
      { error: "Preview login failed" },
      { status: 500 }
    );
  }
}
