/**
 * Admin Email Management API
 *
 * GET - Fetch email config, recipients, and recent logs
 * POST - Send test email or custom email
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession, hasRole } from '@/lib/admin/auth';
import { prisma } from '@/lib/db';
import { validateEmailConfig, sendTestEmail, sendCustomEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

/** Safely query emailLog - returns fallback if table doesn't exist or any DB error occurs */
async function safeEmailLogQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    // Check if emailLog exists on the prisma client (may not if schema wasn't regenerated)
    if (!prisma.emailLog) {
      console.warn('[EMAIL MGMT] emailLog model not available on Prisma client - regenerate client');
      return fallback;
    }
    return await fn();
  } catch (error: unknown) {
    // Catch ALL errors from emailLog queries - the table may not exist,
    // the model may not be generated, or the column structure may differ
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[EMAIL MGMT] emailLog query failed (table may not exist yet):', message);
    return fallback;
  }
}

// GET - Full email management overview
export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const section = searchParams.get('section') || 'overview';

    if (section === 'config') {
      const config = validateEmailConfig();
      return NextResponse.json({ config });
    }

    if (section === 'recipients') {
      const recipients = await prisma.supportEmailRecipient.findMany({
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });
      return NextResponse.json({ recipients });
    }

    if (section === 'logs') {
      const page = parseInt(searchParams.get('page') || '1', 10);
      const limit = parseInt(searchParams.get('limit') || '25', 10);
      const emailType = searchParams.get('emailType') || '';
      const status = searchParams.get('status') || '';
      const search = searchParams.get('search') || '';

      const where: Record<string, unknown> = {};
      if (emailType) where.emailType = emailType;
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { recipientEmail: { contains: search, mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [logs, total] = await Promise.all([
        safeEmailLogQuery(
          () => prisma.emailLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
          []
        ),
        safeEmailLogQuery(
          () => prisma.emailLog.count({ where }),
          0
        ),
      ]);

      return NextResponse.json({
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    }

    // Default: overview with everything
    // Each query is individually wrapped so one failure doesn't break the whole page
    const config = validateEmailConfig();

    let recipients: unknown[] = [];
    try {
      recipients = await prisma.supportEmailRecipient.findMany({
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });
    } catch (err) {
      console.error('[EMAIL MGMT] Failed to load recipients:', err);
    }

    const recentLogs = await safeEmailLogQuery(
      () => prisma.emailLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      []
    );

    const logStats = await getEmailLogStats();

    return NextResponse.json({
      config,
      recipients,
      recentLogs,
      logStats,
    });
  } catch (error) {
    console.error('Email management GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email management data' },
      { status: 500 }
    );
  }
}

// POST - Send test or custom email
const sendEmailSchema = z.object({
  action: z.enum(['test', 'compose']),
  to: z.string().email('Invalid email address'),
  subject: z.string().min(1, 'Subject is required').optional(),
  message: z.string().min(1, 'Message is required').optional(),
  replyTo: z.string().email().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasRole(session, ['OWNER', 'ADMIN'])) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const validated = sendEmailSchema.parse(body);

    if (validated.action === 'test') {
      const result = await sendTestEmail(validated.to);

      // Audit log
      await prisma.adminAuditLog.create({
        data: {
          adminUserId: session.id,
          action: 'EMAIL_TEST_SENT',
          resource: validated.to,
          details: JSON.stringify({ success: result.success, message: result.message }),
        },
      });

      return NextResponse.json(result);
    }

    if (validated.action === 'compose') {
      if (!validated.subject || !validated.message) {
        return NextResponse.json(
          { error: 'Subject and message are required for compose' },
          { status: 400 }
        );
      }

      const result = await sendCustomEmail(
        validated.to,
        validated.subject,
        validated.message,
        validated.replyTo
      );

      // Audit log
      await prisma.adminAuditLog.create({
        data: {
          adminUserId: session.id,
          action: 'EMAIL_CUSTOM_SENT',
          resource: validated.to,
          details: JSON.stringify({
            subject: validated.subject,
            success: result.success,
            message: result.message,
          }),
        },
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Email management POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process email request' },
      { status: 500 }
    );
  }
}

async function getEmailLogStats() {
  const defaultStats = {
    total: { sent: 0, failed: 0 },
    last24h: { sent: 0, failed: 0 },
    last7d: { sent: 0, failed: 0 },
  };

  return safeEmailLogQuery(async () => {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalSent,
      totalFailed,
      sent24h,
      failed24h,
      sent7d,
      failed7d,
    ] = await Promise.all([
      prisma.emailLog.count({ where: { status: 'SENT' } }),
      prisma.emailLog.count({ where: { status: 'FAILED' } }),
      prisma.emailLog.count({ where: { status: 'SENT', createdAt: { gte: last24h } } }),
      prisma.emailLog.count({ where: { status: 'FAILED', createdAt: { gte: last24h } } }),
      prisma.emailLog.count({ where: { status: 'SENT', createdAt: { gte: last7d } } }),
      prisma.emailLog.count({ where: { status: 'FAILED', createdAt: { gte: last7d } } }),
    ]);

    return {
      total: { sent: totalSent, failed: totalFailed },
      last24h: { sent: sent24h, failed: failed24h },
      last7d: { sent: sent7d, failed: failed7d },
    };
  }, defaultStats);
}
