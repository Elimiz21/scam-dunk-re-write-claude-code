/**
 * Admin Login API
 */

import { NextRequest } from "next/server";
import { adminLogin } from "@/lib/admin/auth";
import { z } from "zod";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { apiSuccess, apiError, apiBadRequest } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit: strict for admin login (5 requests per minute)
    const { success: rateLimitSuccess, headers: rateLimitHeaders } =
      await rateLimit(request, "strict");
    if (!rateLimitSuccess) {
      return rateLimitExceededResponse(rateLimitHeaders);
    }

    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return apiBadRequest(validation.error.errors[0].message);
    }

    const { email, password } = validation.data;
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    const result = await adminLogin(email, password, ipAddress, userAgent);

    if (!result.success) {
      return apiError(result.error || "Invalid credentials", 401);
    }

    return apiSuccess({ success: true, admin: result.admin });
  } catch (error) {
    console.error("Admin login error:", error);
    return apiError("Login failed");
  }
}
