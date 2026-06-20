/**
 * Lightweight cache helper for unpersonalized, read-mostly data
 * (admin aggregates, etc.).
 *
 * Backed by Upstash KV when configured (shared across serverless instances),
 * otherwise an in-process Map with TTL (per-instance, but still collapses
 * repeated work within a single warm instance).
 *
 * Only use this for data that is safe to serve slightly stale and is the same
 * for every viewer — never for per-user / personalized responses.
 */

import { kv } from "./kv";

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

// Per-instance fallback store.
const memoryStore = new Map<string, CacheEntry>();

const CACHE_PREFIX = "cache:";

/**
 * Return a cached value for `key`, or compute it with `fn`, cache it for
 * `ttlSeconds`, and return it.
 *
 * Cache failures (KV outage, serialization issues) never block the request:
 * on any cache error we fall through to computing the value directly.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const namespacedKey = `${CACHE_PREFIX}${key}`;

  // 1. Try to read from cache.
  if (kv) {
    try {
      const hit = await kv.getJSON<T>(namespacedKey);
      if (hit !== null) return hit;
    } catch {
      // Ignore and recompute.
    }
  } else {
    const entry = memoryStore.get(namespacedKey);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.value as T;
    }
    if (entry) memoryStore.delete(namespacedKey); // lazy eviction
  }

  // 2. Miss — compute.
  const value = await fn();

  // 3. Store (best-effort).
  if (kv) {
    try {
      await kv.setJSON(namespacedKey, value, ttlSeconds);
    } catch {
      // Non-fatal: serve the computed value even if caching failed.
    }
  } else {
    memoryStore.set(namespacedKey, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  return value;
}

/**
 * Invalidate a cached key (best-effort). Useful after a known write.
 */
export async function invalidateCache(key: string): Promise<void> {
  const namespacedKey = `${CACHE_PREFIX}${key}`;
  if (kv) {
    try {
      await kv.command(["DEL", namespacedKey]);
    } catch {
      // Ignore.
    }
  } else {
    memoryStore.delete(namespacedKey);
  }
}
