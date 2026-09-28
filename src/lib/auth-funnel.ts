import { prisma } from "@/lib/db";

export const AUTH_FUNNEL_EVENT_TYPES = {
  SIGNUP_COMPLETED: "SIGNUP_COMPLETED",
  EMAIL_VERIFIED: "EMAIL_VERIFIED",
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
} as const;

export type AuthFunnelEventType =
  (typeof AUTH_FUNNEL_EVENT_TYPES)[keyof typeof AUTH_FUNNEL_EVENT_TYPES];

/** Records an authoritative funnel milestone without sensitive credentials. */
export async function recordAuthFunnelEvent(input: {
  userId: string;
  eventType: AuthFunnelEventType;
  method?: string;
}) {
  return prisma.authFunnelEvent.create({
    data: {
      userId: input.userId,
      eventType: input.eventType,
      method: input.method,
    },
  });
}
