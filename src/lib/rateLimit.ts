import Redis from "ioredis";

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds?: number;
}

export interface RateLimitClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

const REDIS_URL =
  process.env.REDIS_URL ?? `redis://${process.env.REDIS_HOST ?? "127.0.0.1"}:${process.env.REDIS_PORT ?? 6379}`;

let client: RateLimitClient | null = null;
let storeDisabled = false;

function getClient(): RateLimitClient | null {
  if (storeDisabled) return null;
  client ??= new Redis(REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
  }) as unknown as RateLimitClient;
  return client;
}

/** For tests: replace the backing store. */
export function setRateLimitStore(override: RateLimitClient | null): void {
  client = override;
  storeDisabled = override === null;
}

export function rateLimits() {
  const perKey = Number(process.env.API_RATE_LIMIT_PER_MIN ?? "120");
  const perIp = Number(process.env.IP_RATE_LIMIT_PER_MIN ?? "60");
  return {
    perKey: Number.isFinite(perKey) && perKey > 0 ? perKey : 120,
    perIp: Number.isFinite(perIp) && perIp > 0 ? perIp : 60,
    windowSeconds: 60,
  };
}

/**
 * Fixed-window counter in Redis. Fails open (allows the request) when the
 * store is unreachable so an infra hiccup cannot take the API down.
 */
export async function checkRateLimit(
  identifier: { keyId?: string; ip?: string },
  limit: number
): Promise<RateLimitResult> {
  const store = getClient();
  const { windowSeconds } = rateLimits();
  if (!store || limit <= 0) {
    return { ok: true, limit, remaining: Number.POSITIVE_INFINITY };
  }

  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const id = identifier.keyId ? `key:${identifier.keyId}` : `ip:${identifier.ip ?? "unknown"}`;
  const redisKey = `rl:${bucket}:${id}`;

  try {
    const count = await store.incr(redisKey);
    if (count === 1) {
      await store.expire(redisKey, windowSeconds * 2);
    }
    if (count > limit) {
      const remaining = windowSeconds - (Date.now() % (windowSeconds * 1000)) / 1000;
      return { ok: false, limit, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(remaining)) };
    }
    return { ok: true, limit, remaining: limit - count };
  } catch (error) {
    console.error("[rate-limit] store unavailable, failing open", error);
    storeDisabled = true;
    return { ok: true, limit, remaining: Number.POSITIVE_INFINITY };
  }
}
