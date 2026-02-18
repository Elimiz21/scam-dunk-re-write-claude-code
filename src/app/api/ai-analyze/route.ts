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
import { canUserScan } from "@/lib/usage";
import { sendAPIFailureAlert } from "@/lib/email";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";

// Allow up to 30 seconds for the full AI pipeline
export const maxDuration = 30;

// Custom error for service unavailable
class ServiceUnavailableError extends Error {
  apiName: string;
  ticker: string;
  assetType: string;
  originalError: string;

  constructor(apiName: string, ticker: string, assetType: string, originalError: string) {
    super(`Service unavailable: ${apiName} failed for ${assetType} ${ticker}`);
    this.apiName = apiName;
    this.ticker = ticker;
    this.assetType = assetType;
    this.originalError = originalError;
  }
}

// Python AI backend URL (configurable via environment variable)
const AI_BACKEND_URL = process.env.AI_BACKEND_URL || "http://localhost:8000";

// Request validation schema
const aiAnalyzeSchema = z.object({
  ticker: z.string().min(1, "Ticker is required").max(10),
  assetType: z.enum(["stock", "crypto"]).optional().default("stock"),
  useLiveData: z.boolean().optional().default(true),
  context: z.object({
    unsolicited: z.boolean().optional().default(false),
    promisesHighReturns: z.boolean().optional().default(false),
    urgencyPressure: z.boolean().optional().default(false),
    secrecyInsideInfo: z.boolean().optional().default(false),
  }).optional().default({}),
  pitchText: z.string().max(10000).optional(),
});

interface AIBackendResponse {
  ticker: string;
  asset_type: string;
  risk_level: string;
  risk_probability: number;
  risk_score: number;
  rf_probability: number | null;
  lstm_probability: number | null;
  anomaly_score: number;
  signals: Array<{
    code: string;
    category: string;
    description: string;
    weight: number;
  }>;
  features: Record<string, number | null>;
  explanations: string[];
  sec_flagged: boolean;
  is_otc: boolean;
  is_micro_cap: boolean;
  data_available: boolean;
  analysis_timestamp: string;
}

/**
 * Call the Python AI backend for full ML analysis
 */
async function callAIBackend(
  ticker: string,
  assetType: string,
  useLiveData: boolean
): Promise<AIBackendResponse | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout - keep short so fallback has time

    const headers: Record<string, string> = { "Content-Type": "application/json" };
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
      // Check for 503 Service Unavailable (data API failure)
      if (response.status === 503) {
        const errorData = await response.json().catch(() => ({}));
        const detail = errorData.detail || {};
        console.error(`AI backend returned 503 - Service Unavailable:`, detail);

        // Throw ServiceUnavailableError to be handled by the main handler
        throw new ServiceUnavailableError(
          detail.api_name || "Unknown API",
          detail.ticker || ticker,
          detail.asset_type || assetType,
          detail.original_error || "Data API unavailable"
        );
      }

      console.error(`AI backend returned ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("AI backend unavailable:", error);
    return null;
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
  try {
    // Rate limit: strict for AI analysis (5 requests per minute)
    const { success: rateLimitSuccess, headers: rateLimitHeaders } = await rateLimit(request, "strict");
    if (!rateLimitSuccess) {
      return rateLimitExceededResponse(rateLimitHeaders);
    }

    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Check scan limit
    const { canScan } = await canUserScan(userId);
    if (!canScan) {
      return NextResponse.json(
        { error: "Scan limit reached" },
        { status: 429 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = aiAnalyzeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { ticker, assetType, useLiveData, context, pitchText } = validation.data;

    // Try the Python AI backend first
    const aiBackendAvailable = await checkAIBackendHealth();

    if (aiBackendAvailable) {
      const aiResult = await callAIBackend(ticker, assetType, useLiveData);

      if (aiResult) {
        // Successfully got result from AI backend
        return NextResponse.json({
          source: "ai_backend",
          ticker: aiResult.ticker,
          riskLevel: aiResult.risk_level,
          riskProbability: aiResult.risk_probability,
          riskScore: aiResult.risk_score,
          models: {
            rfProbability: aiResult.rf_probability,
            lstmProbability: aiResult.lstm_probability,
            anomalyScore: aiResult.anomaly_score,
          },
          signals: aiResult.signals,
          features: aiResult.features,
          explanations: aiResult.explanations,
          metadata: {
            secFlagged: aiResult.sec_flagged,
            isOtc: aiResult.is_otc,
            isMicroCap: aiResult.is_micro_cap,
            dataAvailable: aiResult.data_available,
            analysisTimestamp: aiResult.analysis_timestamp,
          },
        });
      }
    }

    // Fall back to TypeScript scoring if AI backend unavailable
    console.log("Falling back to TypeScript scoring");

    const marketData = await fetchMarketData(ticker, assetType);

    if (!marketData.dataAvailable) {
      console.warn(`No market data available for ${ticker} — scoring will return INSUFFICIENT. Check that FMP_API_KEY or ALPHA_VANTAGE_API_KEY is configured.`);
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

    // Get anomaly detection results
    const anomalyResult = marketData.priceHistory.length > 30
      ? runAnomalyDetection(marketData.priceHistory)
      : { hasAnomalies: false, anomalyScore: 0, signals: [] };

    return NextResponse.json({
      source: "typescript_fallback",
      ticker: ticker.toUpperCase(),
      riskLevel: scoringResult.riskLevel,
      riskProbability: scoringResult.totalScore / 20, // Normalize to 0-1
      riskScore: scoringResult.totalScore,
      models: {
        rfProbability: null,
        lstmProbability: null,
        anomalyScore: anomalyResult.anomalyScore,
      },
      signals: scoringResult.signals,
      features: {},
      explanations: anomalyResult.signals,
      metadata: {
        secFlagged: scoringResult.signals.some(s => s.code === "ALERT_LIST_HIT"),
        isOtc: marketData.isOTC,
        isMicroCap: (marketData.quote?.marketCap ?? 0) < 50_000_000,
        dataAvailable: marketData.dataAvailable,
        analysisTimestamp: new Date().toISOString(),
      },
      notice: "Using TypeScript scoring. Deploy Python AI backend for full ML models.",
    });

  } catch (error) {
    console.error("AI Analyze API error:", error);

    // Handle service unavailable errors (data APIs are down)
    if (error instanceof ServiceUnavailableError) {
      console.error(`SERVICE UNAVAILABLE - API: ${error.apiName}, Ticker: ${error.ticker}, Type: ${error.assetType}`);
      console.error(`Original error: ${error.originalError}`);

      // Send email notification to admin (non-blocking)
      sendAPIFailureAlert(
        error.apiName,
        error.ticker,
        error.originalError,
        error.assetType
      ).catch((emailError) => {
        console.error("Failed to send admin alert email:", emailError);
      });

      // Return user-friendly offline message
      return NextResponse.json(
        {
          error: "service_unavailable",
          message: "The scanning system is currently offline. Please try again later.",
          retryAfter: 60, // Suggest retry after 60 seconds
        },
        { status: 503 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Analysis failed: ${errorMessage}` },
      { status: 500 }
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
