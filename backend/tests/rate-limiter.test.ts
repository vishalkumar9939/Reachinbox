import { describe, it, expect, vi } from 'vitest';

export class SimulatedRateLimiter {
  private counters: Map<string, number> = new Map();

  getHourBucket(timestamp: number) {
    const currentHourTimestamp = Math.floor(timestamp / 3600000) * 3600000;
    const resetTime = new Date(currentHourTimestamp + 3600000);
    const retryAfterMs = Math.max(1000, resetTime.getTime() - timestamp + 1000);
    const bucketKey = new Date(currentHourTimestamp).toISOString().slice(0, 13);
    return { bucketKey, resetTime, retryAfterMs };
  }

  checkAndIncrement(senderEmail: string, limit: number, timestamp: number = Date.now()) {
    const { bucketKey, resetTime, retryAfterMs } = this.getHourBucket(timestamp);
    const key = `sender:${senderEmail.toLowerCase()}:${bucketKey}`;
    const current = this.counters.get(key) || 0;

    if (current >= limit) {
      return {
        allowed: false,
        currentCount: current,
        limit,
        resetTime,
        retryAfterMs,
      };
    }

    const newCount = current + 1;
    this.counters.set(key, newCount);

    return {
      allowed: true,
      currentCount: newCount,
      limit,
      resetTime,
      retryAfterMs: 0,
    };
  }

  reset() {
    this.counters.clear();
  }
}

describe('Rate Limiting & Hourly Window Engine', () => {
  const limiter = new SimulatedRateLimiter();

  it('should allow dispatches below configured hourly threshold', () => {
    limiter.reset();
    const limit = 5;
    const sender = 'outreach@reachinbox.ai';

    for (let i = 1; i <= limit; i++) {
      const res = limiter.checkAndIncrement(sender, limit);
      expect(res.allowed).toBe(true);
      expect(res.currentCount).toBe(i);
      expect(res.retryAfterMs).toBe(0);
    }
  });

  it('should deny and defer dispatches exceeding the hourly threshold', () => {
    limiter.reset();
    const limit = 3;
    const sender = 'outreach@reachinbox.ai';

    // Exhaust limit
    limiter.checkAndIncrement(sender, limit);
    limiter.checkAndIncrement(sender, limit);
    limiter.checkAndIncrement(sender, limit);

    // 4th send attempt should be denied
    const blocked = limiter.checkAndIncrement(sender, limit);
    expect(blocked.allowed).toBe(false);
    expect(blocked.currentCount).toBe(3);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.resetTime.getTime()).toBeGreaterThan(Date.now());
  });

  it('should reset limits when crossing into the next hourly bucket', () => {
    limiter.reset();
    const limit = 2;
    const sender = 'outreach@reachinbox.ai';

    const hour1 = new Date('2025-01-01T10:15:00Z').getTime();
    const hour2 = new Date('2025-01-01T11:01:00Z').getTime();

    // Use up hour 1
    limiter.checkAndIncrement(sender, limit, hour1);
    limiter.checkAndIncrement(sender, limit, hour1);
    const blockedHour1 = limiter.checkAndIncrement(sender, limit, hour1);
    expect(blockedHour1.allowed).toBe(false);

    // Hour 2 should have a fresh bucket
    const allowedHour2 = limiter.checkAndIncrement(sender, limit, hour2);
    expect(allowedHour2.allowed).toBe(true);
    expect(allowedHour2.currentCount).toBe(1);
  });

  it('should isolate limits between different senders', () => {
    limiter.reset();
    const limit = 2;
    const senderA = 'senderA@reachinbox.ai';
    const senderB = 'senderB@reachinbox.ai';

    limiter.checkAndIncrement(senderA, limit);
    limiter.checkAndIncrement(senderA, limit);
    const blockedA = limiter.checkAndIncrement(senderA, limit);
    expect(blockedA.allowed).toBe(false);

    // senderB should still have quota available
    const allowedB = limiter.checkAndIncrement(senderB, limit);
    expect(allowedB.allowed).toBe(true);
    expect(allowedB.currentCount).toBe(1);
  });
});
