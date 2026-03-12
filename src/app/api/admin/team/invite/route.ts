/**
 * Admin Team Invite API
 */

import { NextRequest } from "next/server";
import {
  getAdminSession,
  createAdminInvite,
  acceptAdminInvite,
} from "@/lib/admin/auth";
import { sendAdminInviteEmail } from "@/lib/email";
import { z } from "zod";
import {
  apiSuccess,
  apiError,
  apiBadRequest,
  apiUnauthorized,
} from "@/lib/api-response";

export const dynamic = "force-dynamic";

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["ADMIN", "VIEWER"]).default("ADMIN"),
});

const acceptSchema = z.object({
  token: z.string().min(1, "Token is required"),
  name: z.string().min(1, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return apiUnauthorized();
    }

    const body = await request.json();
    const validation = inviteSchema.safeParse(body);

    if (!validation.success) {
      return apiBadRequest(validation.error.errors[0].message);
    }

    const result = await createAdminInvite(
      session,
      validation.data.email,
      validation.data.role,
    );

    if (!result.success) {
      return apiBadRequest(result.error || "Failed to create invite");
    }

    // Generate invite URL
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/admin/login?invite=${result.token}`;

    // Attempt to send invite email
    let emailSent = false;
    try {
      emailSent = await sendAdminInviteEmail(
        validation.data.email,
        inviteUrl,
        validation.data.role,
        session.name || undefined,
      );
    } catch (emailError) {
      console.error("Failed to send invite email:", emailError);
    }

    return apiSuccess({
      success: true,
      inviteUrl,
      token: result.token,
      emailSent,
    });
  } catch (error) {
    console.error("Create invite error:", error);
    return apiError("Failed to create invite");
  }
}

// Accept invite (no auth required)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = acceptSchema.safeParse(body);

    if (!validation.success) {
      return apiBadRequest(validation.error.errors[0].message);
    }

    const result = await acceptAdminInvite(
      validation.data.token,
      validation.data.name,
      validation.data.password,
    );

    if (!result.success) {
      return apiBadRequest(result.error || "Failed to accept invite");
    }

    return apiSuccess({ success: true });
  } catch (error) {
    console.error("Accept invite error:", error);
    return apiError("Failed to accept invite");
  }
}
