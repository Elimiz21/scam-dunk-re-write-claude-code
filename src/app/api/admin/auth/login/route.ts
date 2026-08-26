/**
 * Admin Login API
 */

import { NextRequest, NextResponse } from "next/server";
import { adminLogin } from "@/lib/admin/auth";
import { z } from "zod";
import { rateLimit, RateLimitStoreError, rateLimitExceededResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit: strict for admin login (5 requests per minute).
    // Fail open if the store is unavailable — a broken Redis/DB must not
    // permanently lock out all admins.
    try {
      const { success, headers } = await rateLimit(request, "strict");
      if (!success) {
        return rateLimitExceededResponse(headers);
      }
    } catch (rlErr) {
      if (rlErr instanceof RateLimitStoreError) {
        console.error("[admin-login] Rate-limit store unavailable, failing open:", rlErr.cause);
      } else {
        throw rlErr;
      }
    }

    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 },
      );
    }

    const { email, password } = validation.data;
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    const result = await adminLogin(email, password, ipAddress, userAgent);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      admin: result.admin,
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
