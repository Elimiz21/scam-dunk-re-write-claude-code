import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getAdminSession } from '@/lib/admin/auth';

const recipientSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().optional(),
  isActive: z.boolean().default(true),
  isPrimary: z.boolean().default(false),
  categories: z.array(z.string()).optional(),
});

// GET - List all email recipients
export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const recipients = await prisma.supportEmailRecipient.findMany({
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return NextResponse.json({ recipients });
  } catch (error) {
    console.error('Get support email recipients error:', error);
    return NextResponse.json({ recipients: [] });
  }
}

// POST - Add a new email recipient
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = recipientSchema.parse(body);

    // If setting as primary, unset other primaries
    if (validated.isPrimary) {
      await prisma.supportEmailRecipient.updateMany({
        where: { isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const recipient = await prisma.supportEmailRecipient.create({
      data: {
        email: validated.email,
        name: validated.name,
        isActive: validated.isActive,
        isPrimary: validated.isPrimary,
        categories: validated.categories ? JSON.stringify(validated.categories) : null,
        createdBy: session.id,
      },
    });

    return NextResponse.json({ recipient }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    // Handle unique constraint violation
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'This email address is already a recipient' },
        { status: 409 }
      );
    }

    console.error('Add support email recipient error:', error);
    return NextResponse.json(
      { error: 'Failed to add recipient' },
      { status: 500 }
    );
  }
}

// PATCH - Update a recipient
export async function PATCH(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Recipient ID required' }, { status: 400 });
    }

    // If setting as primary, unset other primaries
    if (updates.isPrimary) {
      await prisma.supportEmailRecipient.updateMany({
        where: { isPrimary: true, id: { not: id } },
        data: { isPrimary: false },
      });
    }

    const recipient = await prisma.supportEmailRecipient.update({
      where: { id },
      data: {
        ...updates,
        categories: updates.categories ? JSON.stringify(updates.categories) : undefined,
      },
    });

    return NextResponse.json({ recipient });
  } catch (error) {
    console.error('Update support email recipient error:', error);
    return NextResponse.json(
      { error: 'Failed to update recipient' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a recipient
export async function DELETE(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Recipient ID required' }, { status: 400 });
    }

    await prisma.supportEmailRecipient.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete support email recipient error:', error);
    return NextResponse.json(
      { error: 'Failed to delete recipient' },
      { status: 500 }
    );
  }
}
