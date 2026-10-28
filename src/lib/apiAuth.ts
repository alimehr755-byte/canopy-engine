import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, hasScope, type ApiKeyContext } from "@/lib/apiKey";

export interface AuthResult {
  ok: boolean;
  ctx?: ApiKeyContext;
  response?: NextResponse;
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
  return { ok: true, ctx };
}
