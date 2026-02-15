import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyEmailVerificationToken } from "@/lib/tokens";
import { logAuthError } from "@/lib/auth-error-tracking";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
  const userAgent = request.headers.get("user-agent") || undefined;

  try {
    // Rate limit: strict for email verification (5 requests per minute)
    const { success: rateLimitSuccess, headers: rateLimitHeaders } = await rateLimit(request, "strict");
    if (!rateLimitSuccess) {
      return rateLimitExceededResponse(rateLimitHeaders);
    }

    const { token } = await request.json();

    if (!token) {
      await logAuthError(
        { ipAddress: ip, userAgent, endpoint: "/api/auth/verify-email" },
        {
          errorType: "VERIFICATION_FAILED",
          errorCode: "TOKEN_INVALID",
          message: "Verification token is required",
        }
      );
      return NextResponse.json(
        { error: "Verification token is required" },
        { status: 400 }
      );
    }

    // Verify the token
    const result = await verifyEmailVerificationToken(token);

    if (!result.valid || !result.email) {
      await logAuthError(
        { ipAddress: ip, userAgent, endpoint: "/api/auth/verify-email" },
        {
          errorType: "VERIFICATION_FAILED",
          errorCode: "TOKEN_EXPIRED",
          message: "Invalid or expired verification token",
          details: { tokenProvided: !!token },
        }
      );
      return NextResponse.json(
        { error: "Invalid or expired verification token" },
        { status: 400 }
      );
    }

    // Update user's emailVerified field
    await prisma.user.update({
      where: { email: result.email },
      data: { emailVerified: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email verification error:", error);
    await logAuthError(
      { ipAddress: ip, userAgent, endpoint: "/api/auth/verify-email" },
      {
        errorType: "VERIFICATION_FAILED",
        errorCode: "UNKNOWN_ERROR",
        message: "Failed to verify email",
        error: error instanceof Error ? error : undefined,
      }
    );
    return NextResponse.json(
      { error: "Failed to verify email" },
      { status: 500 }
    );
  }
}
