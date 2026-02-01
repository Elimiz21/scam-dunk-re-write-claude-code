import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createPasswordResetToken } from "@/lib/tokens";
import { sendPasswordResetEmail } from "@/lib/email";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { logAuthError } from "@/lib/auth-error-tracking";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  turnstileToken: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit: strict for password reset requests (5 requests per minute)
    const { success: rateLimitSuccess, headers: rateLimitHeaders } = await rateLimit(request, "strict");
    if (!rateLimitSuccess) {
      return rateLimitExceededResponse(rateLimitHeaders);
    }

    const body = await request.json();

    const validation = forgotPasswordSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { email: rawEmail, turnstileToken } = validation.data;
    const email = rawEmail.toLowerCase().trim();

    // Verify CAPTCHA if Turnstile is configured
    if (process.env.TURNSTILE_SECRET_KEY) {
      if (!turnstileToken) {
        return NextResponse.json(
          { error: "Please complete the CAPTCHA verification" },
          { status: 400 }
        );
      }

      const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
      const isValidCaptcha = await verifyTurnstileToken(turnstileToken, ip);

      if (!isValidCaptcha) {
        return NextResponse.json(
          { error: "CAPTCHA verification failed. Please try again." },
          { status: 400 }
        );
      }
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // Create reset token and send email
    const token = await createPasswordResetToken(email);
    const emailSent = await sendPasswordResetEmail(email, token);

    if (!emailSent) {
      console.error("Failed to send password reset email to:", email);
      const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
      await logAuthError(
        {
          email,
          userId: user.id,
          ipAddress: ip,
          userAgent: request.headers.get("user-agent") || undefined,
          endpoint: "/api/auth/forgot-password",
        },
        {
          errorType: "EMAIL_SEND_FAILED",
          errorCode: "RESEND_API_ERROR",
          message: "Failed to send password reset email",
          details: { stage: "password-reset" },
        }
      );
      // Still return success to prevent email enumeration, but log the failure
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logAuthError(
      {
        ipAddress: ip,
        userAgent: request.headers.get("user-agent") || undefined,
        endpoint: "/api/auth/forgot-password",
      },
      {
        errorType: "PASSWORD_RESET_FAILED",
        errorCode: "UNKNOWN_ERROR",
        message: "Failed to process password reset request",
        error: error instanceof Error ? error : undefined,
      }
    );
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
