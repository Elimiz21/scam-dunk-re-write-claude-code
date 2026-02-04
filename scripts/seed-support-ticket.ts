/**
 * Seed a dummy support ticket for testing
 * Run with: npx tsx scripts/seed-support-ticket.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Creating dummy support ticket...');

  const ticket = await prisma.supportTicket.create({
    data: {
      name: 'Test User',
      email: 'testuser@example.com',
      subject: 'Test Support Ticket - Feature Question',
      message: `Hi ScamDunk Team,

I've been using ScamDunk for a few weeks now and I'm really impressed with the analysis capabilities. I have a couple of questions:

1. How often is the SEC trading suspension list updated?
2. Is there a way to get email alerts when a stock I've previously scanned changes risk level?
3. Do you have plans to add cryptocurrency scanning in the future?

Thanks for building such a useful tool!

Best regards,
Test User`,
      category: 'SUPPORT',
      status: 'NEW',
      priority: 'NORMAL',
      ipAddress: '127.0.0.1',
      userAgent: 'Seed Script',
    },
  });

  console.log('Created support ticket:', ticket.id);

  // Create a response to the ticket
  await prisma.supportTicketResponse.create({
    data: {
      ticketId: ticket.id,
      message: `Hi Test User,

Thank you for your kind words and great questions!

1. The SEC trading suspension list is checked in real-time during each scan against the SEC RSS feed.

2. Email alerts for risk level changes is a great feature idea! We don't currently have this, but we've added it to our roadmap.

3. We're currently focused on US stock markets, but cryptocurrency scanning is something we're evaluating for a future release.

Please let us know if you have any other questions!

Best,
ScamDunk Support Team`,
      isFromAdmin: true,
      responderName: 'Support Team',
      responderEmail: 'support@scamdunk.com',
      emailSent: true,
    },
  });

  console.log('Added sample response to ticket');
  console.log('\nDone! You can now view the ticket in the admin dashboard at /admin/support');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
