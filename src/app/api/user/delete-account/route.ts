import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";
import { cancelSubscription } from "@/lib/paypal";

export const dynamic = "force-dynamic";

const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export async function DELETE(request: NextRequest) {
  try {
    // Support both session (web) and JWT (mobile) auth
    let userId: string | null = null;

    const session = await auth();
    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      userId = await authenticateMobileRequest(request);
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = deleteAccountSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 },
      );
    }

    const { password } = validation.data;

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        hashedPassword: true,
        billingCustomerId: true,
      },
    });

    if (!user || !user.hashedPassword) {
      return NextResponse.json(
        { error: "User not found or no password set" },
        { status: 400 },
      );
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.hashedPassword);
    if (!isValid) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 400 },
      );
    }

    // Cancel PayPal subscription if active (direct call, not HTTP loopback)
    if (user.billingCustomerId) {
      try {
        const cancelResult = await cancelSubscription(userId);
        if (!cancelResult.success) {
          console.warn(
            "Failed to cancel PayPal subscription during account deletion:",
            cancelResult.error,
          );
        }
      } catch (cancelError) {
        console.warn(
          "PayPal cancel error during account deletion:",
          cancelError,
        );
      }
    }

    // Delete all related data (same pattern as admin deleteUser)
    await prisma.emailVerificationToken.deleteMany({
      where: { email: user.email },
    });
    await prisma.passwordResetToken.deleteMany({
      where: { email: user.email },
    });
    await prisma.scanUsage.deleteMany({ where: { userId } });
    await prisma.scanHistory.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    // Finally delete the user
    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Account deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 },
    );
  }
}
