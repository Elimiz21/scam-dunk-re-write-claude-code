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
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { authConfig } from "./auth.config";
import { logAuthError } from "./auth-error-tracking";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

// Custom error class for email not verified
class EmailNotVerifiedError extends CredentialsSignin {
  code = "EMAIL_NOT_VERIFIED";
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
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    plan?: "FREE" | "PAID";
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true, // Required for Vercel deployments
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.log("[AUTH] Missing credentials in login attempt");
          await logAuthError(
            { endpoint: "/api/auth/[...nextauth]" },
            {
              errorType: "LOGIN_FAILED",
              errorCode: "INVALID_CREDENTIALS",
              message: "Missing email or password",
            }
          );
          return null;
        }

        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        console.log("[AUTH] Attempting login for:", maskEmail(email));

        let user;
        try {
          user = await prisma.user.findUnique({
            where: { email },
          });
        } catch (dbError) {
          const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
          console.error("[AUTH] DATABASE CONNECTION ERROR during login:", errorMsg);
          console.error("[AUTH] DATABASE_URL defined:", !!process.env.DATABASE_URL);
          console.error("[AUTH] DATABASE_URL prefix:", process.env.DATABASE_URL?.substring(0, 20) + "...");

          // Detect common Supabase/Postgres failure modes
          const isTimeout = errorMsg.includes("timed out") || errorMsg.includes("ETIMEDOUT");
          const isRefused = errorMsg.includes("ECONNREFUSED") || errorMsg.includes("Connection refused");
          const isPaused = errorMsg.includes("Project is paused") || errorMsg.includes("too many clients");
          const isDns = errorMsg.includes("ENOTFOUND") || errorMsg.includes("getaddrinfo");

          let hint = "Database connection failed";
          if (isPaused) hint = "Database appears to be paused (Supabase free-tier auto-pause)";
          else if (isTimeout) hint = "Database connection timed out — server may be paused or unreachable";
          else if (isRefused) hint = "Database connection refused — check DATABASE_URL and server status";
          else if (isDns) hint = "Database hostname not found — check DATABASE_URL";

          console.error("[AUTH] DIAGNOSIS:", hint);

          await logAuthError(
            { email, endpoint: "/api/auth/[...nextauth]" },
            {
              errorType: "LOGIN_FAILED",
              errorCode: "DATABASE_ERROR",
              message: `${hint}: ${errorMsg}`,
            }
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
            }
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
            }
          );
          return null;
        }

        console.log("[AUTH] User found, checking password");
        const passwordMatch = await bcrypt.compare(password, user.hashedPassword);

        if (!passwordMatch) {
          console.log("[AUTH] Password mismatch for:", maskEmail(email));
          await logAuthError(
            { email, userId: user.id, endpoint: "/api/auth/[...nextauth]" },
            {
              errorType: "LOGIN_FAILED",
              errorCode: "INVALID_CREDENTIALS",
              message: "Invalid password",
            }
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
            }
          );
          throw new EmailNotVerifiedError();
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan as "FREE" | "PAID",
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }: { token: JWT; user?: User; trigger?: string }) {
      if (user) {
        token.id = user.id;
        token.plan = user.plan;
      }
      // Refresh plan from database on update trigger to ensure it's up to date after upgrade
      if (token.id && trigger === "update") {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { plan: true },
          });
          if (dbUser) {
            token.plan = dbUser.plan as "FREE" | "PAID";
          }
        } catch (error) {
          // Silently fail - use existing token plan
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
  name?: string
): Promise<{ success: boolean; error?: string; userId?: string }> {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return { success: false, error: "Email already registered" };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
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
