/**
 * AI Analysis API Route
 *
 * This endpoint proxies requests to the Python AI backend which provides:
 * - Random Forest ML classifier
 * - LSTM deep learning model
 * - Statistical anomaly detection
 * - Feature engineering (Z-scores, ATR, Keltner Channels)
 * - Model ensemble with probability calibration
 *
 * If the Python backend is not available, falls back to the TypeScript scoring.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { fetchMarketData, runAnomalyDetection } from "@/lib/marketData";
import { computeRiskScore } from "@/lib/scoring";
import { MIN_HISTORY_POINTS } from "@/lib/scoring/engine";
import { reserveScanSlot, refundScanSlot } from "@/lib/usage";
import { sendAPIFailureAlert } from "@/lib/email";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { parseAIBackendResponse } from "@/lib/ai-backend-schema";

// Allow up to 30 seconds for the full AI pipeline
export const maxDuration = 30;

// Python AI backend URL (configurable via environment variable)
const AI_BACKEND_URL = process.env.AI_BACKEND_URL || "http://localhost:8000";

// Request validation schema
const aiAnalyzeSchema = z.object({
  ticker: z.string().min(1, "Ticker is required").max(10),
  assetType: z.enum(["stock", "crypto"]).optional().default("stock"),
  useLiveData: z.boolean().optional().default(true),
  context: z
    .object({
      unsolicited: z.boolean().optional().default(false),
      promisesHighReturns: z.boolean().optional().default(false),
      urgencyPressure: z.boolean().optional().default(false),
      secrecyInsideInfo: z.boolean().optional().default(false),
    })
    .optional()
    .default({}),
  pitchText: z.string().max(10000).optional(),
});

/** Details describing a backend 503 (data API outage) so the route can alert. */
interface ServiceUnavailableInfo {
  apiName: string;
  ticker: string;
  assetType: string;
  originalError: string;
}

interface AIBackendCallResult {
  ok: boolean;
  data?: NonNullable<ReturnType<typeof parseAIBackendResponse>>;
  /** Present when the backend returned 503 — route should alert + fall back. */
  serviceUnavailable?: ServiceUnavailableInfo;
}

/**
 * Call the Python AI backend for full ML analysis.
 *
 * Never throws: a 503 is captured into `serviceUnavailable` so the caller can
 * alert admins AND fall back to TS scoring rather than hard-failing the user
 * (audit TS-C2). The payload is validated through the contract zod schema; an
 * invalid payload falls back (audit TS-H7).
 */
async function callAIBackend(
  ticker: string,
  assetType: string,
  useLiveData: boolean,
): Promise<AIBackendCallResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout - keep short so fallback has time

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (process.env.AI_API_SECRET) {
      headers["X-API-Key"] = process.env.AI_API_SECRET;
    }

    const response = await fetch(`${AI_BACKEND_URL}/analyze`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ticker,
        asset_type: assetType,
        use_live_data: useLiveData,
        days: 90,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 503) {
        const errorData = await response.json().catch(() => ({}));
        const detail = errorData.detail || {};
        console.error(`AI backend returned 503 - Service Unavailable:`, detail);
        return {
          ok: false,
          serviceUnavailable: {
            apiName: detail.api_name || "Unknown API",
            ticker: detail.ticker || ticker,
            assetType: detail.asset_type || assetType,
            originalError: detail.original_error || "Data API unavailable",
          },
        };
      }
      console.error(`AI backend returned ${response.status}`);
      return { ok: false };
    }

    const raw = await response.json();
    const data = parseAIBackendResponse(raw);
    if (!data) return { ok: false };
    return { ok: true, data };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    console.error("AI backend unavailable:", error);
    return { ok: false };
  }
}

/**
 * Check if Python AI backend is available
 */
async function checkAIBackendHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${AI_BACKEND_URL}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return data.status === "healthy" && data.rf_ready && data.lstm_ready;
    }
    return false;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Tracks whether a quota slot has been reserved, so the error path can refund
  // it (and only it) on failure without refunding requests that never reserved.
  let userIdForRefund: string | null = null;

  try {
    // Rate limit: strict for AI analysis (5 requests per minute)
    const { success: rateLimitSuccess, headers: rateLimitHeaders } =
      await rateLimit(request, "strict");
    if (!rateLimitSuccess) {
      return rateLimitExceededResponse(rateLimitHeaders);
    }

    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Parse and validate request body BEFORE reserving a slot (don't burn quota
    // on malformed bodies).
    const body = await request.json().catch(() => null);
    const validation = aiAnalyzeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 },
      );
    }

    const { ticker, assetType, useLiveData, context, pitchText } =
      validation.data;

    // Atomically check the scan limit and reserve a slot. Previously usage was
    // checked but never consumed (free unmetered scans — audit TS-M12).
    const { reserved, usage } = await reserveScanSlot(userId);
    if (!reserved) {
      return NextResponse.json(
        {
          error: "Scan limit reached",
          usage: {
            plan: usage.plan,
            scansUsedThisMonth: usage.scansUsedThisMonth,
            scansLimitThisMonth: usage.scansLimitThisMonth,
          },
        },
        { status: 429 },
      );
    }

    // A slot is now reserved — the error path below must refund it on failure.
    userIdForRefund = userId;

    // Try the Python AI backend first
    const aiBackendAvailable = await checkAIBackendHealth();

    if (aiBackendAvailable) {
      const result = await callAIBackend(ticker, assetType, useLiveData);

      if (result.ok && result.data) {
        const aiResult = result.data;
        return NextResponse.json({
          source: "ai_backend",
          ticker: aiResult.ticker ?? ticker.toUpperCase(),
          riskLevel: aiResult.risk_level,
          // Already clamped to [0,1] by the schema.
          riskProbability: aiResult.risk_probability,
          riskScore: aiResult.risk_score,
          models: {
            rfProbability: aiResult.rf_probability ?? null,
            lstmProbability: aiResult.lstm_probability ?? null,
            anomalyScore: aiResult.anomaly_score ?? 0,
          },
          signals: aiResult.signals,
          features: aiResult.features ?? {},
          explanations: aiResult.explanations ?? [],
          metadata: {
            secFlagged: aiResult.sec_flagged ?? false,
            isOtc: aiResult.is_otc ?? false,
            isMicroCap: aiResult.is_micro_cap ?? false,
            dataAvailable: aiResult.data_available,
            analysisTimestamp:
              aiResult.analysis_timestamp ?? new Date().toISOString(),
          },
        });
      }

      // Backend failed. On a data-API outage (503), alert admins asynchronously
      // and fall through to the TypeScript fallback below (audit TS-C2).
      if (result.serviceUnavailable) {
        const info = result.serviceUnavailable;
        console.error(
          `AI backend data API unavailable — API: ${info.apiName}, Ticker: ${info.ticker}. Falling back to TypeScript scoring.`,
        );
        void sendAPIFailureAlert(
          info.apiName,
          info.ticker,
          info.originalError,
          info.assetType,
        ).catch((emailError) => {
          console.error("Failed to send admin alert email:", emailError);
        });
      }
    }

    // Fall back to TypeScript scoring if AI backend unavailable
    console.log("Falling back to TypeScript scoring");

    const marketData = await fetchMarketData(ticker, assetType);

    if (!marketData.dataAvailable) {
      console.warn(
        `No market data available for ${ticker} — relying on alert-list/behavioral signals. Check that FMP_API_KEY or ALPHA_VANTAGE_API_KEY is configured.`,
      );
    }

    const scoringResult = await computeRiskScore({
      marketData,
      pitchText: pitchText || "",
      context: {
        unsolicited: context?.unsolicited ?? false,
        promisesHighReturns: context?.promisesHighReturns ?? false,
        urgencyPressure: context?.urgencyPressure ?? false,
        secrecyInsideInfo: context?.secrecyInsideInfo ?? false,
      },
    });

    // Align the anomaly gate with the engine's pattern-detection threshold
    // (>= 30, was an off-by-one > 30 — audit TS-M12).
    const anomalyResult =
      marketData.priceHistory.length >= MIN_HISTORY_POINTS
        ? runAnomalyDetection(marketData.priceHistory)
        : { hasAnomalies: false, anomalyScore: 0, signals: [] };

    return NextResponse.json({
      source: "typescript_fallback",
      ticker: ticker.toUpperCase(),
      riskLevel: scoringResult.riskLevel,
      // Pseudo-probability from score, clamped to [0,1] (audit TS-M12).
      riskProbability: Math.min(1, Math.max(0, scoringResult.totalScore / 20)),
      riskScore: scoringResult.totalScore,
      models: {
        rfProbability: null,
        lstmProbability: null,
        anomalyScore: anomalyResult.anomalyScore,
      },
      signals: scoringResult.signals,
      features: {},
      // runAnomalyDetection now returns structured signals — expose their text.
      explanations: anomalyResult.signals.map((s) => s.description),
      metadata: {
        secFlagged: scoringResult.signals.some(
          (s) => s.code === "ALERT_LIST_HIT",
        ),
        isOtc: marketData.isOTC,
        isMicroCap: (marketData.quote?.marketCap ?? 0) < 50_000_000,
        dataAvailable: marketData.dataAvailable,
        dataCompleteness: scoringResult.dataCompleteness,
        analysisTimestamp: new Date().toISOString(),
      },
      notice:
        "Using TypeScript scoring. Deploy Python AI backend for full ML models.",
    });
  } catch (error) {
    console.error("AI Analyze API error:", error);

    // If a scan slot was reserved before this 5xx, refund it so users aren't
    // charged for a scan that never produced a result (audit ARCH-C4).
    // Fire-and-forget: a refund hiccup must not itself fail the response.
    if (userIdForRefund) {
      void refundScanSlot(userIdForRefund).catch((refundError) => {
        console.error("Failed to refund scan slot:", refundError);
      });
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Analysis failed: ${errorMessage}` },
      { status: 500 },
    );
  }
}

// Health check for AI backend status
export async function GET() {
  const healthy = await checkAIBackendHealth();

  return NextResponse.json({
    aiBackend: {
      available: healthy,
      status: healthy ? "connected" : "unavailable",
    },
    fallback: "TypeScript scoring available",
  });
}
