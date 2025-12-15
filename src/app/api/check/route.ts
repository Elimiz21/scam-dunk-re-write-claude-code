import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { fetchMarketData } from "@/lib/marketData";
import { computeRiskScore } from "@/lib/scoring";
import { generateNarrative } from "@/lib/narrative";
import { canUserScan, incrementScanCount } from "@/lib/usage";
import {
  CheckRequest,
  CheckResponse,
  LimitReachedResponse,
  RiskResponse,
  StockSummary,
  RiskSignal,
} from "@/lib/types";

// Python AI backend URL
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
  stock_info?: {
    company_name?: string;
    exchange?: string;
    last_price?: number;
    market_cap?: number;
    avg_volume?: number;
  };
}

/**
 * Call the Python AI backend for full ML analysis
 */
async function callAIBackend(
  ticker: string,
  assetType: string
): Promise<AIBackendResponse | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

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
      return data.status === "healthy";
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

    // Build context with defaults
    const context = {
      unsolicited: checkRequest.context?.unsolicited ?? false,
      promisesHighReturns: checkRequest.context?.promisesHighReturns ?? false,
      urgencyPressure: checkRequest.context?.urgencyPressure ?? false,
      secrecyInsideInfo: checkRequest.context?.secrecyInsideInfo ?? false,
    };

    // Try the Python AI backend first (has real market data via yfinance)
    const aiBackendAvailable = await checkAIBackendHealth();

    if (aiBackendAvailable) {
      const aiResult = await callAIBackend(checkRequest.ticker, checkRequest.assetType || "stock");

      if (aiResult && aiResult.data_available) {
        // Get stock info from AI backend (populated from yfinance)
        const stockInfo = aiResult.stock_info;

        // Fallback: Extract market cap from features if not in stock_info
        const logMarketCap = aiResult.features.log_market_cap;
        const fallbackMarketCap = logMarketCap ? Math.exp(logMarketCap) : undefined;

        // Build stock summary from AI backend data
        const stockSummary: StockSummary = {
          ticker: aiResult.ticker.toUpperCase(),
          companyName: checkRequest.companyName || stockInfo?.company_name || aiResult.ticker.toUpperCase(),
          exchange: stockInfo?.exchange || (aiResult.is_otc ? "OTC" : "NYSE/NASDAQ"),
          lastPrice: stockInfo?.last_price,
          marketCap: stockInfo?.market_cap || fallbackMarketCap,
          avgDollarVolume30d: stockInfo?.avg_volume ? stockInfo.avg_volume * (stockInfo.last_price || 1) : undefined,
        };

        // Convert AI signals to RiskSignal format
        const signals: RiskSignal[] = aiResult.signals.map(s => ({
          code: s.code,
          category: s.category as "STRUCTURAL" | "PATTERN" | "ALERT" | "BEHAVIORAL",
          description: s.description,
          weight: s.weight,
        }));

        // Map risk level
        const riskLevel = aiResult.risk_level as "LOW" | "MEDIUM" | "HIGH" | "INSUFFICIENT";

        // Generate narrative
        const narrative = await generateNarrative(
          riskLevel,
          aiResult.risk_score,
          signals,
          stockSummary,
          riskLevel === "LOW"
        );

        // Increment scan count
        const updatedUsage = await incrementScanCount(userId);

        // Build response
        const response: RiskResponse = {
          riskLevel,
          totalScore: aiResult.risk_score,
          signals,
          stockSummary,
          narrative,
          usage: updatedUsage,
          isLegitimate: riskLevel === "LOW",
        };

        return NextResponse.json(response);
      }
    }

    // Fall back to TypeScript scoring if AI backend unavailable
    console.log("Falling back to TypeScript scoring");

    // Fetch market data using Alpha Vantage
    const marketData = await fetchMarketData(checkRequest.ticker);

    // Compute risk score (deterministic)
    const scoringResult = await computeRiskScore({
      marketData,
      pitchText: checkRequest.pitchText || "",
      context,
    });

    // Build stock summary
    const stockSummary: StockSummary = {
      ticker: checkRequest.ticker.toUpperCase(),
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

    // Increment scan count after successful analysis
    const updatedUsage = await incrementScanCount(userId);

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
