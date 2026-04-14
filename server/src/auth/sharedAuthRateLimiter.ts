import { LocalRateLimitProvider, RateLimitDecision, RateLimitProvider } from "./rateLimit";
import { UpstashRateLimitProvider } from "./upstashRateLimitProvider";

interface SharedAuthLimiterConfig {
  provider: "local" | "upstash";
  windowMs: number;
  maxRequests: number;
  maxPerEmail: number;
  nodeEnv: string;
  upstashUrl?: string;
  upstashToken?: string;
}

export class SharedAuthRateLimiter {
  private primary: RateLimitProvider;
  private fallbackLocal = new LocalRateLimitProvider();
  private fallbackEnabled: boolean;
  private windowMs: number;
  private maxRequests: number;
  private maxPerEmail: number;

  constructor(config: SharedAuthLimiterConfig) {
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
    this.maxPerEmail = config.maxPerEmail;
    this.fallbackEnabled = config.nodeEnv !== "production";

    if (config.provider === "upstash") {
      if (!config.upstashUrl || !config.upstashToken) {
        throw new Error("AUTH_RATE_LIMIT_PROVIDER=upstash requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
      }
      this.primary = new UpstashRateLimitProvider(config.upstashUrl, config.upstashToken);
      return;
    }
    this.primary = this.fallbackLocal;
  }

  async enforce(params: {
    endpoint: string;
    ip: string;
    email?: string;
    strictOnProviderError: boolean;
  }): Promise<RateLimitDecision> {
    try {
      const ipResult = await this.primary.incrementAndCheck({
        key: `auth:ip:${params.endpoint}:${params.ip}`,
        windowMs: this.windowMs,
        maxRequests: this.maxRequests,
      });
      if (!ipResult.allowed) return ipResult;

      if (params.email) {
        const emailResult = await this.primary.incrementAndCheck({
          key: `auth:email:${params.endpoint}:${params.email.toLowerCase()}`,
          windowMs: this.windowMs,
          maxRequests: this.maxPerEmail,
        });
        if (!emailResult.allowed) return emailResult;
      }

      return { allowed: true, retryAfterSec: 0 };
    } catch (error) {
      console.error(`[AUTH] shared rate limiter provider error: ${String(error)}`);
      if (this.fallbackEnabled) {
        console.warn("[AUTH] falling back to local rate limiter (non-production).");
        return this.fallbackLocal.incrementAndCheck({
          key: `auth:fallback:${params.endpoint}:${params.ip}:${params.email ?? "none"}`,
          windowMs: this.windowMs,
          maxRequests: this.maxRequests,
        });
      }
      if (params.strictOnProviderError) {
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(this.windowMs / 1000)) };
      }
      return { allowed: true, retryAfterSec: 0 };
    }
  }

  gc(): number {
    const localGc = this.fallbackLocal.gc?.() ?? 0;
    const primaryGc = this.primary.gc?.() ?? 0;
    return localGc + primaryGc;
  }
}
