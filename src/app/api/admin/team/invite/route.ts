/**
 * Admin Team Invite API
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAdminSession,
  hasRole,
  createAdminInvite,
  acceptAdminInvite,
} from "@/lib/admin/auth";
import { sendAdminInviteEmail } from "@/lib/email";
import { prisma } from "@/lib/db";
import crypto from "crypto";
import { z } from "zod";

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

const resendInviteSchema = z.object({
  inviteId: z.string().min(1, "Invitation ID is required"),
  action: z.literal("resend"),
});

const deleteInviteSchema = z.object({
  inviteId: z.string().min(1, "Invitation ID is required"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = inviteSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 },
      );
    }

    const result = await createAdminInvite(
      session,
      validation.data.email,
      validation.data.role,
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
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

    return NextResponse.json({
      success: true,
      inviteUrl,
      token: result.token,
      emailSent,
    });
  } catch (error) {
    console.error("Create invite error:", error);
    return NextResponse.json(
      { error: "Failed to create invite" },
      { status: 500 },
    );
  }
}

// Resend an invitation with a freshly rotated setup token.
export async function PATCH(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasRole(session, ["OWNER"])) {
      return NextResponse.json({ error: "Only owners can manage invitations" }, { status: 403 });
    }

    const validation = resendInviteSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0].message }, { status: 400 });
    }

    const invite = await prisma.adminInvite.findFirst({
      where: { id: validation.data.inviteId, usedAt: null },
    });
    if (!invite) {
      return NextResponse.json({ error: "Pending invitation not found" }, { status: 404 });
    }

    const existingUser = await prisma.adminUser.findUnique({
      where: { email: invite.email.toLowerCase() },
      select: { id: true },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "This person already has an account; use the team member password reset instead." },
        { status: 409 },
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const updated = await prisma.adminInvite.updateMany({
      where: { id: invite.id, usedAt: null, token: invite.token },
      data: { token, expiresAt },
    });
    if (updated.count !== 1) {
      return NextResponse.json({ error: "Invitation changed. Refresh the page and try again." }, { status: 409 });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/admin/login?invite=${token}`;
    let emailSent = false;
    try {
      emailSent = await sendAdminInviteEmail(
        invite.email,
        inviteUrl,
        invite.role,
        session.name || undefined,
      );
    } catch (emailError) {
      console.error("Failed to resend invite email:", emailError);
    }

    if (!emailSent) {
      await prisma.adminInvite.updateMany({
        where: { id: invite.id, usedAt: null, token },
        data: { token: invite.token, expiresAt: invite.expiresAt },
      });
      return NextResponse.json(
        { error: "Could not send the invitation email. The previous link remains valid." },
        { status: 502 },
      );
    }

    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "INVITE_RESENT",
        resource: invite.email,
        details: JSON.stringify({ role: invite.role, inviteId: invite.id }),
      },
    });

    return NextResponse.json({ success: true, email: invite.email, expiresAt });
  } catch (error) {
    console.error("Resend invite error:", error);
    return NextResponse.json({ error: "Failed to resend invitation" }, { status: 500 });
  }
}

// Delete a pending invitation. Any previously sent setup link stops working.
export async function DELETE(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasRole(session, ["OWNER"])) {
      return NextResponse.json({ error: "Only owners can manage invitations" }, { status: 403 });
    }

    const validation = deleteInviteSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0].message }, { status: 400 });
    }

    const invite = await prisma.adminInvite.findFirst({
      where: { id: validation.data.inviteId, usedAt: null },
      select: { id: true, email: true },
    });
    if (!invite) {
      return NextResponse.json({ error: "Pending invitation not found" }, { status: 404 });
    }

    const deleted = await prisma.$transaction(async (tx) => {
      const result = await tx.adminInvite.deleteMany({
        where: { id: invite.id, usedAt: null },
      });
      if (result.count !== 1) return false;
      await tx.adminAuditLog.create({
        data: {
          adminUserId: session.id,
          action: "INVITE_DELETED",
          resource: invite.email,
          details: JSON.stringify({ inviteId: invite.id }),
        },
      });
      return true;
    });

    if (!deleted) {
      return NextResponse.json({ error: "Invitation changed. Refresh the page and try again." }, { status: 409 });
    }
    return NextResponse.json({ success: true, email: invite.email });
  } catch (error) {
    console.error("Delete invite error:", error);
    return NextResponse.json({ error: "Failed to delete invitation" }, { status: 500 });
  }
}

// Accept invite (no auth required)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = acceptSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 },
      );
    }

    const result = await acceptAdminInvite(
      validation.data.token,
      validation.data.name,
      validation.data.password,
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, email: result.email });
  } catch (error) {
    console.error("Accept invite error:", error);
    return NextResponse.json(
      { error: "Failed to accept invite" },
      { status: 500 },
    );
  }
}
