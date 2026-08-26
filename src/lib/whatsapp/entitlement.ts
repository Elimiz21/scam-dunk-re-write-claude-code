import { prisma } from "@/lib/db";

export type WhatsAppEntitlementDecision =
  | { allowed: true }
  | { allowed: false; reason: "NO_ACTIVE_ENTITLEMENT" };

type EntitlementUser = {
  plan: string;
  billingProvider: string | null;
  deletedAt: Date | null;
  subscriptionExpiresAt: Date | null;
};

type EntitlementBinding = {
  active: boolean;
  revokedAt: Date | null;
};

/** Pure fail-closed entitlement policy, kept separately for exhaustive tests. */
export function decideWhatsAppScanEntitlement(
  user: EntitlementUser | null,
  binding: EntitlementBinding | null,
  now: Date = new Date(),
): WhatsAppEntitlementDecision {
  if (
    !user ||
    !binding ||
    user.deletedAt ||
    user.plan === "FREE" ||
    (user.subscriptionExpiresAt
      ? user.subscriptionExpiresAt <= now
      : !["PAYPAL", "STRIPE", "MANUAL"].includes(user.billingProvider || "")) ||
    !binding.active ||
    binding.revokedAt
  ) {
    return { allowed: false, reason: "NO_ACTIVE_ENTITLEMENT" };
  }

  return { allowed: true };
}

/** Fresh database check. No session, cache, or client-supplied plan is trusted. */
export async function resolveWhatsAppScanEntitlement(
  userId: string,
  identityHash: string,
  now: Date = new Date(),
): Promise<WhatsAppEntitlementDecision> {
  try {
    const binding = await prisma.whatsAppIdentityBinding.findUnique({
      where: { identityHash },
      select: {
        userId: true,
        active: true,
        revokedAt: true,
        user: {
          select: {
            plan: true,
            billingProvider: true,
            deletedAt: true,
            subscriptionExpiresAt: true,
          },
        },
      },
    });

    if (!binding || binding.userId !== userId) {
      return { allowed: false, reason: "NO_ACTIVE_ENTITLEMENT" };
    }

    return decideWhatsAppScanEntitlement(binding.user, binding, now);
  } catch {
    return { allowed: false, reason: "NO_ACTIVE_ENTITLEMENT" };
  }
}
