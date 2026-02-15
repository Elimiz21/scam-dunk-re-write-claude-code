/**
 * Mobile Registration API Endpoint
 *
 * POST /api/auth/mobile/register
 * Creates a new user account and returns JWT tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { createEmailVerificationToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";
import { verifyTurnstileToken } from "@/lib/turnstile";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
  name: z.string().optional(),
  turnstileToken: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit: strict for registration (5 requests per minute)
    const { success: rateLimitSuccess, headers: rateLimitHeaders } = await rateLimit(request, "strict");
    if (!rateLimitSuccess) {
      return rateLimitExceededResponse(rateLimitHeaders);
    }

    const body = await request.json();
    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { email, password, name, turnstileToken } = validation.data;

    // Verify Turnstile CAPTCHA if token provided
    if (turnstileToken) {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
      const isValid = await verifyTurnstileToken(turnstileToken, ip);
      if (!isValid) {
        return NextResponse.json(
          { error: "CAPTCHA verification failed. Please try again." },
          { status: 400 }
        );
      }
    }

    const normalizedEmail = email.toLowerCase();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      // Return generic message to prevent user enumeration
      return NextResponse.json({
        success: true,
        message: "Account created. Please check your email to verify your account before logging in.",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user with FREE plan (email not verified)
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        hashedPassword,
        name: name || null,
        plan: "FREE",
        emailVerified: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
      },
    });

    // Send verification email (don't block registration if this fails)
    try {
      const verificationToken = await createEmailVerificationToken(normalizedEmail);
      await sendVerificationEmail(normalizedEmail, verificationToken);
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
    }

    // Do not issue tokens until email is verified (enforced at login)
    // Response shape matches existing-user path to prevent enumeration
    return NextResponse.json({
      success: true,
      message: "Account created. Please check your email to verify your account before logging in.",
    });
  } catch (error) {
    console.error("Mobile registration error:", error);
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}
