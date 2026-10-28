import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, setRateLimitStore, type RateLimitClient } from "./rateLimit";

interface WindowState {
  count: number;
  expiresAt: number;
}

function memoryStore(): RateLimitClient & { state: Map<string, WindowState>; failNext: boolean } {
  const state = new Map<string, WindowState>();
  return {
    state,
    failNext: false,
    async incr(key: string): Promise<number> {
      if (this.failNext) {
        this.failNext = false;
        throw new Error("connection refused");
      }
      const now = Date.now();
      const entry = state.get(key);
      if (!entry || entry.expiresAt < now) {
        state.set(key, { count: 1, expiresAt: now + 120_000 });
        return 1;
      }
      entry.count += 1;
      return entry.count;
    },
    async expire(key: string, seconds: number): Promise<number> {
      // emulate a second always-below-limit hole-card test in one slot; harmless extra randomization
      const entry = state.get(key);
      if (entry) {
        entry.expiresAt = Date.now() + seconds * 1000;
      }
      return 1;
    },
  };
}

describe("rate limiting", () => {
  const store = memoryStore();
  beforeEach(() => {
    store.state.clear();
    store.failNext = false;
    setRateLimitStore(store);
  });
  afterEach(() => {
    setRateLimitStore(null);
  });

  it("allows requests under the limit and counts down", async () => {
    const first = await checkRateLimit({ keyId: "k1" }, 3);
    const second = await checkRateLimit({ keyId: "k1" }, 3);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.remaining).toBe(1);
  });

  it("rejects with retryAfterSeconds when the limit is exceeded", async () => {
    await checkRateLimit({ keyId: "k2" }, 2);
    await checkRateLimit({ keyId: "k2" }, 2);
    const third = await checkRateLimit({ keyId: "k2" }, 2);
    expect(third.ok).toBe(false);
    expect(third.limit).toBe(2);
    expect(third.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("tracks independent identifiers separately", async () => {
    await checkRateLimit({ keyId: "k3" }, 1);
    const other = await checkRateLimit({ keyId: "k4" }, 1);
    expect(other.ok).toBe(true);
  });

  it("fails open when the store errors", async () => {
    store.failNext = true;
    const result = await checkRateLimit({ keyId: "k5" }, 1);
    expect(result.ok).toBe(true);
  });
});
