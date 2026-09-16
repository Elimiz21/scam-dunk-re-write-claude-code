import {
  persistRowsBounded,
  sanitizeAndTruncateUnicode,
} from "@/lib/social-scan/persistence";

describe("social mention persistence safety", () => {
  test("keeps an emoji at the code-point boundary and repairs malformed Unicode", () => {
    const bounded = sanitizeAndTruncateUnicode(
      `${"a".repeat(499)}😀tail`,
      500,
    );
    const repaired = sanitizeAndTruncateUnicode(
      "bad\ud800text\u0000with/slash\\escape",
      2000,
    );

    expect(Array.from(bounded)).toHaveLength(500);
    expect(bounded.endsWith("😀")).toBe(true);
    expect(repaired).toBe("bad�textwith/slash\\escape");
    expect(() => Buffer.from(repaired, "utf8")).not.toThrow();
  });

  test("isolates one rejected row while preserving valid rows and duplicate accounting", async () => {
    const insertedIds = new Set<string>();
    const createMany = jest.fn(async (rows: Array<{ id: string }>) => {
      if (rows.some((row) => row.id === "malformed")) {
        const error = new Error("invalid byte sequence");
        (error as Error & { code?: string }).code = "P2000";
        throw error;
      }
      let count = 0;
      for (const row of rows) {
        if (insertedIds.has(row.id)) continue;
        insertedIds.add(row.id);
        count += 1;
      }
      return { count };
    });

    const result = await persistRowsBounded(
      [
        { id: "valid-1" },
        { id: "duplicate" },
        { id: "duplicate" },
        { id: "malformed" },
        { id: "valid-2" },
      ],
      {
        createMany,
        chunkSize: 5,
        maxTransientRetries: 0,
        deadlineAt: Number.POSITIVE_INFINITY,
      },
    );

    expect(Array.from(insertedIds).sort()).toEqual([
      "duplicate",
      "valid-1",
      "valid-2",
    ]);
    expect(result).toMatchObject({
      submitted: 5,
      inserted: 3,
      duplicates: 1,
      rejected: 1,
      unprocessed: 0,
      timedOut: false,
    });
    expect(result.rejectedRows).toEqual([
      expect.objectContaining({ index: 3, reason: "invalid byte sequence" }),
    ]);
  });

  test("bounds transient retries and leaves remaining rows for a partial terminal state at deadline", async () => {
    let now = 0;
    const createMany = jest.fn(async (rows: Array<{ id: string }>) => {
      now += 4;
      if (rows[0].id === "retry" && createMany.mock.calls.length < 3) {
        const error = new Error("rate limited");
        (error as Error & { status?: number }).status = 429;
        throw error;
      }
      return { count: rows.length };
    });

    const result = await persistRowsBounded(
      [{ id: "retry" }, { id: "too-late" }],
      {
        createMany,
        chunkSize: 1,
        maxTransientRetries: 2,
        deadlineAt: 12,
        now: () => now,
        sleep: async () => undefined,
      },
    );

    expect(createMany).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      inserted: 1,
      rejected: 0,
      unprocessed: 1,
      timedOut: true,
      transientRetries: 2,
    });
  });

  test("writes bounded chunks instead of one unbounded batch", async () => {
    const createMany = jest.fn(async (rows: Array<{ id: string }>) => ({
      count: rows.length,
    }));
    const rows = Array.from({ length: 121 }, (_, index) => ({
      id: `row-${index}`,
    }));

    const result = await persistRowsBounded(rows, {
      createMany,
      chunkSize: 40,
      maxTransientRetries: 0,
      deadlineAt: Number.POSITIVE_INFINITY,
    });

    expect(createMany.mock.calls.map(([chunk]) => chunk.length)).toEqual([
      40, 40, 40, 1,
    ]);
    expect(result.inserted).toBe(121);
  });

  test("bounds a pending write and aborts it before returning unprocessed evidence", async () => {
    let aborted = false;
    const startedAt = Date.now();
    const result = await persistRowsBounded([{ id: "pending" }], {
      createMany: async (_rows, signal) =>
        new Promise<{ count: number }>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(signal.reason);
          });
        }),
      chunkSize: 1,
      maxTransientRetries: 0,
      deadlineAt: Date.now() + 15,
    });

    expect(Date.now() - startedAt).toBeLessThan(250);
    expect(aborted).toBe(true);
    expect(result).toMatchObject({
      inserted: 0,
      rejected: 0,
      unprocessed: 1,
      timedOut: true,
    });
  });

  test("stops after the transient retry budget instead of recursively retrying every row", async () => {
    const createMany = jest.fn(async () => {
      const error = new Error("database unavailable");
      (error as Error & { code?: string }).code = "P1001";
      throw error;
    });

    const result = await persistRowsBounded(
      Array.from({ length: 8 }, (_, index) => ({ id: index })),
      {
        createMany,
        chunkSize: 8,
        maxTransientRetries: 2,
        deadlineAt: Date.now() + 5_000,
        sleep: async () => undefined,
      },
    );

    expect(createMany).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      inserted: 0,
      rejected: 0,
      unprocessed: 8,
      transientRetries: 2,
    });
  });

  test("bounds a stalled progress write and does not start another data chunk", async () => {
    const createMany = jest.fn(async (rows: Array<{ id: number }>) => ({
      count: rows.length,
    }));
    const result = await persistRowsBounded(
      [{ id: 1 }, { id: 2 }],
      {
        createMany,
        chunkSize: 1,
        maxTransientRetries: 0,
        deadlineAt: Date.now() + 15,
        onProgress: async (_progress, signal) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason));
          }),
      },
    );

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      inserted: 1,
      unprocessed: 1,
      timedOut: true,
    });
  });
});
