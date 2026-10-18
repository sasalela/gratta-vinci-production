export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type LimiterOptions = {
  limit: number;
  windowMs: number;
};

export function createRateLimiter(options: LimiterOptions) {
  const buckets = new Map<string, number[]>();

  return {
    check(key: string, now = Date.now()): RateLimitResult {
      const windowStart = now - options.windowMs;
      const recent = (buckets.get(key) ?? []).filter((ts) => ts > windowStart);

      if (recent.length >= options.limit) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((recent[0] + options.windowMs - now) / 1000)
        );
        buckets.set(key, recent);
        return { allowed: false, retryAfterSeconds };
      }

      recent.push(now);
      buckets.set(key, recent);

      if (buckets.size > 10000) {
        for (const [bucketKey, stamps] of buckets) {
          if (stamps.every((ts) => ts <= windowStart)) buckets.delete(bucketKey);
        }
      }

      return { allowed: true, retryAfterSeconds: 0 };
    },
    reset() {
      buckets.clear();
    }
  };
}

export const AUTH_LIMITS = {
  login: { limit: 8, windowMs: 15 * 60 * 1000 },
  register: { limit: 5, windowMs: 60 * 60 * 1000 },
  verify: { limit: 10, windowMs: 15 * 60 * 1000 },
  resend: { limit: 3, windowMs: 60 * 60 * 1000 }
} as const;

export type AuthLimitKind = keyof typeof AUTH_LIMITS;

const limiters: Record<AuthLimitKind, ReturnType<typeof createRateLimiter>> = {
  login: createRateLimiter(AUTH_LIMITS.login),
  register: createRateLimiter(AUTH_LIMITS.register),
  verify: createRateLimiter(AUTH_LIMITS.verify),
  resend: createRateLimiter(AUTH_LIMITS.resend)
};

export function consumeAuthLimit(kind: AuthLimitKind, key: string, now = Date.now()): RateLimitResult {
  return limiters[kind].check(key, now);
}

export function resetAuthRateLimits(): void {
  for (const limiter of Object.values(limiters)) {
    limiter.reset();
  }
}
