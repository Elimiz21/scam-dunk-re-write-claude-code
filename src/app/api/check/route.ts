import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { fetchMarketData, runAnomalyDetection } from "@/lib/marketData";
import { computeRiskScore } from "@/lib/scoring";
import { generateNarrative } from "@/lib/narrative";
import { canUserScan, incrementScanCount } from "@/lib/usage";
import { prisma } from "@/lib/db";
import {
  CheckRequest,
  LimitReachedResponse,
  RiskResponse,
  StockSummary,
  RiskSignal,
} from "@/lib/types";

// Python AI backend URL
const AI_BACKEND_URL = process.env.AI_BACKEND_URL || "";

// Request validation schema - only ticker is required
const checkRequestSchema = z.object({
  ticker: z.string().min(1, "Ticker is required").max(10),
  companyName: z.string().optional(),
  assetType: z.enum(["stock", "crypto"]).optional().default("stock"),
  pitchText: z.string().max(10000).optional(),
  context: z.object({
    unsolicited: z.boolean().optional().default(false),
    promisesHighReturns: z.boolean().optional().default(false),
    urgencyPressure: z.boolean().optional().default(false),
    secrecyInsideInfo: z.boolean().optional().default(false),
  }).optional().default({}),
});

/**
 * Call the Python AI backend for full ML analysis
 */
async function callPythonAIBackend(
  ticker: string,
  assetType: string
): Promise<{
  success: boolean;
  riskLevel?: string;
  probability?: number;
  signals?: RiskSignal[];
  rfProbability?: number | null;
  lstmProbability?: number | null;
  anomalyScore?: number;
  explanations?: string[];
  secFlagged?: boolean;
  isOtc?: boolean;
  isMicroCap?: boolean;
}> {
  // Skip if no backend URL configured
  if (!AI_BACKEND_URL) {
    console.log("AI_BACKEND_URL not configured, using TypeScript scoring");
    return { success: false };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    console.log(`Calling Python AI backend: ${AI_BACKEND_URL}/analyze`);

    const response = await fetch(`${AI_BACKEND_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker,
        asset_type: assetType,
        use_live_data: true,
        days: 90,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`AI backend returned ${response.status}`);
      return { success: false };
    }

    const data = await response.json();
    console.log(`AI backend response for ${ticker}: ${data.risk_level} (${data.risk_probability})`);

    // Map signals from Python format to TypeScript format
    const signals: RiskSignal[] = (data.signals || []).map((s: { code: string; category: string; description: string; weight: number }) => ({
      code: s.code,
      category: s.category as "STRUCTURAL" | "PATTERN" | "ALERT" | "BEHAVIORAL",
      description: s.description,
      weight: s.weight,
    }));

    return {
      success: true,
      riskLevel: data.risk_level,
      probability: data.risk_probability,
      signals,
      rfProbability: data.rf_probability,
      lstmProbability: data.lstm_probability,
      anomalyScore: data.anomaly_score,
      explanations: data.explanations,
      secFlagged: data.sec_flagged,
      isOtc: data.is_otc,
      isMicroCap: data.is_micro_cap,
    };
  } catch (error) {
    console.error("AI backend call failed:", error);
    return { success: false };
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
    const { canScan, usage } = await canUserScan(userId);

    if (!canScan) {
      const limitResponse: LimitReachedResponse = {
        error: "LIMIT_REACHED",
        usage: {
          plan: usage.plan,
          scansUsedThisMonth: usage.scansUsedThisMonth,
          scansLimitThisMonth: usage.scansLimitThisMonth,
        },
      };
      return NextResponse.json(limitResponse, { status: 429 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = checkRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const checkRequest: CheckRequest = validation.data;
    const ticker = checkRequest.ticker.toUpperCase();

    // Build context with defaults
    const context = {
      unsolicited: checkRequest.context?.unsolicited ?? false,
      promisesHighReturns: checkRequest.context?.promisesHighReturns ?? false,
      urgencyPressure: checkRequest.context?.urgencyPressure ?? false,
      secrecyInsideInfo: checkRequest.context?.secrecyInsideInfo ?? false,
    };

    // =====================================================
    // TRY PYTHON AI BACKEND FIRST (Full ML Models)
    // =====================================================
    const aiResult = await callPythonAIBackend(ticker, checkRequest.assetType || "stock");

    let scoringResult;
    let marketData;
    let usedAIBackend = false;

    if (aiResult.success && aiResult.riskLevel && aiResult.signals) {
      // Use AI backend results
      usedAIBackend = true;
      console.log(`Using Python AI backend for ${ticker}`);

      // Fetch market data for stock summary (we still need this for display)
      marketData = await fetchMarketData(ticker);

      scoringResult = {
        riskLevel: aiResult.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT",
        totalScore: Math.round((aiResult.probability || 0) * 20), // Convert probability to score
        signals: aiResult.signals,
        isInsufficient: false,
        isLegitimate: aiResult.riskLevel === "LOW" && (aiResult.signals?.length || 0) === 0,
        // Additional AI data
        rfProbability: aiResult.rfProbability,
        lstmProbability: aiResult.lstmProbability,
        anomalyScore: aiResult.anomalyScore,
      };
    } else {
      // =====================================================
      // FALLBACK TO TYPESCRIPT SCORING
      // =====================================================
      console.log(`Falling back to TypeScript scoring for ${ticker}`);

      // Fetch market data
      marketData = await fetchMarketData(ticker);

      // Compute risk score using TypeScript
      scoringResult = await computeRiskScore({
        marketData,
        pitchText: checkRequest.pitchText || "",
        context,
      });
    }

    // Build stock summary
    const stockSummary: StockSummary = {
      ticker,
      companyName: checkRequest.companyName || marketData.quote?.companyName,
      exchange: marketData.quote?.exchange,
      lastPrice: marketData.quote?.lastPrice,
      marketCap: marketData.quote?.marketCap,
      avgDollarVolume30d: marketData.quote?.avgDollarVolume30d,
    };

    // Generate narrative (LLM or fallback)
    const narrative = await generateNarrative(
      scoringResult.riskLevel,
      scoringResult.totalScore,
      scoringResult.signals,
      stockSummary,
      scoringResult.isLegitimate
    );

    // Add AI backend info to narrative if used
    if (usedAIBackend) {
      narrative.disclaimers.push(
        "Analysis powered by AI models: Random Forest + LSTM + Anomaly Detection"
      );
    }

    // Increment scan count after successful analysis
    const updatedUsage = await incrementScanCount(userId);

    // Save scan to history for the user
    try {
      await prisma.scanHistory.create({
        data: {
          userId,
          ticker,
          assetType: checkRequest.assetType || "stock",
          riskLevel: scoringResult.riskLevel,
          totalScore: scoringResult.totalScore,
          signalsCount: scoringResult.signals.length,
          isLegitimate: scoringResult.isLegitimate,
          pitchProvided: !!checkRequest.pitchText,
          contextProvided: Object.values(context).some(Boolean),
        },
      });
    } catch (historyError) {
      // Don't fail the request if history save fails
      console.error("Failed to save scan history:", historyError);
    }

    // Build response
    const response: RiskResponse = {
      riskLevel: scoringResult.riskLevel,
      totalScore: scoringResult.totalScore,
      signals: scoringResult.signals,
      stockSummary,
      narrative,
      usage: updatedUsage,
      isLegitimate: scoringResult.isLegitimate,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Check API error:", error);

    // Return more specific error for debugging
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Check failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
