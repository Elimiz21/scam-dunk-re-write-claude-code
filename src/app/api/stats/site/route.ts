import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Publication can change after late ingestion or a corrected artifact. Always
// read the published database state instead of caching an obsolete scan date.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface SiteStatsRow {
  dump_symbols_6mo: bigint;
  dump_symbols_30d: bigint;
  flag_symbols_7d: bigint;
  flag_symbols_30d: bigint;
  pumping_now: bigint;
}

export async function GET() {
  try {
    const [latestScan, totals, rows] = await Promise.all([
      prisma.dailyScanSummary.findFirst({
        orderBy: { scanDate: "desc" },
        select: { scanDate: true, createdAt: true, evaluated: true, highRiskCount: true },
      }),
      prisma.dailyScanSummary.aggregate({ _sum: { evaluated: true } }),
      prisma.$queryRaw<SiteStatsRow[]>`
        SELECT
          (SELECT COUNT(DISTINCT symbol) FROM "PromotedStock"
            WHERE outcome IN ('DUMPED','DELISTED')
              AND "entryPrice" > 0 AND "entryPrice" < 'Infinity'::double precision
              AND "addedDate" > now() - interval '6 months') AS dump_symbols_6mo,
          (SELECT COUNT(DISTINCT symbol) FROM "PromotedStock"
            WHERE outcome IN ('DUMPED','DELISTED')
              AND "entryPrice" > 0 AND "entryPrice" < 'Infinity'::double precision
              AND "addedDate" > now() - interval '30 days') AS dump_symbols_30d,
          (SELECT COUNT(DISTINCT symbol) FROM "PromotedStock"
            WHERE "addedDate" > now() - interval '7 days') AS flag_symbols_7d,
          (SELECT COUNT(DISTINCT symbol) FROM "PromotedStock"
            WHERE "addedDate" > now() - interval '30 days') AS flag_symbols_30d,
          (SELECT COUNT(DISTINCT symbol) FROM "PromotedStock"
            WHERE outcome = 'PUMPING' AND "isActive"
              AND "entryPrice" > 0 AND "entryPrice" < 'Infinity'::double precision) AS pumping_now
      `,
    ]);

    const row = rows[0];
    const stats = {
      updatedAt: new Date().toISOString(),
      lastScanDate: latestScan?.scanDate?.toISOString() ?? null,
      summaryCreatedAt: latestScan?.createdAt?.toISOString() ?? null,
      stocksPerDay: latestScan?.evaluated ?? null,
      highRiskLastScan: latestScan?.highRiskCount ?? null,
      totalScans: totals._sum.evaluated ?? null,
      dumpsConfirmed6mo: Number(row?.dump_symbols_6mo ?? 0),
      dumpsConfirmed30d: Number(row?.dump_symbols_30d ?? 0),
      newFlagSymbols7d: Number(row?.flag_symbols_7d ?? 0),
      newFlagSymbols30d: Number(row?.flag_symbols_30d ?? 0),
      pumpingNow: Number(row?.pumping_now ?? 0),
    };

    return NextResponse.json(stats, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to compute site stats:", error);
    return NextResponse.json(
      { error: "Stats unavailable" },
      { status: 503 },
    );
  }
}
