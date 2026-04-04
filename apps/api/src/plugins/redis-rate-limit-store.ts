import type { Redis } from "ioredis";
import type { FastifyRateLimitStore } from "@fastify/rate-limit";

interface StoreResult {
  current: number;
  ttl: number;
}

type StoreCallback = (err: Error | null, result?: StoreResult) => void;

interface InMemoryEntry {
  current: number;
  resetAt: number;
}

/**
 * Factory that returns a FastifyRateLimitStore class configured with the
 * given Redis client and fail-open/fail-closed behaviour.
 *
 * @param redis       ioredis client to use for storage
 * @param timeWindow  rate-limit window in milliseconds
 * @param failOpen    when true, fall back to in-memory on Redis error;
 *                    when false, return 503 on Redis error
 * @param fallbackMax maximum allowed in the in-memory fallback (fail-open only)
 */
export function makeRateLimitStoreClass(
  redis: Redis,
  timeWindow: number,
  failOpen: boolean,
  fallbackMax: number
) {
  const inMemory = new Map<string, InMemoryEntry>();

  return class implements FastifyRateLimitStore {
    incr(key: string, callback: StoreCallback): void {
      redis
        .pipeline()
        .incr(key)
        .pttl(key)
        .exec()
        .then((results) => {
          if (!results) {
            return onRedisError(key, callback);
          }

          const [[e1, count], [e2, pttl]] = results as [
            [Error | null, number],
            [Error | null, number],
          ];

          if (e1 || e2) {
            return onRedisError(key, callback);
          }

          // Set expiry on first increment (best-effort, non-blocking)
          if (count === 1) {
            void redis.pexpire(key, timeWindow);
          }

          callback(null, {
            current: count,
            ttl: pttl < 0 ? timeWindow : pttl,
          });
        })
        .catch(() => onRedisError(key, callback));
    }

    child(_routeOptions: unknown): this {
      return this;
    }
  };

  function onRedisError(key: string, callback: StoreCallback): void {
    if (failOpen) {
      inMemoryIncr(key, callback);
    } else {
      const err = new Error("Rate limit store unavailable") as Error & {
        statusCode: number;
      };
      err.statusCode = 503;
      callback(err);
    }
  }

  function inMemoryIncr(key: string, callback: StoreCallback): void {
    const now = Date.now();
    const entry = inMemory.get(key);

    if (!entry || now > entry.resetAt) {
      inMemory.set(key, { current: 1, resetAt: now + timeWindow });
      callback(null, { current: 1, ttl: timeWindow });
    } else {
      entry.current++;
      callback(null, { current: entry.current, ttl: entry.resetAt - now });
    }
  }

  // Prevent unbounded growth: prune expired entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of inMemory) {
      if (now > v.resetAt) inMemory.delete(k);
    }
  }, timeWindow).unref();
}
