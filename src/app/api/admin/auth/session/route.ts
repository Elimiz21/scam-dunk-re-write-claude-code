/**
 * Admin Session API - Get current admin session
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";

export async function GET() {
  try {
    const session = await getAdminSession();

    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      admin: session,
    });
  } catch (error) {
    console.error("Admin session error:", error);
    return NextResponse.json(
      { error: "Session check failed" },
      { status: 500 }
    );
  }
}
