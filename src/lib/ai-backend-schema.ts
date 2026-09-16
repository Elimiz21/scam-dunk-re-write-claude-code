/**
 * Python AI backend response schema (TS <-> Python contract).
 *
 * The backend response is parsed through this zod schema before use. On any
 * validation failure the caller falls back to TypeScript scoring instead of
 * trusting an unvalidated `await response.json()` (audit TS-H7). This prevents:
 *  - unknown `risk_level` strings sneaking through a lying `as` cast,
 *  - missing signal `weight` fields producing a NaN total score,
 *  - malformed payloads being written to scan history.
 *
 * THE CONTRACT (both sides implement to this — keep in sync):
 *   Request:  { ticker, asset_type, use_live_data, days, sec_flagged, news_flag }
 *   Response: { risk_level, risk_score, risk_probability(0..1),
 *               signals: [{code,description,weight:number,severity}],
 *               data_available, news_verification? }
 *   Auth:     X-API-Key: <AI_API_SECRET>
 */

import { z } from "zod";

export interface AIBackendRequestInput {
  ticker: string;
  assetType: "stock" | "crypto";
  useLiveData: boolean;
  secFlagged?: boolean;
  newsFlag?: boolean;
}

/** Build the interactive request with explicit null/default semantics. */
export function buildAIBackendRequest(input: AIBackendRequestInput) {
  return {
    ticker: input.ticker.trim().toUpperCase(),
    asset_type: input.assetType,
    use_live_data: input.useLiveData,
    days: 90,
    sec_flagged: input.secFlagged ?? null,
    news_flag: input.newsFlag ?? false,
  };
}

export const RISK_LEVEL_VALUES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "INSUFFICIENT",
] as const;

/** A single signal returned by the backend. Category is normalized downstream. */
export const AIBackendSignalSchema = z.object({
  code: z.string(),
  description: z.string().default(""),
  // Coerce so a stringified number ("3") still parses; reject NaN/Infinity.
  weight: z
    .union([z.number(), z.string().min(1).transform(Number)])
    .refine((n) => Number.isFinite(n), "weight must be finite"),
  severity: z.string().optional(),
  category: z.string().optional(),
});

export const AIBackendNewsVerificationSchema = z.object({
  has_legitimate_catalyst: z.boolean().optional().default(false),
  has_sec_filings: z.boolean().optional().default(false),
  has_promotional_signals: z.boolean().optional().default(false),
  catalyst_summary: z.string().optional().default(""),
  should_reduce_risk: z.boolean().optional().default(false),
  recommended_level: z.string().optional().default(""),
});

export const AIBackendResponseSchema = z.object({
  risk_level: z.enum(RISK_LEVEL_VALUES),
  risk_score: z
    .union([z.number(), z.string().min(1).transform(Number)])
    .refine((n) => Number.isFinite(n), "risk_score must be finite"),
  // Probability is clamped to [0,1] (backend models occasionally overshoot).
  risk_probability: z
    .union([z.number(), z.string().min(1).transform(Number)])
    .refine((n) => Number.isFinite(n), "risk_probability must be finite")
    .refine((n) => n >= 0 && n <= 1, "risk_probability must be between 0 and 1"),
  signals: z.array(AIBackendSignalSchema),
  data_available: z.boolean(),
  // Optional model/diagnostic fields (passed through when present).
  rf_probability: z.number().nullable().optional(),
  lstm_probability: z.number().nullable().optional(),
  anomaly_score: z.number(),
  explanations: z.array(z.string()).optional(),
  sec_flagged: z.boolean().optional(),
  is_otc: z.boolean().optional(),
  is_micro_cap: z.boolean().optional(),
  features: z.record(z.number().nullable()).optional(),
  analysis_timestamp: z.string().optional(),
  ticker: z.string().optional(),
  asset_type: z.string().optional(),
  stock_info: z
    .object({
      company_name: z.string().nullable().optional(),
      exchange: z.string().nullable().optional(),
      last_price: z.number().nullable().optional(),
      market_cap: z.number().nullable().optional(),
      avg_volume: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  news_verification: AIBackendNewsVerificationSchema.nullable().optional(),
  input_source: z.enum(["live", "provided_real_bars", "synthetic"]),
  layers_applied: z.array(
    z.enum([
      "rule_signals",
      "anomaly_detection",
      "random_forest",
      "lstm",
    ]),
  ),
}).superRefine((response, context) => {
  const checks = [
    ["random_forest", response.rf_probability],
    ["lstm", response.lstm_probability],
  ] as const;
  for (const [layer, probability] of checks) {
    const claimed = response.layers_applied.includes(layer);
    const hasOutput = probability != null;
    if (claimed !== hasOutput) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["layers_applied"],
        message: `${layer} layer and probability must be present together`,
      });
    }
  }
});

export type AIBackendResponse = z.infer<typeof AIBackendResponseSchema>;
export type AIBackendSignal = z.infer<typeof AIBackendSignalSchema>;

/**
 * Parse an unknown backend payload. Returns the validated object on success,
 * or null on any validation failure (so callers fall back to TS scoring).
 */
export function parseAIBackendResponse(raw: unknown): AIBackendResponse | null {
  const result = AIBackendResponseSchema.safeParse(raw);
  if (!result.success) {
    console.error(
      "AI backend response failed schema validation:",
      result.error.message,
    );
    return null;
  }
  return result.data;
}

export interface AIBackendAcceptanceOptions {
  expectedSource: "live" | "provided_real_bars" | "synthetic";
  requireDataAvailable?: boolean;
}

/**
 * Validate both the response shape and the caller-specific trust boundary.
 * Interactive callers may only accept an available result derived from live
 * inputs; a schema-valid synthetic or supplied-bar response must still fall
 * back rather than being presented as a live scan.
 */
export function acceptAIBackendResponse(
  raw: unknown,
  options: AIBackendAcceptanceOptions,
): AIBackendResponse | null {
  const response = parseAIBackendResponse(raw);
  if (!response) return null;

  if (response.input_source !== options.expectedSource) {
    console.error(
      `AI backend response used ${response.input_source}; expected ${options.expectedSource}`,
    );
    return null;
  }
  if (options.requireDataAvailable && !response.data_available) {
    console.error("AI backend response reported unavailable input data");
    return null;
  }
  return response;
}
