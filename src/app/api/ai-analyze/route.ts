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
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(`${AI_BACKEND_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    const marketData = await fetchMarketData(ticker);

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
      url: AI_BACKEND_URL,
      available: healthy,
      status: healthy ? "connected" : "unavailable",
    },
    fallback: "TypeScript scoring available",
  });
}
