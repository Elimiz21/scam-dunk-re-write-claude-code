/**
 * Auth.js Edge-compatible configuration
 *
 * This file contains only the configuration that can run in Edge Runtime.
 * The main auth.ts file imports this and adds the providers that require Node.js APIs.
 */

import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  // Explicitly set secret - NextAuth v5 uses AUTH_SECRET by default
  // We support both AUTH_SECRET and NEXTAUTH_SECRET for flexibility
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/error",
    newUser: "/check",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;

      // Auth pages that should always be accessible (not protected)
      const isAuthPage =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/signup") ||
        nextUrl.pathname.startsWith("/verify-email") ||
        nextUrl.pathname.startsWith("/check-email") ||
        nextUrl.pathname.startsWith("/forgot-password") ||
        nextUrl.pathname.startsWith("/reset-password") ||
        nextUrl.pathname.startsWith("/error");

      // Allow auth pages without authentication
      if (isAuthPage) {
        return true;
      }

      // PayPal webhooks are exempt from auth (signature verified in handler)
      const isWebhook = nextUrl.pathname === "/api/billing/paypal/webhook";

      const isProtectedRoute =
        !isWebhook && (
        nextUrl.pathname === "/check" ||
        nextUrl.pathname.startsWith("/check/") ||
        nextUrl.pathname.startsWith("/account") ||
        nextUrl.pathname.startsWith("/api/check") ||
        nextUrl.pathname.startsWith("/api/billing") ||
        nextUrl.pathname.startsWith("/api/user"));

      if (isProtectedRoute && !isLoggedIn) {
        const redirectUrl = new URL("/login", nextUrl.origin);
        redirectUrl.searchParams.set("callbackUrl", nextUrl.pathname);
        return Response.redirect(redirectUrl);
      }

      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.plan = user.plan;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.plan = (token.plan as "FREE" | "PAID") || "FREE";
      }
      return session;
    },
  },
  providers: [], // Providers are added in auth.ts (not Edge-compatible)
};
