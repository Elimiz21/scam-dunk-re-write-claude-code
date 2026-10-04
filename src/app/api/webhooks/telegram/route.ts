import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encryptTelegramData } from "@/lib/telegram/crypto";
import { isTelegramConfigured } from "@/lib/telegram/provider";
import { hashTelegramIdentity, verifyTelegramWebhookSecret } from "@/lib/telegram/security";
import { processTelegramInboundEvent } from "@/lib/telegram/processor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const id = z.number().int().positive().safe();
const payload = z.object({ update_id: z.number().int().nonnegative().safe(), message: z.object({
  message_id: id,
  from: z.object({ id, is_bot: z.boolean() }),
  chat: z.object({ id: z.number().int().safe(), type: z.string() }),
  text: z.string().max(4096).optional(),
}).optional() });

export async function POST(request: NextRequest) {
  if (!isTelegramConfigured()) return new NextResponse("Unavailable", { status: 503 });
  if (!verifyTelegramWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token")))
    return new NextResponse("Unauthorized", { status: 401 });
  const body = await request.text();
  if (Buffer.byteLength(body) > 65536) return new NextResponse("Too large", { status: 413 });
  let data;
  try { data = payload.safeParse(JSON.parse(body)); } catch { return new NextResponse("Bad Request", { status: 400 }); }
  if (!data.success) return new NextResponse("Bad Request", { status: 400 });
  const message = data.data.message;
  // Only private messages from their actual human sender can link or scan.
  if (!message || message.chat.type !== "private" || message.from.is_bot || message.from.id !== message.chat.id)
    return NextResponse.json({ received: true });
  try {
    const identity = String(message.from.id);
    const identityHash = hashTelegramIdentity(identity);
    const binding = await prisma.telegramIdentityBinding.findUnique({ where: { identityHash }, select: { id: true } });
    let event;
    try {
      event = await prisma.telegramInboundEvent.create({ data: {
        providerMessageId: String(data.data.update_id),
        senderIdentityHash: identityHash, bindingId: binding?.id,
        senderIdentityEncrypted: encryptTelegramData(identity),
        encryptedText: message.text ? encryptTelegramData(message.text) : null,
        messageType: message.text ? "text" : "unsupported",
        purgeAt: new Date(Date.now() + 7 * 86400_000),
      } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      event = await prisma.telegramInboundEvent.findUnique({ where: { providerMessageId: String(data.data.update_id) } });
    }
    if (event) await processTelegramInboundEvent(event.id);
    return NextResponse.json({ received: true });
  } catch { return new NextResponse("Unavailable", { status: 503 }); }
}
