import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encryptWhatsAppData } from "@/lib/whatsapp/crypto";
import { processWhatsAppInboundEvent } from "@/lib/whatsapp/processor";
import { hashWhatsAppIdentity, verifyWhatsAppWebhookSignature } from "@/lib/whatsapp/security";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    changes: z.array(z.object({
      value: z.object({
        metadata: z.object({ phone_number_id: z.string() }),
        contacts: z.array(z.object({ wa_id: z.string() })).optional(),
        messages: z.array(z.object({
          id: z.string(),
          from: z.string(),
          type: z.string(),
          text: z.object({ body: z.string() }).optional(),
        })).optional(),
      }),
    })),
  })),
});

function sameSecret(value: string | null, expected: string | undefined): boolean {
  if (!value || !expected || value.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

function senderIdentity(from: string): string | null {
  return /^\d{8,15}$/.test(from) ? `+${from}` : null;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  if (
    query.get("hub.mode") !== "subscribe" ||
    !sameSecret(query.get("hub.verify_token"), process.env.WHATSAPP_VERIFY_TOKEN)
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(query.get("hub.challenge") || "", { status: 200 });
}

export async function POST(request: NextRequest) {
  const rawBody = Buffer.from(await request.arrayBuffer());
  try {
    if (!verifyWhatsAppWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  } catch {
    return new NextResponse("Unavailable", { status: 503 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  try {
    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (value.metadata.phone_number_id !== process.env.WHATSAPP_PHONE_NUMBER_ID) continue;
        for (const message of value.messages ?? []) {
          const identity = senderIdentity(message.from);
          if (!identity) continue;
          const senderIdentityHash = hashWhatsAppIdentity(identity);
          const binding = await prisma.whatsAppIdentityBinding.findUnique({
            where: { identityHash: senderIdentityHash },
            select: { id: true },
          });
          try {
            const event = await prisma.whatsAppInboundEvent.create({
              data: {
                providerMessageId: message.id,
                senderIdentityHash,
                bindingId: binding?.id,
                messageType: message.type,
                encryptedText: message.type === "text" && message.text?.body
                  ? encryptWhatsAppData(message.text.body)
                  : null,
                senderIdentityEncrypted: encryptWhatsAppData(identity),
                purgeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              },
            });
            await processWhatsAppInboundEvent(event.id, message.from);
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
              continue;
            }
            throw error;
          }
        }
      }
    }
    return NextResponse.json({ received: true });
  } catch {
    return new NextResponse("Unavailable", { status: 503 });
  }
}
