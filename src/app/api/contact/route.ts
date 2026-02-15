/**
 * Contact Form API
 *
 * Handles support ticket submissions from the Contact Us page.
 * Stores tickets in the database and sends email notifications.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import {
  sendSupportTicketNotification,
  sendSupportTicketConfirmation,
} from '@/lib/email';
import { rateLimit, rateLimitExceededResponse } from '@/lib/rate-limit';

// Validation schema for contact form
const contactFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name is too long'),
  email: z.string().email('Invalid email address'),
  subject: z.string().min(5, 'Subject must be at least 5 characters').max(200, 'Subject is too long'),
  message: z.string().min(20, 'Message must be at least 20 characters').max(5000, 'Message is too long'),
  category: z.enum(['SUPPORT', 'FEEDBACK', 'BUG_REPORT', 'FEATURE_REQUEST', 'BILLING', 'OTHER']),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit: strict for contact form (5 requests per minute)
    const { success: rateLimitSuccess, headers: rateLimitHeaders } = await rateLimit(request, "strict");
    if (!rateLimitSuccess) {
      return rateLimitExceededResponse(rateLimitHeaders);
    }

    // Get IP address for logging
    const forwarded = request.headers.get('x-forwarded-for');
    const ipAddress = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || undefined;

    // Parse and validate request body
    const body = await request.json();
    const validationResult = contactFormSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return NextResponse.json(
        { error: 'Validation failed', details: errors },
        { status: 400 }
      );
    }

    const { name, email, subject, message, category } = validationResult.data;

    // Check if user is logged in
    let userId: string | null = null;
    try {
      const session = await auth();
      if (session?.user?.id) {
        userId = session.user.id;
      }
    } catch {
      // User not logged in, that's fine
    }

    // Determine initial priority based on category
    let priority = 'NORMAL';
    if (category === 'BUG_REPORT' || category === 'BILLING') {
      priority = 'HIGH';
    }

    // Create the support ticket in the database
    const ticket = await prisma.supportTicket.create({
      data: {
        name,
        email,
        userId,
        subject,
        message,
        category,
        priority,
        status: 'NEW',
        ipAddress,
        userAgent,
        lastActivityAt: new Date(),
      },
    });

    // Send email notifications (don't fail if email fails)
    try {
      // Notify admin of new ticket
      await sendSupportTicketNotification(
        ticket.id,
        name,
        email,
        subject,
        message,
        category
      );

      // Send confirmation to user
      await sendSupportTicketConfirmation(
        ticket.id,
        name,
        email,
        subject,
        category
      );
    } catch (emailError) {
      console.error('Failed to send support emails:', emailError);
      // Don't fail the request if email fails
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Your message has been received. We\'ll get back to you soon!',
        ticketId: ticket.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Contact form submission error:', error);
    return NextResponse.json(
      { error: 'Failed to submit your message. Please try again later.' },
      { status: 500 }
    );
  }
}
