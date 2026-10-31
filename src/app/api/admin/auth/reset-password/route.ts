import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { validatePasswordStrength } from "@/lib/config";

export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().superRefine((password, ctx) => {
    const error = validatePasswordStrength(password);
    if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
  }),
});

export async function POST(request: NextRequest) {
  const { success, headers } = await rateLimit(request, "auth");
  if (!success) return rateLimitExceededResponse(headers);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(parsed.data.password, 12);
  const now = new Date();

  try {
    const completed = await prisma.$transaction(async (tx) => {
      const reset = await tx.adminPasswordResetToken.findUnique({
        where: { token: parsed.data.token },
      });
      if (!reset || reset.expiresAt <= now) {
        if (reset) await tx.adminPasswordResetToken.delete({ where: { id: reset.id } });
        return false;
      }

      const consumed = await tx.adminPasswordResetToken.deleteMany({
        where: { id: reset.id, expiresAt: { gt: now } },
      });
      if (consumed.count !== 1) return false;

      await tx.adminUser.update({
        where: { id: reset.adminUserId },
        data: { hashedPassword },
      });
      await tx.adminSession.deleteMany({ where: { adminUserId: reset.adminUserId } });
      await tx.adminPasswordResetToken.deleteMany({ where: { adminUserId: reset.adminUserId } });
      await tx.adminAuditLog.create({
        data: { adminUserId: reset.adminUserId, action: "ADMIN_PASSWORD_RESET_COMPLETED" },
      });
      return true;
    });

    if (!completed) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin password reset failed:", error);
    return NextResponse.json({ error: "Could not reset password" }, { status: 500 });
  }
}
