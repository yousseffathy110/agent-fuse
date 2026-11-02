import { Redis } from "@upstash/redis/cloudflare";

const WINDOW_SIZE_MS = 60 * 1000; // 60 seconds rolling
const MAX_CALLS_PER_WINDOW = 15;

export async function checkCircuitBreaker(
  redis: Redis,
  agentId: string,
): Promise<{ allowed: boolean; currentCount: number }> {
  const key = `cb:sliding:${agentId}`;
  const now = Date.now();
  const clearBefore = now - WINDOW_SIZE_MS;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, clearBefore);
  pipeline.zadd(key, {
    score: now,
    member: `${now}:${Math.random().toString(36).substring(2, 8)}`,
  });
  pipeline.zcard(key);
  pipeline.expire(key, 65);

  const results = await pipeline.exec<[number, number, number, number]>();
  const currentCount = results[2];

  if (currentCount > MAX_CALLS_PER_WINDOW) {
    return { allowed: false, currentCount };
  }

  return { allowed: true, currentCount };
}
