import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processWhatsAppInboundEvent } from "@/lib/whatsapp/processor";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !token || expected.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });
  const now = new Date();
  const retryBefore = new Date(now.getTime() - 60_000);
  const scanBefore = new Date(now.getTime() - 5 * 60_000);
  const retryEvents = await prisma.whatsAppInboundEvent.findMany({
    where: {
      OR: [
        { status: "RECEIVED", createdAt: { lte: retryBefore } },
        { status: "RETRY", updatedAt: { lte: retryBefore } },
        { status: "SENDING", updatedAt: { lte: retryBefore } },
      ],
      attemptCount: { lt: 3 },
      purgeAt: { gt: now },
    },
    select: { id: true },
    take: 25,
    orderBy: { updatedAt: "asc" },
  });
  for (const event of retryEvents) await processWhatsAppInboundEvent(event.id);
  const deadLettered = await prisma.whatsAppInboundEvent.updateMany({
    where: {
      OR: [
        { status: "RETRY", attemptCount: { gte: 3 } },
        { status: "PROCESSING", updatedAt: { lte: scanBefore } },
        { status: "SCANNING", updatedAt: { lte: scanBefore } },
      ],
    },
    data: { status: "FAILED", reasonCode: "RETRY_EXHAUSTED" },
  });
  const purged = await prisma.whatsAppInboundEvent.updateMany({
    where: { purgeAt: { lte: now } },
    data: { encryptedText: null, encryptedReply: null, senderIdentityEncrypted: null },
  });
  return NextResponse.json({ retried: retryEvents.length, deadLettered: deadLettered.count, purged: purged.count });
}
