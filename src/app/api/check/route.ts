import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { z } from "zod";
import { fetchMarketData, runAnomalyDetection, checkAlertList } from "@/lib/marketData";
import { computeRiskScore } from "@/lib/scoring";
import { generateNarrative } from "@/lib/narrative";
import { canUserScan, incrementScanCount } from "@/lib/usage";
import { logScanHistory } from "@/lib/admin/metrics";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { sendAPIFailureAlert } from "@/lib/email";
import {
  CheckRequest,
  LimitReachedResponse,
  RiskResponse,
  StockSummary,
  RiskSignal,
} from "@/lib/types";

// Allow up to 30 seconds for the full AI pipeline (Python backend + market data + narrative)
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

// Python AI backend URL (must match ai-analyze/route.ts and config.ts default)
const AI_BACKEND_URL = process.env.AI_BACKEND_URL || "http://localhost:8000";

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
  assetType: string,
  secFlagged?: boolean
): Promise<{
  success: boolean;
  failReason?: string;
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
  newsVerification?: {
    hasLegitimateCatalyst: boolean;
    hasSecFilings: boolean;
    hasPromotionalSignals: boolean;
    catalystSummary: string;
    shouldReduceRisk: boolean;
    recommendedLevel: string;
  };
}> {
  // Skip if no backend URL configured
  if (!AI_BACKEND_URL) {
    console.log("AI_BACKEND_URL not configured, using TypeScript scoring");
    return { success: false, failReason: "AI_BACKEND_URL not configured" };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout - keep short so TypeScript fallback has time

    console.log(`Calling Python AI backend: ${AI_BACKEND_URL}/analyze`);

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
        use_live_data: true,
        days: 90,
        sec_flagged: secFlagged ?? null,
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
      return { success: false, failReason: `AI backend returned HTTP ${response.status}` };
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
      newsVerification: data.news_verification ? {
        hasLegitimateCatalyst: data.news_verification.has_legitimate_catalyst,
        hasSecFilings: data.news_verification.has_sec_filings,
        hasPromotionalSignals: data.news_verification.has_promotional_signals,
        catalystSummary: data.news_verification.catalyst_summary,
        shouldReduceRisk: data.news_verification.should_reduce_risk,
        recommendedLevel: data.news_verification.recommended_level,
      } : undefined,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("AI backend call failed:", error);
    return { success: false, failReason: `Exception: ${errMsg}` };
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let currentStep = "INIT";

  try {
    // Rate limit: heavy for CPU-intensive scan operations (10 requests per minute)
    // Wrapped in try/catch because Upstash Redis uses fetch internally and can fail
    currentStep = "RATE_LIMIT";
    try {
      const { success: rateLimitSuccess, headers: rateLimitHeaders } = await rateLimit(request, "heavy");
      if (!rateLimitSuccess) {
        return rateLimitExceededResponse(rateLimitHeaders);
      }
    } catch (rateLimitError) {
      // Fail closed: if rate limiting is unavailable, reject the request
      console.error("Rate limit check failed:", rateLimitError);
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }

    // Check authentication - support both session (web) and JWT (mobile)
    currentStep = "AUTH";
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
    currentStep = "USAGE_CHECK";
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
    currentStep = "PARSE_REQUEST";
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
    // CHECK REGULATORY DATABASE (real SEC EDGAR data)
    // =====================================================
    currentStep = "SEC_CHECK";
    const secFlagged = await checkAlertList(ticker);

    // =====================================================
    // TRY PYTHON AI BACKEND FIRST (Full ML Models)
    // =====================================================
    currentStep = "AI_BACKEND";
    const aiResult = await callPythonAIBackend(ticker, checkRequest.assetType || "stock", secFlagged);

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
      currentStep = "MARKET_DATA_AI";
      marketData = await fetchMarketData(ticker, checkRequest.assetType);

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

      // Fetch market data (pass assetType to use correct API - CoinGecko for crypto)
      currentStep = "MARKET_DATA_TS";
      marketData = await fetchMarketData(ticker, checkRequest.assetType);

      if (!marketData.dataAvailable) {
        console.warn(`No market data available for ${ticker} — scoring will return INSUFFICIENT. Check that FMP_API_KEY or ALPHA_VANTAGE_API_KEY is configured.`);
      }

      // Compute risk score using TypeScript (returns INSUFFICIENT when no data)
      currentStep = "SCORING";
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
    currentStep = "NARRATIVE";
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
    currentStep = "INCREMENT_USAGE";
    const updatedUsage = await incrementScanCount(userId);

    // Calculate processing time
    const processingTime = Date.now() - startTime;

    // Get client IP for logging (optional)
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : undefined;

    // Save scan to history and update model metrics for dashboard
    currentStep = "LOG_HISTORY";
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
      ...(aiResult.newsVerification ? { newsVerification: aiResult.newsVerification } : {}),
    };

    return NextResponse.json(response);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`Check API error at step [${currentStep}] after ${elapsed}ms:`, error);

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

    return NextResponse.json(
      { error: "An internal error occurred. Please try again later." },
      { status: 500 }
    );
  }
}
