/**
 * Rate Limiting Module
 *
 * Provides rate limiting for API routes using PostgreSQL via Prisma.
 * Falls back to in-memory rate limiting if the database query fails.
 */

import { prisma } from "./db";
import { NextRequest, NextResponse } from "next/server";

// In-memory fallback for when Prisma queries fail
const inMemoryStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Rate limit configurations for different endpoint types
 */
export const rateLimitConfigs = {
  // Strict: Login, registration, password reset (prevent brute force)
  strict: {
    requests: 5,
    window: "1 m" as const, // 5 requests per minute
    windowMs: 60 * 1000,
  },
  // Auth: Email verification, resend verification
  auth: {
    requests: 10,
    window: "1 m" as const, // 10 requests per minute
    windowMs: 60 * 1000,
  },
  // Standard: Regular API endpoints
  standard: {
    requests: 30,
    window: "1 m" as const, // 30 requests per minute
    windowMs: 60 * 1000,
  },
  // Relaxed: Read-only endpoints, health checks
  relaxed: {
    requests: 100,
    window: "1 m" as const, // 100 requests per minute
    windowMs: 60 * 1000,
  },
  // Heavy: CPU-intensive operations like scans
  heavy: {
    requests: 10,
    window: "1 m" as const, // 10 requests per minute
    windowMs: 60 * 1000,
  },
  // Contact: Contact form submissions (prevent email relay abuse)
  contact: {
    requests: 3,
    window: "1 h" as const, // 3 requests per hour
    windowMs: 60 * 60 * 1000,
  },
};

type RateLimitConfig = keyof typeof rateLimitConfigs;

/**
 * Get client identifier from request
 * Prioritizes Vercel's trusted x-real-ip header to prevent spoofing via x-forwarded-for
 */
export function getClientIdentifier(request: NextRequest): string {
  // Prefer x-real-ip (set by Vercel's proxy, not spoofable by clients)
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Vercel-specific forwarded header (also set by the platform)
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp) {
    return vercelIp.split(",")[0].trim();
  }

  // x-forwarded-for as last resort (can be spoofed but better than nothing)
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  // Fallback to localhost for development
  return "127.0.0.1";
}

/**
 * Prisma-based rate limiting using the RateLimitEntry table
 */
async function prismaRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const configValues = rateLimitConfigs[config];
  const now = new Date();
  const windowStart = new Date(now.getTime() - configValues.windowMs);
  const windowEnd = new Date(now.getTime() + configValues.windowMs);

  const entry = await prisma.rateLimitEntry.findUnique({
    where: { identifier_tier: { identifier, tier: config } },
  });

  // No entry or window has expired — start a new window
  if (!entry || entry.window < windowStart) {
    await prisma.rateLimitEntry.upsert({
      where: { identifier_tier: { identifier, tier: config } },
      create: {
        identifier,
        tier: config,
        count: 1,
        window: now,
        expiresAt: windowEnd,
      },
      update: {
        count: 1,
        window: now,
        expiresAt: windowEnd,
      },
    });
    return {
      success: true,
      remaining: configValues.requests - 1,
      reset: windowEnd.getTime(),
    };
  }

  // Window still active and limit reached
  if (entry.count >= configValues.requests) {
    return {
      success: false,
      remaining: 0,
      reset: entry.expiresAt.getTime(),
    };
  }

  // Increment count within the current window
  const updated = await prisma.rateLimitEntry.update({
    where: { identifier_tier: { identifier, tier: config } },
    data: { count: { increment: 1 } },
  });

  return {
    success: true,
    remaining: configValues.requests - updated.count,
    reset: entry.expiresAt.getTime(),
  };
}

/**
 * In-memory rate limiting fallback
 * Used when the Prisma query fails
 */
function inMemoryRateLimit(
  identifier: string,
  config: RateLimitConfig
): { success: boolean; remaining: number; reset: number } {
  const configValues = rateLimitConfigs[config];
  const now = Date.now();
  const key = `${config}:${identifier}`;

  const entry = inMemoryStore.get(key);

  if (!entry || now >= entry.resetTime) {
    // Create new entry
    inMemoryStore.set(key, {
      count: 1,
      resetTime: now + configValues.windowMs,
    });
    return {
      success: true,
      remaining: configValues.requests - 1,
      reset: now + configValues.windowMs,
    };
  }

  if (entry.count >= configValues.requests) {
    return {
      success: false,
      remaining: 0,
      reset: entry.resetTime,
    };
  }

  entry.count++;
  return {
    success: true,
    remaining: configValues.requests - entry.count,
    reset: entry.resetTime,
  };
}

// Clean up old entries periodically (for in-memory store)
setInterval(() => {
  const now = Date.now();
  inMemoryStore.forEach((value, key) => {
    if (now >= value.resetTime) {
      inMemoryStore.delete(key);
    }
  });
}, 60 * 1000); // Clean up every minute

/**
 * Rate limit a request
 *
 * Tries PostgreSQL (via Prisma) first, falls back to in-memory on error.
 *
 * @param request - The incoming request
 * @param config - Rate limit configuration to use
 * @returns Rate limit result with success status and headers
 */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig = "standard"
): Promise<{
  success: boolean;
  remaining: number;
  reset: number;
  headers: Record<string, string>;
}> {
  const identifier = getClientIdentifier(request);

  let result: { success: boolean; remaining: number; reset: number };

  try {
    result = await prismaRateLimit(identifier, config);
  } catch (error) {
    console.error("Prisma rate limit error, falling back to in-memory:", error);
    result = inMemoryRateLimit(identifier, config);
  }

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(rateLimitConfigs[config].requests),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
  };

  if (!result.success) {
    headers["Retry-After"] = String(Math.ceil((result.reset - Date.now()) / 1000));
  }

  return {
    ...result,
    headers,
  };
}

/**
 * Create a rate-limited response for exceeded limits
 */
export function rateLimitExceededResponse(
  headers: Record<string, string>
): NextResponse {
  return NextResponse.json(
    {
      error: "Too many requests. Please try again later.",
      retryAfter: headers["Retry-After"],
    },
    {
      status: 429,
      headers,
    }
  );
}

/**
 * Higher-order function to wrap API route handlers with rate limiting
 *
 * @param handler - The API route handler
 * @param config - Rate limit configuration to use
 */
export function withRateLimit<T extends NextRequest>(
  handler: (request: T) => Promise<NextResponse>,
  config: RateLimitConfig = "standard"
) {
  return async (request: T): Promise<NextResponse> => {
    const { success, headers } = await rateLimit(request, config);

    if (!success) {
      return rateLimitExceededResponse(headers);
    }

    const response = await handler(request);

    // Add rate limit headers to successful response
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  };
}

/**
 * Check if rate limiting is using a persistent store (PostgreSQL)
 */
export function isUsingRedis(): boolean {
  return true;
}
