/**
 * Safe parsing/clamping of admin list-route query params.
 *
 * Many admin routes did `parseInt(searchParams.get("days") || "7")` etc. with no
 * guard, so a bad value (?days=abc, ?page=-1) produced NaN → Invalid Date /
 * negative skip → Prisma throws → 500 (or a fake-empty 200 in the swallow-200
 * routes). These helpers always return a sane, bounded number (R6).
 */

/** Parse an integer query param, clamped to [min, max] with a fallback. */
export function clampIntParam(
  raw: string | null,
  opts: { def: number; min: number; max: number },
): number {
  const n = parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return opts.def;
  return Math.min(opts.max, Math.max(opts.min, n));
}

/** 1-based page number, >= 1. */
export function parsePage(params: URLSearchParams): number {
  return clampIntParam(params.get("page"), { def: 1, min: 1, max: 1_000_000 });
}

/** Page size, clamped to [1, max] (default max 100). */
export function parseLimit(params: URLSearchParams, max = 100, def = 20): number {
  return clampIntParam(params.get("limit"), { def, min: 1, max });
}

/** A day-window param, clamped to [1, max] days (default max 365). */
export function parseDays(params: URLSearchParams, def = 7, max = 365): number {
  return clampIntParam(params.get("days"), { def, min: 1, max });
}

/**
 * Whitelist a sort field: return `raw` only if it's in `allowed`, else the
 * default. Prevents an attacker-controlled `orderBy: { [sortBy]: ... }` from
 * throwing on an unknown column.
 */
export function pickSortField<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  def: T,
): T {
  return (allowed as readonly string[]).includes(raw ?? "")
    ? (raw as T)
    : def;
}

/** Normalize a sort order to "asc" | "desc" (default "desc"). */
export function pickSortOrder(
  raw: string | null,
  def: "asc" | "desc" = "desc",
): "asc" | "desc" {
  return raw === "asc" || raw === "desc" ? raw : def;
}
