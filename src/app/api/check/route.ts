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
} from "@/lib/types";

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

    // Fetch market data
    const marketData = await fetchMarketData(checkRequest.ticker);

    // Build context with defaults
    const context = {
      unsolicited: checkRequest.context?.unsolicited ?? false,
      promisesHighReturns: checkRequest.context?.promisesHighReturns ?? false,
      urgencyPressure: checkRequest.context?.urgencyPressure ?? false,
      secrecyInsideInfo: checkRequest.context?.secrecyInsideInfo ?? false,
    };

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
