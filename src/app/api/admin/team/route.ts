/**
 * Admin Team Management API
 */

import { NextRequest } from "next/server";
import { getAdminSession, hasRole } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import {
  apiSuccess,
  apiError,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiBadRequest,
} from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return apiUnauthorized();
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

    return apiSuccess({
      members,
      pendingInvites,
    });
  } catch (error) {
    console.error("Get team error:", error);
    return apiError("Failed to fetch team");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return apiUnauthorized();
    }

    if (!hasRole(session, ["OWNER"])) {
      return apiForbidden("Only owners can modify team members");
    }

    const { memberId, action, role } = await request.json();

    if (!memberId) {
      return apiBadRequest("Member ID required");
    }

    // Prevent self-modification
    if (memberId === session.id) {
      return apiBadRequest("Cannot modify your own account");
    }

    const member = await prisma.adminUser.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      return apiNotFound("Member not found");
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

    return apiSuccess({ success: true });
  } catch (error) {
    console.error("Update team member error:", error);
    return apiError("Failed to update team member");
  }
}
