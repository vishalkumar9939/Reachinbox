import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { RateLimitCheckResult } from '../types/index.js';

export class RateLimitService {
  /**
   * Generates the Redis key for the current hourly bucket
   */
  private static getHourBucket(): { bucketKey: string; resetTime: Date; retryAfterMs: number } {
    const now = Date.now();
    const currentHourTimestamp = Math.floor(now / 3600000) * 3600000;
    const resetTime = new Date(currentHourTimestamp + 3600000);
    const retryAfterMs = Math.max(1000, resetTime.getTime() - now + 1000); // 1s buffer into next hour
    const date = new Date(currentHourTimestamp);
    const bucketKey = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(
      date.getUTCDate()
    ).padStart(2, '0')}${String(date.getUTCHours()).padStart(2, '0')}`;

    return { bucketKey, resetTime, retryAfterMs };
  }

  /**
   * Atomically checks and increments hourly rate limit counter.
   * If limit is exceeded, does NOT increment and returns allowed: false with retryAfterMs.
   */
  static async checkAndIncrementHourlyLimit(
    senderEmail: string,
    customLimit?: number
  ): Promise<RateLimitCheckResult> {
    const limit = customLimit && customLimit > 0 ? customLimit : env.MAX_EMAILS_PER_HOUR;
    const { bucketKey, resetTime, retryAfterMs } = this.getHourBucket();

    // Keyed per sender and global bucket — no per-recipient throttling
    const senderKey = `rate_limit:hourly:sender:${senderEmail.toLowerCase()}:${bucketKey}`;
    const globalKey = `rate_limit:hourly:global:${bucketKey}`;

    // Redis Lua Script to atomically check both sender and global limits before incrementing
    const luaScript = `
      local senderKey = KEYS[1]
      local globalKey = KEYS[2]
      local maxAllowed = tonumber(ARGV[1])
      local ttlSeconds = 3600

      local senderCount = tonumber(redis.call('get', senderKey) or '0')
      local globalCount = tonumber(redis.call('get', globalKey) or '0')

      if senderCount >= maxAllowed or globalCount >= (maxAllowed * 10) then
        return { 0, senderCount, globalCount }
      end

      local newSenderCount = redis.call('incr', senderKey)
      if newSenderCount == 1 then
        redis.call('expire', senderKey, ttlSeconds)
      end

      local newGlobalCount = redis.call('incr', globalKey)
      if newGlobalCount == 1 then
        redis.call('expire', globalKey, ttlSeconds)
      end

      return { 1, newSenderCount, newGlobalCount }
    `;

    try {
      const evalPromise = redis.eval(
        luaScript,
        2,
        senderKey,
        globalKey,
        limit.toString()
      ) as Promise<[number, number, number]>;

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis operation timeout')), 1000)
      );

      const result = await Promise.race([evalPromise, timeoutPromise]);

      const allowed = result[0] === 1;
      const currentCount = result[1];

      return {
        allowed,
        currentCount,
        limit,
        resetTime,
        retryAfterMs: allowed ? 0 : retryAfterMs,
      };
    } catch (err: any) {
      console.warn(`⚠️ RateLimitService Redis error, using graceful pass-through: ${err.message}`);
      return {
        allowed: true,
        currentCount: 1,
        limit,
        resetTime,
        retryAfterMs: 0,
      };
    }
  }

  /**
   * Retrieves current hourly usage for dashboard
   */
  static async getHourlyUsage(senderEmail?: string, customLimit?: number): Promise<{
    currentUsage: number;
    limit: number;
    resetTime: Date;
    remaining: number;
  }> {
    const limit = customLimit && customLimit > 0 ? customLimit : env.MAX_EMAILS_PER_HOUR;
    const { bucketKey, resetTime } = this.getHourBucket();

    try {
      const key = senderEmail
        ? `rate_limit:hourly:sender:${senderEmail.toLowerCase()}:${bucketKey}`
        : `rate_limit:hourly:global:${bucketKey}`;

      const getPromise = redis.get(key);
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Redis timeout')), 800)
      );

      const raw = await Promise.race([getPromise, timeoutPromise]);
      const currentUsage = raw ? parseInt(raw, 10) : 0;
      const remaining = Math.max(0, limit - currentUsage);

      return {
        currentUsage,
        limit,
        resetTime,
        remaining,
      };
    } catch {
      return {
        currentUsage: 0,
        limit,
        resetTime,
        remaining: limit,
      };
    }
  }
}
