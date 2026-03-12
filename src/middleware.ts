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
  "Access-Control-Allow-Origin":
    process.env.MOBILE_APP_ORIGIN || "https://scamdunk.com",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function isMobileApiRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth/mobile") || pathname.startsWith("/api/check")
  );
}

// In-memory rate limiter for admin routes (Edge Runtime compatible)
// Resets on cold start, which is acceptable for defense-in-depth
const adminRateLimits = new Map<string, { count: number; resetTime: number }>();
const ADMIN_RATE_LIMIT = 60; // requests per minute
const ADMIN_RATE_WINDOW = 60 * 1000; // 1 minute

function checkAdminRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = adminRateLimits.get(ip);

  if (!entry || now >= entry.resetTime) {
    adminRateLimits.set(ip, { count: 1, resetTime: now + ADMIN_RATE_WINDOW });
    return true;
  }

  if (entry.count >= ADMIN_RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

// Admin auth paths that don't require an existing session
const ADMIN_PUBLIC_PATHS = [
  "/api/admin/auth/login",
  "/api/admin/auth/logout",
  "/api/admin/auth/session",
  "/api/admin/auth/preview-login",
  "/api/admin/init",
  "/api/admin/setup",
];

export default async function middleware(request: NextRequest) {
  // Handle CORS preflight for mobile API routes
  if (
    request.method === "OPTIONS" &&
    isMobileApiRoute(request.nextUrl.pathname)
  ) {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  // Allow PayPal webhooks through without authentication
  // (webhook signature is verified in the route handler itself)
  if (request.nextUrl.pathname === "/api/billing/paypal/webhook") {
    return NextResponse.next();
  }

  // Admin API routes: rate limit + auth check (defense-in-depth)
  if (request.nextUrl.pathname.startsWith("/api/admin/")) {
    // Rate limit all admin routes
    const ip =
      request.headers.get("x-real-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      "127.0.0.1";
    if (!checkAdminRateLimit(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // Allow public admin paths through (login, setup, etc.)
    if (ADMIN_PUBLIC_PATHS.includes(request.nextUrl.pathname)) {
      return NextResponse.next();
    }

    // Require admin session cookie for all other admin routes
    const adminToken = request.cookies.get("admin_session_token")?.value;
    if (!adminToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.next();
  }

  // Check if request has a Bearer token (mobile app)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const isMobile = isMobileApiRoute(request.nextUrl.pathname);
    const corsHeaders = isMobile ? CORS_HEADERS : undefined;
    const unauthorized = () =>
      NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders },
      );

    const token = authHeader.slice(7);
    const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return unauthorized();
    }
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(secret),
      );
      if (payload.type !== "access") {
        return unauthorized();
      }
      const response = NextResponse.next();
      if (corsHeaders) {
        Object.entries(corsHeaders).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      }
      return response;
    } catch {
      return unauthorized();
    }
  }

  // For web requests, use NextAuth session auth
  return (auth as unknown as (req: NextRequest) => Promise<NextResponse>)(
    request,
  );
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
    // Admin routes: rate limited + auth check (defense-in-depth)
    "/api/admin/:path*",
  ],
};
