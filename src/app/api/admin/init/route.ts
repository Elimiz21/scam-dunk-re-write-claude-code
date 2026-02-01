/**
 * Admin Database Initialization API
 * Creates admin tables and initial owner if they don't exist
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, password, name } = body;

    // Try to create the AdminUser table by attempting a query
    // If it fails, the tables don't exist
    try {
      const existingAdmin = await prisma.adminUser.findFirst();

      if (existingAdmin) {
        return NextResponse.json({
          success: false,
          message: "Admin already exists. Please login at /admin/login",
        });
      }

      // Tables exist but no admin - create one if credentials provided
      if (email && password) {
        const hashedPassword = await bcrypt.hash(password, 12);

        await prisma.adminUser.create({
          data: {
            email: email.toLowerCase(),
            hashedPassword,
            name: name || "Admin Owner",
            role: "OWNER",
          },
        });

        return NextResponse.json({
          success: true,
          message: "Admin owner created successfully!",
        });
      }

      return NextResponse.json({
        success: true,
        setupRequired: true,
        message: "Tables exist. Provide email and password to create admin.",
      });

    } catch (dbError) {
      // Tables don't exist - try to create them using raw SQL
      const error = dbError as Error;
      if (error.message?.includes("does not exist") || error.message?.includes("relation")) {
        return NextResponse.json({
          success: false,
          tablesExist: false,
          message: "Admin tables do not exist. Please ensure prisma db push has been run.",
          hint: "The build process should run 'prisma db push' automatically. Check Vercel build logs.",
        }, { status: 503 });
      }
      throw dbError;
    }

  } catch (error) {
    console.error("Admin init error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Initialization failed",
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Check if tables exist and if admin is set up
    const adminCount = await prisma.adminUser.count();

    return NextResponse.json({
      tablesExist: true,
      adminExists: adminCount > 0,
      setupRequired: adminCount === 0,
      message: adminCount > 0
        ? "Admin is configured. Login at /admin/login"
        : "Tables exist. POST with email/password to create admin.",
    });
  } catch (error) {
    const err = error as Error;
    const tablesExist = !err.message?.includes("does not exist") && !err.message?.includes("relation");

    return NextResponse.json({
      tablesExist,
      adminExists: false,
      setupRequired: true,
      error: err.message,
      message: tablesExist
        ? "Database error occurred"
        : "Admin tables do not exist. Waiting for deployment with prisma db push.",
    }, { status: tablesExist ? 500 : 503 });
  }
}
