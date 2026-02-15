/**
 * Mobile Authentication Module
 *
 * Provides JWT-based authentication for mobile clients.
 * Web app uses NextAuth sessions, mobile app uses JWTs.
 */

import jwt from "jsonwebtoken";
import { prisma } from "./db";
import { Plan } from "./types";

// JWT Configuration - separate secrets for access and refresh tokens
const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET or NEXTAUTH_SECRET must be set");
}
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (() => {
  if (process.env.NODE_ENV === "production") {
    console.warn("WARNING: JWT_REFRESH_SECRET not set. Set a unique secret in production.");
  }
  return JWT_SECRET + "_REFRESH";
})();
// Short access token expiry mitigates stateless JWT revocation limitation.
// Refresh tokens are longer-lived; revocation requires a future token blacklist.
const JWT_EXPIRY = "15m";
const JWT_REFRESH_EXPIRY = "7d";

interface JWTPayload {
  userId: string;
  email: string;
  type: "access" | "refresh";
  iat?: number;
  exp?: number;
}

interface MobileUser {
  id: string;
  email: string;
  name: string | null;
  plan: Plan;
}

/**
 * Generate an access token for mobile authentication
 */
export function generateAccessToken(userId: string, email: string): string {
  const payload: JWTPayload = {
    userId,
    email,
    type: "access",
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Generate a refresh token for mobile authentication
 */
export function generateRefreshToken(userId: string, email: string): string {
  const payload: JWTPayload = {
    userId,
    email,
    type: "refresh",
  };
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRY });
}

/**
 * Verify and decode a JWT token
 * Uses the appropriate secret based on expected token type.
 */
export function verifyToken(token: string, expectedType: "access" | "refresh" = "access"): JWTPayload | null {
  try {
    const secret = expectedType === "refresh" ? JWT_REFRESH_SECRET : JWT_SECRET;
    const decoded = jwt.verify(token, secret) as JWTPayload;
    return decoded;
  } catch (error) {
    console.warn(`JWT verification failed (expected ${expectedType}):`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Authenticate a mobile request using JWT
 * Returns the user ID if valid, null otherwise
 */
export async function authenticateMobileRequest(
  request: Request
): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  const token = extractBearerToken(authHeader);

  if (!token) {
    return null;
  }

  const payload = verifyToken(token);

  if (!payload || payload.type !== "access") {
    return null;
  }

  // Verify user still exists in database
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true },
  });

  if (!user) {
    return null;
  }

  return payload.userId;
}

/**
 * Get full user data for mobile response
 */
export async function getMobileUser(userId: string): Promise<MobileUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
    },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan as Plan,
  };
}

/**
 * Authenticate with either session (web) or JWT (mobile)
 * This is a universal auth helper that works for both clients
 */
export async function getAuthenticatedUserId(
  request: Request,
  sessionAuth: () => Promise<{ user?: { id?: string } } | null>
): Promise<string | null> {
  // Try session auth first (web)
  try {
    const session = await sessionAuth();
    if (session?.user?.id) {
      return session.user.id;
    }
  } catch {
    // Session auth failed, try JWT
  }

  // Fall back to JWT auth (mobile)
  return authenticateMobileRequest(request);
}
