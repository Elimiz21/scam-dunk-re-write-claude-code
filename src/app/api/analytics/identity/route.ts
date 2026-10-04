import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildAnalyticsIdentity } from "@/lib/conversion-funnel";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, plan: true, emailVerified: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const hasStartedScanning = Boolean(
    await prisma.scanHistory.findFirst({
      where: { userId: user.id },
      select: { id: true },
    }),
  );

  return NextResponse.json(
    buildAnalyticsIdentity({
      userId: user.id,
      plan: user.plan === "PRO_MAX" ? "PRO_MAX" : user.plan === "PAID" ? "PAID" : "FREE",
      emailVerified: Boolean(user.emailVerified),
      hasStartedScanning,
    }),
  );
}
