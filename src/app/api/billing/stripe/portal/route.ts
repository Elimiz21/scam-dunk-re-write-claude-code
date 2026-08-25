import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required.", code: "UNAUTHORIZED" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { billingProvider: true, billingCustomerId: true },
  });
  if (user?.billingProvider !== "STRIPE" || !user.billingCustomerId) {
    return NextResponse.json({ error: "No Stripe subscription is attached to this account.", code: "NO_STRIPE_SUBSCRIPTION" }, { status: 409 });
  }
  try {
    const baseUrl = process.env.NEXTAUTH_URL || "https://scamdunk.com";
    const portal = await getStripeClient().billingPortal.sessions.create({
      customer: user.billingCustomerId,
      return_url: `${baseUrl}/account`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (error) {
    console.error("Stripe portal creation failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Stripe account management is temporarily unavailable.", code: "STRIPE_UNAVAILABLE" }, { status: 503 });
  }
}
