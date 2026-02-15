/**
 * Admin Database Initialization API
 * Creates admin tables and initial owner if they don't exist
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

export const dynamic = 'force-dynamic';

const adminInitSchema = z.object({
  setupKey: z.string().min(1).max(256),
  email: z.string().email().max(255).optional(),
  password: z.string().min(10).max(72).optional(),
  name: z.string().min(1).max(100).trim().optional(),
}).refine(
  (data) => (!data.email && !data.password) || (!!data.email && !!data.password),
  { message: "Both email and password must be provided together, or neither" }
);

export async function POST(request: NextRequest) {
  try {
    const setupKey = process.env.ADMIN_SETUP_KEY;
    if (!setupKey) {
      return NextResponse.json(
        { error: "Admin setup is disabled" },
        { status: 403 }
      );
    }

    const rawBody = await request.json().catch(() => ({}));
    const parsed = adminInitSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsed.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const { setupKey: providedSetupKey, email, password, name } = parsed.data;

    if (providedSetupKey !== setupKey) {
      return NextResponse.json(
        { error: "Invalid setup key" },
        { status: 403 }
      );
    }

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
