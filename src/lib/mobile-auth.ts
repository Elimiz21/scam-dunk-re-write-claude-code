/**
 * Mobile Authentication Module
 *
 * Provides JWT-based authentication for mobile clients.
 * Web app uses NextAuth sessions, mobile app uses JWTs.
 */

import jwt from "jsonwebtoken";
import { prisma } from "./db";
import { Plan } from "./types";

// JWT Configuration - separate secrets for access and refresh tokens.
// These are resolved LAZILY (at request time) rather than at module load, so a
// missing secret fails the specific request that needs it instead of crashing
// `next build` (which imports route modules with NODE_ENV=production but without
// runtime secrets present). The security property — fail closed in production —
// is preserved because the throw still fires whenever a token op is attempted.
function getAccessSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("FATAL: JWT_SECRET or NEXTAUTH_SECRET must be set");
  }
  return secret;
}

// Refresh tokens must use a dedicated secret so that compromise of either the
// access or refresh secret does not compromise the other. In production this is
// required; deriving it from JWT_SECRET (the previous behaviour) meant the two
// secrets were trivially related. Outside production we fall back to a derived
// value with a warning so local/test setups keep working.
function getRefreshSecret(): string {
  const dedicated = process.env.JWT_REFRESH_SECRET;
  if (dedicated) return dedicated;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL: JWT_REFRESH_SECRET must be set in production (no insecure fallback allowed)",
    );
  }
  console.warn(
    "WARNING: JWT_REFRESH_SECRET not set — using a derived dev-only fallback. Set a unique secret in production.",
  );
  return getAccessSecret() + "_REFRESH";
}

// Pin the signing algorithm so a forged token cannot downgrade to "none" or
// trick verification with an asymmetric-key confusion attack.
const JWT_ALGORITHM = "HS256" as const;

// Short access token expiry mitigates stateless JWT revocation limitation.
// Refresh tokens are longer-lived; revocation is enforced via sessionVersion.
const JWT_EXPIRY = "15m";
const JWT_REFRESH_EXPIRY = "7d";

interface JWTPayload {
  userId: string;
  email: string;
  type: "access" | "refresh";
  // Per-user session generation. Bumped on password reset / credential change;
  // tokens minted before the bump are rejected, invalidating outstanding
  // sessions and refresh tokens (SEC-M10 / SEC-M3 rotation).
  sessionVersion: number;
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
 * Generate an access token for mobile authentication.
 * The caller must pass the user's current sessionVersion so the token can be
 * invalidated by bumping it (e.g. on password reset).
 */
export function generateAccessToken(
  userId: string,
  email: string,
  sessionVersion: number,
): string {
  const payload: JWTPayload = {
    userId,
    email,
    type: "access",
    sessionVersion,
  };
  return jwt.sign(payload, getAccessSecret(), {
    expiresIn: JWT_EXPIRY,
    algorithm: JWT_ALGORITHM,
  });
}

/**
 * Generate a refresh token for mobile authentication.
 * Embeds sessionVersion so rotation/invalidation can reject stale tokens.
 */
export function generateRefreshToken(
  userId: string,
  email: string,
  sessionVersion: number,
): string {
  const payload: JWTPayload = {
    userId,
    email,
    type: "refresh",
    sessionVersion,
  };
  return jwt.sign(payload, getRefreshSecret(), {
    expiresIn: JWT_REFRESH_EXPIRY,
    algorithm: JWT_ALGORITHM,
  });
}

/**
 * Verify and decode a JWT token.
 * Uses the appropriate secret based on expected token type and pins the
 * accepted algorithm to HS256 to prevent algorithm-confusion attacks.
 */
export function verifyToken(
  token: string,
  expectedType: "access" | "refresh" = "access",
): JWTPayload | null {
  try {
    const secret = expectedType === "refresh" ? getRefreshSecret() : getAccessSecret();
    const decoded = jwt.verify(token, secret, {
      algorithms: [JWT_ALGORITHM],
    }) as JWTPayload;
    return decoded;
  } catch (error) {
    console.warn(
      `JWT verification failed (expected ${expectedType}):`,
      error instanceof Error ? error.message : error,
    );
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
  request: Request,
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

  // Verify user still exists in database and the token's sessionVersion is
  // current. A password reset / credential change bumps sessionVersion, so any
  // token minted beforehand is rejected here.
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, sessionVersion: true },
  });

  if (!user) {
    return null;
  }

  // Reject tokens issued before the current session generation. Tokens minted
  // before this claim existed (sessionVersion === undefined) are also rejected.
  if (
    typeof payload.sessionVersion !== "number" ||
    payload.sessionVersion < user.sessionVersion
  ) {
    return null;
  }

  return payload.userId;
}

/**
 * Get full user data for mobile response
 */
export async function getMobileUser(
  userId: string,
): Promise<MobileUser | null> {
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
  sessionAuth: () => Promise<{ user?: { id?: string } } | null>,
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
