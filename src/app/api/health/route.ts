import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Resets on cold start, so cleanup may run more often than every 24h on serverless.
// This is acceptable — the queries are idempotent DELETEs of already-expired rows.
let lastCleanupRun = 0;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function cleanupExpiredTokens() {
  const now = new Date();
  try {
    await Promise.all([
      prisma.session.deleteMany({ where: { expires: { lt: now } } }),
      prisma.verificationToken.deleteMany({ where: { expires: { lt: now } } }),
      prisma.emailVerificationToken.deleteMany({ where: { expires: { lt: now } } }),
      prisma.passwordResetToken.deleteMany({ where: { expires: { lt: now } } }),
      prisma.adminSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);
    lastCleanupRun = Date.now();
  } catch (error) {
    console.error("Token cleanup error:", error);
  }
}

export async function GET() {
  const checks = {
    api: "ok",
    database: "unknown",
    timestamp: new Date().toISOString(),
  };

  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";

    // Run expired token cleanup if last run > 24h ago
    if (Date.now() - lastCleanupRun > CLEANUP_INTERVAL_MS) {
      cleanupExpiredTokens().catch((err) => console.error("Token cleanup error:", err));
    }
  } catch (error) {
    console.error("Health check database error:", error);
    checks.database = "error";
  }

  const allOk = checks.database === "ok";

  return NextResponse.json(checks, { status: allOk ? 200 : 500 });
}
