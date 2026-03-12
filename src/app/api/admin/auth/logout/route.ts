/**
 * Admin Logout API
 */

import { adminLogout } from "@/lib/admin/auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await adminLogout();
    return apiSuccess({ success: true });
  } catch (error) {
    console.error("Admin logout error:", error);
    return apiError("Logout failed");
  }
}
