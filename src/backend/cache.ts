/**
 * Lightweight Redis-backed cache for external API results.
 *
 * Goal: cut paid API calls (Apify, Ahrefs, YouTube, LLM, …) by serving a
 * recent result from Redis when one exists. Falls back to a per-process
 * in-memory map when Redis isn't reachable, so it's always safe to call —
 * a missing/broken Redis just degrades to "no shared cache", never an error.
 *
 * Layering: this sits in FRONT of the durable Postgres caches (SeoToolRun,
 * LinkedInScan, …). Read order is Redis → Postgres → live API; writes
 * populate both. Redis is the fast hot layer; Postgres is the source of truth
 * that survives Redis eviction / restarts.
 */
import IORedis from "ioredis";

type MemEntry = { value: string; expiresAt: number };
const mem = new Map<string, MemEntry>();

let _redis: IORedis | null | undefined;

function getRedis(): IORedis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    _redis = null;
    return null;
  }
  try {
    _redis = new IORedis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    _redis.on("error", (err) => {
      if ("code" in err && (err as { code?: string }).code === "ECONNREFUSED") return;
      console.warn("[cache] Redis:", err.message);
    });
    return _redis;
  } catch {
    _redis = null;
    return null;
  }
}

const PREFIX = "cache:";

function memGet(key: string): string | null {
  const e = mem.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    mem.delete(key);
    return null;
  }
  return e.value;
}

function memSet(key: string, value: string, ttlSeconds: number): void {
  mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  // Bound the in-memory map so it can't grow unbounded in a long-lived process.
  if (mem.size > 1000) {
    const oldest = mem.keys().next().value;
    if (oldest) mem.delete(oldest);
  }
}

/** Read a cached JSON value. Returns null on miss / parse error. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const k = PREFIX + key;
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(k);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      /* fall through to memory */
    }
  }
  const raw = memGet(k);
  return raw != null ? (JSON.parse(raw) as T) : null;
}

/** Write a JSON value with a TTL (seconds). Best-effort; never throws. */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  const k = PREFIX + key;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return;
  }
  memSet(k, serialized, ttlSeconds);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(k, serialized, "EX", Math.max(1, Math.floor(ttlSeconds)));
    } catch {
      /* in-memory copy already stored */
    }
  }
}

/** Drop a cached key (e.g. when the underlying input changes). */
export async function cacheDel(key: string): Promise<void> {
  const k = PREFIX + key;
  mem.delete(k);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(k);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Read-through helper: return the cached value for `key`, or run `fn`, cache
 * its result for `ttlSeconds`, and return it. Errors from `fn` are NOT cached.
 */
export async function remember<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await fn();
  if (value !== null && value !== undefined) {
    await cacheSet(key, value, ttlSeconds);
  }
  return value;
}
