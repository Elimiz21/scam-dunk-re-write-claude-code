import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * Standardized API response helpers.
 * Reduces boilerplate across admin API routes.
 */

/** Return a successful JSON response */
export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Return an error JSON response. Keeps the legacy `{ error: message }` shape
 * (many clients read `error`) and adds a stable `code` for new consumers.
 */
export function apiError(
  message: string,
  status = 500,
  code?: string,
): NextResponse {
  return NextResponse.json(
    { error: message, ...(code ? { code } : {}) },
    { status },
  );
}

/**
 * A typed error that route handlers can throw to produce a specific HTTP
 * status. Anything else thrown becomes a 500 (and is reported to Sentry).
 */
export class ApiException extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = "ApiException";
    this.status = status;
    this.code = code;
  }
}

type RouteHandler<Ctx> = (
  request: Request,
  context: Ctx,
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps a route handler so that uncaught errors are reported to Sentry and
 * returned as a consistent envelope instead of leaking stack traces or
 * silently 500-ing. Handlers may throw `ApiException` for specific statuses.
 *
 * Adopt incrementally: `export const POST = withApiHandler(async (req) => {...})`.
 */
export function withApiHandler<Ctx = unknown>(
  handler: RouteHandler<Ctx>,
): RouteHandler<Ctx> {
  return async (request: Request, context: Ctx) => {
    try {
      return await handler(request, context);
    } catch (err) {
      if (err instanceof ApiException) {
        // Client/expected errors: don't spam Sentry, return the intended status.
        return apiError(err.message, err.status, err.code);
      }
      Sentry.captureException(err);
      const message =
        err instanceof Error ? err.message : "Internal server error";
      // In production, avoid leaking internal detail.
      return apiError(
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : message,
        500,
        "internal_error",
      );
    }
  };
}

/** 401 Unauthorized */
export function apiUnauthorized(message = "Unauthorized"): NextResponse {
  return apiError(message, 401);
}

/** 403 Forbidden */
export function apiForbidden(
  message = "Insufficient permissions",
): NextResponse {
  return apiError(message, 403);
}

/** 404 Not Found */
export function apiNotFound(message = "Not found"): NextResponse {
  return apiError(message, 404);
}

/** 400 Bad Request */
export function apiBadRequest(message: string): NextResponse {
  return apiError(message, 400);
}
