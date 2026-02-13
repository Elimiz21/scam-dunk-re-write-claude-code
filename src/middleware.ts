import { NextRequest, NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Custom middleware that:
 * 1. Allows requests with Bearer tokens to pass through (mobile JWT auth)
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
    // Let the request through - API route will handle JWT validation
    return NextResponse.next();
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
