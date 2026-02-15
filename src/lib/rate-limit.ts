/**
 * Rate Limiting Module
 *
 * Provides rate limiting for API routes using Upstash Redis.
 * Falls back to in-memory rate limiting if Redis is not configured.
 *
 * Required environment variables for Redis:
 * - UPSTASH_REDIS_REST_URL
 * - UPSTASH_REDIS_REST_TOKEN
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

// Check if Upstash Redis is configured
const isRedisConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

const isProduction = process.env.NODE_ENV === "production";
if (isProduction && !isRedisConfigured) {
  throw new Error(
    "FATAL: Redis (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN) must be configured in production for rate limiting"
  );
}

// Initialize Redis client if configured
const redis = isRedisConfigured
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// In-memory fallback for development/testing
const inMemoryStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Rate limit configurations for different endpoint types
 */
export const rateLimitConfigs = {
  // Strict: Login, registration, password reset (prevent brute force)
  strict: {
    requests: 5,
    window: "1 m" as const, // 5 requests per minute
  },
  // Auth: Email verification, resend verification
  auth: {
    requests: 10,
    window: "1 m" as const, // 10 requests per minute
  },
  // Standard: Regular API endpoints
  standard: {
    requests: 30,
    window: "1 m" as const, // 30 requests per minute
  },
  // Relaxed: Read-only endpoints, health checks
  relaxed: {
    requests: 100,
    window: "1 m" as const, // 100 requests per minute
  },
  // Heavy: CPU-intensive operations like scans
  heavy: {
    requests: 10,
    window: "1 m" as const, // 10 requests per minute
  },
  // Contact: Contact form submissions (prevent email relay abuse)
  contact: {
    requests: 3,
    window: "1 h" as const, // 3 requests per hour
  },
};

type RateLimitConfig = keyof typeof rateLimitConfigs;

// Create rate limiters for each config
const rateLimiters: Record<RateLimitConfig, Ratelimit | null> = {
  strict: redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          rateLimitConfigs.strict.requests,
          rateLimitConfigs.strict.window
        ),
        prefix: "ratelimit:strict",
      })
    : null,
  auth: redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          rateLimitConfigs.auth.requests,
          rateLimitConfigs.auth.window
        ),
        prefix: "ratelimit:auth",
      })
    : null,
  standard: redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          rateLimitConfigs.standard.requests,
          rateLimitConfigs.standard.window
        ),
        prefix: "ratelimit:standard",
      })
    : null,
  relaxed: redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          rateLimitConfigs.relaxed.requests,
          rateLimitConfigs.relaxed.window
        ),
        prefix: "ratelimit:relaxed",
      })
    : null,
  heavy: redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          rateLimitConfigs.heavy.requests,
          rateLimitConfigs.heavy.window
        ),
        prefix: "ratelimit:heavy",
      })
    : null,
  contact: redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          rateLimitConfigs.contact.requests,
          rateLimitConfigs.contact.window
        ),
        prefix: "ratelimit:contact",
      })
    : null,
};

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
 * In-memory rate limiting fallback
 * Used when Redis is not configured
 */
function inMemoryRateLimit(
  identifier: string,
  config: RateLimitConfig
): { success: boolean; remaining: number; reset: number } {
  const configValues = rateLimitConfigs[config];
  const windowMs = 60 * 1000; // 1 minute in milliseconds
  const now = Date.now();
  const key = `${config}:${identifier}`;

  const entry = inMemoryStore.get(key);

  if (!entry || now >= entry.resetTime) {
    // Create new entry
    inMemoryStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      success: true,
      remaining: configValues.requests - 1,
      reset: now + windowMs,
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
  const limiter = rateLimiters[config];

  let result: { success: boolean; remaining: number; reset: number };

  if (limiter) {
    // Use Redis-based rate limiting
    const { success, remaining, reset } = await limiter.limit(identifier);
    result = { success, remaining, reset };
  } else {
    // Use in-memory fallback
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
 * Check if rate limiting is using Redis (production) or in-memory (development)
 */
export function isUsingRedis(): boolean {
  return isRedisConfigured;
}
