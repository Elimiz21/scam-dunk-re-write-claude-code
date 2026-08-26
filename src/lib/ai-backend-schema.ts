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
  weight: z.coerce
    .number()
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
  // risk_score may be absent on some paths; default 0 and require finite.
  risk_score: z.coerce
    .number()
    .refine((n) => Number.isFinite(n), "risk_score must be finite")
    .default(0),
  // Probability is clamped to [0,1] (backend models occasionally overshoot).
  risk_probability: z.coerce
    .number()
    .refine((n) => Number.isFinite(n), "risk_probability must be finite")
    .transform((n) => Math.min(1, Math.max(0, n)))
    .default(0),
  signals: z.array(AIBackendSignalSchema).default([]),
  data_available: z.boolean().default(true),
  // Optional model/diagnostic fields (passed through when present).
  rf_probability: z.number().nullable().optional(),
  lstm_probability: z.number().nullable().optional(),
  anomaly_score: z.coerce.number().optional(),
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
      company_name: z.string().optional(),
      exchange: z.string().optional(),
      last_price: z.number().optional(),
      market_cap: z.number().optional(),
      avg_volume: z.number().optional(),
    })
    .optional(),
  news_verification: AIBackendNewsVerificationSchema.optional(),
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
