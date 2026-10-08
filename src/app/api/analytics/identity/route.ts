import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildAnalyticsIdentity } from "@/lib/conversion-funnel";
import { deserializeFirstTouchAttribution, FIRST_TOUCH_COOKIE, userAttributionData } from "@/lib/first-touch-attribution";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, plan: true, emailVerified: true, firstTouchSource: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // OAuth signups complete outside the registration route. Attribute the first
  // authenticated request exactly once if the first-touch record is still empty.
  if (!user.firstTouchSource) {
    const attribution = deserializeFirstTouchAttribution(request.cookies.get(FIRST_TOUCH_COOKIE)?.value);
    if (attribution) {
      await prisma.user.update({ where: { id: user.id }, data: userAttributionData(attribution) });
    }
  }

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
