/**
 * TEMPORARY DEBUG ENDPOINT - Remove after testing
 * Tests the admin login flow and reports what's happening
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    const debug: Record<string, unknown> = {};

    // Step 1: Check if user exists
    const adminUser = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    debug.step1_userFound = !!adminUser;
    debug.step1_emailSearched = email.toLowerCase();

    if (!adminUser) {
      // List all admin emails for debugging
      const allAdmins = await prisma.adminUser.findMany({
        select: { email: true, isActive: true, role: true },
      });
      debug.allAdminEmails = allAdmins;
      return NextResponse.json({ error: "User not found", debug });
    }

    debug.step2_isActive = adminUser.isActive;
    debug.step2_role = adminUser.role;
    debug.step2_hashPrefix = adminUser.hashedPassword.substring(0, 10);
    debug.step2_hashLength = adminUser.hashedPassword.length;

    // Step 3: Verify password
    const isValid = await bcrypt.compare(password, adminUser.hashedPassword);
    debug.step3_passwordValid = isValid;

    // Step 4: Try to create session
    if (isValid) {
      try {
        const token = require("crypto").randomBytes(32).toString("hex");
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.adminSession.create({
          data: {
            adminUserId: adminUser.id,
            token,
            expiresAt,
          },
        });
        debug.step4_sessionCreated = true;

        // Clean up test session
        await prisma.adminSession.delete({ where: { token } });
        debug.step4_sessionCleanedUp = true;
      } catch (sessionError) {
        debug.step4_sessionError = String(sessionError);
      }
    }

    return NextResponse.json({ debug });
  } catch (error) {
    return NextResponse.json({
      error: "Debug endpoint error",
      message: String(error),
    });
  }
}
