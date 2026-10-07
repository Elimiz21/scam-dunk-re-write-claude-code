import { prisma } from "@/lib/db";

export type TelegramEntitlementDecision =
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
export function decideTelegramScanEntitlement(
  user: EntitlementUser | null,
  binding: EntitlementBinding | null,
  now: Date = new Date(),
): TelegramEntitlementDecision {
  if (
    !user ||
    !binding ||
    user.deletedAt ||
    user.plan === "FREE" ||
    (user.subscriptionExpiresAt
      ? user.subscriptionExpiresAt <= now
      // Admin-granted legacy paid accounts retain billingProvider=NONE.
      // Billing displays these accounts as MANUAL; honor the same entitlement.
      : !["PAYPAL", "STRIPE", "MANUAL", "NONE"].includes(user.billingProvider || "")) ||
    !binding.active ||
    binding.revokedAt
  ) {
    return { allowed: false, reason: "NO_ACTIVE_ENTITLEMENT" };
  }

  return { allowed: true };
}

/** Fresh database check. No session, cache, or client-supplied plan is trusted. */
export async function resolveTelegramScanEntitlement(
  userId: string,
  identityHash: string,
  now: Date = new Date(),
): Promise<TelegramEntitlementDecision> {
  try {
    const binding = await prisma.telegramIdentityBinding.findUnique({
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

    return decideTelegramScanEntitlement(binding.user, binding, now);
  } catch {
    return { allowed: false, reason: "NO_ACTIVE_ENTITLEMENT" };
  }
}
