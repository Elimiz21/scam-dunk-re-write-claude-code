/** Preserve observed zero, but never use it (or missing data) as a return basis. */
export function hasReturnBasis(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function normalizeEntryPrice(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Invalid promoted entry price");
  }
  return value;
}

/** Mask unsupported interpretations in responses without rewriting stored evidence. */
export function visiblePromotion<T extends {
  entryPrice: number | null;
  currentGainPct?: number | null;
  maxGainPct?: number | null;
  outcome?: string | null;
}>(row: T) {
  const supported = hasReturnBasis(row.entryPrice);
  return {
    ...row,
    currentGainPct: supported ? row.currentGainPct ?? null : null,
    maxGainPct: supported ? row.maxGainPct ?? null : null,
    outcome: supported ? row.outcome ?? null : null,
  };
}

export function formatEntryPrice(value: number | null): string {
  return value != null && Number.isFinite(value) && value >= 0
    ? `$${value.toFixed(2)}` : "Unknown";
}
