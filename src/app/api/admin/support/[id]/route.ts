/**
 * Admin Support Ticket Detail API - View and respond to individual tickets
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, hasRole } from '@/lib/admin/auth';
import { prisma } from '@/lib/db';
import { sendSupportTicketResponse } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ticketId = params.id;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        responses: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Get assigned admin info if exists
    let assignedAdmin = null;
    if (ticket.assignedTo) {
      const admin = await prisma.adminUser.findUnique({
        where: { id: ticket.assignedTo },
        select: { id: true, name: true, email: true },
      });
      assignedAdmin = admin;
    }

    return NextResponse.json({
      ticket: {
        ...ticket,
        assignedAdmin,
      },
    });
  } catch (error) {
    console.error('Get support ticket error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch support ticket' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasRole(session, ['OWNER', 'ADMIN'])) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const ticketId = params.id;
    const body = await request.json();
    const { message, sendEmail = true } = body;

    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return NextResponse.json(
        { error: 'Response message must be at least 10 characters' },
        { status: 400 }
      );
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Create the response
    const response = await prisma.supportTicketResponse.create({
      data: {
        ticketId,
        message: message.trim(),
        isFromAdmin: true,
        responderId: session.id,
        responderName: session.name || session.email,
        responderEmail: session.email,
        emailSent: false,
      },
    });

    // Update ticket status and last activity
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: ticket.status === 'NEW' ? 'OPEN' : ticket.status,
        lastActivityAt: new Date(),
        assignedTo: ticket.assignedTo || session.id,
      },
    });

    // Send email to user if requested
    let emailSent = false;
    if (sendEmail) {
      try {
        emailSent = await sendSupportTicketResponse(
          ticketId,
          ticket.name,
          ticket.email,
          ticket.subject,
          message.trim(),
          session.name || 'Support Team'
        );

        // Update response with email status
        await prisma.supportTicketResponse.update({
          where: { id: response.id },
          data: { emailSent },
        });
      } catch (emailError) {
        console.error('Failed to send support response email:', emailError);
      }
    }

    // Log the admin action
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: 'SUPPORT_TICKET_RESPOND',
        resource: ticketId,
        details: JSON.stringify({
          ticketSubject: ticket.subject,
          userEmail: ticket.email,
          emailSent,
          responseLength: message.length,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: emailSent ? 'Response sent and email delivered' : 'Response saved (email not sent)',
      response: {
        id: response.id,
        message: response.message,
        createdAt: response.createdAt,
        emailSent,
      },
    });
  } catch (error) {
    console.error('Send support ticket response error:', error);
    return NextResponse.json(
      { error: 'Failed to send response' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasRole(session, ['OWNER'])) {
      return NextResponse.json({ error: 'Only owners can delete tickets' }, { status: 403 });
    }

    const ticketId = params.id;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Delete ticket (responses will cascade delete)
    await prisma.supportTicket.delete({
      where: { id: ticketId },
    });

    // Log the admin action
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: 'SUPPORT_TICKET_DELETE',
        resource: ticketId,
        details: JSON.stringify({
          ticketSubject: ticket.subject,
          userEmail: ticket.email,
          category: ticket.category,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Ticket deleted successfully',
    });
  } catch (error) {
    console.error('Delete support ticket error:', error);
    return NextResponse.json(
      { error: 'Failed to delete ticket' },
      { status: 500 }
    );
  }
}
