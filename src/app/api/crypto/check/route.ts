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
import { config } from "@/lib/config";

// Python AI backend URL
const AI_BACKEND_URL = process.env.AI_BACKEND_URL || "http://localhost:8000";

interface AIBackendCryptoResponse {
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
  crypto_signals?: Array<{
    code: string;
    category: string;
    description: string;
    weight: number;
  }>;
  crypto_risk_probability?: number;
  features: Record<string, number | null>;
  explanations: string[];
  data_available: boolean;
  analysis_timestamp: string;
}

/**
 * Check if Python AI backend is available and healthy
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

/**
 * Call Python AI backend for crypto analysis with crypto-calibrated thresholds
 */
async function callAIBackendForCrypto(
  symbol: string,
  marketData: CryptoMarketData
): Promise<AIBackendCryptoResponse | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    // Prepare fundamentals for the AI backend
    const fundamentals = {
      symbol: symbol,
      market_cap: marketData.quote?.marketCap || 0,
      volume_24h: marketData.quote?.totalVolume24h || 0,
      circulating_supply: marketData.quote?.circulatingSupply || 0,
      total_supply: marketData.quote?.totalSupply || 0,
      holder_count: marketData.securityData?.holderCount || 0,
      top_10_concentration: marketData.securityData?.top10HolderPercent || 0,
    };

    // Prepare security data if available
    const securityData = marketData.securityData ? {
      is_honeypot: marketData.securityData.isHoneypot,
      is_mintable: marketData.securityData.canMint,
      hidden_owner: marketData.securityData.hiddenOwner,
      can_blacklist: marketData.securityData.canBlacklist,
      buy_tax: marketData.securityData.buyTax,
      sell_tax: marketData.securityData.sellTax,
      lp_locked: marketData.securityData.lpLocked,
      lp_lock_duration_days: marketData.securityData.lpLockDuration || 0,
      owner_change_balance: marketData.securityData.ownerChangeBalance,
    } : null;

    const response = await fetch(`${AI_BACKEND_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: symbol,
        asset_type: "crypto",
        use_live_data: false, // We already have market data
        fundamentals,
        security_data: securityData,
        days: 30,
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
    console.error("AI backend unavailable for crypto:", error);
    return null;
  }
}

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
    // TRY AI BACKEND FIRST (uses crypto-calibrated thresholds)
    // =====================================================
    let scoringResult;
    let aiBackendUsed = false;

    const aiBackendAvailable = await checkAIBackendHealth();
    if (aiBackendAvailable) {
      console.log(`[Crypto] Using AI backend with crypto-calibrated analysis...`);
      const aiResult = await callAIBackendForCrypto(symbol, marketData);

      if (aiResult) {
        aiBackendUsed = true;
        // Convert AI backend response to our scoring result format
        const aiSignals = [
          ...(aiResult.signals || []),
          ...(aiResult.crypto_signals || []),
        ].map(sig => ({
          code: sig.code,
          description: sig.description,
          weight: sig.weight,
          category: sig.category as "STRUCTURAL" | "PATTERN" | "CONTRACT" | "LIQUIDITY" | "DISTRIBUTION" | "BEHAVIORAL",
          severity: sig.weight >= 20 ? "critical" as const : sig.weight >= 10 ? "warning" as const : "info" as const,
        }));

        scoringResult = {
          riskLevel: aiResult.risk_level as "LOW" | "MEDIUM" | "HIGH",
          totalScore: Math.round(aiResult.risk_probability * 20), // Convert to 0-20 scale
          signals: aiSignals,
          isLegitimate: aiResult.risk_level === "LOW",
          aiBackendUsed: true,
          rfProbability: aiResult.rf_probability,
          lstmProbability: aiResult.lstm_probability,
          cryptoRiskProbability: aiResult.crypto_risk_probability,
        };
        console.log(`[Crypto] AI backend analysis complete: ${aiResult.risk_level}`);
      }
    }

    // =====================================================
    // FALLBACK: DETERMINISTIC SCORING (if AI backend unavailable)
    // =====================================================
    if (!aiBackendUsed) {
      console.log(`[Crypto] Using deterministic scoring (AI backend unavailable)...`);
      scoringResult = await computeCryptoRiskScore({
        marketData,
        pitchText: checkRequest.pitchText || "",
        context,
      });
    }

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
