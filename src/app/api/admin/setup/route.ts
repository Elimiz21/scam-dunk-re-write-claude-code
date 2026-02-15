/**
 * Admin Setup API - One-time setup for initial admin owner
 * This endpoint creates the first admin user if none exists
 */

import { NextRequest, NextResponse } from "next/server";
import { createOwnerAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

export const dynamic = 'force-dynamic';

const setupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
  setupKey: z.string().optional(),
});

export async function GET() {
  try {
    // Check if any admin exists
    const existingAdmin = await prisma.adminUser.findFirst();

    return NextResponse.json({
      setupRequired: !existingAdmin,
      message: existingAdmin
        ? "Admin system is already configured"
        : "Admin setup is required. Use POST to create the first admin.",
    });
  } catch (error) {
    console.error("Setup check error:", error);
    return NextResponse.json(
      { error: "Failed to check setup status" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check if any admin already exists
    const existingAdmin = await prisma.adminUser.findFirst();
    if (existingAdmin) {
      return NextResponse.json(
        { error: "Admin system is already configured. Cannot create another owner." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validation = setupSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    // Require setup key
    const expectedSetupKey = process.env.ADMIN_SETUP_KEY;
    if (!expectedSetupKey) {
      return NextResponse.json(
        { error: "Admin setup is disabled" },
        { status: 403 }
      );
    }
    if (validation.data.setupKey !== expectedSetupKey) {
      return NextResponse.json(
        { error: "Invalid setup key" },
        { status: 403 }
      );
    }

    const result = await createOwnerAdmin(
      validation.data.email,
      validation.data.password,
      validation.data.name
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Admin owner created successfully. You can now login at /admin/login",
    });
  } catch (error) {
    console.error("Admin setup error:", error);
    return NextResponse.json(
      { error: "Failed to create admin owner" },
      { status: 500 }
    );
  }
}
