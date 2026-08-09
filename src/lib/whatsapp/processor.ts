import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { decryptWhatsAppData, encryptWhatsAppData } from "./crypto";
import { resolveWhatsAppScanEntitlement } from "./entitlement";
import { WHATSAPP_INVALID_INPUT_REPLY, parseWhatsAppStockScan } from "./parser";
import { sendWhatsAppTextReply } from "./provider";
import { runAuthorizedStockScan } from "./scan";

const UNBOUND_REPLY =
  "This WhatsApp number is not eligible for ScamDunk scans. Manage WhatsApp access from your ScamDunk account.";
const ENTITLEMENT_REPLY =
  "WhatsApp scans require an active ScamDunk subscription. Manage your subscription in your ScamDunk account.";
const QUOTA_REPLY =
  "Your ScamDunk scan limit has been reached for this month. Manage your plan in your ScamDunk account.";
const RATE_LIMIT_REPLY = "Too many scan requests. Please try again later.";
const UNAVAILABLE_REPLY = "ScamDunk is temporarily unavailable. Please try again later.";
const FAILED_SCAN_REPLY = "ScamDunk could not complete that scan. Please try again later.";

function rateLimitRequest(identifier: string): NextRequest {
  return new NextRequest("http://internal/whatsapp-rate-limit", {
    headers: { "x-real-ip": identifier },
  });
}

async function isAllowed(identityHash: string, userId: string): Promise<boolean> {
  try {
    const [hourly, daily, global] = await Promise.all([
      rateLimit(rateLimitRequest(`whatsapp-identity:${identityHash}`), "whatsappHourly"),
      rateLimit(rateLimitRequest(`whatsapp-user:${userId}`), "whatsappDaily"),
      rateLimit(rateLimitRequest("whatsapp-global"), "whatsappGlobal"),
    ]);
    return hourly.success && daily.success && global.success;
  } catch {
    return false;
  }
}

function conciseResult(ticker: string, riskLevel: string, header: string): string {
  const summary = header.replace(/\s+/g, " ").trim().slice(0, 360);
  return `ScamDunk scan: ${ticker} — ${riskLevel}. ${summary} This is risk-signal analysis, not investment advice.`;
}

async function respond(
  eventId: string,
  recipientWaId: string,
  body: string,
  status: string,
  reasonCode: string,
): Promise<void> {
  let replyPersisted = false;
  try {
    // Persist the exact response before network delivery. A retry can then
    // resend the reply without ever running another scan or consuming quota.
    await prisma.whatsAppInboundEvent.update({
      where: { id: eventId },
      data: { status: "SENDING", reasonCode, encryptedReply: encryptWhatsAppData(body) },
    });
    replyPersisted = true;
    const providerReplyMessageId = await sendWhatsAppTextReply(recipientWaId, body);
    await prisma.whatsAppInboundEvent.update({
      where: { id: eventId },
      data: {
        status,
        reasonCode,
        encryptedReply: encryptWhatsAppData(body),
        providerReplyMessageId,
        processedAt: new Date(),
      },
    });
  } catch {
    await prisma.whatsAppInboundEvent.update({
      where: { id: eventId },
      data: replyPersisted
        ? { status: "RETRY", reasonCode: "PROVIDER_UNAVAILABLE", attemptCount: { increment: 1 } }
        : { status: "FAILED", reasonCode: "REPLY_PERSIST_FAILED" },
    });
  }
}

/** Process one previously deduplicated provider event. Raw input never enters scan history. */
export async function processWhatsAppInboundEvent(
  eventId: string,
  recipientWaId?: string,
): Promise<void> {
  const event = await prisma.whatsAppInboundEvent.findUnique({
    where: { id: eventId },
    include: { binding: true },
  });
  if (!event || !["RECEIVED", "RETRY", "SENDING"].includes(event.status)) return;

  let recipient = recipientWaId;
  if (!recipient && event.senderIdentityEncrypted) {
    try {
      recipient = decryptWhatsAppData(event.senderIdentityEncrypted).slice(1);
    } catch {
      await prisma.whatsAppInboundEvent.update({
        where: { id: eventId },
        data: { status: "FAILED", reasonCode: "IDENTITY_DECRYPT_FAILED" },
      });
      return;
    }
  }
  if (!recipient) return;

  if (event.status === "RETRY" || event.status === "SENDING") {
    if (!event.encryptedReply) return;
    try {
      await respond(eventId, recipient, decryptWhatsAppData(event.encryptedReply), "REPLIED", event.reasonCode || "RETRY");
    } catch {
      // respond records the retry state and attempt count.
    }
    return;
  }

  const claimed = await prisma.whatsAppInboundEvent.updateMany({
    where: { id: eventId, status: "RECEIVED" },
    data: { status: "PROCESSING", attemptCount: { increment: 1 } },
  });
  if (claimed.count !== 1) return;

  if (event.messageType !== "text" || !event.encryptedText) {
    await respond(eventId, recipient, WHATSAPP_INVALID_INPUT_REPLY, "REPLIED", "INVALID_INPUT");
    return;
  }
  if (!event.binding?.active || event.binding.revokedAt) {
    await respond(eventId, recipient, UNBOUND_REPLY, "REPLIED", "UNBOUND");
    return;
  }
  const entitlement = await resolveWhatsAppScanEntitlement(event.binding.userId, event.senderIdentityHash);
  if (entitlement.allowed === false) {
    await respond(eventId, recipient, ENTITLEMENT_REPLY, "REPLIED", entitlement.reason);
    return;
  }
  if (!(await isAllowed(event.senderIdentityHash, event.binding.userId))) {
    await respond(eventId, recipient, RATE_LIMIT_REPLY, "REPLIED", "RATE_LIMITED");
    return;
  }

  let text: string;
  try {
    text = decryptWhatsAppData(event.encryptedText);
  } catch {
    await respond(eventId, recipient, UNAVAILABLE_REPLY, "FAILED", "DECRYPT_FAILED");
    return;
  }
  const parsed = parseWhatsAppStockScan(text);
  if (parsed.ok === false) {
    await respond(eventId, recipient, parsed.reply, "REPLIED", "INVALID_INPUT");
    return;
  }

  await prisma.whatsAppInboundEvent.update({
    where: { id: eventId },
    data: { status: "SCANNING" },
  });

  const scan = await runAuthorizedStockScan({
    userId: event.binding.userId,
    ticker: parsed.ticker,
    assetType: "stock",
  });
  if (!scan.ok) {
    const body = scan.body as { error?: string };
    if (scan.status === 429 && body.error === "LIMIT_REACHED") {
      await respond(eventId, recipient, QUOTA_REPLY, "REPLIED", "QUOTA_EXHAUSTED");
    } else if (scan.status >= 500) {
      await respond(eventId, recipient, FAILED_SCAN_REPLY, "FAILED", "SCAN_FAILED");
    } else {
      await respond(eventId, recipient, UNAVAILABLE_REPLY, "FAILED", "SCAN_UNAVAILABLE");
    }
    return;
  }
  await respond(
    eventId,
    recipient,
    conciseResult(parsed.ticker, scan.body.riskLevel, scan.body.narrative.header),
    "REPLIED",
    "SCAN_COMPLETED",
  );
}
