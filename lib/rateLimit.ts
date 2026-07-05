// Distributed rate limiter using Upstash Redis.
// Falls back to in-memory when UPSTASH_REDIS_REST_URL is not set.
// To enable distributed mode: add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
// to Vercel environment variables (get from upstash.com → create Redis database).

import { Redis } from "@upstash/redis";

let redis: Redis | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch { redis = null; }

// In-memory fallback (single instance only — not distributed)
interface RateEntry { count: number; resetAt: number; }
const store = new Map<string, RateEntry>();
setInterval(() => {
  const now = Date.now();
  store.forEach((entry, key) => { if (now > entry.resetAt) store.delete(key); });
}, 5 * 60 * 1000);

export async function rateLimit(key: string, maxRequests = 5, windowMs = 60_000): Promise<boolean> {
  if (redis) {
    try {
      const redisKey = `rl:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.pexpire(redisKey, windowMs);
      return count <= maxRequests;
    } catch { /* fall through to in-memory */ }
  }

  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}
