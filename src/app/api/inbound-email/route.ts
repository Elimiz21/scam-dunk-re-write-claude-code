/**
 * Inbound Email Webhook
 *
 * Receives emails forwarded by Resend (or other email services) to
 * support@scamdunk.com and automatically creates support tickets
 * routed through the email routing system.
 *
 * Setup:
 * 1. Add your domain to Resend: https://resend.com/domains
 * 2. Configure an MX record to route support@scamdunk.com to Resend inbound
 * 3. Set RESEND_INBOUND_WEBHOOK_SECRET to the existing Resend signing secret
 *    (INBOUND_EMAIL_WEBHOOK_SECRET remains supported for legacy forwarding)
 * 4. Add the webhook URL in Resend: https://yourdomain.com/api/inbound-email
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import {
  sendSupportTicketNotification,
  sendSupportTicketConfirmation,
} from "@/lib/email";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.INBOUND_EMAIL_WEBHOOK_SECRET || "";

// Category detection keywords
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  BUG_REPORT: [
    "bug",
    "broken",
    "error",
    "crash",
    "not working",
    "issue",
    "glitch",
    "fails",
  ],
  BILLING: [
    "billing",
    "payment",
    "charge",
    "invoice",
    "subscription",
    "refund",
    "cancel",
  ],
  FEATURE_REQUEST: [
    "feature",
    "suggestion",
    "would be nice",
    "wish",
    "request",
    "add",
    "improve",
  ],
  FEEDBACK: [
    "feedback",
    "love",
    "great",
    "amazing",
    "thank",
    "appreciate",
    "thoughts",
  ],
};

function detectCategory(subject: string, body: string): string {
  const text = `${subject} ${body}`.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      return category;
    }
  }
  return "SUPPORT";
}

function extractName(fromHeader: string): string {
  // Try to extract name from "Name <email>" format
  const match = fromHeader.match(/^([^<]+)\s*</);
  if (match) return match[1].trim().replace(/"/g, "");
  // Fall back to email username
  const emailMatch = fromHeader.match(/([^@]+)@/);
  if (emailMatch) return emailMatch[1].replace(/[._-]/g, " ");
  return "Email User";
}

function extractEmail(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  // Maybe it's just a plain email
  if (fromHeader.includes("@")) return fromHeader.trim();
  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: auth for inbound email webhook (10 requests per minute)
    const { success: rateLimitSuccess, headers: rateLimitHeaders } =
      await rateLimit(request, "auth");
    if (!rateLimitSuccess) {
      return rateLimitExceededResponse(rateLimitHeaders);
    }

    const rawBody = await request.text();
    const hasResendSignature = request.headers.has("svix-signature");
    let body;
    if (hasResendSignature) {
      const signingSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
      if (!signingSecret || !process.env.RESEND_API_KEY) {
        return NextResponse.json({ error: "Inbound signing is not configured" }, { status: 503 });
      }
      const resend = new Resend(process.env.RESEND_API_KEY);
      let event;
      try {
        event = resend.webhooks.verify({
          payload: rawBody,
          headers: {
            id: request.headers.get("svix-id") || "",
            timestamp: request.headers.get("svix-timestamp") || "",
            signature: request.headers.get("svix-signature") || "",
          },
          webhookSecret: signingSecret,
        });
      } catch {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
      if (event.type !== "email.received") {
        return NextResponse.json({ success: true, ignored: true });
      }
      const received = await resend.emails.receiving.get(event.data.email_id);
      if (received.error || !received.data) {
        return NextResponse.json({ error: "Unable to retrieve incoming email" }, { status: 503 });
      }
      body = { ...received.data, inboundId: event.data.email_id };
      const allowedInboxes = [
        process.env.SUPPORT_REPLY_EMAIL || "support@inbound.scamdunk.com",
        process.env.SUPPORT_EMAIL || "support@scamdunk.com",
      ].map((email) => email.toLowerCase());
      if (!body.to.some((email: string) => allowedInboxes.includes(extractEmail(email).toLowerCase()))) {
        return NextResponse.json({ success: true, ignored: true });
      }
    } else {
      // Keep the existing authenticated forwarding integration compatible.
      if (!WEBHOOK_SECRET) {
        console.error(
          "[INBOUND EMAIL] INBOUND_EMAIL_WEBHOOK_SECRET not configured",
        );
        return NextResponse.json(
          { error: "Webhook not configured" },
          { status: 503 },
        );
      }

      const authHeader = request.headers.get("authorization");
      const webhookHeader = request.headers.get("x-webhook-secret");
      const token = authHeader?.replace("Bearer ", "") || webhookHeader || "";

      const tokenBuf = Buffer.from(token);
      const secretBuf = Buffer.from(WEBHOOK_SECRET);
      if (
        tokenBuf.length !== secretBuf.length ||
        !crypto.timingSafeEqual(tokenBuf, secretBuf)
      ) {
        console.error("[INBOUND EMAIL] Invalid webhook secret");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      body = JSON.parse(rawBody);
    }

    // Support multiple webhook formats:
    // 1. Verified Resend email retrieved via the Receiving API
    // 2. Generic/forwarded: { from, subject, body/text/html }
    const from = body.from || body.sender || "";
    const subject = body.subject || "(No subject)";
    const textBody = body.text || body.body || "";
    const htmlBody = body.html || "";
    const message = textBody || stripHtml(htmlBody);

    if (!from) {
      return NextResponse.json(
        { error: "Missing required field: from" },
        { status: 400 },
      );
    }

    const senderEmail = extractEmail(from).toLowerCase();
    const senderName = extractName(from);

    if (!senderEmail) {
      return NextResponse.json(
        { error: "Could not extract email address from sender" },
        { status: 400 },
      );
    }

    if (!message || message.length < 5) {
      return NextResponse.json(
        { error: "Email body is empty or too short" },
        { status: 400 },
      );
    }

    // A ticket reference is only honored for its original sender. Older
    // support emails did not include references, so match reply subjects for
    // the same sender as a backwards-compatible fallback.
    const ticketReference = subject.match(/\[Ticket ([a-zA-Z0-9_-]+)\]/i)?.[1];
    const originalSubject = subject.replace(/^(?:(?:re|fw|fwd):\s*)+/i, "").trim();
    const existingTicket = ticketReference
      ? await prisma.supportTicket.findFirst({ where: { id: ticketReference, email: { equals: senderEmail, mode: "insensitive" } } })
      : /^re:/i.test(subject)
        ? await prisma.supportTicket.findFirst({
          where: { email: { equals: senderEmail, mode: "insensitive" }, subject: originalSubject },
          orderBy: { lastActivityAt: "desc" },
        })
        : null;
    // Deterministic IDs make provider retries safe without a schema migration.
    const inboundId = body.inboundId || body.message_id;
    const recordId = typeof inboundId === "string"
      ? `inbound-${crypto.createHash("sha256").update(inboundId).digest("hex")}`
      : undefined;

    if (existingTicket) {
      try {
        await prisma.$transaction(async (transaction) => {
          await transaction.supportTicketResponse.create({ data: {
            ...(recordId ? { id: recordId } : {}),
            ticketId: existingTicket.id,
            message: message.substring(0, 5000),
            isFromAdmin: false,
            responderName: senderName,
            responderEmail: senderEmail,
          } });
          await transaction.supportTicket.update({ where: { id: existingTicket.id }, data: {
            status: "OPEN", resolvedAt: null, closedAt: null, lastActivityAt: new Date(),
          } });
        });
      } catch (error) {
        if (recordId && (error as { code?: string }).code === "P2002") {
          return NextResponse.json({ success: true, ticketId: existingTicket.id, duplicate: true });
        }
        throw error;
      }
      await sendSupportTicketNotification(existingTicket.id, senderName, senderEmail, existingTicket.subject, message.substring(0, 2000), existingTicket.category, "reply");
      return NextResponse.json({ success: true, ticketId: existingTicket.id, isReply: true });
    }

    // Auto-detect category from content
    const category = detectCategory(subject, message);

    // Auto-assign priority
    let priority = "NORMAL";
    if (category === "BUG_REPORT" || category === "BILLING") {
      priority = "HIGH";
    }

    // Create the support ticket
    let ticket;
    try {
      ticket = await prisma.supportTicket.create({
        data: {
          ...(recordId ? { id: recordId } : {}),
          name: senderName,
          email: senderEmail,
          subject: subject.substring(0, 200),
          message: message.substring(0, 5000),
          category,
          priority,
          status: "NEW",
          ipAddress: "inbound-email",
          userAgent: "Inbound Email Webhook",
          lastActivityAt: new Date(),
        },
      });
    } catch (error) {
      if (recordId && (error as { code?: string }).code === "P2002") {
        return NextResponse.json({ success: true, ticketId: recordId, duplicate: true });
      }
      throw error;
    }

    // Route notifications through the email routing system
    try {
      await sendSupportTicketNotification(
        ticket.id,
        senderName,
        senderEmail,
        subject,
        message.substring(0, 2000),
        category,
      );

      await sendSupportTicketConfirmation(
        ticket.id,
        senderName,
        senderEmail,
        subject,
        category,
      );
    } catch (emailError) {
      console.error(
        "[INBOUND EMAIL] Failed to send notification emails:",
        emailError,
      );
    }

    console.log(
      `[INBOUND EMAIL] Created ticket ${ticket.id} from ${senderEmail} (category: ${category})`,
    );

    return NextResponse.json(
      {
        success: true,
        ticketId: ticket.id,
        category,
        priority,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[INBOUND EMAIL] Webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process inbound email" },
      { status: 500 },
    );
  }
}
