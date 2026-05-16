/**
 * Rate limiting for API routes.
 * - When `process.env.REDIS_URL` is set (e.g. Upstash on Vercel), uses a fixed-window counter in Redis.
 * - Otherwise uses an in-memory token bucket (fine for single-instance dev; weak on multi-instance without Redis).
 */

import IORedis from "ioredis";

type Bucket = { tokens: number; last: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number };

let _redis: IORedis | undefined | null;

function getOptionalRedis(): IORedis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (_redis === null) return null;
  if (_redis) return _redis;
  try {
    _redis = new IORedis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
    _redis.on("error", (err) => {
      if ("code" in err && err.code === "ECONNREFUSED") return;
      console.warn("[rate-limit] Redis:", err.message);
    });
    return _redis;
  } catch {
    _redis = null;
    return null;
  }
}

/** Synchronous in-memory limiter (tests + fallback). */
export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const refillPerMs = limit / windowMs;
  const b = buckets.get(key) ?? { tokens: limit, last: now };
  const elapsed = now - b.last;
  b.tokens = Math.min(limit, b.tokens + elapsed * refillPerMs);
  b.last = now;

  if (b.tokens < 1) {
    buckets.set(key, b);
    return { ok: false, retryAfterMs: Math.ceil((1 - b.tokens) / refillPerMs) };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { ok: true, remaining: Math.floor(b.tokens) };
}

async function rateLimitRedis(
  redis: IORedis,
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  const redisKey = `rl:api:${key}`;
  const n = await redis.incr(redisKey);
  if (n === 1) {
    await redis.pexpire(redisKey, windowMs);
  }
  if (n > limit) {
    const pttl = await redis.pttl(redisKey);
    return {
      ok: false,
      retryAfterMs: pttl > 0 ? pttl : windowMs,
    };
  }
  return { ok: true, remaining: Math.max(0, limit - n) };
}

/**
 * Prefer this in route handlers. Uses Redis when `REDIS_URL` is set in the environment;
 * otherwise falls back to in-memory `rateLimit`.
 */
export async function rateLimitAsync(
  key: string,
  opts: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  const redis = getOptionalRedis();
  if (!redis) {
    return rateLimit(key, opts);
  }
  try {
    return await rateLimitRedis(redis, key, opts);
  } catch (e) {
    console.warn("[rate-limit] Redis error, using memory:", e);
    return rateLimit(key, opts);
  }
}

export function ipKey(req: Request, prefix: string): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || "unknown";
  return `${prefix}:${ip}`;
}
