/**
 * Admin Users API - List and manage app users
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasRole } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { createPasswordResetToken, createEmailVerificationToken } from "@/lib/tokens";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const search = searchParams.get("search") || "";
    const plan = searchParams.get("plan") || "";
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Build where clause
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }
    if (plan) {
      where.plan = plan;
    }

    // Get users with their scan usage
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          scanUsages: {
            orderBy: { monthKey: "desc" },
            take: 1,
          },
          _count: {
            select: { scanUsages: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    // Get current month key
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Format users with additional data
    const formattedUsers = users.map((user) => {
      const currentUsage = user.scanUsages.find((u) => u.monthKey === currentMonthKey);
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        formerPro: user.formerPro,
        billingCustomerId: user.billingCustomerId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        emailVerified: user.emailVerified,
        scansThisMonth: currentUsage?.scanCount || 0,
        totalMonthsActive: user._count.scanUsages,
      };
    });

    // Get summary stats
    const stats = await prisma.user.groupBy({
      by: ["plan"],
      _count: true,
    });

    const [totalUsers, formerProUsers, newUsersLast30Days] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { formerPro: true } }),
      prisma.user.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
    ]);

    return NextResponse.json({
      users: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      stats: {
        totalUsers,
        freeUsers: stats.find((s) => s.plan === "FREE")?._count || 0,
        paidUsers: stats.find((s) => s.plan === "PAID")?._count || 0,
        formerProUsers,
        newUsersLast30Days,
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
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

    if (!hasRole(session, ["OWNER", "ADMIN"])) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, action, value } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: "User ID and action required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let updateData: Record<string, unknown> = {};
    let logDetails = "";

    switch (action) {
      case "upgradeToPaid":
        updateData = { plan: "PAID" };
        logDetails = "Upgraded user to PAID plan";
        break;

      case "downgradeToFree":
        updateData = { plan: "FREE", formerPro: true };
        logDetails = "Downgraded user to FREE plan";
        break;

      case "resetScans":
        // Get current month key
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        await prisma.scanUsage.updateMany({
          where: { userId, monthKey },
          data: { scanCount: 0 },
        });
        logDetails = "Reset user's monthly scan count to 0";
        break;

      case "setScans":
        if (typeof value !== "number") {
          return NextResponse.json({ error: "Scan count value required" }, { status: 400 });
        }
        const nowForSet = new Date();
        const monthKeyForSet = `${nowForSet.getFullYear()}-${String(nowForSet.getMonth() + 1).padStart(2, "0")}`;

        await prisma.scanUsage.upsert({
          where: { userId_monthKey: { userId, monthKey: monthKeyForSet } },
          update: { scanCount: value },
          create: { userId, monthKey: monthKeyForSet, scanCount: value },
        });
        logDetails = `Set user's monthly scan count to ${value}`;
        break;

      case "updateName":
        if (typeof value !== "string") {
          return NextResponse.json({ error: "Name value required" }, { status: 400 });
        }
        updateData = { name: value };
        logDetails = `Updated user's name to "${value}"`;
        break;

      case "resetPassword":
        // Send password reset email to user
        try {
          const resetToken = await createPasswordResetToken(user.email);
          const emailSent = await sendPasswordResetEmail(user.email, resetToken);
          if (!emailSent) {
            return NextResponse.json(
              { error: "Failed to send password reset email" },
              { status: 500 }
            );
          }
          logDetails = `Sent password reset email to ${user.email}`;
        } catch (emailError) {
          console.error("Password reset email error:", emailError);
          return NextResponse.json(
            { error: "Failed to send password reset email" },
            { status: 500 }
          );
        }
        break;

      case "deleteUser":
        // Delete user and all related data
        try {
          // Delete related data first (in order of dependencies)
          await prisma.emailVerificationToken.deleteMany({ where: { email: user.email } });
          await prisma.passwordResetToken.deleteMany({ where: { email: user.email } });
          await prisma.scanUsage.deleteMany({ where: { userId } });
          await prisma.scanHistory.deleteMany({ where: { userId } });
          await prisma.session.deleteMany({ where: { userId } });
          await prisma.account.deleteMany({ where: { userId } });
          // Finally delete the user
          await prisma.user.delete({ where: { id: userId } });
          logDetails = `Deleted user ${user.email} and all related data`;

          // Log and return early since user is deleted
          await prisma.adminAuditLog.create({
            data: {
              adminUserId: session.id,
              action: "USER_DELETE",
              resource: userId,
              details: JSON.stringify({ userEmail: user.email, details: logDetails }),
            },
          });

          return NextResponse.json({ success: true, message: logDetails });
        } catch (deleteError) {
          console.error("Delete user error:", deleteError);
          return NextResponse.json(
            { error: "Failed to delete user" },
            { status: 500 }
          );
        }

      case "resetVerification":
        // Reset email verification and send new verification email
        try {
          // Set emailVerified to null
          await prisma.user.update({
            where: { id: userId },
            data: { emailVerified: null },
          });

          // Delete any existing verification tokens for this email
          await prisma.emailVerificationToken.deleteMany({ where: { email: user.email } });

          // Create new verification token and send email
          const verificationToken = await createEmailVerificationToken(user.email);
          const emailSent = await sendVerificationEmail(user.email, verificationToken);

          if (!emailSent) {
            return NextResponse.json(
              { error: "Failed to send verification email" },
              { status: 500 }
            );
          }
          logDetails = `Reset verification and sent new verification email to ${user.email}`;
        } catch (verifyError) {
          console.error("Reset verification error:", verifyError);
          return NextResponse.json(
            { error: "Failed to reset verification" },
            { status: 500 }
          );
        }
        break;

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Update user if there's data to update
    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
    }

    // Log the admin action
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: `USER_${action.toUpperCase()}`,
        resource: userId,
        details: JSON.stringify({ action, value, userEmail: user.email, details: logDetails }),
      },
    });

    return NextResponse.json({ success: true, message: logDetails });
  } catch (error) {
    console.error("Update user error:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
