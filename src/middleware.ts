import { NextRequest, NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { jwtVerify } from "jose";

const { auth } = NextAuth(authConfig);

/**
 * Custom middleware that:
 * 1. Validates Bearer token JWTs for mobile requests
 * 2. Uses NextAuth session auth for web requests
 */
export default async function middleware(request: NextRequest) {
  // Allow PayPal webhooks through without authentication
  // (webhook signature is verified in the route handler itself)
  if (request.nextUrl.pathname === "/api/billing/paypal/webhook") {
    return NextResponse.next();
  }

  // Check if request has a Bearer token (mobile app)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      if (payload.type !== "access") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.next();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // For web requests, use NextAuth session auth
  return (auth as unknown as (req: NextRequest) => Promise<NextResponse>)(request);
}

export const config = {
  matcher: [
    // Protected routes that require authentication
    "/check/:path*",
    "/account/:path*",
    // API routes that require authentication (except auth routes)
    "/api/check/:path*",
    "/api/billing/:path*",
    "/api/user/:path*",
  ],
};
