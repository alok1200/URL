import { getConfig } from "./config";

export interface RateLimitCheck {
  allowed: boolean;
  retryAfterSec?: number;
  remaining?: number;
}

export interface ConcurrencyLease {
  allowed: boolean;
  reason?: "IP_LIMIT" | "GLOBAL_LIMIT";
  release: () => void;
}

export class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequestsPerWindow: number;
  private readonly maxConcurrentPerIp: number;
  private readonly maxConcurrentGlobal: number;

  private readonly requestLogs = new Map<string, number[]>();
  private readonly activePerIp = new Map<string, number>();
  private activeGlobal = 0;

  constructor(options?: {
    windowMs?: number;
    maxRequestsPerWindow?: number;
    maxConcurrentPerIp?: number;
    maxConcurrentGlobal?: number;
  }) {
    const cfg = getConfig();
    this.windowMs = options?.windowMs ?? 60_000;
    this.maxRequestsPerWindow = options?.maxRequestsPerWindow ?? cfg.rateLimitPerMin;
    this.maxConcurrentPerIp = options?.maxConcurrentPerIp ?? cfg.maxConcurrentPerIp;
    this.maxConcurrentGlobal = options?.maxConcurrentGlobal ?? cfg.maxConcurrentJobs;
  }

  /**
   * Sliding-window rate limit check for /api/info requests per IP.
   */
  checkInfoRateLimit(ip: string, now = Date.now()): RateLimitCheck {
    const cutoff = now - this.windowMs;
    const timestamps = (this.requestLogs.get(ip) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= this.maxRequestsPerWindow) {
      const oldest = timestamps[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      this.requestLogs.set(ip, timestamps);
      return {
        allowed: false,
        retryAfterSec,
        remaining: 0,
      };
    }

    timestamps.push(now);
    this.requestLogs.set(ip, timestamps);

    // Opportunistic pruning if map grows large
    if (this.requestLogs.size > 500) {
      for (const [key, list] of this.requestLogs.entries()) {
        const fresh = list.filter((t) => t > cutoff);
        if (fresh.length === 0) {
          this.requestLogs.delete(key);
        } else {
          this.requestLogs.set(key, fresh);
        }
      }
    }

    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequestsPerWindow - timestamps.length),
    };
  }

  /**
   * Acquires a download concurrency slot for the given IP and globally.
   * Always call `lease.release()` in a finally block when `lease.allowed` is true.
   */
  acquireDownloadSlot(ip: string): ConcurrencyLease {
    const ipCount = this.activePerIp.get(ip) ?? 0;

    if (ipCount >= this.maxConcurrentPerIp) {
      return {
        allowed: false,
        reason: "IP_LIMIT",
        release: () => {},
      };
    }

    if (this.activeGlobal >= this.maxConcurrentGlobal) {
      return {
        allowed: false,
        reason: "GLOBAL_LIMIT",
        release: () => {},
      };
    }

    this.activePerIp.set(ip, ipCount + 1);
    this.activeGlobal += 1;

    let released = false;
    return {
      allowed: true,
      release: () => {
        if (released) return;
        released = true;
        this.activeGlobal = Math.max(0, this.activeGlobal - 1);
        const current = this.activePerIp.get(ip) ?? 1;
        if (current <= 1) {
          this.activePerIp.delete(ip);
        } else {
          this.activePerIp.set(ip, current - 1);
        }
      },
    };
  }

  getActiveCounts(): { global: number; perIpSize: number } {
    return {
      global: this.activeGlobal,
      perIpSize: this.activePerIp.size,
    };
  }
}

const globalForRateLimiter = globalThis as typeof globalThis & {
  __umdRateLimiter?: RateLimiter;
};

export function getRateLimiter(): RateLimiter {
  if (!globalForRateLimiter.__umdRateLimiter) {
    globalForRateLimiter.__umdRateLimiter = new RateLimiter();
  }
  return globalForRateLimiter.__umdRateLimiter;
}

/**
 * Extracts a client IP address from request headers safely.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "127.0.0.1";
}
