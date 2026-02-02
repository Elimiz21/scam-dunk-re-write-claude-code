/**
 * Admin Password Reset Script
 * Resets the admin password for the specified email
 *
 * Usage: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed/reset-admin-password.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "elimizroch@gmail.com";
const NEW_PASSWORD = "AdminPassword123!";

async function main() {
  console.log(`Resetting password for ${ADMIN_EMAIL}...`);

  const admin = await prisma.adminUser.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (!admin) {
    console.error("Admin user not found!");
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 12);

  await prisma.adminUser.update({
    where: { email: ADMIN_EMAIL },
    data: { hashedPassword },
  });

  console.log("Password reset successfully!");
  console.log(`\nLogin credentials:`);
  console.log(`  Email: ${ADMIN_EMAIL}`);
  console.log(`  Password: ${NEW_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error("Reset error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
