/**
 * Live AI Backend Status API
 *
 * Pings the Python AI backend's /health endpoint in real-time and combines
 * it with recent scan activity from the database to show which AI layers
 * are currently active for user-facing scans.
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const AI_BACKEND_URL = process.env.AI_BACKEND_URL || "http://localhost:8000";

interface HealthResponse {
  status: string;
  models_loaded: boolean;
  rf_ready: boolean;
  lstm_ready: boolean;
  version?: string;
}

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Ping the Python AI backend health endpoint
    let backendHealth: HealthResponse | null = null;
    let backendReachable = false;
    let backendLatencyMs: number | null = null;

    const configured = !!process.env.AI_BACKEND_URL;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const start = Date.now();

      const headers: Record<string, string> = {};
      if (process.env.AI_API_SECRET) {
        headers["X-API-Key"] = process.env.AI_API_SECRET;
      }

      const res = await fetch(`${AI_BACKEND_URL}/health`, {
        signal: controller.signal,
        headers,
      });

      clearTimeout(timeoutId);
      backendLatencyMs = Date.now() - start;

      if (res.ok) {
        backendHealth = await res.json();
        backendReachable = backendHealth?.status === "healthy";
      }
    } catch {
      // Backend unreachable
    }

    // 2. Get recent scan activity from the database
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [scansLastHour, scansToday, todayMetrics, recentScans] = await Promise.all([
      prisma.scanHistory.count({
        where: { createdAt: { gte: oneHourAgo } },
      }),
      prisma.scanHistory.count({
        where: { createdAt: { gte: todayStart } },
      }),
      prisma.modelMetrics.findUnique({
        where: {
          dateKey: now.toISOString().split("T")[0],
        },
      }),
      // Last 5 scans for "recent activity" feed
      prisma.scanHistory.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          ticker: true,
          riskLevel: true,
          totalScore: true,
          processingTime: true,
          createdAt: true,
        },
      }),
    ]);

    // 3. Build layer status
    const layers = [
      {
        id: "deterministic",
        name: "Deterministic",
        description: "Rule-based signals",
        // Always available since it's TypeScript-based
        status: "online" as const,
      },
      {
        id: "anomaly",
        name: "Anomaly Detection",
        description: "Statistical Z-score detection",
        // Available in TS fallback + Python backend
        status: "online" as const,
      },
      {
        id: "random_forest",
        name: "Random Forest",
        description: "ML classification",
        status: (backendReachable && backendHealth?.rf_ready ? "online" : "offline") as "online" | "offline",
      },
      {
        id: "lstm",
        name: "LSTM",
        description: "Deep learning temporal patterns",
        status: (backendReachable && backendHealth?.lstm_ready ? "online" : "offline") as "online" | "offline",
      },
    ];

    const onlineCount = layers.filter((l) => l.status === "online").length;

    return NextResponse.json({
      timestamp: now.toISOString(),
      backend: {
        configured,
        reachable: backendReachable,
        url: configured ? AI_BACKEND_URL : null,
        latencyMs: backendLatencyMs,
        version: backendHealth?.version || null,
        modelsLoaded: backendHealth?.models_loaded || false,
      },
      layers,
      layersSummary: `${onlineCount}/${layers.length} layers online`,
      activity: {
        scansLastHour,
        scansToday,
        avgProcessingTimeMs: todayMetrics?.avgProcessingTime
          ? Math.round(todayMetrics.avgProcessingTime)
          : null,
        riskBreakdown: todayMetrics
          ? {
              low: todayMetrics.lowRiskCount,
              medium: todayMetrics.mediumRiskCount,
              high: todayMetrics.highRiskCount,
              insufficient: todayMetrics.insufficientCount,
            }
          : null,
        recentScans: recentScans.map((s) => ({
          ticker: s.ticker,
          riskLevel: s.riskLevel,
          score: s.totalScore,
          processingTimeMs: s.processingTime,
          scannedAt: s.createdAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    console.error("AI backend live status error:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI backend status" },
      { status: 500 }
    );
  }
}
