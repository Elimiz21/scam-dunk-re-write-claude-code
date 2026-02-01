import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { createEmailVerificationToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { logAuthError } from "@/lib/auth-error-tracking";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
  turnstileToken: z.string().min(1, "CAPTCHA token is required"),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit: strict for registration (5 requests per minute)
    const { success: rateLimitSuccess, headers: rateLimitHeaders } = await rateLimit(request, "strict");
    if (!rateLimitSuccess) {
      return rateLimitExceededResponse(rateLimitHeaders);
    }

    const body = await request.json();

    // Validate input
    const validation = registerSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { email, password, name, turnstileToken } = validation.data;

    // Verify CAPTCHA if Turnstile is configured
    if (process.env.TURNSTILE_SECRET_KEY) {
      const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
      const isValidCaptcha = await verifyTurnstileToken(turnstileToken, ip);

      if (!isValidCaptcha) {
        const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
        await logAuthError(
          {
            email: validation.data.email,
            ipAddress: ip,
            userAgent: request.headers.get("user-agent") || undefined,
            endpoint: "/api/auth/register",
          },
          {
            errorType: "SIGNUP_FAILED",
            errorCode: "CAPTCHA_FAILED",
            message: "CAPTCHA verification failed",
          }
        );
        return NextResponse.json(
          { error: "CAPTCHA verification failed. Please try again." },
          { status: 400 }
        );
      }
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
      await logAuthError(
        {
          email,
          ipAddress: ip,
          userAgent: request.headers.get("user-agent") || undefined,
          endpoint: "/api/auth/register",
        },
        {
          errorType: "SIGNUP_FAILED",
          errorCode: "EMAIL_ALREADY_EXISTS",
          message: "Email already registered",
        }
      );
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user (emailVerified is null - requires verification)
    const user = await prisma.user.create({
      data: {
        email,
        hashedPassword,
        name: name || null,
        plan: "FREE",
      },
    });

    // Create verification token and send email
    const verificationToken = await createEmailVerificationToken(email);
    const emailSent = await sendVerificationEmail(email, verificationToken);

    if (!emailSent) {
      // Delete the user if we couldn't send the verification email
      // so they can try again
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.emailVerificationToken.deleteMany({ where: { email } });

      const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
      await logAuthError(
        {
          email,
          ipAddress: ip,
          userAgent: request.headers.get("user-agent") || undefined,
          endpoint: "/api/auth/register",
        },
        {
          errorType: "EMAIL_SEND_FAILED",
          errorCode: "RESEND_API_ERROR",
          message: "Failed to send verification email",
          details: { stage: "registration" },
        }
      );

      return NextResponse.json(
        { error: "Failed to send verification email. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      userId: user.id,
      requiresVerification: true
    });
  } catch (error) {
    console.error("Registration error:", error);

    // Check for specific error types and return user-friendly messages
    // Never expose internal error details to the client
    let statusCode = 500;
    let userMessage = "Registration failed. Please try again later.";
    let errorCode: "DATABASE_ERROR" | "NETWORK_ERROR" | "UNKNOWN_ERROR" = "UNKNOWN_ERROR";

    // Check for database connection errors
    if (error instanceof Error) {
      const errorString = error.message.toLowerCase();
      if (
        errorString.includes("database") ||
        errorString.includes("prisma") ||
        errorString.includes("connection") ||
        errorString.includes("environment variable")
      ) {
        userMessage = "Service temporarily unavailable. Please try again later.";
        statusCode = 503;
        errorCode = "DATABASE_ERROR";
      } else if (errorString.includes("network") || errorString.includes("fetch")) {
        userMessage = "Unable to complete registration. Please check your connection.";
        statusCode = 503;
        errorCode = "NETWORK_ERROR";
      }
    }

    // Log the error
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logAuthError(
      {
        ipAddress: ip,
        userAgent: request.headers.get("user-agent") || undefined,
        endpoint: "/api/auth/register",
      },
      {
        errorType: "SIGNUP_FAILED",
        errorCode,
        message: userMessage,
        error: error instanceof Error ? error : undefined,
        details: { originalError: error instanceof Error ? error.message : String(error) },
      }
    );

    return NextResponse.json(
      { error: userMessage },
      { status: statusCode }
    );
  }
}
