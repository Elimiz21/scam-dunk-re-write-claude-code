import * as fs from "fs";
import * as path from "path";

export const RUN_JOURNAL_SCHEMA_VERSION = 1;

export interface NewsAnalysisRow {
  symbol: string;
  hasLegitimateNews: boolean;
  explanation: string;
  specificEvent?: string | null;
}

export interface QuarantinedNewsSymbol {
  symbol: string;
  reason: string;
}

export interface NewsAnalysisParseResult {
  valid: Map<string, NewsAnalysisRow>;
  quarantined: QuarantinedNewsSymbol[];
  anomalies: string[];
  malformedTopLevel: boolean;
  degraded: boolean;
}

export function normalizeAnalysisSymbol(symbol: unknown): string {
  return typeof symbol === "string" ? symbol.trim().toUpperCase().replace(/\s+/g, "") : "";
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parsePayload(raw: unknown): { payload: Record<string, any> | null; malformed: boolean } {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { payload: null, malformed: true };
    }
  }
  if (!isRecord(raw) || !Array.isArray(raw.results)) return { payload: null, malformed: true };
  const keys = Object.keys(raw);
  if (keys.some((key) => key !== "results")) return { payload: null, malformed: true };
  return { payload: raw, malformed: false };
}

export function parseNewsAnalysisResponse(raw: unknown, expectedSymbols: Iterable<string>): NewsAnalysisParseResult {
  const expected = [...new Set([...expectedSymbols].map(normalizeAnalysisSymbol).filter(Boolean))];
  const { payload, malformed } = parsePayload(raw);
  if (malformed) {
    return {
      valid: new Map(),
      quarantined: expected.map((symbol) => ({ symbol, reason: "malformed-top-level-response" })),
      anomalies: ["malformed-top-level-response"],
      malformedTopLevel: true,
      degraded: true,
    };
  }

  const rows = payload.results as unknown[];
  const counts = new Map<string, number>();
  const normalizedRows: Array<{ symbol: string; row: unknown }> = [];
  const anomalies: string[] = [];
  for (const row of rows) {
    const symbol = normalizeAnalysisSymbol(isRecord(row) ? row.symbol : "");
    if (!symbol || !expected.includes(symbol)) {
      anomalies.push(`unexpected-symbol:${symbol || "<empty>"}`);
      continue;
    }
    counts.set(symbol, (counts.get(symbol) || 0) + 1);
    normalizedRows.push({ symbol, row });
  }

  const valid = new Map<string, NewsAnalysisRow>();
  const quarantined: QuarantinedNewsSymbol[] = [];
  for (const symbol of expected) {
    const count = counts.get(symbol) || 0;
    if (count === 0) {
      quarantined.push({ symbol, reason: "missing-expected-symbol" });
      continue;
    }
    if (count > 1) {
      quarantined.push({ symbol, reason: "duplicate-expected-symbol" });
      continue;
    }
    const row = normalizedRows.find((item) => item.symbol === symbol)?.row;
    if (!isRecord(row) || typeof row.hasLegitimateNews !== "boolean" || typeof row.explanation !== "string" || row.explanation.trim() === "" || (row.specificEvent !== undefined && row.specificEvent !== null && typeof row.specificEvent !== "string")) {
      quarantined.push({ symbol, reason: "malformed-expected-row" });
      continue;
    }
    valid.set(symbol, {
      symbol,
      hasLegitimateNews: row.hasLegitimateNews,
      explanation: row.explanation,
      specificEvent: row.specificEvent === undefined ? null : row.specificEvent,
    });
  }

  return { valid, quarantined, anomalies, malformedTopLevel: false, degraded: anomalies.length > 0 || quarantined.length > 0 };
}

export type JournalTaskState = "pending" | "deferred" | "quarantined" | "resolved";

export interface JournalAttempt {
  attempt: number;
  batchId: string;
  capturedAt: string;
  prompt?: string;
  rawResponse?: string | null;
  responseId?: string | null;
  model?: string | null;
  tokenUsage?: unknown;
  pricingSnapshot?: Record<string, number>;
  estimatedCostUsd?: number | null;
  semanticValidation?: "pending" | "deferred" | "resolved" | "quarantined";
  degraded?: boolean;
  anomalyCodes?: string[];
  malformedTopLevel?: boolean;
  providerFailure?: { type: string; message: string; metadata?: unknown };
}

export interface JournalTask {
  taskId: string;
  scanDate: string;
  symbol: string;
  state: JournalTaskState;
  batchIds: string[];
  sourceEvidenceSnapshots: Array<{ snapshotId: string; batchId: string; nextAttempt: number; capturedAt: string; evidence: unknown }>;
  attempts: JournalAttempt[];
  retryCount: number;
  transitions: Array<{ from: JournalTaskState; to: JournalTaskState; reason: string; batchId: string; attempt: number | null; timestamp: string }>;
}

export interface RunJournal {
  schemaVersion: number;
  scanDate: string;
  generationId: string;
  generatedAt: string;
  replayOfGeneration?: string;
  replay?: { requested: string[]; matched: string[]; missing: string[] };
  tasks: Record<string, JournalTask>;
  batches: Record<string, { batchId: string; taskIds: string[]; attempts: number; degraded?: boolean; anomalyCodes?: string[]; malformedTopLevel?: boolean }>;
  durableCaptureAttempts?: Record<string, number>;
}

function taskIdFor(scanDate: string, symbol: string): string {
  return `${scanDate}:${normalizeAnalysisSymbol(symbol)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(): string {
  return new Date().toISOString();
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(api.?key|access.?token|secret|password|authorization)/i.test(key)) output[key] = "[REDACTED]";
    else output[key] = redact(item);
  }
  return output;
}

export function createRunJournal(input: { scanDate: string; generationId?: string; generatedAt?: string; replayOfGeneration?: string }): RunJournal {
  return {
    schemaVersion: RUN_JOURNAL_SCHEMA_VERSION,
    scanDate: input.scanDate,
    generationId: input.generationId || `${input.scanDate}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    generatedAt: input.generatedAt || nowIso(),
    ...(input.replayOfGeneration ? { replayOfGeneration: input.replayOfGeneration } : {}),
    tasks: {},
    batches: {},
  };
}

export function registerJournalTasks(journal: RunJournal, symbols: Iterable<string>, batchId = "batch-1", state: JournalTaskState = "pending"): RunJournal {
  const next = clone(journal);
  const batch = next.batches[batchId] || { batchId, taskIds: [], attempts: 0 };
  for (const rawSymbol of symbols) {
    const symbol = normalizeAnalysisSymbol(rawSymbol);
    if (!symbol) continue;
    const taskId = taskIdFor(next.scanDate, symbol);
    const existing = next.tasks[taskId];
    if (!existing) {
      next.tasks[taskId] = { taskId, scanDate: next.scanDate, symbol, state, batchIds: [batchId], sourceEvidenceSnapshots: [], attempts: [], retryCount: 0, transitions: [{ from: "pending", to: state, reason: "registered", batchId, attempt: null, timestamp: nowIso() }] };
    } else if (!existing.batchIds.includes(batchId)) {
      existing.batchIds.push(batchId);
    }
    if (!batch.taskIds.includes(taskId)) batch.taskIds.push(taskId);
  }
  next.batches[batchId] = batch;
  return next;
}

export function recordSourceEvidence(journal: RunJournal, symbolsOrTaskIds: Iterable<string>, evidence: unknown, batchId = "batch-1", capturedAt = nowIso()): RunJournal {
  const next = clone(journal);
  const nextAttempt = (next.batches[batchId]?.attempts || 0) + 1;
  const snapshotId = `${batchId}:attempt-${nextAttempt}:${capturedAt}`;
  for (const value of symbolsOrTaskIds) {
    const normalized = normalizeAnalysisSymbol(value).replace(`${next.scanDate}:`, "");
    const taskId = next.tasks[value] ? value : taskIdFor(next.scanDate, normalized);
    const task = next.tasks[taskId];
    if (!task) continue;
    if (!task.batchIds.includes(batchId)) task.batchIds.push(batchId);
    task.sourceEvidenceSnapshots.push({ snapshotId, batchId, nextAttempt, capturedAt, evidence: redact(clone(evidence)) });
  }
  return next;
}

function requireFiniteNonNegative(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`Invalid ${name}`);
}

export interface ProviderCapture {
  batchId: string;
  prompt: string;
  rawResponse: string | null;
  responseId: string | null;
  model: string | null;
  tokenUsage: unknown;
  pricingSnapshot: { inputPerMillion: number; outputPerMillion: number };
  estimatedCostUsd: number | null;
  capturedAt?: string;
  providerFailure?: { type: string; message: string; metadata?: unknown };
}

function assertBatchProvenance(journal: RunJournal, batchId: string, requireProviderAttempt = false): RunJournal["batches"][string] {
  const batch = journal.batches[batchId];
  if (!batch) throw new Error(`Unknown batch: ${batchId}`);
  const durableAttempt = journal.durableCaptureAttempts?.[batchId];
  if (requireProviderAttempt && durableAttempt !== batch.attempts) throw new Error(`Durable provider capture required for latest attempt in ${batchId}`);
  for (const taskId of batch.taskIds) {
    const task = journal.tasks[taskId];
    if (!task || (requireProviderAttempt ? !task.sourceEvidenceSnapshots.some((snapshot) => snapshot.batchId === batchId && snapshot.nextAttempt === durableAttempt) : !task.sourceEvidenceSnapshots.some((snapshot) => snapshot.batchId === batchId && snapshot.nextAttempt === batch.attempts + 1))) throw new Error(`Fresh source evidence required before capture for ${taskId}`);
    const latestAttempt = [...(task?.attempts || [])].reverse().find((attempt) => attempt.batchId === batchId);
    if (requireProviderAttempt && (!latestAttempt || latestAttempt.attempt !== durableAttempt)) throw new Error(`Durable provider capture required for latest attempt in ${taskId}`);
  }
  return batch;
}

export function recordProviderCapture(journal: RunJournal, input: ProviderCapture): RunJournal {
  const next = clone(journal);
  const batch = assertBatchProvenance(next, input.batchId);
  // Capture is intentionally permissive: raw provider metadata must survive
  // before later semantic/accounting validation classifies anomalies.
  if (typeof input.prompt !== "string") throw new Error("Provider capture requires a prompt");
  const capturedAt = input.capturedAt || nowIso();
  const attemptNumber = batch.attempts + 1;
  const attempt: JournalAttempt = { attempt: attemptNumber, batchId: input.batchId, capturedAt, prompt: input.prompt, rawResponse: input.rawResponse, responseId: input.responseId, model: input.model, tokenUsage: input.tokenUsage, pricingSnapshot: input.pricingSnapshot, estimatedCostUsd: input.estimatedCostUsd, semanticValidation: "pending", ...(input.providerFailure ? { providerFailure: clone(input.providerFailure) } : {}) };
  batch.attempts = attemptNumber;
  for (const taskId of batch.taskIds) next.tasks[taskId].attempts.push(clone(attempt));
  if (next.durableCaptureAttempts) delete next.durableCaptureAttempts[input.batchId];
  return next;
}

export function transitionSemanticValidation(journal: RunJournal, input: { batchId: string; validSymbols: Iterable<string>; quarantined: QuarantinedNewsSymbol[]; degraded?: boolean; anomalyCodes?: string[]; malformedTopLevel?: boolean }): RunJournal {
  const next = clone(journal);
  const valid = new Set([...input.validSymbols].map(normalizeAnalysisSymbol));
  const quarantined = new Map(input.quarantined.map((item) => [normalizeAnalysisSymbol(item.symbol), item.reason]));
  const batch = assertBatchProvenance(next, input.batchId, true);
  if (input.degraded) batch.degraded = true;
  if (input.anomalyCodes?.length) batch.anomalyCodes = [...new Set([...(batch.anomalyCodes || []), ...input.anomalyCodes])];
  if (input.malformedTopLevel) batch.malformedTopLevel = true;
  for (const taskId of batch.taskIds) {
    const task = next.tasks[taskId];
    if (task.state === "resolved") continue;
    const attempt = [...task.attempts].reverse().find((candidate) => candidate.batchId === input.batchId);
    const status = valid.has(task.symbol) ? "resolved" : quarantined.has(task.symbol) ? "quarantined" : "deferred";
    const reason = quarantined.get(task.symbol) || (status === "resolved" ? "validated" : "unresolved-response");
    task.transitions.push({ from: task.state, to: status, reason, batchId: input.batchId, attempt: attempt?.attempt ?? null, timestamp: nowIso() });
    task.state = status;
    if (attempt) {
      attempt.semanticValidation = status;
      if (input.degraded) attempt.degraded = true;
      if (input.anomalyCodes?.length) attempt.anomalyCodes = [...new Set([...(attempt.anomalyCodes || []), ...input.anomalyCodes])];
      if (input.malformedTopLevel) attempt.malformedTopLevel = true;
    }
  }
  return next;
}

export function retryJournalTasks(journal: RunJournal, symbols: Iterable<string>, batchId: string): RunJournal {
  const requested = [...symbols];
  const knownTaskIds = [...new Set(requested.map((symbol) => taskIdFor(journal.scanDate, symbol)).filter((taskId) => !!journal.tasks[taskId]))];
  const next = clone(journal);
  const batch = next.batches[batchId] || { batchId, taskIds: [], attempts: 0 };
  const replayable = knownTaskIds.filter((taskId) => !next.tasks[taskId].batchIds.includes(batchId));
  for (const taskId of replayable) {
    const task = next.tasks[taskId];
    task.transitions.push({ from: task.state, to: "pending", reason: "retry-requested", batchId, attempt: null, timestamp: nowIso() });
    task.state = "pending";
    task.retryCount += 1;
    task.batchIds.push(batchId);
    if (!batch.taskIds.includes(taskId)) batch.taskIds.push(taskId);
  }
  next.batches[batchId] = batch;
  return next;
}

export function selectRetryTasks(journal: RunJournal, symbols: Iterable<string>): string[] {
  return [...symbols].map((symbol) => taskIdFor(journal.scanDate, symbol)).filter((taskId) => !!journal.tasks[taskId] && journal.tasks[taskId].state !== "resolved");
}

export function writeRunJournalAtomic(filePath: string, journal: RunJournal): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(journal, null, 2), { encoding: "utf8", flag: "w" });
  fs.renameSync(temporary, filePath);
}

export function readRunJournal(filePath: string): RunJournal {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as RunJournal;
}

export function persistCaptureBeforeValidation(filePath: string, journal: RunJournal, input: ProviderCapture): RunJournal {
  const captured = recordProviderCapture(journal, input);
  writeRunJournalAtomic(filePath, captured);
  const verified = readRunJournal(filePath);
  const batch = verified.batches[input.batchId];
  const capturedAttempt = captured.batches[input.batchId].attempts;
  if (!batch || batch.attempts !== capturedAttempt || batch.taskIds.some((taskId) => [...verified.tasks[taskId].attempts].reverse().find((attempt) => attempt.batchId === input.batchId)?.attempt !== capturedAttempt)) {
    throw new Error(`Provider capture could not be verified on disk for ${input.batchId}`);
  }
  const durable = clone(verified);
  durable.durableCaptureAttempts = { ...(durable.durableCaptureAttempts || {}), [input.batchId]: capturedAttempt };
  writeRunJournalAtomic(filePath, durable);
  return durable;
}

export interface DegradedAlertInput {
  scanDate: string;
  generation: string;
  affectedSymbols: string[];
  counts: Record<string, number>;
  costUsd: number;
  malformedResponseCostUsd?: number;
  recoveryFile: string;
  replayInstructions: string;
  workflowUrl?: string;
}

export function buildDegradedScanAlertPayload(input: DegradedAlertInput) {
  const sanitizedInstructions = input.replayInstructions.replace(/(--?(?:api[-_]?key|token|secret|password)(?:=|\s+)[^\s]+)/gi, "[REDACTED]");
  return {
    type: "scan-degraded",
    scanDate: input.scanDate,
    generation: input.generation,
    affectedSymbols: [...new Set(input.affectedSymbols.map(normalizeAnalysisSymbol).filter(Boolean))],
    affectedSymbolCount: new Set(input.affectedSymbols.map(normalizeAnalysisSymbol).filter(Boolean)).size,
    counts: { ...input.counts },
    costUsd: Number((input.costUsd + (input.malformedResponseCostUsd || 0)).toFixed(6)),
    malformedResponseCostUsd: input.malformedResponseCostUsd || 0,
    recoveryFile: input.recoveryFile,
    replayInstructions: sanitizedInstructions,
    ...(input.workflowUrl ? { workflowUrl: input.workflowUrl.split(/[?#]/, 1)[0] } : {}),
  };
}

// Stable aliases keep the primitive names discoverable for pipeline callers.
export const validateNewsAnalysisResponse = parseNewsAnalysisResponse;
export const createScanRunJournal = createRunJournal;
export const appendSourceEvidenceSnapshot = recordSourceEvidence;
export const persistProviderCapture = recordProviderCapture;
export const applySemanticValidation = transitionSemanticValidation;
export const getRetryableTaskIds = selectRetryTasks;
export const persistRunJournalAtomic = writeRunJournalAtomic;
