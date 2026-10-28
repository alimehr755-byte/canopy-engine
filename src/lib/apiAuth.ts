import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, hasScope, type ApiKeyContext } from "@/lib/apiKey";
import { checkRateLimit } from "@/lib/rateLimit";

export interface AuthResult {
  ok: boolean;
  ctx?: ApiKeyContext;
  response?: NextResponse;
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.headers.get("x-real-ip") ?? "127.0.0.1";
}

export async function requireApiKey(
  req: NextRequest,
  scope: string
): Promise<AuthResult> {
  const header =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;
  const ctx = await authenticateApiKey(header);
  if (!ctx) {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid or missing API key" }, { status: 401 }),
    };
  }
  if (!hasScope(ctx, scope)) {
    return {
      ok: false,
      response: NextResponse.json({ error: `missing scope: ${scope}` }, { status: 403 }),
    };
  }

  const limits = await import("@/lib/rateLimit").then((m) => m.rateLimits());
  const rate = await checkRateLimit(
    { keyId: ctx.id, ip: clientIp(req) },
    Math.min(limits.perKey, limits.perIp * 2)
  );
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(Math.max(0, Number.isFinite(rate.remaining) ? rate.remaining : 0)),
  };
  if (!rate.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds },
        { status: 429, headers: { ...headers, "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
      ),
    };
  }
  return { ok: true, ctx };
}
