import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEmailVerificationToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";
import { logAuthError } from "@/lib/auth-error-tracking";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Rate limit: strict for resend verification (5 requests per minute)
    const { success: rateLimitSuccess, headers: rateLimitHeaders } = await rateLimit(request, "strict");
    if (!rateLimitSuccess) {
      return rateLimitExceededResponse(rateLimitHeaders);
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Check if user exists and is not verified
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    });

    if (!user) {
      // Don't reveal if user exists
      return NextResponse.json({ success: true });
    }

    if (user.emailVerified) {
      return NextResponse.json(
        { error: "Email is already verified" },
        { status: 400 }
      );
    }

    // Create new verification token and send email
    const token = await createEmailVerificationToken(email);
    const emailSent = await sendVerificationEmail(email, token);

    if (!emailSent) {
      const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
      await logAuthError(
        {
          email,
          userId: user.id,
          ipAddress: ip,
          userAgent: request.headers.get("user-agent") || undefined,
          endpoint: "/api/auth/resend-verification",
        },
        {
          errorType: "EMAIL_SEND_FAILED",
          errorCode: "RESEND_API_ERROR",
          message: "Failed to resend verification email",
          details: { stage: "resend-verification" },
        }
      );
      return NextResponse.json(
        { error: "Failed to send verification email. Please try again later." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Resend verification error:", error);
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logAuthError(
      {
        ipAddress: ip,
        userAgent: request.headers.get("user-agent") || undefined,
        endpoint: "/api/auth/resend-verification",
      },
      {
        errorType: "EMAIL_SEND_FAILED",
        errorCode: "UNKNOWN_ERROR",
        message: "Failed to resend verification email",
        error: error instanceof Error ? error : undefined,
      }
    );
    return NextResponse.json(
      { error: "Failed to resend verification email" },
      { status: 500 }
    );
  }
}
