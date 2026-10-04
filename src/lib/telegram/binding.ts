import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { encryptTelegramData } from "./crypto";
import { hashTelegramIdentity, hashTelegramLinkToken } from "./security";
import { decideTelegramScanEntitlement } from "./entitlement";

export async function isTelegramSubscriber(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return decideTelegramScanEntitlement(user, { active: true, revokedAt: null }).allowed;
}

export async function beginTelegramBinding(userId: string): Promise<string | null> {
  if (!(await isTelegramSubscriber(userId))) return null;
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.telegramLinkToken.upsert({ where: { userId },
    create: { userId, tokenHash: hashTelegramLinkToken(token), expiresAt: new Date(Date.now() + 600_000) },
    update: { tokenHash: hashTelegramLinkToken(token), expiresAt: new Date(Date.now() + 600_000) },
  });
  return `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${token}`;
}

/** Atomically consume the single-use link and reserve a private Telegram identity. */
export async function confirmTelegramBinding(token: string, identity: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !/^[1-9]\d{0,15}$/.test(identity)) return false;
  try {
    return await prisma.$transaction(async tx => {
      const tokenHash = hashTelegramLinkToken(token);
      const link = await tx.telegramLinkToken.findUnique({ where: { tokenHash }, include: { user: true } });
      if (!link || link.expiresAt <= new Date() ||
        !decideTelegramScanEntitlement(link.user, { active: true, revokedAt: null }).allowed) return false;
      const claimed = await tx.telegramLinkToken.deleteMany({ where: { id: link.id, tokenHash, expiresAt: { gt: new Date() } } });
      if (claimed.count !== 1) return false;
      const identityHash = hashTelegramIdentity(identity);
      const existing = await tx.telegramIdentityBinding.findUnique({ where: { identityHash } });
      if (existing?.active && existing.userId !== link.userId) throw new Error("IDENTITY_IN_USE");
      await tx.telegramIdentityBinding.updateMany({ where: { userId: link.userId, active: true }, data: { active: false, revokedAt: new Date() } });
      const data = { userId: link.userId, identityEncrypted: encryptTelegramData(identity), active: true, revokedAt: null, boundAt: new Date() };
      await tx.telegramIdentityBinding.upsert({ where: { identityHash }, create: { ...data, identityHash }, update: data });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch { return false; }
}

export async function revokeTelegramBinding(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.telegramLinkToken.deleteMany({ where: { userId } }),
    prisma.telegramIdentityBinding.updateMany({ where: { userId }, data: { active: false, revokedAt: new Date() } }),
  ]);
}
