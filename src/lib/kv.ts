/**
 * Shared Upstash Redis (REST) client.
 *
 * Active only when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.
 * When unset, `kv` is null and callers fall back to their local strategy
 * (Prisma rate limiter, in-process cache, per-instance circuit breaker, …).
 *
 * Uses fetch against the Upstash REST API so no npm dependency is required.
 * REST API reference: https://upstash.com/docs/redis/features/restapi
 *
 * We use a sliding-window counter via a single atomic pipeline (INCR + EXPIRE)
 * keyed on a fixed time bucket, which is sufficient for rate limiting and is
 * shared across all serverless instances.
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

type RedisCommand = (string | number)[];

export interface KvClient {
  /** Run a single Redis command, returning the parsed `result`. */
  command<T = unknown>(cmd: RedisCommand): Promise<T>;
  /** Run a pipeline of commands atomically, returning each `result` in order. */
  pipeline<T = unknown[]>(cmds: RedisCommand[]): Promise<T>;
  /** GET a JSON value, or null when absent / on error. */
  getJSON<T>(key: string): Promise<T | null>;
  /** SET a JSON value with an optional TTL (seconds). */
  setJSON(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
}

function createKvClient(url: string, token: string): KvClient {
  const baseHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  async function command<T = unknown>(cmd: RedisCommand): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(cmd),
      // Rate-limit / cache reads must never be cached by the fetch layer.
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Upstash command failed: ${res.status}`);
    }
    const data = (await res.json()) as { result?: T; error?: string };
    if (data.error) {
      throw new Error(`Upstash error: ${data.error}`);
    }
    return data.result as T;
  }

  async function pipeline<T = unknown[]>(cmds: RedisCommand[]): Promise<T> {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(cmds),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Upstash pipeline failed: ${res.status}`);
    }
    const data = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    return data.map((entry) => {
      if (entry.error) throw new Error(`Upstash error: ${entry.error}`);
      return entry.result;
    }) as T;
  }

  async function getJSON<T>(key: string): Promise<T | null> {
    const raw = await command<string | null>(["GET", key]);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async function setJSON(
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> {
    const payload = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await command(["SET", key, payload, "EX", ttlSeconds]);
    } else {
      await command(["SET", key, payload]);
    }
  }

  return { command, pipeline, getJSON, setJSON };
}

/**
 * Shared KV client, or null when Upstash env vars are not configured.
 * Cached on the module so every instance reuses the same client.
 */
export const kv: KvClient | null =
  UPSTASH_URL && UPSTASH_TOKEN ? createKvClient(UPSTASH_URL, UPSTASH_TOKEN) : null;

/** Whether a shared KV store is configured and available. */
export function isKvEnabled(): boolean {
  return kv !== null;
}
