import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { googleExchangeCode, googleOauthConfigured, googleClient } from "@/lib/lms/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fail(message: string, origin: string): Promise<NextResponse> {
  const back = new URL(`${origin}/settings?google_error=${encodeURIComponent(message)}`);
  return NextResponse.redirect(back.toString(), 302);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const origin = req.nextUrl.origin;
  if (!googleOauthConfigured()) {
    return NextResponse.json({ error: "Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)." }, { status: 501 });
  }

  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  if (error) {
    return fail(error === "access_denied" ? "Google sign-in was cancelled." : error, origin);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) {
    return fail("Google did not return an authorization code.", origin);
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("veritas_oauth_state")?.value;
  cookieStore.delete("veritas_oauth_state");
  if (!state || !expectedState || state !== expectedState) {
    return fail("OAuth state mismatch — start the sign-in again.", origin);
  }

  try {
    const tokens = await googleExchangeCode(code, `${origin}/api/oauth/google/callback`);
    if (!tokens.refresh_token) {
      return fail("Google did not return a refresh token — remove app access at myaccount.google.com/permissions and retry.", origin);
    }

    // Resolve the account email for display.
    let accountEmail: string | null = null;
    try {
      const connectionLike = { baseUrl: "https://classroom.googleapis.com", token: tokens.refresh_token };
      const client = googleClient(connectionLike);
      accountEmail = await client.self();
    } catch {
      accountEmail = null;
    }

    const existing = await prisma.lmsConnection.findFirst();
    const data = {
      platform: "GOOGLE" as const,
      baseUrl: "https://classroom.googleapis.com",
      token: tokens.refresh_token,
      name: accountEmail ?? "Google Classroom",
    };
    const connection = existing
      ? await prisma.lmsConnection.update({ where: { id: existing.id }, data })
      : await prisma.lmsConnection.create({ data });

    const back = new URL(`${origin}/settings?google_connected=${encodeURIComponent(connection.name ?? "")}`);
    return NextResponse.redirect(back.toString(), 302);
  } catch (err) {
    return fail(err instanceof Error ? err.message.slice(0, 200) : "Token exchange failed.", origin);
  }
}
