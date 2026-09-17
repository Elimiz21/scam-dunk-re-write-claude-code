export interface RawMarketObservation {
  lastPrice?: number | null;
  previousClose?: number | null;
  priceChangePct?: number | null;
  volume?: number | null;
  avgVolume?: number | null;
  avgDailyVolume?: number | null;
  volumeRatio?: number | null;
  isLegitimate?: boolean | null;
  isInsufficient?: boolean | null;
  priceDataSource?: string | null;
  sourceObservedAt?: string | null;
  sourceVersion?: string | null;
}

export interface NormalizedMarketObservation {
  lastPrice: number | null;
  previousClose: number | null;
  priceChangePct: number | null;
  volume: number | null;
  avgVolume: number | null;
  volumeRatio: number | null;
  isLegitimate: boolean | null;
  isInsufficient: boolean | null;
  dataSource: string | null;
  sourceObservedAt: Date | null;
  sourceVersion: string | null;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerOrNull(value: number | null | undefined): number | null {
  const finite = finiteOrNull(value);
  return finite === null ? null : Math.round(finite);
}

export function normalizeMarketObservation(
  input: RawMarketObservation,
): NormalizedMarketObservation {
  let sourceObservedAt: Date | null = null;
  if (input.sourceObservedAt != null) {
    const normalized = normalizeStrictIsoTimestamp(input.sourceObservedAt);
    if (!normalized) {
      throw new Error(`Invalid sourceObservedAt: ${input.sourceObservedAt}`);
    }
    sourceObservedAt = new Date(normalized);
  }

  return {
    lastPrice: finiteOrNull(input.lastPrice),
    previousClose: finiteOrNull(input.previousClose),
    priceChangePct: finiteOrNull(input.priceChangePct),
    volume: integerOrNull(input.volume),
    avgVolume: integerOrNull(input.avgVolume ?? input.avgDailyVolume),
    volumeRatio: finiteOrNull(input.volumeRatio),
    isLegitimate:
      typeof input.isLegitimate === "boolean" ? input.isLegitimate : null,
    isInsufficient:
      typeof input.isInsufficient === "boolean" ? input.isInsufficient : null,
    dataSource: input.priceDataSource?.trim() || null,
    sourceObservedAt,
    sourceVersion: input.sourceVersion?.trim() || null,
  };
}
import { normalizeStrictIsoTimestamp } from "@/lib/strict-timestamp";
