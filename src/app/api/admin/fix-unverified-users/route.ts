/**
 * Admin endpoint to fix users with unverified emails
 *
 * This is a one-time fix for users who registered before email verification
 * was required. It sets emailVerified for all users who have null.
 *
 * Protected by admin session check.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/auth";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Check admin session
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get count of unverified users first
    const unverifiedCount = await prisma.user.count({
      where: { emailVerified: null },
    });

    if (unverifiedCount === 0) {
      return NextResponse.json({
        success: true,
        message: "No unverified users found",
        updatedCount: 0,
      });
    }

    // Update all users with null emailVerified
    const result = await prisma.user.updateMany({
      where: { emailVerified: null },
      data: { emailVerified: new Date() },
    });

    console.log(`[ADMIN] Fixed ${result.count} unverified users`);

    return NextResponse.json({
      success: true,
      message: `Successfully verified ${result.count} users`,
      updatedCount: result.count,
    });
  } catch (error) {
    console.error("Fix unverified users error:", error);
    return NextResponse.json(
      { error: "Failed to fix unverified users" },
      { status: 500 }
    );
  }
}

// GET to check how many need fixing
export async function GET(request: NextRequest) {
  try {
    // Check admin session
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const unverifiedCount = await prisma.user.count({
      where: { emailVerified: null },
    });

    const totalCount = await prisma.user.count();

    return NextResponse.json({
      unverifiedCount,
      totalCount,
      verifiedCount: totalCount - unverifiedCount,
    });
  } catch (error) {
    console.error("Check unverified users error:", error);
    return NextResponse.json(
      { error: "Failed to check unverified users" },
      { status: 500 }
    );
  }
}
