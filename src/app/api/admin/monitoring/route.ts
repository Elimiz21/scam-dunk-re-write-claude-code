import { NextResponse } from "next/server";

import { getAdminSession, hasRole } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const FRESHNESS_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;
const REPORTING_WINDOW_DAYS = 30;

type SummaryStatus =
  | "FRESH"
  | "STALE"
  | "HEALTHY"
  | "PARTIAL"
  | "CONFIGURED"
  | "DEGRADED"
  | "UNAVAILABLE";

function freshnessFor(value: Date, now: Date): "FRESH" | "STALE" {
  const age = now.getTime() - value.getTime();
  return age >= 0 && age <= FRESHNESS_WINDOW_MS ? "FRESH" : "STALE";
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function groupCount(row: unknown): number {
  if (!row || typeof row !== "object") return 0;
  const count = (row as { _count?: { _all?: unknown } })._count?._all;
  return asCount(count);
}

function unavailable(message: string) {
  return { status: "UNAVAILABLE" as const, message };
}

async function readPublication(now: Date) {
  try {
    const summary = await prisma.dailyScanSummary.findFirst({
      orderBy: [{ scanDate: "desc" }, { createdAt: "desc" }],
      select: {
        scanDate: true,
        createdAt: true,
        totalStocks: true,
        evaluated: true,
        skippedNoData: true,
      },
    });

    if (!summary || !(summary.scanDate instanceof Date)) {
      return unavailable("No published market scan is available.");
    }

    const total = asCount(summary.totalStocks);
    const evaluated = asCount(summary.evaluated);
    const skipped = asCount(summary.skippedNoData);
    const publishedAt =
      summary.createdAt instanceof Date ? summary.createdAt : summary.scanDate;

    return {
      status: freshnessFor(summary.scanDate, now),
      asOf: summary.scanDate.toISOString(),
      publishedAt: publishedAt.toISOString(),
      coverage: {
        total,
        evaluated,
        skipped,
        evaluatedPercent:
          total > 0 ? Math.round((evaluated / total) * 10000) / 100 : null,
      },
    };
  } catch (error) {
    console.error("Admin monitoring publication read failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return unavailable("Publication data is unavailable.");
  }
}

async function readMonitoringExecutions(now: Date) {
  try {
    const windowStart = new Date(
      now.getTime() - REPORTING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const [byStatus, bySkipReason, creditsCharged] = await Promise.all([
      prisma.monitorExecution.groupBy({
        by: ["status"],
        where: { createdAt: { gte: windowStart } },
        _count: { _all: true },
      }),
      prisma.monitorExecution.groupBy({
        by: ["skipReason"],
        where: {
          createdAt: { gte: windowStart },
          status: "SKIPPED",
          skipReason: { not: null },
        },
        _count: { _all: true },
      }),
      prisma.monitorExecution.count({
        where: { createdAt: { gte: windowStart }, creditCharged: true },
      }),
    ]);

    const executionCounts: Record<string, number> = {};
    for (const row of byStatus) {
      const status = String(row.status || "UNKNOWN");
      executionCounts[status] = groupCount(row);
    }

    const skipReasons = bySkipReason
      .map((row) => ({
        reason: String(row.skipReason || "UNSPECIFIED"),
        count: groupCount(row),
      }))
      .sort((left, right) => right.count - left.count);

    return {
      status: "HEALTHY" as const,
      windowDays: REPORTING_WINDOW_DAYS,
      executionCounts,
      skipReasons,
      creditsCharged: asCount(creditsCharged),
    };
  } catch (error) {
    console.error("Admin monitoring execution read failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return unavailable("Monitor execution data is unavailable.");
  }
}

async function readNotifications(now: Date) {
  try {
    const windowStart = new Date(
      now.getTime() - REPORTING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const rows = await prisma.notificationDelivery.groupBy({
      by: ["channel", "status"],
      where: { createdAt: { gte: windowStart } },
      _count: { _all: true },
    });

    const byStatus: Record<string, number> = {};
    const byChannel: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      const status = String(row.status || "UNKNOWN");
      const channel = String(row.channel || "UNKNOWN");
      byStatus[status] = (byStatus[status] || 0) + groupCount(row);
      byChannel[channel] ||= {};
      byChannel[channel][status] = groupCount(row);
    }

    return {
      status: "HEALTHY" as const,
      windowDays: REPORTING_WINDOW_DAYS,
      byStatus,
      byChannel,
    };
  } catch (error) {
    console.error("Admin monitoring notification read failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return unavailable("Notification delivery data is unavailable.");
  }
}

async function readSocialScan(now: Date) {
  try {
    const run = await prisma.socialScanRun.findFirst({
      orderBy: [{ scanDate: "desc" }, { updatedAt: "desc" }],
      select: {
        scanDate: true,
        updatedAt: true,
        status: true,
        tickersScanned: true,
        tickersWithMentions: true,
        totalMentions: true,
      },
    });

    if (!run || !(run.scanDate instanceof Date)) {
      return unavailable("No social scan run is available.");
    }

    const runStatus = String(run.status || "UNKNOWN");
    if (runStatus !== "COMPLETED") {
      return {
        status: "UNAVAILABLE" as const,
        runStatus,
        message: "The latest social scan did not complete.",
      };
    }

    return {
      status: freshnessFor(run.scanDate, now),
      runStatus,
      scanDate: run.scanDate.toISOString(),
      lastUpdatedAt:
        run.updatedAt instanceof Date ? run.updatedAt.toISOString() : null,
      tickersScanned: asCount(run.tickersScanned),
      tickersWithMentions: asCount(run.tickersWithMentions),
      totalMentions: asCount(run.totalMentions),
    };
  } catch (error) {
    console.error("Admin monitoring social scan read failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return unavailable("Social scan data is unavailable.");
  }
}

async function readBillingStatus() {
  try {
    const integrations = await prisma.integrationConfig.findMany({
      where: { name: { in: ["PAYPAL", "STRIPE"] } },
      select: {
        name: true,
        isEnabled: true,
        status: true,
        lastCheckedAt: true,
      },
    });
    const integrationByName = new Map(
      integrations.map((integration) => [integration.name, integration]),
    );

    const paypalCredentialsConfigured = Boolean(
      process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET,
    );
    const paypalPlanConfigured = Boolean(
      process.env.PAYPAL_PLAN_ID || process.env.PAYPAL_PRO_MAX_PLAN_ID,
    );
    const paypalWebhookConfigured = Boolean(process.env.PAYPAL_WEBHOOK_ID);
    const paypalConfigured =
      paypalCredentialsConfigured && paypalPlanConfigured;
    const stripeConfigured = false;

    return {
      status: (paypalConfigured && paypalWebhookConfigured
        ? "CONFIGURED"
        : "PARTIAL") as "CONFIGURED" | "PARTIAL",
      activeProvider: paypalConfigured ? "PAYPAL" : "MANUAL",
      providers: [
        {
          name: "PayPal",
          configured: paypalConfigured,
          credentialsConfigured: paypalCredentialsConfigured,
          planConfigured: paypalPlanConfigured,
          webhookConfigured: paypalWebhookConfigured,
          mode: process.env.PAYPAL_MODE === "live" ? "live" : "sandbox",
          databaseStatus: integrationByName.get("PAYPAL")?.status || "UNKNOWN",
          enabled: integrationByName.get("PAYPAL")?.isEnabled ?? false,
        },
        {
          name: "Stripe",
          configured: stripeConfigured,
          credentialsConfigured: false,
          planConfigured: false,
          webhookConfigured: false,
          mode: "disabled",
          databaseStatus: integrationByName.get("STRIPE")?.status || "UNKNOWN",
          enabled: integrationByName.get("STRIPE")?.isEnabled ?? false,
        },
      ],
      plans: {
        pro: {
          paypalPlanConfigured: Boolean(process.env.PAYPAL_PLAN_ID),
          stripePriceConfigured: Boolean(process.env.STRIPE_PRICE_PAID_PLAN_ID),
        },
        proMax: {
          paypalPlanConfigured: Boolean(process.env.PAYPAL_PRO_MAX_PLAN_ID),
          stripePriceConfigured: Boolean(process.env.STRIPE_PRO_MAX_PRICE_ID),
        },
      },
    };
  } catch (error) {
    console.error("Admin monitoring billing read failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return unavailable("Billing configuration status is unavailable.");
  }
}

function overallStatus(sections: Array<{ status: SummaryStatus }>): SummaryStatus {
  if (sections.some((section) => section.status === "UNAVAILABLE")) {
    return "UNAVAILABLE" as const;
  }
  if (
    sections.some(
      (section) => section.status === "STALE" || section.status === "PARTIAL",
    )
  ) {
    return "DEGRADED";
  }
  return "HEALTHY" as const;
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasRole(session, ["VIEWER", "ADMIN", "OWNER"])) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 },
    );
  }

  const now = new Date();
  const [publication, monitoring, notifications, socialScan, billing] =
    await Promise.all([
      readPublication(now),
      readMonitoringExecutions(now),
      readNotifications(now),
      readSocialScan(now),
      readBillingStatus(),
    ]);
  const overall = overallStatus([
    publication,
    monitoring,
    notifications,
    socialScan,
    billing,
  ]);

  return NextResponse.json(
    {
      generatedAt: now.toISOString(),
      overall: { status: overall },
      publication,
      monitoring,
      notifications,
      socialScan,
      billing,
    },
    {
      status: overall === "UNAVAILABLE" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
