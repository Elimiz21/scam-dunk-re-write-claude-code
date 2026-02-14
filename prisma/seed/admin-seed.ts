/**
 * Admin Seed Script
 * Creates the initial admin owner and sets up default integrations
 *
 * Usage: npx ts-node prisma/seed/admin-seed.ts
 * Or: npm run db:seed:admin
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Admin owner credentials from environment
const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_SEED_NAME || "Admin Owner";

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error("ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set");
}

// Default integrations to create
const DEFAULT_INTEGRATIONS = [
  {
    name: "OPENAI",
    displayName: "OpenAI",
    category: "API",
    rateLimit: 500,
  },
  {
    name: "ALPHA_VANTAGE",
    displayName: "Alpha Vantage",
    category: "API",
    rateLimit: 5,
  },
  {
    name: "STRIPE",
    displayName: "Stripe",
    category: "PAYMENT",
    rateLimit: 100,
  },
  {
    name: "DATABASE",
    displayName: "PostgreSQL (Supabase)",
    category: "DATABASE",
  },
];

async function main() {
  console.log("Starting admin seed...");

  // Check if admin owner already exists
  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (existingAdmin) {
    console.log("Admin owner already exists, skipping creation.");
  } else {
    // Create admin owner
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    const adminUser = await prisma.adminUser.create({
      data: {
        email: ADMIN_EMAIL,
        hashedPassword,
        name: ADMIN_NAME,
        role: "OWNER",
      },
    });

    console.log(`Created admin owner: ${adminUser.email}`);
  }

  // Create default integrations
  for (const integration of DEFAULT_INTEGRATIONS) {
    const existing = await prisma.integrationConfig.findUnique({
      where: { name: integration.name },
    });

    if (!existing) {
      await prisma.integrationConfig.create({
        data: {
          name: integration.name,
          displayName: integration.displayName,
          category: integration.category,
          rateLimit: integration.rateLimit,
          isEnabled: true,
          status: "UNKNOWN",
        },
      });
      console.log(`Created integration: ${integration.displayName}`);
    }
  }

  // Create default cost alerts
  const existingAlerts = await prisma.apiCostAlert.findMany();
  if (existingAlerts.length === 0) {
    await prisma.apiCostAlert.createMany({
      data: [
        {
          service: "OPENAI",
          alertType: "COST_THRESHOLD",
          threshold: 50, // $50 monthly threshold
          isActive: true,
        },
        {
          service: "ALL",
          alertType: "COST_THRESHOLD",
          threshold: 100, // $100 total monthly threshold
          isActive: true,
        },
      ],
    });
    console.log("Created default cost alerts");
  }

  console.log("\nAdmin seed completed successfully!");
  console.log(`\nAdmin email: ${ADMIN_EMAIL}`);
  console.log(`\nAccess the admin panel at: /admin/login`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
