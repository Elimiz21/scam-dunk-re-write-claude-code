import { prisma } from "@/lib/db";
import { buildAcquisitionBreakdown, type AcquisitionRow } from "@/lib/admin/acquisition-report";

const EVENT_TYPES = ["PAYWALL_VIEW", "BEGIN_CHECKOUT", "PURCHASE"] as const;

type EventType = (typeof EVENT_TYPES)[number];

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function makeDays(days: number) {
  const values: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - offset);
    values.push(dayKey(date));
  }
  return values;
}

function rate(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(1));
}

export type ConversionFunnelReport = {
  generatedAt: string;
  refreshSeconds: number;
  allTime: {
    signUps: number;
    emailVerified: number;
    startedScanning: number;
    paywallViews: number;
    checkoutStarts: number;
    purchases: number;
    paidUsers: number;
  };
  last30Days: {
    signUps: number;
    emailVerified: number;
    startedScanning: number;
    paywallViews: number;
    checkoutStarts: number;
    purchases: number;
  };
  conversionRates: {
    verifiedFromSignup: number;
    scannedFromVerified: number;
    purchaseFromCheckout: number;
  };
  planBreakdown: { free: number; pro: number; proMax: number };
  acquisition: {
    capturedSignUps: number;
    sources: AcquisitionRow[];
  };
  daily: Array<{
    date: string;
    signUps: number;
    emailVerified: number;
    startedScanning: number;
    checkoutStarts: number;
    purchases: number;
  }>;
};

export async function getConversionFunnelReport(days = 30): Promise<ConversionFunnelReport> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const [
    totalUsers,
    verifiedUsers,
    startedScanningUsers,
    paidUsers,
    planRows,
    allEvents,
    periodUsers,
    periodVerifiedUsers,
    periodScans,
    periodEvents,
    attributionUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { emailVerified: { not: null } } }),
    prisma.scanHistory.groupBy({ by: ["userId"], where: { userId: { not: null } } }),
    prisma.user.count({ where: { plan: { not: "FREE" } } }),
    prisma.user.groupBy({ by: ["plan"], _count: { _all: true } }),
    prisma.conversionFunnelEvent.findMany({
      where: { eventType: { in: [...EVENT_TYPES] } },
      select: { eventType: true },
    }),
    prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.user.findMany({ where: { emailVerified: { gte: since } }, select: { emailVerified: true } }),
    prisma.scanHistory.findMany({
      where: { createdAt: { gte: since }, userId: { not: null } },
      select: { userId: true, createdAt: true },
    }),
    prisma.conversionFunnelEvent.findMany({
      where: { eventType: { in: [...EVENT_TYPES] }, occurredAt: { gte: since } },
      select: { eventType: true, occurredAt: true },
    }),
    prisma.user.findMany({
      select: {
        firstTouchSource: true,
        firstTouchMedium: true,
        firstTouchCampaign: true,
      },
    }),
  ]);

  const countEvents = (events: Array<{ eventType: string }>, eventType: EventType) =>
    events.filter((event) => event.eventType === eventType).length;
  const allTime = {
    signUps: totalUsers,
    emailVerified: verifiedUsers,
    startedScanning: startedScanningUsers.length,
    paywallViews: countEvents(allEvents, "PAYWALL_VIEW"),
    checkoutStarts: countEvents(allEvents, "BEGIN_CHECKOUT"),
    purchases: countEvents(allEvents, "PURCHASE"),
    paidUsers,
  };

  const scannedUserIds = new Set(periodScans.map((scan) => scan.userId).filter(Boolean));
  const last30Days = {
    signUps: periodUsers.length,
    emailVerified: periodVerifiedUsers.length,
    startedScanning: scannedUserIds.size,
    paywallViews: countEvents(periodEvents, "PAYWALL_VIEW"),
    checkoutStarts: countEvents(periodEvents, "BEGIN_CHECKOUT"),
    purchases: countEvents(periodEvents, "PURCHASE"),
  };

  const planCounts = new Map(planRows.map((row) => [row.plan, row._count._all]));
  const daily = makeDays(days).map((date) => {
    const dailyScannedUsers = new Set(
      periodScans.filter((scan) => dayKey(scan.createdAt) === date).map((scan) => scan.userId),
    );
    const dailyEvents = periodEvents.filter((event) => dayKey(event.occurredAt) === date);
    return {
      date,
      signUps: periodUsers.filter((user) => dayKey(user.createdAt) === date).length,
      emailVerified: periodVerifiedUsers.filter((user) => user.emailVerified && dayKey(user.emailVerified) === date).length,
      startedScanning: dailyScannedUsers.size,
      checkoutStarts: countEvents(dailyEvents, "BEGIN_CHECKOUT"),
      purchases: countEvents(dailyEvents, "PURCHASE"),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    refreshSeconds: 60,
    allTime,
    last30Days,
    conversionRates: {
      verifiedFromSignup: rate(allTime.emailVerified, allTime.signUps),
      scannedFromVerified: rate(allTime.startedScanning, allTime.emailVerified),
      purchaseFromCheckout: rate(allTime.purchases, allTime.checkoutStarts),
    },
    planBreakdown: {
      free: planCounts.get("FREE") ?? 0,
      pro: planCounts.get("PAID") ?? 0,
      proMax: planCounts.get("PRO_MAX") ?? 0,
    },
    acquisition: {
      capturedSignUps: attributionUsers.filter((user) => user.firstTouchSource !== null).length,
      sources: buildAcquisitionBreakdown(
        attributionUsers.map((user) => ({
          source: user.firstTouchSource,
          medium: user.firstTouchMedium,
          campaign: user.firstTouchCampaign,
        })),
      ).slice(0, 10),
    },
    daily,
  };
}
