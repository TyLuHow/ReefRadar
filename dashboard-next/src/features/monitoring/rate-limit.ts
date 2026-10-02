/**
 * Token bucket with an injectable clock (03-12, PLAT-09).
 *
 * The bucket starts full, holds at most `capacity` tokens and refills continuously
 * at `refillPerMinute`. State is per module instance, so on serverless each warm
 * instance has its own bucket: a best-effort cap on log flooding, not a global quota.
 */
export interface RateLimiterOptions {
  capacity: number;
  refillPerMinute: number;
  now?: () => number;
}

export interface RateLimiter {
  /** True and one token spent, or false when the bucket is empty. */
  tryTake(): boolean;
}

export function createRateLimiter({ capacity, refillPerMinute, now = Date.now }: RateLimiterOptions): RateLimiter {
  let tokens = capacity;
  let last = now();
  const refillPerMs = refillPerMinute / 60_000;

  return {
    tryTake() {
      const current = now();
      // A clock that moves backwards adds nothing and is re-anchored.
      const elapsed = Math.max(0, current - last);
      last = current;
      tokens = Math.min(capacity, tokens + elapsed * refillPerMs);
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}
