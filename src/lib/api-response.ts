import { NextResponse } from "next/server";

/**
 * Standardized API response helpers.
 * Reduces boilerplate across admin API routes.
 */

/** Return a successful JSON response */
export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Return an error JSON response with { error: message } */
export function apiError(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
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
