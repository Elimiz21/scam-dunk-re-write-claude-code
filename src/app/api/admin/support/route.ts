/**
 * Admin Support Tickets API - List and manage support tickets
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, hasRole } from '@/lib/admin/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const category = searchParams.get('category') || '';
    const priority = searchParams.get('priority') || '';
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Build where clause
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) {
      where.status = status;
    }
    if (category) {
      where.category = category;
    }
    if (priority) {
      where.priority = priority;
    }

    // Get tickets with their response count
    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          _count: {
            select: { responses: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    // Format tickets
    const formattedTickets = tickets.map((ticket) => ({
      id: ticket.id,
      name: ticket.name,
      email: ticket.email,
      subject: ticket.subject,
      message: ticket.message.substring(0, 200) + (ticket.message.length > 200 ? '...' : ''),
      category: ticket.category,
      status: ticket.status,
      priority: ticket.priority,
      assignedTo: ticket.assignedTo,
      responseCount: ticket._count.responses,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      lastActivityAt: ticket.lastActivityAt,
      resolvedAt: ticket.resolvedAt,
    }));

    // Get summary statistics
    const [
      totalTickets,
      newTickets,
      openTickets,
      inProgressTickets,
      resolvedTickets,
      closedTickets,
      supportTickets,
      feedbackTickets,
      bugReportTickets,
      featureRequestTickets,
    ] = await Promise.all([
      prisma.supportTicket.count(),
      prisma.supportTicket.count({ where: { status: 'NEW' } }),
      prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      prisma.supportTicket.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.supportTicket.count({ where: { status: 'RESOLVED' } }),
      prisma.supportTicket.count({ where: { status: 'CLOSED' } }),
      prisma.supportTicket.count({ where: { category: 'SUPPORT' } }),
      prisma.supportTicket.count({ where: { category: 'FEEDBACK' } }),
      prisma.supportTicket.count({ where: { category: 'BUG_REPORT' } }),
      prisma.supportTicket.count({ where: { category: 'FEATURE_REQUEST' } }),
    ]);

    // Get tickets created in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const ticketsLast7Days = await prisma.supportTicket.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    });

    // Get urgent tickets
    const urgentTickets = await prisma.supportTicket.count({
      where: { priority: 'URGENT', status: { notIn: ['RESOLVED', 'CLOSED'] } },
    });

    return NextResponse.json({
      tickets: formattedTickets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      stats: {
        total: totalTickets,
        new: newTickets,
        open: openTickets,
        inProgress: inProgressTickets,
        resolved: resolvedTickets,
        closed: closedTickets,
        ticketsLast7Days,
        urgentTickets,
        byCategory: {
          support: supportTickets,
          feedback: feedbackTickets,
          bugReport: bugReportTickets,
          featureRequest: featureRequestTickets,
        },
      },
    });
  } catch (error) {
    console.error('Get support tickets error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch support tickets' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasRole(session, ['OWNER', 'ADMIN'])) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { ticketId, action, value } = body;

    if (!ticketId || !action) {
      return NextResponse.json({ error: 'Ticket ID and action required' }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    let updateData: Record<string, unknown> = {};
    let logDetails = '';

    switch (action) {
      case 'updateStatus':
        if (!value || !['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'].includes(value)) {
          return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }
        updateData = {
          status: value,
          lastActivityAt: new Date(),
        };
        if (value === 'RESOLVED') {
          updateData.resolvedAt = new Date();
        }
        if (value === 'CLOSED') {
          updateData.closedAt = new Date();
        }
        logDetails = `Updated ticket status to ${value}`;
        break;

      case 'updatePriority':
        if (!value || !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(value)) {
          return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
        }
        updateData = {
          priority: value,
          lastActivityAt: new Date(),
        };
        logDetails = `Updated ticket priority to ${value}`;
        break;

      case 'assign':
        updateData = {
          assignedTo: value || null,
          status: ticket.status === 'NEW' ? 'OPEN' : ticket.status,
          lastActivityAt: new Date(),
        };
        logDetails = value ? `Assigned ticket to admin ${value}` : 'Unassigned ticket';
        break;

      case 'addNote':
        if (!value || typeof value !== 'string') {
          return NextResponse.json({ error: 'Note content required' }, { status: 400 });
        }
        const existingNotes = ticket.internalNotes || '';
        const timestamp = new Date().toISOString();
        const newNote = `[${timestamp}] ${session.name || session.email}: ${value}`;
        updateData = {
          internalNotes: existingNotes ? `${existingNotes}\n\n${newNote}` : newNote,
          lastActivityAt: new Date(),
        };
        logDetails = 'Added internal note';
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Update ticket
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: updateData,
    });

    // Log the admin action
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: `SUPPORT_TICKET_${action.toUpperCase()}`,
        resource: ticketId,
        details: JSON.stringify({ action, value, ticketSubject: ticket.subject, details: logDetails }),
      },
    });

    return NextResponse.json({ success: true, message: logDetails });
  } catch (error) {
    console.error('Update support ticket error:', error);
    return NextResponse.json(
      { error: 'Failed to update support ticket' },
      { status: 500 }
    );
  }
}
