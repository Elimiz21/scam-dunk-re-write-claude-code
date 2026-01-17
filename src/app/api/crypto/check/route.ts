/**
 * Crypto Scanning API Endpoint
 *
 * Separate from the stock scanning endpoint to maintain isolation
 * and prevent regression. Uses the crypto module for all analysis.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { canUserScan, incrementScanCount } from "@/lib/usage";
import { prisma } from "@/lib/db";
import {
  fetchCryptoMarketData,
  fetchTokenSecurity,
  computeCryptoRiskScore,
  generateCryptoNarrative,
  CryptoCheckRequest,
  CryptoRiskResponse,
  CryptoSummary,
  CryptoMarketData,
  SUPPORTED_CHAINS,
} from "@/lib/crypto";
import { LimitReachedResponse } from "@/lib/types";

// Request validation schema
const cryptoCheckRequestSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").max(20),
  contractAddress: z.string().optional(),
  blockchain: z.string().optional(), // ethereum, bsc, polygon, etc.
  pitchText: z.string().max(10000).optional(),
  context: z
    .object({
      unsolicited: z.boolean().optional().default(false),
      promisesHighReturns: z.boolean().optional().default(false),
      urgencyPressure: z.boolean().optional().default(false),
      secrecyInsideInfo: z.boolean().optional().default(false),
    })
    .optional()
    .default({}),
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Check scan limit (crypto uses same quota as stocks)
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
    const validation = cryptoCheckRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const checkRequest: CryptoCheckRequest = validation.data;
    const symbol = checkRequest.symbol.toUpperCase();

    // Build context with defaults
    const context = {
      unsolicited: checkRequest.context?.unsolicited ?? false,
      promisesHighReturns: checkRequest.context?.promisesHighReturns ?? false,
      urgencyPressure: checkRequest.context?.urgencyPressure ?? false,
      secrecyInsideInfo: checkRequest.context?.secrecyInsideInfo ?? false,
    };

    console.log(`[Crypto] Analyzing ${symbol}...`);

    // =====================================================
    // FETCH MARKET DATA FROM COINGECKO
    // =====================================================
    const marketData: CryptoMarketData = await fetchCryptoMarketData(symbol);

    // =====================================================
    // FETCH SECURITY DATA FROM GOPLUS (if contract address provided)
    // =====================================================
    if (checkRequest.contractAddress && checkRequest.blockchain) {
      console.log(
        `[Crypto] Fetching security data for ${checkRequest.contractAddress} on ${checkRequest.blockchain}`
      );
      const securityData = await fetchTokenSecurity(
        checkRequest.contractAddress,
        checkRequest.blockchain
      );
      marketData.securityData = securityData;
    }

    // =====================================================
    // COMPUTE RISK SCORE
    // =====================================================
    const scoringResult = await computeCryptoRiskScore({
      marketData,
      pitchText: checkRequest.pitchText || "",
      context,
    });

    // =====================================================
    // BUILD CRYPTO SUMMARY
    // =====================================================
    const cryptoSummary: CryptoSummary = {
      symbol,
      name: marketData.quote?.name || symbol,
      blockchain: checkRequest.blockchain,
      lastPrice: marketData.quote?.currentPrice,
      marketCap: marketData.quote?.marketCap,
      marketCapRank: marketData.quote?.marketCapRank,
      volume24h: marketData.quote?.totalVolume24h,
      priceChange24h: marketData.quote?.priceChangePercentage24h,
      priceChange7d: marketData.quote?.priceChangePercentage7d,
      circulatingSupply: marketData.quote?.circulatingSupply,
      totalSupply: marketData.quote?.totalSupply,
      contractAddress: checkRequest.contractAddress,
    };

    // =====================================================
    // GENERATE NARRATIVE
    // =====================================================
    const narrative = await generateCryptoNarrative(
      scoringResult.riskLevel,
      scoringResult.totalScore,
      scoringResult.signals,
      cryptoSummary,
      scoringResult.isLegitimate
    );

    // Add security data source info if available
    if (marketData.securityData?.securityAvailable) {
      narrative.disclaimers.push(
        "Contract security data provided by GoPlus Security API"
      );
    }

    // =====================================================
    // INCREMENT SCAN COUNT & SAVE HISTORY
    // =====================================================
    const updatedUsage = await incrementScanCount(userId);

    // Save scan to history
    try {
      await prisma.scanHistory.create({
        data: {
          userId,
          ticker: symbol,
          assetType: "crypto",
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
      console.error("Failed to save crypto scan history:", historyError);
    }

    // =====================================================
    // BUILD RESPONSE
    // =====================================================
    const response: CryptoRiskResponse = {
      riskLevel: scoringResult.riskLevel,
      totalScore: scoringResult.totalScore,
      signals: scoringResult.signals,
      cryptoSummary,
      narrative,
      usage: updatedUsage,
      isLegitimate: scoringResult.isLegitimate,
    };

    console.log(
      `[Crypto] ${symbol} analysis complete: ${scoringResult.riskLevel} (score: ${scoringResult.totalScore})`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("Crypto Check API error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Crypto check failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to list supported chains
 */
export async function GET() {
  return NextResponse.json({
    supportedChains: Object.entries(SUPPORTED_CHAINS).map(([key, value]) => ({
      id: key,
      chainId: value.chainId,
      name: value.name,
    })),
  });
}
