import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const checks = [
  {
    table: "WatchlistEntry",
    label: "duplicate user/ticker watchlist entries",
    query: 'SELECT "userId", "ticker", COUNT(*)::int AS "count" FROM "WatchlistEntry" GROUP BY "userId", "ticker" HAVING COUNT(*) > 1',
  },
  {
    table: "ActiveMonitor",
    label: "duplicate watchlist-entry/kind monitor slots",
    query: 'SELECT "watchlistEntryId", "kind", COUNT(*)::int AS "count" FROM "ActiveMonitor" GROUP BY "watchlistEntryId", "kind" HAVING COUNT(*) > 1',
  },
  {
    table: "MonitorExecution",
    label: "duplicate monitor/publication executions",
    query: 'SELECT "monitorId", "publicationKey", COUNT(*)::int AS "count" FROM "MonitorExecution" GROUP BY "monitorId", "publicationKey" HAVING COUNT(*) > 1',
  },
  {
    table: "NotificationDelivery",
    label: "duplicate user/execution/channel notification deliveries",
    query: 'SELECT "userId", "executionId", "channel", COUNT(*)::int AS "count" FROM "NotificationDelivery" GROUP BY "userId", "executionId", "channel" HAVING COUNT(*) > 1',
  },
] as const;

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS "exists"
  `;
  return rows[0]?.exists === true;
}

async function main(): Promise<void> {
  let conflictsFound = false;

  for (const check of checks) {
    if (!(await tableExists(check.table))) {
      console.log(`${check.table}: not present yet; no conflict check run.`);
      continue;
    }

    const conflicts = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      check.query,
    );

    if (conflicts.length === 0) {
      console.log(`${check.table}: no ${check.label}.`);
      continue;
    }

    conflictsFound = true;
    console.error(`${check.table}: found ${check.label}.`);
    console.error(JSON.stringify(conflicts, null, 2));
  }

  if (conflictsFound) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error("Dashboard monitoring migration verification failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
