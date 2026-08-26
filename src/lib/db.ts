import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * In serverless (many concurrent lambdas, each with its own pool), DATABASE_URL
 * MUST point at a connection pooler (e.g. Supabase pgBouncer on :6543) with an
 * explicit small connection_limit — NOT the direct :5432 host. Otherwise the
 * fleet exhausts Postgres connections ("too many clients", see auth.ts).
 * DIRECT_URL is the unpooled host and is used only for migrations.
 *
 * We warn (not throw) in production if the pooler/limit looks misconfigured so
 * a bad URL is visible in logs without taking the app down on boot.
 */
function assertPooledDatabaseUrl(): void {
  if (process.env.NODE_ENV !== "production") return;
  const url = process.env.DATABASE_URL || "";
  const looksPooled =
    url.includes("pgbouncer=true") ||
    url.includes("connection_limit=") ||
    url.includes(":6543") || // Supabase pooler port
    url.includes("-pooler.");
  if (!looksPooled) {
    console.warn(
      "[db] DATABASE_URL does not look like a pooled connection " +
        "(expected pgbouncer=true / connection_limit= / :6543 / -pooler host). " +
        "Serverless deployments should use the pooler URL to avoid connection exhaustion.",
    );
  }
}

assertPooledDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    datasourceUrl: process.env.DATABASE_URL,
  });

// Cache PrismaClient globally in ALL environments to prevent connection exhaustion in serverless
globalForPrisma.prisma = prisma;
