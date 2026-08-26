import crypto from "crypto";
import { prisma } from "@/lib/db";
import { decryptWhatsAppData, encryptWhatsAppData } from "./crypto";
import { decideWhatsAppScanEntitlement } from "./entitlement";
import { sendWhatsAppVerificationCode } from "./provider";
import {
  hashWhatsAppIdentity,
  hashWhatsAppVerificationCode,
  normalizeWhatsAppPhoneNumber,
  verificationCodesMatch,
} from "./security";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;

export type BindingActionResult =
  | { ok: true; maskedPhone?: string }
  | { ok: false; code: "INVALID_PHONE" | "NUMBER_IN_USE" | "NOT_ENTITLED" | "TOO_SOON" | "INVALID_CODE" | "EXPIRED_CODE" | "UNAVAILABLE" };

function makeVerificationCode(): string {
  return crypto.randomInt(100000, 1_000_000).toString();
}

function maskPhoneNumber(phoneNumber: string): string {
  return `${phoneNumber.slice(0, 3)}••••${phoneNumber.slice(-2)}`;
}

async function activePaidUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      billingProvider: true,
      deletedAt: true,
      subscriptionExpiresAt: true,
    },
  });
  return decideWhatsAppScanEntitlement(user, { active: true, revokedAt: null }).allowed;
}

export async function isCurrentWhatsAppSubscriber(userId: string): Promise<boolean> {
  try {
    return await activePaidUser(userId);
  } catch {
    return false;
  }
}

export async function beginWhatsAppBinding(
  userId: string,
  input: string,
): Promise<BindingActionResult> {
  const phoneNumber = normalizeWhatsAppPhoneNumber(input);
  if (!phoneNumber) return { ok: false, code: "INVALID_PHONE" };

  try {
    if (!(await activePaidUser(userId))) return { ok: false, code: "NOT_ENTITLED" };

    const identityHash = hashWhatsAppIdentity(phoneNumber);
    const existing = await prisma.whatsAppIdentityBinding.findUnique({
      where: { identityHash },
      select: { userId: true, active: true, lastVerificationSentAt: true },
    });
    // Only a verified active binding reserves an identity. A stale or
    // unverified attempt cannot squat on someone else's WhatsApp number.
    if (existing?.active && existing.userId !== userId) return { ok: false, code: "NUMBER_IN_USE" };
    if (
      existing?.userId === userId && existing.lastVerificationSentAt &&
      Date.now() - existing.lastVerificationSentAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      return { ok: false, code: "TOO_SOON" };
    }

    const code = makeVerificationCode();
    const now = new Date();
    await prisma.whatsAppIdentityBinding.upsert({
      where: { identityHash },
      create: {
        userId,
        identityHash,
        identityEncrypted: encryptWhatsAppData(phoneNumber),
        verificationCodeHash: hashWhatsAppVerificationCode(code),
        verificationExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
        lastVerificationSentAt: now,
      },
      update: {
        userId,
        identityEncrypted: encryptWhatsAppData(phoneNumber),
        verificationCodeHash: hashWhatsAppVerificationCode(code),
        verificationExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
        verificationAttempts: 0,
        lastVerificationSentAt: now,
        active: false,
        revokedAt: null,
      },
    });
    await sendWhatsAppVerificationCode(phoneNumber, code);
    return { ok: true, maskedPhone: maskPhoneNumber(phoneNumber) };
  } catch {
    return { ok: false, code: "UNAVAILABLE" };
  }
}

export async function confirmWhatsAppBinding(
  userId: string,
  code: string,
): Promise<BindingActionResult> {
  try {
    if (!(await activePaidUser(userId))) return { ok: false, code: "NOT_ENTITLED" };
    const binding = await prisma.whatsAppIdentityBinding.findFirst({
      where: { userId, active: false, verificationCodeHash: { not: null } },
      orderBy: { lastVerificationSentAt: "desc" },
    });
    if (!binding?.verificationCodeHash || !binding.verificationExpiresAt) {
      return { ok: false, code: "INVALID_CODE" };
    }
    if (
      binding.verificationExpiresAt <= new Date() ||
      binding.verificationAttempts >= MAX_VERIFICATION_ATTEMPTS
    ) {
      return { ok: false, code: "EXPIRED_CODE" };
    }
    if (!/^\d{6}$/.test(code) || !verificationCodesMatch(code, binding.verificationCodeHash)) {
      await prisma.whatsAppIdentityBinding.update({
        where: { id: binding.id },
        data: { verificationAttempts: { increment: 1 } },
      });
      return { ok: false, code: "INVALID_CODE" };
    }

    const maskedPhone = maskPhoneNumber(decryptWhatsAppData(binding.identityEncrypted));
    await prisma.$transaction([
      prisma.whatsAppIdentityBinding.updateMany({
        where: { userId, active: true },
        data: { active: false, revokedAt: new Date() },
      }),
      prisma.whatsAppIdentityBinding.update({
        where: { id: binding.id },
        data: {
          active: true,
          boundAt: new Date(),
          revokedAt: null,
          verificationCodeHash: null,
          verificationExpiresAt: null,
          verificationAttempts: 0,
        },
      }),
    ]);
    return { ok: true, maskedPhone };
  } catch {
    return { ok: false, code: "UNAVAILABLE" };
  }
}

export async function revokeWhatsAppBinding(userId: string): Promise<void> {
  await prisma.whatsAppIdentityBinding.updateMany({
    where: { userId, active: true },
    data: { active: false, revokedAt: new Date() },
  });
}

export async function getWhatsAppBindingStatus(userId: string): Promise<{
  active: boolean;
  maskedPhone?: string;
}> {
  const binding = await prisma.whatsAppIdentityBinding.findFirst({
    where: { userId, active: true, revokedAt: null },
    orderBy: { boundAt: "desc" },
  });
  if (!binding) return { active: false };
  try {
    return { active: true, maskedPhone: maskPhoneNumber(decryptWhatsAppData(binding.identityEncrypted)) };
  } catch {
    return { active: true };
  }
}
