import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { z } from "zod";
import { fetchMarketData, checkAlertList } from "@/lib/marketData";
import { computeRiskScore, computeIsLegitimate } from "@/lib/scoring";
import {
  dedupeSignalScore,
  calculateRiskLevel,
  getDataCompleteness,
} from "@/lib/scoring/engine";
import { generateNarrative } from "@/lib/narrative";
import { reserveScanSlot, refundScanSlot } from "@/lib/usage";
import { logScanHistory } from "@/lib/admin/metrics";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { sendAPIFailureAlert } from "@/lib/email";
import { parseAIBackendResponse } from "@/lib/ai-backend-schema";
import {
  LimitReachedResponse,
  RiskResponse,
  RiskLevel,
  StockSummary,
  RiskSignal,
  SignalCategory,
} from "@/lib/types";

// Allow up to 30 seconds for the full AI pipeline (Python backend + market data + narrative)
export const maxDuration = 30;

// Python AI backend URL (must match ai-analyze/route.ts and config.ts default)
const AI_BACKEND_URL = process.env.AI_BACKEND_URL || "http://localhost:8000";

// No-downgrade guard: when enabled (default), if the AI backend returns a
// LOWER risk level than the TypeScript deterministic baseline, we use the
// baseline instead.  This ensures the AI backend is purely additive and
// can never mask a high-risk finding.  Set AI_NO_DOWNGRADE_GUARD=false
// to disable (e.g. during controlled experiments).
const NO_DOWNGRADE_GUARD = process.env.AI_NO_DOWNGRADE_GUARD !== "false";

const RISK_PRIORITY: Record<string, number> = {
  INSUFFICIENT: -1,
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

const VALID_CATEGORIES: SignalCategory[] = [
  "STRUCTURAL",
  "PATTERN",
  "ALERT",
  "BEHAVIORAL",
  "SOCIAL",
];

function normalizeCategory(category: string | undefined): SignalCategory {
  const upper = (category || "").toUpperCase() as SignalCategory;
  return VALID_CATEGORIES.includes(upper) ? upper : "PATTERN";
}

// Request validation schema - only ticker is required
const checkRequestSchema = z.object({
  ticker: z.string().min(1, "Ticker is required").max(10),
  companyName: z.string().optional(),
  assetType: z.enum(["stock", "crypto"]).optional().default("stock"),
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

/** Details describing a backend 503 (data API outage) so the route can alert. */
interface ServiceUnavailableInfo {
  apiName: string;
  ticker: string;
  assetType: string;
  originalError: string;
}

interface AIBackendCallResult {
  success: boolean;
  failReason?: string;
  /** Present when the backend returned 503 — route should alert + fall back. */
  serviceUnavailable?: ServiceUnavailableInfo;
  riskLevel?: RiskLevel;
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
}

/**
 * Call the Python AI backend for full ML analysis.
 *
 * Never throws: a backend 503 is captured into `serviceUnavailable` so the
 * caller can fire the admin alert AND gracefully fall back to TypeScript
 * scoring rather than hard-failing the user (audit TS-C2). The response is
 * validated through the zod contract schema; an invalid payload is treated as
 * a failure so we fall back (audit TS-H7).
 */
async function callPythonAIBackend(
  ticker: string,
  assetType: string,
  secFlagged?: boolean,
  newsFlag?: boolean,
): Promise<AIBackendCallResult> {
  if (!AI_BACKEND_URL) {
    console.log("AI_BACKEND_URL not configured, using TypeScript scoring");
    return { success: false, failReason: "AI_BACKEND_URL not configured" };
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout - keep short so TS fallback has time

    console.log(`Calling Python AI backend: ${AI_BACKEND_URL}/analyze`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (process.env.AI_API_SECRET) {
      headers["X-API-Key"] = process.env.AI_API_SECRET;
    }

    const response = await fetch(`${AI_BACKEND_URL}/analyze`, {
      method: "POST",
      headers,
      // TS <-> Python contract (see ai-backend-schema.ts).
      body: JSON.stringify({
        ticker,
        asset_type: assetType,
        use_live_data: true,
        days: 90,
        sec_flagged: secFlagged ?? null,
        news_flag: newsFlag ?? null,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 503) {
        const errorData = await response.json().catch(() => ({}));
        const detail = errorData.detail || {};
        console.error(`AI backend returned 503 - Service Unavailable:`, detail);
        // Capture (do NOT throw) so the caller can both alert and fall back.
        return {
          success: false,
          failReason: "AI backend 503 (data API unavailable)",
          serviceUnavailable: {
            apiName: detail.api_name || "Unknown API",
            ticker: detail.ticker || ticker,
            assetType: detail.asset_type || assetType,
            originalError: detail.original_error || "Data API unavailable",
          },
        };
      }

      console.error(`AI backend returned ${response.status}`);
      return {
        success: false,
        failReason: `AI backend returned HTTP ${response.status}`,
      };
    }

    const raw = await response.json();
    const data = parseAIBackendResponse(raw);
    if (!data) {
      // Payload failed the contract — fall back to TS scoring.
      return {
        success: false,
        failReason: "AI backend response failed schema validation",
      };
    }

    console.log(
      `AI backend response for ${ticker}: ${data.risk_level} (${data.risk_probability})`,
    );

    const signals: RiskSignal[] = data.signals.map((s) => ({
      code: s.code,
      category: normalizeCategory(s.category),
      description: s.description,
      weight: s.weight,
    }));

    return {
      success: true,
      riskLevel: data.risk_level,
      probability: data.risk_probability,
      signals,
      rfProbability: data.rf_probability ?? null,
      lstmProbability: data.lstm_probability ?? null,
      anomalyScore: data.anomaly_score,
      explanations: data.explanations,
      secFlagged: data.sec_flagged,
      isOtc: data.is_otc,
      isMicroCap: data.is_micro_cap,
      stockInfo: data.stock_info
        ? {
            companyName: data.stock_info.company_name,
            exchange: data.stock_info.exchange,
            lastPrice: data.stock_info.last_price,
            marketCap: data.stock_info.market_cap,
            avgVolume: data.stock_info.avg_volume,
          }
        : undefined,
      newsVerification: data.news_verification
        ? {
            hasLegitimateCatalyst:
              data.news_verification.has_legitimate_catalyst,
            hasSecFilings: data.news_verification.has_sec_filings,
            hasPromotionalSignals:
              data.news_verification.has_promotional_signals,
            catalystSummary: data.news_verification.catalyst_summary,
            shouldReduceRisk: data.news_verification.should_reduce_risk,
            recommendedLevel: data.news_verification.recommended_level,
          }
        : undefined,
    };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("AI backend call failed:", error);
    return { success: false, failReason: `Exception: ${errMsg}` };
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let currentStep = "INIT";
  // Tracks whether a quota slot has been reserved, so the error path can refund
  // it (and only it) on failure without refunding requests that never reserved.
  let userIdForRefund: string | null = null;

  try {
    // Rate limit: heavy for CPU-intensive scan operations (10 requests per minute)
    currentStep = "RATE_LIMIT";
    try {
      const { success: rateLimitSuccess, headers: rateLimitHeaders } =
        await rateLimit(request, "heavy");
      if (!rateLimitSuccess) {
        return rateLimitExceededResponse(rateLimitHeaders);
      }
    } catch (rateLimitError) {
      // Fail closed: if rate limiting is unavailable, reject the request
      console.error("Rate limit check failed:", rateLimitError);
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please try again later." },
        { status: 503 },
      );
    }

    // Check authentication - support both session (web) and JWT (mobile)
    currentStep = "AUTH";
    let userId: string | null = null;
    const session = await auth();
    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      userId = await authenticateMobileRequest(request);
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body BEFORE reserving a scan slot so malformed
    // requests don't burn quota (audit TS-M13).
    currentStep = "PARSE_REQUEST";
    const body = await request.json().catch(() => null);
    const validation = checkRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 },
      );
    }

    const checkRequest = validation.data;
    const ticker = checkRequest.ticker.toUpperCase();
    const assetType = checkRequest.assetType || "stock";

    const context = {
      unsolicited: checkRequest.context?.unsolicited ?? false,
      promisesHighReturns: checkRequest.context?.promisesHighReturns ?? false,
      urgencyPressure: checkRequest.context?.urgencyPressure ?? false,
      secrecyInsideInfo: checkRequest.context?.secrecyInsideInfo ?? false,
    };

    // Cheap regulatory check (no quota consumed) runs BEFORE reserving a slot.
    currentStep = "SEC_CHECK";
    const secFlagged = await checkAlertList(ticker);

    // Atomically check scan limit and reserve a slot (prevents TOCTOU race).
    currentStep = "USAGE_CHECK";
    const { reserved, usage } = await reserveScanSlot(userId);

    if (!reserved) {
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

    // A slot is now reserved — the error path below must refund it on failure.
    userIdForRefund = userId;

    // =====================================================
    // TRY PYTHON AI BACKEND FIRST (Full ML Models)
    // =====================================================
    currentStep = "AI_BACKEND";
    const aiResult = await callPythonAIBackend(ticker, assetType, secFlagged);

    // If the backend reported a data-API outage (503), alert admins
    // asynchronously and FALL BACK to TypeScript scoring (audit TS-C2) —
    // never hard-fail the user.
    if (aiResult.serviceUnavailable) {
      const info = aiResult.serviceUnavailable;
      console.error(
        `AI backend data API unavailable — API: ${info.apiName}, Ticker: ${info.ticker}, Type: ${info.assetType}. Falling back to TypeScript scoring.`,
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

    let scoringResult: {
      riskLevel: RiskLevel;
      totalScore: number;
      signals: RiskSignal[];
      isInsufficient: boolean;
      isLegitimate: boolean;
      dataCompleteness?: RiskResponse["dataCompleteness"];
    };
    let marketData;
    let usedAIBackend = false;
    let aiStockInfo: typeof aiResult.stockInfo | undefined;

    if (aiResult.success && aiResult.riskLevel && aiResult.signals) {
      usedAIBackend = true;
      aiStockInfo = aiResult.stockInfo;
      console.log(`Using Python AI backend for ${ticker}`);

      // Fetch market data (needed for stock summary, legitimacy + baseline).
      currentStep = "MARKET_DATA_AI";
      marketData = await fetchMarketData(ticker, assetType);

      // Derive the displayed score and level CONSISTENTLY from the same set of
      // signals so we can never show e.g. HIGH with score 0 (audit TS-H7). The
      // de-dup logic also stops correlated signals double-counting (TS-C1).
      const aiSignals = aiResult.signals;
      let aiTotalScore = dedupeSignalScore(aiSignals);
      if (!Number.isFinite(aiTotalScore)) aiTotalScore = 0;

      // Prefer the backend ensemble level, but never let it contradict an
      // alert-list hit, and keep level/score coherent.
      const derivedLevel = calculateRiskLevel(aiTotalScore, aiSignals);
      const backendPriority = RISK_PRIORITY[aiResult.riskLevel] ?? 0;
      const derivedPriority = RISK_PRIORITY[derivedLevel] ?? 0;
      // Take the MORE severe of the backend level and the score-derived level.
      const aiRiskLevel: RiskLevel =
        derivedPriority > backendPriority ? derivedLevel : aiResult.riskLevel;

      // isLegitimate via the SHARED check (large-cap/liquidity/major-exchange,
      // forced false when not LOW) — never "well-established" for an unknown
      // ticker just because it had no signals (audit TS-H6).
      const aiIsLegitimate = computeIsLegitimate(
        marketData,
        aiSignals,
        aiRiskLevel,
      );

      scoringResult = {
        riskLevel: aiRiskLevel,
        totalScore: aiTotalScore,
        signals: aiSignals,
        isInsufficient: aiRiskLevel === "INSUFFICIENT",
        isLegitimate: aiIsLegitimate,
        dataCompleteness: getDataCompleteness(marketData),
      };

      // =====================================================
      // NO-DOWNGRADE GUARD
      // =====================================================
      if (NO_DOWNGRADE_GUARD && scoringResult.riskLevel !== "HIGH") {
        currentStep = "BASELINE_COMPARISON";
        try {
          const baselineResult = await computeRiskScore({
            marketData,
            pitchText: checkRequest.pitchText || "",
            context,
            secFlagged,
          });

          const aiPriority = RISK_PRIORITY[scoringResult.riskLevel] ?? 0;
          const baselinePriority = RISK_PRIORITY[baselineResult.riskLevel] ?? 0;

          if (baselinePriority > aiPriority) {
            console.log(
              `No-downgrade guard: AI=${scoringResult.riskLevel}(${scoringResult.totalScore}), ` +
                `baseline=${baselineResult.riskLevel}(${baselineResult.totalScore}) → using baseline`,
            );
            scoringResult = baselineResult;
            usedAIBackend = false;
            aiStockInfo = undefined;
          }
        } catch (baselineError) {
          console.warn(
            "Baseline comparison failed, keeping AI result:",
            baselineError,
          );
        }
      }
    } else {
      // =====================================================
      // FALLBACK TO TYPESCRIPT SCORING
      // =====================================================
      console.log(`Falling back to TypeScript scoring for ${ticker}`);

      currentStep = "MARKET_DATA_TS";
      marketData = await fetchMarketData(ticker, assetType);

      if (!marketData.dataAvailable) {
        console.warn(
          `No market data available for ${ticker} — relying on alert-list/behavioral signals. Check that FMP_API_KEY or ALPHA_VANTAGE_API_KEY is configured.`,
        );
      }

      // Pass the already-computed secFlagged so a flagged-but-quoteless ticker
      // is HIGH rather than INSUFFICIENT (audit TS-C6).
      currentStep = "SCORING";
      scoringResult = await computeRiskScore({
        marketData,
        pitchText: checkRequest.pitchText || "",
        context,
        secFlagged,
      });
    }

    // Build stock summary - prefer API-derived company name over user-supplied
    // (audit TS-M8: user-supplied name is untrusted and could carry injection).
    const stockSummary: StockSummary = {
      ticker,
      companyName:
        aiStockInfo?.companyName ||
        marketData.quote?.companyName ||
        checkRequest.companyName,
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
      scoringResult.isLegitimate,
    );

    if (usedAIBackend) {
      narrative.disclaimers.push(
        "Analysis powered by AI models: Random Forest + LSTM + Anomaly Detection",
      );
    }

    if (scoringResult.dataCompleteness === "quote-only") {
      narrative.disclaimers.push(
        "Limited price history was available — pattern and anomaly detection could not be fully evaluated for this ticker.",
      );
    }

    const updatedUsage = usage;
    const processingTime = Date.now() - startTime;

    const forwardedFor = request.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor
      ? forwardedFor.split(",")[0].trim()
      : undefined;

    // Save scan to history — fire-and-forget so a metrics hiccup can't 500 a
    // completed analysis after the slot was consumed (audit TS-M13).
    currentStep = "LOG_HISTORY";
    const isOtcScan =
      marketData.isOTC ||
      scoringResult.signals.some((s) => s.code === "OTC_EXCHANGE");
    const isMicroCapScan =
      (marketData.quote?.marketCap ?? 0) < 50_000_000 ||
      scoringResult.signals.some(
        (s) => s.code === "SMALL_MARKET_CAP" || s.code === "MICRO_CAP",
      );
    const isHighVolumeScan = scoringResult.signals.some(
      (s) => s.code === "VOLUME_EXPLOSION" || s.code === "VOLUME_ANOMALY",
    );

    void logScanHistory({
      userId,
      ticker,
      assetType,
      riskLevel: scoringResult.riskLevel,
      totalScore: scoringResult.totalScore,
      signalsCount: scoringResult.signals.length,
      processingTime,
      isLegitimate: scoringResult.isLegitimate,
      pitchProvided: !!checkRequest.pitchText,
      contextProvided: Object.values(context).some(Boolean),
      ipAddress,
      isOtc: isOtcScan,
      isMicroCap: isMicroCapScan,
      isHighVolume: isHighVolumeScan,
      usedAiBackend: usedAIBackend,
    }).catch((logError) => {
      console.error("Failed to log scan history:", logError);
    });

    const response: RiskResponse = {
      riskLevel: scoringResult.riskLevel,
      totalScore: scoringResult.totalScore,
      signals: scoringResult.signals,
      stockSummary,
      narrative,
      usage: updatedUsage,
      isLegitimate: scoringResult.isLegitimate,
      dataCompleteness: scoringResult.dataCompleteness,
      // Only attach news verification if the AI result actually drove this
      // response (not when the no-downgrade guard replaced it — audit TS-L7).
      ...(usedAIBackend && aiResult.newsVerification
        ? { newsVerification: aiResult.newsVerification }
        : {}),
    };

    return NextResponse.json(response);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(
      `Check API error at step [${currentStep}] after ${elapsed}ms:`,
      error,
    );

    // If a scan slot was reserved before this 5xx, refund it so users aren't
    // charged for a scan that never produced a result (audit ARCH-C4).
    // Fire-and-forget: a refund hiccup must not itself fail the response.
    if (userIdForRefund) {
      void refundScanSlot(userIdForRefund).catch((refundError) => {
        console.error("Failed to refund scan slot:", refundError);
      });
    }

    return NextResponse.json(
      { error: "An internal error occurred. Please try again later." },
      { status: 500 },
    );
  }
}
