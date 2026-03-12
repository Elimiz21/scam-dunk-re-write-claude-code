/**
 * Admin Session API - Get current admin session
 */

import { getAdminSession } from "@/lib/admin/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAdminSession();

    if (!session) {
      return apiError("Not authenticated", 401);
    }

    return apiSuccess({ authenticated: true, admin: session });
  } catch (error) {
    console.error("Admin session error:", error);
    return apiError("Session check failed");
  }
}
