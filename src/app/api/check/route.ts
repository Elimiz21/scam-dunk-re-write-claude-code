import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { z } from "zod";
import { fetchMarketData, runAnomalyDetection } from "@/lib/marketData";
import { computeRiskScore } from "@/lib/scoring";
import { generateNarrative } from "@/lib/narrative";
import { canUserScan, incrementScanCount } from "@/lib/usage";
import { logScanHistory } from "@/lib/admin/metrics";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
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
  stockInfo?: {
    companyName?: string;
    exchange?: string;
    lastPrice?: number;
    marketCap?: number;
    avgVolume?: number;
  };
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
      stockInfo: data.stock_info ? {
        companyName: data.stock_info.company_name,
        exchange: data.stock_info.exchange,
        lastPrice: data.stock_info.last_price,
        marketCap: data.stock_info.market_cap,
        avgVolume: data.stock_info.avg_volume,
      } : undefined,
    };
  } catch (error) {
    console.error("AI backend call failed:", error);
    return { success: false };
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Rate limit: heavy for CPU-intensive scan operations (10 requests per minute)
    const { success: rateLimitSuccess, headers: rateLimitHeaders } = await rateLimit(request, "heavy");
    if (!rateLimitSuccess) {
      return rateLimitExceededResponse(rateLimitHeaders);
    }

    // Check authentication - support both session (web) and JWT (mobile)
    let userId: string | null = null;

    // Try session auth first (web)
    const session = await auth();
    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      // Fall back to JWT auth (mobile)
      userId = await authenticateMobileRequest(request);
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const checkRequest = validation.data;
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

    let aiStockInfo: typeof aiResult.stockInfo | undefined;

    if (aiResult.success && aiResult.riskLevel && aiResult.signals) {
      // Use AI backend results
      usedAIBackend = true;
      aiStockInfo = aiResult.stockInfo;
      console.log(`Using Python AI backend for ${ticker}`);

      // Fetch market data as fallback for stock summary if AI doesn't provide it
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

    // Build stock summary - prefer AI backend data when available
    const stockSummary: StockSummary = {
      ticker,
      companyName: checkRequest.companyName || aiStockInfo?.companyName || marketData.quote?.companyName,
      exchange: aiStockInfo?.exchange || marketData.quote?.exchange,
      lastPrice: aiStockInfo?.lastPrice ?? marketData.quote?.lastPrice,
      marketCap: aiStockInfo?.marketCap ?? marketData.quote?.marketCap,
      avgDollarVolume30d: aiStockInfo?.avgVolume
        ? aiStockInfo.avgVolume * (aiStockInfo.lastPrice || 1)
        : marketData.quote?.avgDollarVolume30d,
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

    // Calculate processing time
    const processingTime = Date.now() - startTime;

    // Get client IP for logging (optional)
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : undefined;

    // Save scan to history and update model metrics for dashboard
    await logScanHistory({
      userId,
      ticker,
      assetType: checkRequest.assetType || "stock",
      riskLevel: scoringResult.riskLevel,
      totalScore: scoringResult.totalScore,
      signalsCount: scoringResult.signals.length,
      processingTime,
      isLegitimate: scoringResult.isLegitimate,
      pitchProvided: !!checkRequest.pitchText,
      contextProvided: Object.values(context).some(Boolean),
      ipAddress,
    });

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
