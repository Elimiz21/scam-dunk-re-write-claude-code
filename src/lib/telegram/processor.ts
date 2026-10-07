import { confirmTelegramBinding } from "./binding";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { decryptTelegramData, encryptTelegramData } from "./crypto";
import { resolveTelegramScanEntitlement } from "./entitlement";
import { WHATSAPP_INVALID_INPUT_REPLY, parseWhatsAppStockScan } from "@/lib/whatsapp/parser";
import { sendTelegramTextReply } from "./provider";
import { runAuthorizedStockScan } from "@/lib/check-scan";

const UNBOUND_REPLY =
  "This Telegram number is not eligible for ScamDunk scans. Manage Telegram access from your ScamDunk account.";
const ENTITLEMENT_REPLY =
  "Telegram scans require an active ScamDunk subscription. Manage your subscription in your ScamDunk account.";
const QUOTA_REPLY =
  "Your ScamDunk scan limit has been reached for this month. Manage your plan in your ScamDunk account.";
const RATE_LIMIT_REPLY = "Too many scan requests. Please try again later.";
const UNAVAILABLE_REPLY = "ScamDunk is temporarily unavailable. Please try again later.";
const FAILED_SCAN_REPLY = "ScamDunk could not complete that scan. Please try again later.";

function rateLimitRequest(identifier: string): NextRequest {
  return new NextRequest("http://internal/telegram-rate-limit", {
    headers: { "x-real-ip": identifier },
  });
}

async function isAllowed(identityHash: string, userId: string): Promise<boolean> {
  try {
    const [hourly, daily, global] = await Promise.all([
      rateLimit(rateLimitRequest(`telegram-identity:${identityHash}`), "whatsappHourly"),
      rateLimit(rateLimitRequest(`telegram-user:${userId}`), "whatsappDaily"),
      rateLimit(rateLimitRequest("telegram-global"), "whatsappGlobal"),
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
    await prisma.telegramInboundEvent.update({
      where: { id: eventId },
      data: { status: "DELIVERING", reasonCode, encryptedReply: encryptTelegramData(body) },
    });
    replyPersisted = true;
    const providerReplyMessageId = await sendTelegramTextReply(recipientWaId, body);
    await prisma.telegramInboundEvent.update({
      where: { id: eventId },
      data: {
        status,
        reasonCode,
        encryptedReply: encryptTelegramData(body),
        providerReplyMessageId,
        processedAt: new Date(),
      },
    });
  } catch {
    await prisma.telegramInboundEvent.update({
      where: { id: eventId },
      data: replyPersisted
        ? { status: "RETRY", reasonCode: "PROVIDER_UNAVAILABLE", attemptCount: { increment: 1 } }
        : { status: "FAILED", reasonCode: "REPLY_PERSIST_FAILED" },
    });
  }
}

/** Process one previously deduplicated provider event. Raw input never enters scan history. */
export async function processTelegramInboundEvent(
  eventId: string,
  recipientWaId?: string,
): Promise<void> {
  const event = await prisma.telegramInboundEvent.findUnique({
    where: { id: eventId },
    include: { binding: true },
  });
  if (!event || !["RECEIVED", "RETRY", "SENDING"].includes(event.status)) return;

  let recipient = recipientWaId;
  if (!recipient && event.senderIdentityEncrypted) {
    try {
      recipient = decryptTelegramData(event.senderIdentityEncrypted);
    } catch {
      await prisma.telegramInboundEvent.update({
        where: { id: eventId },
        data: { status: "FAILED", reasonCode: "IDENTITY_DECRYPT_FAILED" },
      });
      return;
    }
  }
  if (!recipient) return;

  if (event.status === "RETRY" || event.status === "SENDING") {
    if (!event.encryptedReply) return;
    const deliveryClaim = await prisma.telegramInboundEvent.updateMany({
      where: { id: eventId, status: event.status, updatedAt: event.updatedAt },
      data: { status: "DELIVERING" },
    });
    if (deliveryClaim.count !== 1) return;
    try {
      await respond(eventId, recipient, decryptTelegramData(event.encryptedReply), "REPLIED", event.reasonCode || "RETRY");
    } catch {
      // respond records the retry state and attempt count.
    }
    return;
  }

  const claimed = await prisma.telegramInboundEvent.updateMany({
    where: { id: eventId, status: "RECEIVED" },
    data: { status: "PROCESSING", attemptCount: { increment: 1 } },
  });
  if (claimed.count !== 1) return;

  if (event.messageType !== "text" || !event.encryptedText) {
    await respond(eventId, recipient, WHATSAPP_INVALID_INPUT_REPLY, "REPLIED", "INVALID_INPUT");
    return;
  }
  let input: string;
  try { input = decryptTelegramData(event.encryptedText); }
  catch {
    await respond(eventId, recipient, UNAVAILABLE_REPLY, "FAILED", "DECRYPT_FAILED");
    return;
  }
  if (input.startsWith("/start ")) {
    const linked = await confirmTelegramBinding(input.slice(7).trim(), recipient);
    await prisma.telegramInboundEvent.update({ where: { id: eventId }, data: { encryptedText: null } });
    await respond(eventId, recipient, linked
      ? "Telegram linked to ScamDunk. Send AAPL or scan AAPL to scan a stock using your monthly allowance."
      : "This link is expired or unavailable. Generate a new Telegram link from your ScamDunk account.", "REPLIED", linked ? "LINKED" : "LINK_FAILED");
    return;
  }
  if (input === "/start" || input === "/help") {
    await respond(eventId, recipient, "Link Telegram from your ScamDunk account, then send AAPL or scan AAPL. Scans require an active subscription and use your monthly allowance.", "REPLIED", "HELP");
    return;
  }
  if (!event.binding?.active || event.binding.revokedAt) {
    await respond(eventId, recipient, UNBOUND_REPLY, "REPLIED", "UNBOUND");
    return;
  }
  const entitlement = await resolveTelegramScanEntitlement(event.binding.userId, event.senderIdentityHash);
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
    text = decryptTelegramData(event.encryptedText);
  } catch {
    await respond(eventId, recipient, UNAVAILABLE_REPLY, "FAILED", "DECRYPT_FAILED");
    return;
  }
  const parsed = parseWhatsAppStockScan(text);
  if (parsed.ok === false) {
    await respond(eventId, recipient, parsed.reply, "REPLIED", "INVALID_INPUT");
    return;
  }

  await prisma.telegramInboundEvent.update({
    where: { id: eventId },
    data: { status: "SCANNING" },
  });

  // Full scans can take tens of seconds. Acknowledge immediately so the chat
  // does not appear stalled; the final verdict remains the persisted reply.
  try {
    await sendTelegramTextReply(recipient, `Scanning ${parsed.ticker}… I'll reply here when it's ready.`);
  } catch {
    // A failed progress message must not prevent the final verdict.
  }

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
