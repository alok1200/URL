import { describe, expect, it } from "vitest";
import { RateLimiter } from "@/lib/rate-limiter";

describe("RateLimiter", () => {
  it("enforces per-IP sliding window limit and resets after window", () => {
    const limiter = new RateLimiter({
      windowMs: 60_000,
      maxRequestsPerWindow: 3,
      maxConcurrentPerIp: 2,
      maxConcurrentGlobal: 3,
    });

    const t0 = 1_000_000;
    expect(limiter.checkInfoRateLimit("1.2.3.4", t0).allowed).toBe(true);
    expect(limiter.checkInfoRateLimit("1.2.3.4", t0 + 1000).allowed).toBe(true);
    expect(limiter.checkInfoRateLimit("1.2.3.4", t0 + 2000).allowed).toBe(true);

    const blocked = limiter.checkInfoRateLimit("1.2.3.4", t0 + 3000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);

    // Different IP is unaffected
    expect(limiter.checkInfoRateLimit("5.6.7.8", t0 + 3000).allowed).toBe(true);

    // Original IP is allowed again once the window slides past t0
    expect(limiter.checkInfoRateLimit("1.2.3.4", t0 + 61_000).allowed).toBe(true);
  });

  it("enforces per-IP and global download concurrency limits and releases cleanly", () => {
    const limiter = new RateLimiter({
      maxConcurrentPerIp: 2,
      maxConcurrentGlobal: 3,
    });

    const lease1 = limiter.acquireDownloadSlot("1.1.1.1");
    const lease2 = limiter.acquireDownloadSlot("1.1.1.1");
    const lease3 = limiter.acquireDownloadSlot("1.1.1.1");

    expect(lease1.allowed).toBe(true);
    expect(lease2.allowed).toBe(true);
    expect(lease3.allowed).toBe(false);
    expect(lease3.reason).toBe("IP_LIMIT");

    const lease4 = limiter.acquireDownloadSlot("2.2.2.2");
    const lease5 = limiter.acquireDownloadSlot("3.3.3.3");

    expect(lease4.allowed).toBe(true);
    expect(lease5.allowed).toBe(false);
    expect(lease5.reason).toBe("GLOBAL_LIMIT");

    // Releasing is idempotent
    lease1.release();
    lease1.release();
    expect(limiter.getActiveCounts().global).toBe(2);

    const lease6 = limiter.acquireDownloadSlot("3.3.3.3");
    expect(lease6.allowed).toBe(true);
  });
});
