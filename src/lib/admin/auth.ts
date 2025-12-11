/**
 * Admin Authentication System
 * Standalone authentication for admin workspace - separate from main app auth
 */

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const ADMIN_SESSION_COOKIE = "admin_session_token";
const SESSION_EXPIRY_DAYS = 7;

export interface AdminSessionData {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Generate a secure session token
 */
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Login an admin user
 */
export async function adminLogin(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; error?: string; admin?: AdminSessionData }> {
  try {
    const adminUser = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!adminUser) {
      return { success: false, error: "Invalid credentials" };
    }

    if (!adminUser.isActive) {
      return { success: false, error: "Account is deactivated" };
    }

    const isValid = await verifyPassword(password, adminUser.hashedPassword);
    if (!isValid) {
      return { success: false, error: "Invalid credentials" };
    }

    // Create session
    const token = generateSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS);

    await prisma.adminSession.create({
      data: {
        adminUserId: adminUser.id,
        token,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    // Update last login
    await prisma.adminUser.update({
      where: { id: adminUser.id },
      data: { lastLoginAt: new Date() },
    });

    // Log the login
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: adminUser.id,
        action: "LOGIN",
        ipAddress,
        details: JSON.stringify({ userAgent }),
      },
    });

    // Set cookie
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    });

    return {
      success: true,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role,
      },
    };
  } catch (error) {
    console.error("Admin login error:", error);
    return { success: false, error: "Login failed" };
  }
}

/**
 * Logout an admin user
 */
export async function adminLogout(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

    if (token) {
      const session = await prisma.adminSession.findUnique({
        where: { token },
      });

      if (session) {
        await prisma.adminAuditLog.create({
          data: {
            adminUserId: session.adminUserId,
            action: "LOGOUT",
          },
        });

        await prisma.adminSession.delete({
          where: { token },
        });
      }
    }

    cookieStore.delete(ADMIN_SESSION_COOKIE);
  } catch (error) {
    console.error("Admin logout error:", error);
  }
}

/**
 * Get the current admin session
 */
export async function getAdminSession(): Promise<AdminSessionData | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

    if (!token) {
      return null;
    }

    const session = await prisma.adminSession.findUnique({
      where: { token },
      include: { adminUser: true },
    });

    if (!session) {
      return null;
    }

    if (new Date() > session.expiresAt) {
      await prisma.adminSession.delete({ where: { token } });
      return null;
    }

    if (!session.adminUser.isActive) {
      await prisma.adminSession.delete({ where: { token } });
      return null;
    }

    return {
      id: session.adminUser.id,
      email: session.adminUser.email,
      name: session.adminUser.name,
      role: session.adminUser.role,
    };
  } catch (error) {
    console.error("Get admin session error:", error);
    return null;
  }
}

/**
 * Require admin authentication - redirect if not logged in
 */
export async function requireAdminAuth(): Promise<AdminSessionData> {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

/**
 * Check if admin has specific role
 */
export function hasRole(session: AdminSessionData, allowedRoles: string[]): boolean {
  return allowedRoles.includes(session.role);
}

/**
 * Create an invite for a new admin user
 */
export async function createAdminInvite(
  inviterSession: AdminSessionData,
  email: string,
  role: string = "ADMIN"
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    // Only OWNER can invite
    if (inviterSession.role !== "OWNER") {
      return { success: false, error: "Only owners can invite new admins" };
    }

    // Check if user already exists
    const existing = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return { success: false, error: "User already exists" };
    }

    // Check for existing unused invite
    const existingInvite = await prisma.adminInvite.findFirst({
      where: {
        email: email.toLowerCase(),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      return { success: true, token: existingInvite.token };
    }

    // Create new invite
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 day expiry

    await prisma.adminInvite.create({
      data: {
        email: email.toLowerCase(),
        token,
        role,
        expiresAt,
        invitedBy: inviterSession.id,
      },
    });

    // Log the invite
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: inviterSession.id,
        action: "INVITE_SENT",
        resource: email,
        details: JSON.stringify({ role }),
      },
    });

    return { success: true, token };
  } catch (error) {
    console.error("Create invite error:", error);
    return { success: false, error: "Failed to create invite" };
  }
}

/**
 * Accept an invite and create admin user
 */
export async function acceptAdminInvite(
  token: string,
  name: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const invite = await prisma.adminInvite.findUnique({
      where: { token },
    });

    if (!invite) {
      return { success: false, error: "Invalid invite" };
    }

    if (invite.usedAt) {
      return { success: false, error: "Invite already used" };
    }

    if (new Date() > invite.expiresAt) {
      return { success: false, error: "Invite expired" };
    }

    // Create the admin user
    const hashedPassword = await hashPassword(password);

    await prisma.adminUser.create({
      data: {
        email: invite.email,
        hashedPassword,
        name,
        role: invite.role,
        createdBy: invite.invitedBy,
      },
    });

    // Mark invite as used
    await prisma.adminInvite.update({
      where: { token },
      data: { usedAt: new Date() },
    });

    return { success: true };
  } catch (error) {
    console.error("Accept invite error:", error);
    return { success: false, error: "Failed to accept invite" };
  }
}

/**
 * Create the initial owner admin user (one-time setup)
 */
export async function createOwnerAdmin(
  email: string,
  password: string,
  name?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if any admin exists
    const existingAdmin = await prisma.adminUser.findFirst();
    if (existingAdmin) {
      return { success: false, error: "Admin owner already exists" };
    }

    const hashedPassword = await hashPassword(password);

    await prisma.adminUser.create({
      data: {
        email: email.toLowerCase(),
        hashedPassword,
        name: name || "Admin Owner",
        role: "OWNER",
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Create owner admin error:", error);
    return { success: false, error: "Failed to create owner admin" };
  }
}
