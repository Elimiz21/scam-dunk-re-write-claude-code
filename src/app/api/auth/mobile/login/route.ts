/**
 * Mobile Login API Endpoint
 *
 * POST /api/auth/mobile/login
 * Authenticates a mobile user with email/password and returns JWT tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import {
  generateAccessToken,
  generateRefreshToken,
  getMobileUser,
} from "@/lib/mobile-auth";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit: strict for login (5 requests per minute)
    const { success: rateLimitSuccess, headers: rateLimitHeaders } = await rateLimit(request, "strict");
    if (!rateLimitSuccess) {
      return rateLimitExceededResponse(rateLimitHeaders);
    }

    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        hashedPassword: true,
        emailVerified: true,
      },
    });

    if (!user || !user.hashedPassword) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.hashedPassword);

    if (!passwordValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Check if email is verified (optional - can be relaxed for mobile)
    // For mobile, we allow unverified emails but flag it
    const emailVerified = !!user.emailVerified;

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
      },
      token: accessToken,
      refreshToken,
      emailVerified,
    });
  } catch (error) {
    console.error("Mobile login error:", error);
    return NextResponse.json(
      { error: "Login failed. Please try again." },
      { status: 500 }
    );
  }
}
