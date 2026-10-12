import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/db";
import { encryptWhatsAppData } from "@/lib/whatsapp/crypto";
import { hashWhatsAppIdentity } from "@/lib/whatsapp/security";
import { processWhatsAppInboundEvent } from "@/lib/whatsapp/processor";
import { isWhatsAppConfigured } from "@/lib/whatsapp/provider";
import { parseTelnyxWhatsAppInbound, verifyTelnyxSignature } from "@/lib/whatsapp/telnyx";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (process.env.WHATSAPP_PROVIDER !== "telnyx" || !isWhatsAppConfigured()) {
    return new NextResponse("Unavailable", { status: 503 });
  }
  const raw = Buffer.from(await request.arrayBuffer());
  if (!verifyTelnyxSignature(raw, request.headers.get("telnyx-signature-ed25519"), request.headers.get("telnyx-timestamp"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  let message;
  try { message = parseTelnyxWhatsAppInbound(JSON.parse(raw.toString("utf8"))); }
  catch { return new NextResponse("Bad Request", { status: 400 }); }
  if (!message) return NextResponse.json({ received: true });
  try {
    const senderIdentityHash = hashWhatsAppIdentity(message.from);
    const binding = await prisma.whatsAppIdentityBinding.findUnique({
      where: { identityHash: senderIdentityHash }, select: { id: true },
    });
    // Persist before acknowledgement; the existing cron recovers interrupted work.
    const event = await prisma.whatsAppInboundEvent.create({ data: {
      providerMessageId: message.id, senderIdentityHash, bindingId: binding?.id,
      messageType: message.messageType,
      encryptedText: message.text ? encryptWhatsAppData(message.text) : null,
      senderIdentityEncrypted: encryptWhatsAppData(message.from),
      purgeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    } });
    waitUntil(processWhatsAppInboundEvent(event.id, message.from.slice(1)).catch(() => {
      console.error("WhatsApp Telnyx processing failed");
    }));
    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ received: true });
    }
    console.error("WhatsApp Telnyx persistence failed");
    return new NextResponse("Unavailable", { status: 503 });
  }
}
