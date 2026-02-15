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
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "https://scamdunk.com",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function isMobileApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/auth/mobile") || pathname.startsWith("/api/check");
}

export default async function middleware(request: NextRequest) {
  // Handle CORS preflight for mobile API routes
  if (request.method === "OPTIONS" && isMobileApiRoute(request.nextUrl.pathname)) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  // Allow PayPal webhooks through without authentication
  // (webhook signature is verified in the route handler itself)
  if (request.nextUrl.pathname === "/api/billing/paypal/webhook") {
    return NextResponse.next();
  }

  // Check if request has a Bearer token (mobile app)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const isMobile = isMobileApiRoute(request.nextUrl.pathname);
    const corsHeaders = isMobile ? CORS_HEADERS : undefined;
    const unauthorized = () =>
      NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const token = authHeader.slice(7);
    const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return unauthorized();
    }
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      if (payload.type !== "access") {
        return unauthorized();
      }
      const response = NextResponse.next();
      if (corsHeaders) {
        Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
      }
      return response;
    } catch {
      return unauthorized();
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
