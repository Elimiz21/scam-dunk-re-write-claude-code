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
 * 3. Set INBOUND_EMAIL_WEBHOOK_SECRET in your environment
 * 4. Add the webhook URL in Resend: https://yourdomain.com/api/inbound-email
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  sendSupportTicketNotification,
  sendSupportTicketConfirmation,
} from '@/lib/email';
import { rateLimit, rateLimitExceededResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const WEBHOOK_SECRET = process.env.INBOUND_EMAIL_WEBHOOK_SECRET || '';

// Category detection keywords
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  BUG_REPORT: ['bug', 'broken', 'error', 'crash', 'not working', 'issue', 'glitch', 'fails'],
  BILLING: ['billing', 'payment', 'charge', 'invoice', 'subscription', 'refund', 'cancel'],
  FEATURE_REQUEST: ['feature', 'suggestion', 'would be nice', 'wish', 'request', 'add', 'improve'],
  FEEDBACK: ['feedback', 'love', 'great', 'amazing', 'thank', 'appreciate', 'thoughts'],
};

function detectCategory(subject: string, body: string): string {
  const text = `${subject} ${body}`.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      return category;
    }
  }
  return 'SUPPORT';
}

function extractName(fromHeader: string): string {
  // Try to extract name from "Name <email>" format
  const match = fromHeader.match(/^([^<]+)\s*</);
  if (match) return match[1].trim().replace(/"/g, '');
  // Fall back to email username
  const emailMatch = fromHeader.match(/([^@]+)@/);
  if (emailMatch) return emailMatch[1].replace(/[._-]/g, ' ');
  return 'Email User';
}

function extractEmail(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  // Maybe it's just a plain email
  if (fromHeader.includes('@')) return fromHeader.trim();
  return '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: auth for inbound email webhook (10 requests per minute)
    const { success: rateLimitSuccess, headers: rateLimitHeaders } = await rateLimit(request, "auth");
    if (!rateLimitSuccess) {
      return rateLimitExceededResponse(rateLimitHeaders);
    }

    // Verify webhook secret if configured
    if (WEBHOOK_SECRET) {
      const authHeader = request.headers.get('authorization');
      const webhookHeader = request.headers.get('x-webhook-secret');
      const token = authHeader?.replace('Bearer ', '') || webhookHeader || '';

      if (token !== WEBHOOK_SECRET) {
        console.error('[INBOUND EMAIL] Invalid webhook secret');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json();

    // Support multiple webhook formats:
    // 1. Resend inbound: { from, to, subject, text, html }
    // 2. Generic/forwarded: { from, subject, body/text/html }
    const from = body.from || body.sender || '';
    const subject = body.subject || '(No subject)';
    const textBody = body.text || body.body || '';
    const htmlBody = body.html || '';
    const message = textBody || stripHtml(htmlBody);

    if (!from) {
      return NextResponse.json(
        { error: 'Missing required field: from' },
        { status: 400 }
      );
    }

    const senderEmail = extractEmail(from);
    const senderName = extractName(from);

    if (!senderEmail) {
      return NextResponse.json(
        { error: 'Could not extract email address from sender' },
        { status: 400 }
      );
    }

    if (!message || message.length < 5) {
      return NextResponse.json(
        { error: 'Email body is empty or too short' },
        { status: 400 }
      );
    }

    // Auto-detect category from content
    const category = detectCategory(subject, message);

    // Auto-assign priority
    let priority = 'NORMAL';
    if (category === 'BUG_REPORT' || category === 'BILLING') {
      priority = 'HIGH';
    }

    // Create the support ticket
    const ticket = await prisma.supportTicket.create({
      data: {
        name: senderName,
        email: senderEmail,
        subject: subject.substring(0, 200),
        message: message.substring(0, 5000),
        category,
        priority,
        status: 'NEW',
        ipAddress: 'inbound-email',
        userAgent: 'Inbound Email Webhook',
        lastActivityAt: new Date(),
      },
    });

    // Route notifications through the email routing system
    try {
      await sendSupportTicketNotification(
        ticket.id,
        senderName,
        senderEmail,
        subject,
        message.substring(0, 2000),
        category
      );

      await sendSupportTicketConfirmation(
        ticket.id,
        senderName,
        senderEmail,
        subject,
        category
      );
    } catch (emailError) {
      console.error('[INBOUND EMAIL] Failed to send notification emails:', emailError);
    }

    console.log(`[INBOUND EMAIL] Created ticket ${ticket.id} from ${senderEmail} (category: ${category})`);

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      category,
      priority,
    }, { status: 201 });
  } catch (error) {
    console.error('[INBOUND EMAIL] Webhook error:', error);
    return NextResponse.json(
      { error: 'Failed to process inbound email' },
      { status: 500 }
    );
  }
}
