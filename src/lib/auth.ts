/**
 * Authentication Configuration
 *
 * Uses NextAuth v5 (Auth.js) with credentials provider for email/password auth.
 * Can be extended to support OAuth providers.
 */

import NextAuth, { CredentialsSignin } from "next-auth";
import type { Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { authConfig } from "./auth.config";
import { logAuthError } from "./auth-error-tracking";
import { rateLimit } from "./rate-limit";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Extract a best-effort client IP from the authorize() request headers.
 * Mirrors the precedence used by the rate limiter's getClientIdentifier.
 */
function clientIpFromRequest(request: Request | undefined): string {
  if (!request) return "unknown";
  const headers = request.headers;
  return (
    headers.get("x-real-ip") ||
    headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * Rate-limit the credentials login path, keyed on IP + email, using the shared
 * strict tier (SEC-H4). The NextAuth authorize() callback isn't a normal route
 * handler, so we adapt the rate-limit module — which keys on a NextRequest's
 * client-IP header — by handing it a synthetic request whose x-real-ip carries
 * the composite "login:<ip>:<email>" identifier. This reuses the existing
 * Prisma-backed limiter (and its in-memory fallback) without duplicating it.
 *
 * Returns true if the attempt is allowed, false if the limit is exceeded.
 */
async function checkLoginRateLimit(
  email: string,
  request: Request | undefined,
): Promise<boolean> {
  try {
    const ip = clientIpFromRequest(request);
    const identifier = `login:${ip}:${email}`;
    const syntheticRequest = new NextRequest("https://internal/login", {
      headers: { "x-real-ip": identifier },
    });
    const { success } = await rateLimit(syntheticRequest, "strict");
    return success;
  } catch (error) {
    // Never let a rate-limiter failure block all logins — fail open.
    console.error("[AUTH] Login rate-limit check failed (allowing):", error);
    return true;
  }
}

// Custom error class for email not verified
class EmailNotVerifiedError extends CredentialsSignin {
  code = "EMAIL_NOT_VERIFIED";
}

// Custom error surfaced when the IP+email login rate limit is exceeded.
class TooManyLoginAttemptsError extends CredentialsSignin {
  code = "TOO_MANY_ATTEMPTS";
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      plan: "FREE" | "PAID";
    };
  }

  interface User {
    plan?: "FREE" | "PAID";
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    plan?: "FREE" | "PAID";
    // Per-user session generation, captured at login. If the user's DB
    // sessionVersion later exceeds this (e.g. after a password reset), the
    // session is rejected — see the jwt callback below (SEC-M10).
    sessionVersion?: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true, // Required for Vercel deployments
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          console.log("[AUTH] Missing credentials in login attempt");
          await logAuthError(
            { endpoint: "/api/auth/[...nextauth]" },
            {
              errorType: "LOGIN_FAILED",
              errorCode: "INVALID_CREDENTIALS",
              message: "Missing email or password",
            },
          );
          return null;
        }

        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        // Rate-limit brute-force guessing on the primary web login (SEC-H4),
        // keyed on IP + email so neither a single IP nor a single targeted
        // account can be hammered. Throwing surfaces a distinct code to the
        // client; bcrypt cost-12 alone is not a sufficient throttle.
        const allowed = await checkLoginRateLimit(email, request);
        if (!allowed) {
          console.warn("[AUTH] Login rate limit exceeded for:", maskEmail(email));
          await logAuthError(
            { email, endpoint: "/api/auth/[...nextauth]" },
            {
              errorType: "LOGIN_FAILED",
              errorCode: "RATE_LIMITED",
              message: "Too many login attempts",
            },
          );
          throw new TooManyLoginAttemptsError();
        }

        console.log("[AUTH] Attempting login for:", maskEmail(email));

        let user;
        try {
          user = await prisma.user.findUnique({
            where: { email },
          });
        } catch (dbError) {
          const errorMsg =
            dbError instanceof Error ? dbError.message : String(dbError);
          console.error(
            "[AUTH] DATABASE CONNECTION ERROR during login:",
            errorMsg,
          );
          console.error(
            "[AUTH] DATABASE_URL defined:",
            !!process.env.DATABASE_URL,
          );
          console.error(
            "[AUTH] DATABASE_URL prefix:",
            process.env.DATABASE_URL?.substring(0, 20) + "...",
          );

          // Detect common Supabase/Postgres failure modes
          const isTimeout =
            errorMsg.includes("timed out") || errorMsg.includes("ETIMEDOUT");
          const isRefused =
            errorMsg.includes("ECONNREFUSED") ||
            errorMsg.includes("Connection refused");
          const isPaused =
            errorMsg.includes("Project is paused") ||
            errorMsg.includes("too many clients");
          const isDns =
            errorMsg.includes("ENOTFOUND") || errorMsg.includes("getaddrinfo");

          let hint = "Database connection failed";
          if (isPaused)
            hint =
              "Database appears to be paused (Supabase free-tier auto-pause)";
          else if (isTimeout)
            hint =
              "Database connection timed out — server may be paused or unreachable";
          else if (isRefused)
            hint =
              "Database connection refused — check DATABASE_URL and server status";
          else if (isDns)
            hint = "Database hostname not found — check DATABASE_URL";

          console.error("[AUTH] DIAGNOSIS:", hint);

          await logAuthError(
            { email, endpoint: "/api/auth/[...nextauth]" },
            {
              errorType: "LOGIN_FAILED",
              errorCode: "DATABASE_ERROR",
              message: `${hint}: ${errorMsg}`,
            },
          );
          throw new Error(`DATABASE_UNAVAILABLE: ${hint}`);
        }

        if (!user) {
          console.log("[AUTH] User not found for:", maskEmail(email));
          await logAuthError(
            { email, endpoint: "/api/auth/[...nextauth]" },
            {
              errorType: "LOGIN_FAILED",
              errorCode: "USER_NOT_FOUND",
              message: "User not found",
            },
          );
          return null;
        }

        if (!user.hashedPassword) {
          console.log("[AUTH] User has no password set:", maskEmail(email));
          await logAuthError(
            { email, userId: user.id, endpoint: "/api/auth/[...nextauth]" },
            {
              errorType: "LOGIN_FAILED",
              errorCode: "INVALID_CREDENTIALS",
              message: "User has no password set (OAuth account)",
            },
          );
          return null;
        }

        console.log("[AUTH] User found, checking password");
        const passwordMatch = await bcrypt.compare(
          password,
          user.hashedPassword,
        );

        if (!passwordMatch) {
          console.log("[AUTH] Password mismatch for:", maskEmail(email));
          await logAuthError(
            { email, userId: user.id, endpoint: "/api/auth/[...nextauth]" },
            {
              errorType: "LOGIN_FAILED",
              errorCode: "INVALID_CREDENTIALS",
              message: "Invalid password",
            },
          );
          return null;
        }

        console.log("[AUTH] Password matched, checking email verification");

        // Check if email is verified
        if (!user.emailVerified) {
          await logAuthError(
            { email, userId: user.id, endpoint: "/api/auth/[...nextauth]" },
            {
              errorType: "LOGIN_FAILED",
              errorCode: "EMAIL_NOT_VERIFIED",
              message: "Email not verified",
            },
          );
          throw new EmailNotVerifiedError();
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan as "FREE" | "PAID",
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({
      token,
      user,
    }: {
      token: JWT;
      user?: User;
    }) {
      if (user) {
        token.id = user.id;
        token.plan = user.plan;
        token.sessionVersion = user.sessionVersion ?? 0;
      }
      // On every authenticated request (and on the "update" trigger) revalidate
      // against the DB. This refreshes the plan after an upgrade AND enforces
      // session invalidation: if the user's sessionVersion has advanced past the
      // one captured in this token (e.g. a password reset), reject the session
      // by returning null, which signs the holder out (SEC-M10).
      if (token.id && !user) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { plan: true, sessionVersion: true },
          });
          if (!dbUser) {
            // User deleted — drop the session.
            return null;
          }
          if (
            typeof token.sessionVersion === "number" &&
            dbUser.sessionVersion > token.sessionVersion
          ) {
            // Token predates a credential change — invalidate it.
            return null;
          }
          token.plan = dbUser.plan as "FREE" | "PAID";
        } catch (error) {
          // DB unavailable — fail open and keep the existing token rather than
          // logging every user out during a transient outage.
        }
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.plan = (token.plan as "FREE" | "PAID") || "FREE";
      }
      return session;
    },
  },
});

/**
 * Register a new user with email and password
 */
export async function registerUser(
  email: string,
  password: string,
  name?: string,
): Promise<{ success: boolean; error?: string; userId?: string }> {
  try {
    // Normalize email so it matches the login lookup (which lowercases) and to
    // avoid case-variant duplicate accounts (SEC-M1).
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return { success: false, error: "Email already registered" };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        hashedPassword,
        name,
        plan: "FREE",
      },
    });

    return { success: true, userId: user.id };
  } catch (error) {
    console.error("Error registering user:", error);
    return { success: false, error: "Failed to create account" };
  }
}

/**
 * Get the current authenticated user from session
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      billingCustomerId: true,
      createdAt: true,
    },
  });

  return user;
}
