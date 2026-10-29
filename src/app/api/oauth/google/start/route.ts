import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { googleOauthConfigured, GOOGLE_SCOPES } from "@/lib/lms/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starts the Google Classroom OAuth flow. Redirect URI is derived from the
 * request origin — add <origin>/api/oauth/google/callback to your Google
 * Cloud OAuth client's authorized redirect URIs.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!googleOauthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local (Google Cloud Console -> APIs & Services -> Credentials -> OAuth client ID, Web application) and add <this-origin>/api/oauth/google/callback as an authorized redirect URI.",
      },
      { status: 501 },
    );
  }
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("veritas_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  authUrl.searchParams.set("redirect_uri", `${req.nextUrl.origin}/api/oauth/google/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);
  return NextResponse.redirect(authUrl.toString(), 302);
}
