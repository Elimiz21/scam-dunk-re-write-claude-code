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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const verbose = searchParams.get("verbose") === "true";

  const checks: Record<string, unknown> = {
    api: "ok",
    database: "unknown",
    timestamp: new Date().toISOString(),
  };

  // In verbose mode, report which critical env vars are set (not their values)
  if (verbose) {
    checks.env = {
      DATABASE_URL: !!process.env.DATABASE_URL,
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      AUTH_SECRET: !!process.env.AUTH_SECRET,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || "(not set)",
      RATE_LIMIT: "PostgreSQL (via Prisma)",
    };
  }

  try {
    // Test database connection with a timeout
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;
    checks.database = "ok";
    if (verbose) {
      checks.databaseLatencyMs = dbLatency;
    }

    // Run expired token cleanup if last run > 24h ago
    if (Date.now() - lastCleanupRun > CLEANUP_INTERVAL_MS) {
      cleanupExpiredTokens().catch((err) => console.error("Token cleanup error:", err));
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Health check database error:", errorMsg);
    checks.database = "error";
    if (verbose) {
      checks.databaseError = errorMsg;

      // Diagnose common failure modes
      const isTimeout = errorMsg.includes("timed out") || errorMsg.includes("ETIMEDOUT");
      const isRefused = errorMsg.includes("ECONNREFUSED") || errorMsg.includes("Connection refused");
      const isPaused = errorMsg.includes("Project is paused") || errorMsg.includes("too many clients");
      const isDns = errorMsg.includes("ENOTFOUND") || errorMsg.includes("getaddrinfo");

      if (isPaused) checks.databaseHint = "Database appears paused — restore it in Supabase dashboard";
      else if (isTimeout) checks.databaseHint = "Connection timed out — database may be paused or unreachable";
      else if (isRefused) checks.databaseHint = "Connection refused — check DATABASE_URL and server status";
      else if (isDns) checks.databaseHint = "Hostname not found — DATABASE_URL may be incorrect";
      else checks.databaseHint = "Unexpected error — check DATABASE_URL in Vercel environment variables";
    }
  }

  const allOk = checks.database === "ok";

  return NextResponse.json(checks, { status: allOk ? 200 : 500 });
}
