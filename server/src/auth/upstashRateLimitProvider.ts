import { Redis } from "@upstash/redis";
import { RateLimitDecision, RateLimitProvider } from "./rateLimit";

// Atomic INCR + PEXPIRE (only on first increment) + PTTL via Lua.
// Returns [count, ttlMs] where ttlMs is -1 if the key has no TTL (shouldn't happen).
const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

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
    const result = await this.redis.eval(
      RATE_LIMIT_LUA,
      [params.key],
      [String(params.windowMs)]
    ) as [number, number];

    const count = result[0];
    const ttlMs = result[1];

    if (count > params.maxRequests) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : params.windowMs) / 1000)),
      };
    }
    return { allowed: true, retryAfterSec: 0 };
  }
}
