import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { z } from "zod";
import { fetchMarketData, checkAlertList } from "@/lib/marketData";
import { computeRiskScore } from "@/lib/scoring";
import {
  applyPumpDumpFeasibilityFilter,
} from "@/lib/scoring/engine";
import { generateFallbackNarrative, generateNarrative } from "@/lib/narrative";
import { beginScan, completeScan, failScan, ScanConflict, type ScanLease } from "@/lib/scan-completion";
import { SCORING_VERSION, SCORE_UNIT } from "@/lib/scoring/policy";
import { logScanHistory } from "@/lib/admin/metrics";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { normalizeSupportedTicker } from "@/lib/stock-universe";
import {
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
  context: z
    .object({
      unsolicited: z.boolean().optional().default(false),
      promisesHighReturns: z.boolean().optional().default(false),
      urgencyPressure: z.boolean().optional().default(false),
      secrecyInsideInfo: z.boolean().optional().default(false),
    })
    .optional()
    .default({ unsolicited: false, promisesHighReturns: false, urgencyPressure: false, secrecyInsideInfo: false }),
});

export type AuthorizedStockScanRequest = {
  idempotencyKey?: string;
  userId: string;
  ticker: string;
  assetType: "stock";
};

export async function processCheckRequest(
  request: NextRequest,
  authenticatedUserId?: string,
  fastNarrative = false,
) {
  const startTime = Date.now();
  let currentStep = "INIT";
  // Tracks whether a quota slot has been reserved, so the error path can refund
  // it (and only it) on failure without refunding requests that never reserved.
  let scanLease: ScanLease | null = null;

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
    let userId: string | null = authenticatedUserId ?? null;
    if (!userId) {
      const session = await auth();
      if (session?.user?.id) {
        userId = session.user.id;
      } else {
        userId = await authenticateMobileRequest(request);
      }
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
        { error: validation.error.issues[0].message },
        { status: 400 },
      );
    }

    const checkRequest = validation.data;
    const ticker = checkRequest.ticker.toUpperCase();
    const assetType = checkRequest.assetType || "stock";

    // V1 is limited to US-listed common stocks. Reject unsupported inputs
    // before regulatory lookups or quota reservation so they never consume a
    // scan credit.
    if (assetType !== "stock") {
      return NextResponse.json(
        { error: "Only US-listed common stocks are supported in ScamDunk V1.", code: "UNSUPPORTED_ASSET" },
        { status: 400 },
      );
    }
    const normalizedTicker = normalizeSupportedTicker(ticker);
    if ("reason" in normalizedTicker) {
      const code = normalizedTicker.reason;
      return NextResponse.json(
        { error: "Enter a supported US-listed common-stock ticker.", code },
        { status: 400 },
      );
    }
    const supportedTicker = normalizedTicker.ticker;

    const context = {
      unsolicited: checkRequest.context?.unsolicited ?? false,
      promisesHighReturns: checkRequest.context?.promisesHighReturns ?? false,
      urgencyPressure: checkRequest.context?.urgencyPressure ?? false,
      secrecyInsideInfo: checkRequest.context?.secrecyInsideInfo ?? false,
    };

    // Cheap regulatory check (no quota consumed) runs BEFORE reserving a slot.
    currentStep = "SEC_CHECK";
    const secFlagged = await checkAlertList(supportedTicker);

    // Atomically check scan limit and reserve a slot (prevents TOCTOU race).
    currentStep = "USAGE_CHECK";
    const requestKey = request.headers.get("idempotency-key") || randomUUID();
    if (!/^[A-Za-z0-9:._-]{1,128}$/.test(requestKey)) return NextResponse.json({ error: "Invalid idempotency key" }, { status: 400 });
    const reservation = await beginScan(userId, requestKey, { ...checkRequest, ticker: supportedTicker });
    if (reservation.state === "COMPLETED") return NextResponse.json(reservation.result, { headers: { "Cache-Control": "private, no-store" } });
    if (reservation.state === "PENDING") return NextResponse.json({ error: "SCAN_IN_PROGRESS" }, { status: 409, headers: { "Retry-After": "3" } });
    const { usage } = reservation;
    if (reservation.state === "LIMIT_REACHED") {
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
    scanLease = reservation.lease;

    // One canonical rules engine serves web, mobile, legacy API and messaging.
    // Backend probabilities and differing feature sets cannot change these points.
    currentStep = "MARKET_DATA";
    const marketData = await fetchMarketData(supportedTicker, assetType);
    currentStep = "SCORING";
    let scoringResult = await computeRiskScore({
      marketData, pitchText: checkRequest.pitchText || "", context, secFlagged,
    });
    const usedAIBackend = false;

    // The nightly size/liquidity rule also protects ticker-only customer scans
    // from treating ordinary market activity in very large/liquid stocks as a
    // pump-and-dump warning. Keep regulatory and user-tip evidence intact.
    const filtered = applyPumpDumpFeasibilityFilter(scoringResult, marketData, {
      secFlagged,
      hasUserTip: !!checkRequest.pitchText || Object.values(context).some(Boolean),
    });
    scoringResult = filtered.result;

    // Build stock summary - prefer API-derived company name over user-supplied
    // (audit TS-M8: user-supplied name is untrusted and could carry injection).
    const stockSummary: StockSummary = {
      ticker: supportedTicker,
      companyName:
        marketData.quote?.companyName ||
        checkRequest.companyName,
      exchange: marketData.quote?.exchange,
      lastPrice: marketData.quote?.lastPrice,
      marketCap: marketData.quote?.marketCap,
      avgDollarVolume30d: marketData.quote?.avgDollarVolume30d,
    };

    // Generate narrative (LLM or fallback)
    currentStep = "NARRATIVE";
    const narrative = await (fastNarrative ? generateFallbackNarrative : generateNarrative)(
      scoringResult.riskLevel,
      scoringResult.totalScore,
      scoringResult.signals,
      stockSummary,
      scoringResult.isLegitimate,
    );

    if (filtered.applied) {
      // A zero-signal backend verdict can also be downgraded by this filter.
      narrative.header = `${supportedTicker} is above the nightly market-cap or liquidity threshold. Market activity alone is not counted as pump-and-dump risk for this stock. This does not rule out other investment scams.`;
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

    const response: RiskResponse = {
      resultId: randomUUID(), schemaVersion: "1.1", scoringVersion: SCORING_VERSION,
      scoreUnit: SCORE_UNIT, assessedAt: new Date().toISOString(),
      marketDataAsOf: marketData.priceAsOf, marketDataQuality: marketData.qualityReason,
      riskLevel: scoringResult.riskLevel,
      totalScore: scoringResult.totalScore,
      signals: scoringResult.signals,
      excludedMarketSignals: filtered.excludedSignals,
      stockSummary,
      narrative,
      usage: updatedUsage,
      isLegitimate: scoringResult.isLegitimate,
      dataCompleteness: scoringResult.dataCompleteness,

    };


    // Finish saving customer history before returning: a serverless runtime
    // may freeze unfinished work after the response. Keep the catch so a
    // logging failure cannot discard an already completed analysis.
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

    await completeScan(scanLease, response, {
      ticker: supportedTicker, assetType, processingTime,
      pitchProvided: !!checkRequest.pitchText, contextProvided: Object.values(context).some(Boolean),
      isOtc: isOtcScan, isMicroCap: isMicroCapScan, isHighVolume: isHighVolumeScan, usedAiBackend: usedAIBackend,
    });
    scanLease = null;
    await logScanHistory({
      historySaved: true,
      userId,
      ticker: supportedTicker,
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


    return NextResponse.json(response);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    if (scanLease) {
      try { await failScan(scanLease, currentStep); }
      catch (refundError) { console.error("Durable refund pending recovery:", refundError); }
    }
    if (error instanceof ScanConflict) return NextResponse.json({ error: error.message }, { status: 409 });

    console.error(
      `Check API error at step [${currentStep}] after ${elapsed}ms:`,
      error,
    );

    return NextResponse.json(
      { error: "An internal error occurred. Please try again later." },
      { status: 500 },
    );
  }
}

/**
 * Server-only adapter used by trusted channels. It calls the same in-process
 * scan operation as the web route, never loops back through public HTTP, and
 * deliberately offers no way to supply pitch text or client context.
 */
export async function runAuthorizedStockScan(
  input: AuthorizedStockScanRequest,
) {
  const request = new NextRequest("http://internal/api/check", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": `channel:${input.userId}`,
      ...(input.idempotencyKey ? { "idempotency-key": input.idempotencyKey } : {}),
    },
    body: JSON.stringify({ ticker: input.ticker, assetType: input.assetType }),
  });
  const response = await processCheckRequest(request, input.userId, true);
  const body = await response.json();
  if (!response.ok) {
    return { ok: false as const, status: response.status, body };
  }
  return { ok: true as const, body: body as RiskResponse };
}
