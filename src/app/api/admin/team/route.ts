/**
 * Admin Team Management API
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasRole } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const members = await prisma.adminUser.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const pendingInvites = await prisma.adminInvite.findMany({
      where: {
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      members,
      pendingInvites,
    });
  } catch (error) {
    console.error("Get team error:", error);
    return NextResponse.json(
      { error: "Failed to fetch team" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasRole(session, ["OWNER"])) {
      return NextResponse.json({ error: "Only owners can modify team members" }, { status: 403 });
    }

    const { memberId, action, role } = await request.json();

    if (!memberId) {
      return NextResponse.json({ error: "Member ID required" }, { status: 400 });
    }

    // Prevent self-modification
    if (memberId === session.id) {
      return NextResponse.json({ error: "Cannot modify your own account" }, { status: 400 });
    }

    const member = await prisma.adminUser.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (action === "deactivate") {
      await prisma.adminUser.update({
        where: { id: memberId },
        data: { isActive: false },
      });

      // Delete their sessions
      await prisma.adminSession.deleteMany({
        where: { adminUserId: memberId },
      });

      await prisma.adminAuditLog.create({
        data: {
          adminUserId: session.id,
          action: "MEMBER_DEACTIVATED",
          resource: memberId,
        },
      });
    } else if (action === "activate") {
      await prisma.adminUser.update({
        where: { id: memberId },
        data: { isActive: true },
      });

      await prisma.adminAuditLog.create({
        data: {
          adminUserId: session.id,
          action: "MEMBER_ACTIVATED",
          resource: memberId,
        },
      });
    } else if (action === "updateRole" && role) {
      await prisma.adminUser.update({
        where: { id: memberId },
        data: { role },
      });

      await prisma.adminAuditLog.create({
        data: {
          adminUserId: session.id,
          action: "MEMBER_ROLE_CHANGED",
          resource: memberId,
          details: JSON.stringify({ newRole: role }),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update team member error:", error);
    return NextResponse.json(
      { error: "Failed to update team member" },
      { status: 500 }
    );
  }
}
