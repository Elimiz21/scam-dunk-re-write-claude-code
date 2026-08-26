import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  beginWhatsAppBinding,
  confirmWhatsAppBinding,
  getWhatsAppBindingStatus,
  isCurrentWhatsAppSubscriber,
  revokeWhatsAppBinding,
} from "@/lib/whatsapp/binding";
import { isWhatsAppConfigured } from "@/lib/whatsapp/provider";

export const dynamic = "force-dynamic";

const beginSchema = z.object({ action: z.literal("begin"), phoneNumber: z.string().max(32) });
const confirmSchema = z.object({ action: z.literal("confirm"), code: z.string().regex(/^\d{6}$/) });

async function sessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    INVALID_PHONE: "Enter a valid phone number in international format, for example +12125550199.",
    NUMBER_IN_USE: "That WhatsApp number cannot be linked to this account.",
    NOT_ENTITLED: "An active ScamDunk subscription is required to link WhatsApp.",
    TOO_SOON: "A code was sent recently. Wait a minute before requesting another.",
    INVALID_CODE: "That code is not valid. Check the code and try again.",
    EXPIRED_CODE: "That code has expired. Request a new one.",
    UNAVAILABLE: "WhatsApp linking is temporarily unavailable. Please try again later.",
  };
  return messages[code] ?? "WhatsApp linking is temporarily unavailable. Please try again later.";
}

async function allowBindingCodeSend(request: NextRequest, userId: string): Promise<boolean> {
  const userRequest = new NextRequest("http://internal/whatsapp-binding", {
    headers: { "x-real-ip": `whatsapp-binding-user:${userId}` },
  });
  const globalRequest = new NextRequest("http://internal/whatsapp-binding", {
    headers: { "x-real-ip": "whatsapp-binding-global" },
  });
  const [byUser, byIp, global] = await Promise.all([
    rateLimit(userRequest, "whatsappBindingUser"),
    rateLimit(request, "whatsappBindingIp"),
    rateLimit(globalRequest, "whatsappBindingGlobal"),
  ]);
  return byUser.success && byIp.success && global.success;
}

export async function GET() {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const status = await getWhatsAppBindingStatus(userId);
    return NextResponse.json({ ...status, available: isWhatsAppConfigured() });
  } catch {
    return NextResponse.json({ error: "Unable to load WhatsApp status" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const begin = beginSchema.safeParse(body);
  const confirm = confirmSchema.safeParse(body);
  if (begin.success) {
    if (!isWhatsAppConfigured()) {
      return NextResponse.json(
        { error: "WhatsApp scanning is coming soon — linking opens at launch." },
        { status: 503 },
      );
    }
    try {
      if (!(await isCurrentWhatsAppSubscriber(userId))) {
        return NextResponse.json({ error: errorMessage("NOT_ENTITLED") }, { status: 403 });
      }
      if (!(await allowBindingCodeSend(request, userId))) {
        return NextResponse.json({ error: "Too many verification requests. Please try again later." }, { status: 429 });
      }
    } catch {
      return NextResponse.json({ error: "WhatsApp linking is temporarily unavailable. Please try again later." }, { status: 503 });
    }
  }
  const result = begin.success
    ? await beginWhatsAppBinding(userId, begin.data.phoneNumber)
    : confirm.success
      ? await confirmWhatsAppBinding(userId, confirm.data.code)
      : null;
  if (!result) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (result.ok === false) return NextResponse.json({ error: errorMessage(result.code) }, { status: 400 });
  return NextResponse.json(result);
}

export async function DELETE() {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await revokeWhatsAppBinding(userId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unable to unlink WhatsApp" }, { status: 503 });
  }
}
