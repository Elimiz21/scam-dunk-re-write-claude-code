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
import {
  generateAccessToken,
  generateRefreshToken,
} from "@/lib/mobile-auth";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { createEmailVerificationToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/email";
import { verifyTurnstileToken } from "@/lib/turnstile";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
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
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
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

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id, user.email);

    // Return user data and tokens
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        emailVerified: false,
      },
      token: accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("Mobile registration error:", error);
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}
