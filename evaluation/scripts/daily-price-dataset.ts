/**
 * Immutable daily-price dataset contract shared by the iMac publisher and the
 * weekday scan consumer. This module deliberately has no vendor client and no
 * storage credentials: price acquisition stays outside GitHub Actions.
 */
import { createHash } from "crypto";

export const DAILY_PRICE_DATASET_SCHEMA_VERSION =
  "scamdunk.daily-price-dataset/v1";
export const SCAN_WINDOW_BARS = 100;
const ROOT = "v1";

export type AdjustmentBasis = "split_adjusted" | "unadjusted" | "total_return";

export interface DailyPriceBar {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustmentBasis: AdjustmentBasis;
  sourceVendor: string;
  vendorAsOf: string;
  ingestionRunId: string;
}

export interface ScanWindowArtifact {
  schemaVersion: typeof DAILY_PRICE_DATASET_SCHEMA_VERSION;
  runId: string;
  generatedAt: string;
  windows: Record<string, DailyPriceBar[]>;
}

export interface DailyPriceManifest {
  schemaVersion: typeof DAILY_PRICE_DATASET_SCHEMA_VERSION;
  runId: string;
  generatedAt: string;
  source: { vendor: string; adjustmentBasis: AdjustmentBasis };
  freshness: {
    vendorAsOf: string;
    latestTradingDate: string;
    maxAgeHours: number;
  };
  coverage: {
    expectedSymbols: string[];
    coveredSymbols: string[];
    missingSymbols: string[];
    barsPerInstrument: number;
    symbolResolution: Record<string, string>;
  };
  assets: {
    scanWindow: { path: string; sha256: string; bytes: number };
  };
}

export interface DailyPriceCurrentPointer {
  schemaVersion: typeof DAILY_PRICE_DATASET_SCHEMA_VERSION;
  runId: string;
  manifestPath: string;
  manifestSha256: string;
  promotedAt: string;
}

export interface DailyPriceDatasetArtifacts {
  manifestPath: string;
  scanWindowPath: string;
  manifest: DailyPriceManifest;
  scanWindow: ScanWindowArtifact;
  currentPointer: DailyPriceCurrentPointer;
}

export class DailyPriceDatasetError extends Error {
  constructor(
    public readonly code:
      | "POINTER_INVALID"
      | "MANIFEST_INVALID"
      | "STALE_MANIFEST"
      | "CHECKSUM_MISMATCH"
      | "SYMBOL_RESOLUTION_INVALID"
      | "WINDOW_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "DailyPriceDatasetError";
  }
}

export function canonicalSymbol(value: string): string {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function weekdayDistance(fromDate: string, toDate: Date): number {
  const cursor = new Date(`${fromDate}T00:00:00.000Z`);
  const target = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate()));
  let weekdays = 0;
  while (cursor < target) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) weekdays++;
  }
  return weekdays;
}

function assertRunId(runId: unknown, code: DailyPriceDatasetError["code"]): asserts runId is string {
  if (typeof runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(runId)) {
    throw new DailyPriceDatasetError(code, "runId is absent or contains an unsafe path character");
  }
}

function assertUniqueSymbols(symbols: string[], label: string): void {
  if (symbols.some((symbol) => !symbol || symbol !== canonicalSymbol(symbol)) || new Set(symbols).size !== symbols.length) {
    throw new DailyPriceDatasetError("MANIFEST_INVALID", `${label} contains duplicate or non-canonical symbols`);
  }
}

function stableRunPrefix(runId: string): string {
  return `${ROOT}/runs/${runId}`;
}

function parseJson(text: string, code: DailyPriceDatasetError["code"], label: string): any {
  try {
    return JSON.parse(text);
  } catch {
    throw new DailyPriceDatasetError(code, `${label} is not valid JSON`);
  }
}

function assertPriceBar(
  bar: any,
  expectedSymbol: string,
  manifest: DailyPriceManifest,
  previousDate?: string,
): void {
  if (!bar || canonicalSymbol(bar.symbol) !== expectedSymbol || !isIsoDate(bar.date)) {
    throw new DailyPriceDatasetError("WINDOW_INVALID", `invalid bar identity for ${expectedSymbol}`);
  }
  if (previousDate && bar.date <= previousDate) {
    throw new DailyPriceDatasetError("WINDOW_INVALID", `bars for ${expectedSymbol} are not strictly date-ascending`);
  }
  for (const field of ["open", "high", "low", "close", "volume"] as const) {
    if (typeof bar[field] !== "number" || !Number.isFinite(bar[field]) || bar[field] < 0) {
      throw new DailyPriceDatasetError("WINDOW_INVALID", `${expectedSymbol} has invalid ${field}`);
    }
  }
  if (bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) {
    throw new DailyPriceDatasetError("WINDOW_INVALID", `${expectedSymbol} has inconsistent OHLC values`);
  }
  if (
    bar.adjustmentBasis !== manifest.source.adjustmentBasis ||
    bar.sourceVendor !== manifest.source.vendor ||
    bar.vendorAsOf !== manifest.freshness.vendorAsOf ||
    bar.ingestionRunId !== manifest.runId
  ) {
    throw new DailyPriceDatasetError("WINDOW_INVALID", `${expectedSymbol} bar provenance does not match the manifest`);
  }
}

function assertManifestShape(manifest: any): asserts manifest is DailyPriceManifest {
  if (!manifest || manifest.schemaVersion !== DAILY_PRICE_DATASET_SCHEMA_VERSION) {
    throw new DailyPriceDatasetError("MANIFEST_INVALID", "unsupported manifest schema version");
  }
  assertRunId(manifest.runId, "MANIFEST_INVALID");
  if (!isIsoTimestamp(manifest.generatedAt) || !manifest.source || typeof manifest.source.vendor !== "string" || !manifest.source.vendor.trim()) {
    throw new DailyPriceDatasetError("MANIFEST_INVALID", "manifest source or generatedAt is invalid");
  }
  if (!["split_adjusted", "unadjusted", "total_return"].includes(manifest.source.adjustmentBasis)) {
    throw new DailyPriceDatasetError("MANIFEST_INVALID", "manifest adjustment basis is invalid");
  }
  const freshness = manifest.freshness;
  if (!freshness || !isIsoTimestamp(freshness.vendorAsOf) || !isIsoDate(freshness.latestTradingDate) || !Number.isFinite(freshness.maxAgeHours) || freshness.maxAgeHours <= 0) {
    throw new DailyPriceDatasetError("MANIFEST_INVALID", "manifest freshness metadata is invalid");
  }
  const coverage = manifest.coverage;
  if (!coverage || !Array.isArray(coverage.expectedSymbols) || !Array.isArray(coverage.coveredSymbols) || !Array.isArray(coverage.missingSymbols) || coverage.barsPerInstrument !== SCAN_WINDOW_BARS || !coverage.symbolResolution) {
    throw new DailyPriceDatasetError("MANIFEST_INVALID", "manifest coverage metadata is invalid");
  }
  assertUniqueSymbols(coverage.expectedSymbols, "expectedSymbols");
  assertUniqueSymbols(coverage.coveredSymbols, "coveredSymbols");
  assertUniqueSymbols(coverage.missingSymbols, "missingSymbols");
  if (coverage.missingSymbols.length !== 0 || coverage.coveredSymbols.length !== coverage.expectedSymbols.length) {
    throw new DailyPriceDatasetError("MANIFEST_INVALID", "manifest has incomplete coverage");
  }
  for (const symbol of coverage.expectedSymbols) {
    if (!coverage.coveredSymbols.includes(symbol) || coverage.symbolResolution[symbol] !== symbol) {
      throw new DailyPriceDatasetError("MANIFEST_INVALID", `invalid symbol resolution for ${symbol}`);
    }
  }
  const asset = manifest.assets?.scanWindow;
  if (!asset || typeof asset.path !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isInteger(asset.bytes) || asset.bytes <= 0) {
    throw new DailyPriceDatasetError("MANIFEST_INVALID", "scan-window asset metadata is invalid");
  }
  if (asset.path !== `${stableRunPrefix(manifest.runId)}/scan-window.json`) {
    throw new DailyPriceDatasetError("MANIFEST_INVALID", "scan-window path escapes the immutable run");
  }
}

export function buildDailyPriceDatasetArtifacts(input: {
  runId: string;
  bars: DailyPriceBar[];
  expectedSymbols: string[];
  vendorAsOf: string;
  generatedAt: string;
  sourceVendor: string;
  adjustmentBasis: AdjustmentBasis;
  maxAgeHours?: number;
}): DailyPriceDatasetArtifacts {
  assertRunId(input.runId, "MANIFEST_INVALID");
  if (!isIsoTimestamp(input.vendorAsOf) || !isIsoTimestamp(input.generatedAt) || !input.sourceVendor.trim()) {
    throw new DailyPriceDatasetError("MANIFEST_INVALID", "publisher input has invalid provenance metadata");
  }
  const maxAgeHours = input.maxAgeHours ?? 36;
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
    throw new DailyPriceDatasetError("MANIFEST_INVALID", "publisher input maxAgeHours is invalid");
  }
  if (!["split_adjusted", "unadjusted", "total_return"].includes(input.adjustmentBasis)) {
    throw new DailyPriceDatasetError("MANIFEST_INVALID", "publisher input adjustment basis is invalid");
  }
  const expectedSymbols = input.expectedSymbols.map(canonicalSymbol).sort();
  if (!expectedSymbols.length || expectedSymbols.some((symbol) => !symbol) || new Set(expectedSymbols).size !== expectedSymbols.length) {
    throw new DailyPriceDatasetError("MANIFEST_INVALID", "expected symbols must be unique and non-empty");
  }
  const source: DailyPriceManifest["source"] = {
    vendor: input.sourceVendor,
    adjustmentBasis: input.adjustmentBasis,
  };
  const grouped = new Map<string, DailyPriceBar[]>();
  for (const rawBar of input.bars) {
    const symbol = canonicalSymbol(rawBar.symbol);
    if (!expectedSymbols.includes(symbol)) continue;
    const normalized = { ...rawBar, symbol };
    if (
      normalized.adjustmentBasis !== source.adjustmentBasis ||
      normalized.sourceVendor !== source.vendor ||
      normalized.vendorAsOf !== input.vendorAsOf ||
      normalized.ingestionRunId !== input.runId
    ) {
      throw new DailyPriceDatasetError("WINDOW_INVALID", `publisher input provenance mismatch for ${symbol}`);
    }
    grouped.set(symbol, [...(grouped.get(symbol) || []), normalized]);
  }
  const windows: Record<string, DailyPriceBar[]> = {};
  for (const symbol of expectedSymbols) {
    const records = (grouped.get(symbol) || []).sort((left, right) => left.date.localeCompare(right.date));
    if (records.length < SCAN_WINDOW_BARS) {
      throw new DailyPriceDatasetError("SYMBOL_RESOLUTION_INVALID", `${symbol} has fewer than ${SCAN_WINDOW_BARS} bars`);
    }
    const latest = records.slice(-SCAN_WINDOW_BARS);
    const draftManifest = {
      source,
      freshness: { vendorAsOf: input.vendorAsOf },
      runId: input.runId,
    } as DailyPriceManifest;
    latest.forEach((bar, index) => assertPriceBar(bar, symbol, draftManifest, latest[index - 1]?.date));
    windows[symbol] = latest;
  }
  const scanWindow: ScanWindowArtifact = {
    schemaVersion: DAILY_PRICE_DATASET_SCHEMA_VERSION,
    runId: input.runId,
    generatedAt: input.generatedAt,
    windows,
  };
  const scanWindowPath = `${stableRunPrefix(input.runId)}/scan-window.json`;
  const latestTradingDate = Object.values(windows)
    .flat()
    .map((bar) => bar.date)
    .sort()
    .at(-1)!;
  const manifest: DailyPriceManifest = {
    schemaVersion: DAILY_PRICE_DATASET_SCHEMA_VERSION,
    runId: input.runId,
    generatedAt: input.generatedAt,
    source,
    freshness: {
      vendorAsOf: input.vendorAsOf,
      latestTradingDate,
      maxAgeHours,
    },
    coverage: {
      expectedSymbols,
      coveredSymbols: expectedSymbols,
      missingSymbols: [],
      barsPerInstrument: SCAN_WINDOW_BARS,
      symbolResolution: Object.fromEntries(expectedSymbols.map((symbol) => [symbol, symbol])),
    },
    assets: {
      scanWindow: {
        path: scanWindowPath,
        sha256: sha256Json(scanWindow),
        bytes: Buffer.byteLength(JSON.stringify(scanWindow), "utf8"),
      },
    },
  };
  const manifestPath = `${stableRunPrefix(input.runId)}/manifest.json`;
  const currentPointer: DailyPriceCurrentPointer = {
    schemaVersion: DAILY_PRICE_DATASET_SCHEMA_VERSION,
    runId: input.runId,
    manifestPath,
    manifestSha256: sha256Json(manifest),
    promotedAt: input.generatedAt,
  };
  return { manifestPath, scanWindowPath, manifest, scanWindow, currentPointer };
}

export interface ValidatedDailyPriceDataset {
  runId: string;
  manifest: DailyPriceManifest;
  callBudget: { storageObjectsRead: number; fmpHistoryCalls: 0 };
  getWindow(symbol: string): DailyPriceBar[];
}

export async function loadValidatedDailyPriceDataset(input: {
  fetchObject: (path: string) => Promise<string>;
  expectedSymbols: string[];
  now?: Date;
  maxAgeHours: number;
}): Promise<ValidatedDailyPriceDataset> {
  let reads = 0;
  const read = async (path: string) => {
    reads++;
    try {
      return await input.fetchObject(path);
    } catch (error) {
      throw error instanceof DailyPriceDatasetError
        ? error
        : new DailyPriceDatasetError("POINTER_INVALID", `unable to read dataset object ${path}`);
    }
  };
  const pointer = parseJson(await read(`${ROOT}/current.json`), "POINTER_INVALID", "current pointer") as DailyPriceCurrentPointer;
  if (!pointer || pointer.schemaVersion !== DAILY_PRICE_DATASET_SCHEMA_VERSION) {
    throw new DailyPriceDatasetError("POINTER_INVALID", "current pointer schema is invalid");
  }
  assertRunId(pointer.runId, "POINTER_INVALID");
  const requiredManifestPath = `${stableRunPrefix(pointer.runId)}/manifest.json`;
  if (pointer.manifestPath !== requiredManifestPath || !/^[a-f0-9]{64}$/.test(pointer.manifestSha256) || !isIsoTimestamp(pointer.promotedAt)) {
    throw new DailyPriceDatasetError("POINTER_INVALID", "current pointer is not an immutable promotion pointer");
  }
  const manifest = parseJson(await read(pointer.manifestPath), "MANIFEST_INVALID", "manifest") as DailyPriceManifest;
  assertManifestShape(manifest);
  if (manifest.runId !== pointer.runId || sha256Json(manifest) !== pointer.manifestSha256) {
    throw new DailyPriceDatasetError("CHECKSUM_MISMATCH", "manifest does not match the promoted pointer");
  }
  const now = input.now || new Date();
  const ageHours = (now.getTime() - Date.parse(manifest.freshness.vendorAsOf)) / 3_600_000;
  if (ageHours < -0.25 || ageHours > Math.min(input.maxAgeHours, manifest.freshness.maxAgeHours)) {
    throw new DailyPriceDatasetError("STALE_MANIFEST", `dataset vendor as-of is ${ageHours.toFixed(2)} hours old`);
  }
  const requested = input.expectedSymbols.map(canonicalSymbol);
  if (!requested.length || requested.some((symbol) => !symbol) || new Set(requested).size !== requested.length) {
    throw new DailyPriceDatasetError("SYMBOL_RESOLUTION_INVALID", "scan requested duplicate or empty symbols");
  }
  for (const symbol of requested) {
    if (!manifest.coverage.expectedSymbols.includes(symbol) || manifest.coverage.symbolResolution[symbol] !== symbol) {
      throw new DailyPriceDatasetError("SYMBOL_RESOLUTION_INVALID", `dataset cannot resolve ${symbol}`);
    }
  }
  const scanWindow = parseJson(await read(manifest.assets.scanWindow.path), "WINDOW_INVALID", "scan window") as ScanWindowArtifact;
  if (sha256Json(scanWindow) !== manifest.assets.scanWindow.sha256 || Buffer.byteLength(JSON.stringify(scanWindow), "utf8") !== manifest.assets.scanWindow.bytes) {
    throw new DailyPriceDatasetError("CHECKSUM_MISMATCH", "scan-window checksum or byte length does not match manifest");
  }
  if (!scanWindow || scanWindow.schemaVersion !== DAILY_PRICE_DATASET_SCHEMA_VERSION || scanWindow.runId !== manifest.runId || !isIsoTimestamp(scanWindow.generatedAt) || !scanWindow.windows) {
    throw new DailyPriceDatasetError("WINDOW_INVALID", "scan-window identity is invalid");
  }
  for (const symbol of manifest.coverage.coveredSymbols) {
    const window = scanWindow.windows[symbol];
    if (!Array.isArray(window) || window.length !== SCAN_WINDOW_BARS) {
      throw new DailyPriceDatasetError("WINDOW_INVALID", `${symbol} does not have exactly ${SCAN_WINDOW_BARS} bars`);
    }
    window.forEach((bar, index) => assertPriceBar(bar, symbol, manifest, window[index - 1]?.date));
    if (window[window.length - 1].date !== manifest.freshness.latestTradingDate) {
      throw new DailyPriceDatasetError("STALE_MANIFEST", `${symbol} terminal bar does not match manifest latestTradingDate`);
    }
  }
  const scanDate = now.toISOString().slice(0, 10);
  if (manifest.freshness.latestTradingDate > scanDate) {
    throw new DailyPriceDatasetError("STALE_MANIFEST", "latestTradingDate is in the future relative to the scan date");
  }
  if (weekdayDistance(manifest.freshness.latestTradingDate, now) > 1) {
    throw new DailyPriceDatasetError("STALE_MANIFEST", "latestTradingDate is more than one trading day behind the scan date");
  }
  return {
    runId: manifest.runId,
    manifest,
    callBudget: { storageObjectsRead: reads, fmpHistoryCalls: 0 },
    getWindow(symbol: string) {
      const resolved = canonicalSymbol(symbol);
      const window = scanWindow.windows[resolved];
      if (!window) throw new DailyPriceDatasetError("SYMBOL_RESOLUTION_INVALID", `dataset cannot resolve ${resolved}`);
      return window.map((bar) => ({ ...bar }));
    },
  };
}
