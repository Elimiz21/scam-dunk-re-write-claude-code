/**
 * Authentication Configuration
 *
 * Uses NextAuth v5 (Auth.js) with credentials provider for email/password auth.
 * Can be extended to support OAuth providers.
 */

import NextAuth from "next-auth";
import type { Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { authConfig } from "./auth.config";

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
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.hashedPassword) {
          return null;
        }

        const passwordMatch = await bcrypt.compare(password, user.hashedPassword);

        if (!passwordMatch) {
          return null;
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
