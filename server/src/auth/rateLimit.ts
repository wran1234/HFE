interface Entry {
  count: number;
  resetAtMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSec: number;
}

export interface RateLimitProvider {
  incrementAndCheck(params: {
    key: string;
    windowMs: number;
    maxRequests: number;
  }): Promise<RateLimitDecision>;
  gc?(): number;
}

export class LocalRateLimitProvider implements RateLimitProvider {
  private entries = new Map<string, Entry>();

  async incrementAndCheck(params: {
    key: string;
    windowMs: number;
    maxRequests: number;
  }): Promise<RateLimitDecision> {
    const now = Date.now();
    const existing = this.entries.get(params.key);

    if (!existing || now > existing.resetAtMs) {
      this.entries.set(params.key, { count: 1, resetAtMs: now + params.windowMs });
      return { allowed: true, retryAfterSec: 0 };
    }

    if (existing.count >= params.maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000));
      return { allowed: false, retryAfterSec };
    }

    existing.count += 1;
    this.entries.set(params.key, existing);
    return { allowed: true, retryAfterSec: 0 };
  }

  gc(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, value] of this.entries.entries()) {
      if (now > value.resetAtMs) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}

export function clientIpFromRequest(ip: string | undefined, forwardedFor: string | undefined): string {
  const forwarded = forwardedFor?.split(",")[0]?.trim();
  return forwarded || ip || "unknown";
}
