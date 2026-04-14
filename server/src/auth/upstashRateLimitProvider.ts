import { Redis } from "@upstash/redis";
import { RateLimitDecision, RateLimitProvider } from "./rateLimit";

export class UpstashRateLimitProvider implements RateLimitProvider {
  private redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  async incrementAndCheck(params: {
    key: string;
    windowMs: number;
    maxRequests: number;
  }): Promise<RateLimitDecision> {
    const count = await this.redis.incr(params.key);
    if (count === 1) {
      await this.redis.pexpire(params.key, params.windowMs);
    }
    const ttlMs = await this.redis.pttl(params.key);
    if (count > params.maxRequests) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((Number(ttlMs) || params.windowMs) / 1000)),
      };
    }
    return { allowed: true, retryAfterSec: 0 };
  }
}
