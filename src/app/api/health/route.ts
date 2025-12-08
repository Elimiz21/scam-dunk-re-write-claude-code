import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
  } catch (error) {
    checks.database = `error: ${error instanceof Error ? error.message : "Unknown error"}`;
  }

  const allOk = checks.database === "ok";

  return NextResponse.json(checks, { status: allOk ? 200 : 500 });
}
