import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LmsError, normalizeBaseUrl } from "@/lib/lms/types";
import { canvasClient } from "@/lib/lms/canvas";
import { moodleClient } from "@/lib/lms/moodle";
import { googleClient } from "@/lib/lms/google";
import type { LmsClient } from "@/lib/lms/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientFor({ baseUrl, token, platform }: { platform: string; baseUrl: string; token: string }): LmsClient {
  const opts = { baseUrl, token };
  if (platform === "MOODLE") {
    return moodleClient(opts);
  }
  if (platform === "GOOGLE") {
    return googleClient(opts);
  }
  return canvasClient(opts);
}

export async function GET(): Promise<NextResponse> {
  try {
    const connections = await prisma.lmsConnection.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, platform: true, baseUrl: true, name: true, lastSyncAt: true, createdAt: true },
    });
    return NextResponse.json({ connections: connections.map(({ createdAt, ...rest }) => ({ ...rest, createdAt: createdAt.toISOString() })) });
  } catch (error) {
    console.error("lms list error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

/**
 * Connect or replace the single LMS connection (Canvas/Moodle token flow).
 * Google uses the OAuth start/callback routes instead. The token is stored
 * locally; every LMS call is outbound so no public URL is required.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const { platform, baseUrl, token, name } = body as {
    platform?: string;
    baseUrl?: string;
    token?: string;
    name?: string;
  };

  if (platform === "GOOGLE") {
    return NextResponse.json({ error: "Google Classroom uses the sign-in flow — use the Google button." }, { status: 400 });
  }
  if (!baseUrl || !token) {
    return NextResponse.json({ error: "baseUrl and token are required." }, { status: 400 });
  }
  if (platform && platform !== "CANVAS" && platform !== "MOODLE") {
    return NextResponse.json({ error: "platform must be CANVAS or MOODLE." }, { status: 400 });
  }

  try {
    const normalized = normalizeBaseUrl(baseUrl);
    const cleanToken = token.trim();
    if (cleanToken.length < 10) {
      return NextResponse.json({ error: "That token looks too short to be valid." }, { status: 400 });
    }

    const chosenPlatform = platform === "MOODLE" ? "MOODLE" : "CANVAS";
    const client = clientFor({ platform: chosenPlatform, baseUrl: normalized, token: cleanToken });

    // Verify the token before saving anything.
    let accountName: string;
    try {
      accountName = await client.self();
    } catch (error) {
      if (error instanceof LmsError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    const existing = await prisma.lmsConnection.findFirst();
    const data = {
      platform: chosenPlatform as "CANVAS" | "MOODLE",
      baseUrl: normalized,
      token: cleanToken,
      name: name ?? accountName,
    };
    const connection = existing
      ? await prisma.lmsConnection.update({ where: { id: existing.id }, data })
      : await prisma.lmsConnection.create({ data });

    return NextResponse.json(
      {
        id: connection.id,
        platform: connection.platform,
        baseUrl: connection.baseUrl,
        name: connection.name,
        connected: true,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("lms connect error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    await prisma.lmsConnection.deleteMany({});
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("lms disconnect error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
