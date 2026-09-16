export interface PersistenceResult {
  submitted: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  unprocessed: number;
  timedOut: boolean;
  transientRetries: number;
  rejectedRows: Array<{ index: number; reason: string }>;
  unprocessedRows: Array<{ index: number; reason: string }>;
}

export function sanitizeAndTruncateUnicode(
  value: string,
  maxCodePoints: number,
): string {
  if (maxCodePoints <= 0 || !value) return "";

  let repaired = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0) continue;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        repaired += value[index] + value[index + 1];
        index += 1;
      } else {
        repaired += "\ufffd";
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      repaired += "\ufffd";
      continue;
    }
    repaired += value[index];
  }

  return Array.from(repaired.normalize("NFC")).slice(0, maxCodePoints).join("");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "Unknown persistence error");
}

function isTransientError(error: unknown): boolean {
  const candidate = error as { status?: number; code?: string } | null;
  const status = candidate?.status;
  const code = candidate?.code;
  return (
    status === 408 ||
    status === 429 ||
    (typeof status === "number" && status >= 500) ||
    code === "P1001" ||
    code === "P1002" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET"
  );
}

function isRunFencedError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "RUN_FENCED";
}

export async function persistRowsBounded<T>(
  rows: T[],
  options: {
    createMany: (rows: T[], signal: AbortSignal) => Promise<{ count: number }>;
    chunkSize: number;
    maxTransientRetries: number;
    deadlineAt: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    onProgress?: (
      result: PersistenceResult,
      signal: AbortSignal,
    ) => Promise<void> | void;
  },
): Promise<PersistenceResult> {
  const now = options.now || Date.now;
  const sleep = options.sleep ||
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const chunkSize = Math.max(1, Math.trunc(options.chunkSize));
  const result: PersistenceResult = {
    submitted: rows.length,
    inserted: 0,
    duplicates: 0,
    rejected: 0,
    unprocessed: 0,
    timedOut: false,
    transientRetries: 0,
    rejectedRows: [],
    unprocessedRows: [],
  };

  type IndexedRow = { row: T; index: number };
  let stopAll = false;
  const markUnprocessed = (
    batch: IndexedRow[],
    reason: string,
    timedOut: boolean,
  ) => {
    result.timedOut = result.timedOut || timedOut;
    result.unprocessed += batch.length;
    result.unprocessedRows.push(
      ...batch.map(({ index }) => ({ index, reason })),
    );
  };
  const runWithinDeadline = async <R>(
    operation: (signal: AbortSignal) => Promise<R> | R,
    label: string,
  ): Promise<R> => {
    const remaining = options.deadlineAt - now();
    if (remaining <= 0) {
      const error = new Error(`${label} exceeded the persistence deadline`);
      (error as Error & { code?: string }).code = "DEADLINE_EXCEEDED";
      throw error;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      if (!Number.isFinite(remaining)) return;
      timer = setTimeout(() => {
        const error = new Error(`${label} exceeded the persistence deadline`);
        (error as Error & { code?: string }).code = "DEADLINE_EXCEEDED";
        controller.abort(error);
        reject(error);
      }, Math.max(1, remaining));
    });
    try {
      return await Promise.race([
        Promise.resolve(operation(controller.signal)),
        timeout,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const reportProgress = async (): Promise<boolean> => {
    if (!options.onProgress) return true;
    try {
      await runWithinDeadline(
        (signal) =>
          options.onProgress?.(
            {
              ...result,
              rejectedRows: [...result.rejectedRows],
              unprocessedRows: [...result.unprocessedRows],
            },
            signal,
          ),
        "Persistence progress update",
      );
      return true;
    } catch {
      result.timedOut = true;
      stopAll = true;
      return false;
    }
  };

  const writeBatch = async (batch: IndexedRow[]): Promise<void> => {
    if (batch.length === 0) return;
    if (now() >= options.deadlineAt) {
      markUnprocessed(batch, "Persistence deadline reached", true);
      stopAll = true;
      return;
    }

    let attempt = 0;
    while (true) {
      try {
        const write = await runWithinDeadline(
          (signal) => options.createMany(batch.map(({ row }) => row), signal),
          "Persistence write",
        );
        result.inserted += write.count;
        result.duplicates += Math.max(0, batch.length - write.count);
        await reportProgress();
        return;
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code === "DEADLINE_EXCEEDED") {
          markUnprocessed(batch, errorMessage(error), true);
          stopAll = true;
          await reportProgress();
          return;
        }
        if (isRunFencedError(error)) {
          markUnprocessed(batch, errorMessage(error), false);
          stopAll = true;
          await reportProgress();
          return;
        }
        if (
          isTransientError(error) &&
          attempt < options.maxTransientRetries &&
          now() < options.deadlineAt
        ) {
          attempt += 1;
          result.transientRetries += 1;
          await sleep(Math.min(250 * 2 ** (attempt - 1), 1000));
          if (now() >= options.deadlineAt) {
            markUnprocessed(
              batch,
              "Persistence deadline reached after transient backoff",
              true,
            );
            stopAll = true;
            await reportProgress();
            return;
          }
          continue;
        }

        if (isTransientError(error)) {
          markUnprocessed(
            batch,
            `Transient persistence failure after retry budget: ${errorMessage(error)}`,
            false,
          );
          stopAll = true;
          await reportProgress();
          return;
        }

        if (batch.length === 1) {
          result.rejected += 1;
          result.rejectedRows.push({
            index: batch[0].index,
            reason: errorMessage(error),
          });
          await reportProgress();
          return;
        }

        const midpoint = Math.floor(batch.length / 2);
        await writeBatch(batch.slice(0, midpoint));
        await writeBatch(batch.slice(midpoint));
        return;
      }
    }
  };

  const indexedRows = rows.map((row, index) => ({ row, index }));
  for (let offset = 0; offset < indexedRows.length; offset += chunkSize) {
    const chunk = indexedRows.slice(offset, offset + chunkSize);
    if (stopAll || now() >= options.deadlineAt) {
      markUnprocessed(
        indexedRows.slice(offset),
        stopAll
          ? "Persistence stopped after an unresolved batch"
          : "Persistence deadline reached",
        now() >= options.deadlineAt,
      );
      await reportProgress();
      break;
    }
    await writeBatch(chunk);
  }

  result.rejectedRows.sort((left, right) => left.index - right.index);
  result.unprocessedRows.sort((left, right) => left.index - right.index);
  return result;
}
