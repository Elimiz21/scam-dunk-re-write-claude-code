import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const interestSchema = z.object({
  email: z.string().email("Enter a valid email address").max(255),
  feature: z.enum(["WHATSAPP_BOT", "TELEGRAM_BOT", "MESSENGER_UPDATES"]),
});

export async function POST(request: NextRequest) {
  try {
    const { success, headers } = await rateLimit(request, "auth");
    if (!success) return rateLimitExceededResponse(headers);

    const parsed = interestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid signup" },
        { status: 400 },
      );
    }

    const { email, feature } = parsed.data;
    await prisma.featureInterest.upsert({
      where: { email_feature: { email: email.toLowerCase().trim(), feature } },
      update: {},
      create: { email: email.toLowerCase().trim(), feature },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Feature interest signup error:", error);
    return NextResponse.json(
      { error: "Could not save your signup. Please try again." },
      { status: 500 },
    );
  }
}
