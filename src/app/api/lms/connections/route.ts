import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LmsError, canvasSelf, normalizeBaseUrl } from "@/lib/lms/canvas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const connections = await prisma.lmsConnection.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        platform: true,
        baseUrl: true,
        name: true,
        lastSyncAt: true,
        externalRef: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ connections });
  } catch (error) {
    console.error("lms list error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

/**
 * Connect or replace the single LMS connection. The token is stored locally
 * (this is a first-party, self-hosted integration) but never returned.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const { platform, baseUrl, token, name } = body as {
    platform?: string;
    baseUrl?: string;
    token?: string;
    name?: string;
  };

  if (!baseUrl || !token) {
    return NextResponse.json({ error: "baseUrl and token are required." }, { status: 400 });
  }
  if (platform && platform !== "CANVAS" && platform !== "MOODLE") {
    return NextResponse.json({ error: "platform must be CANVAS or MOODLE." }, { status: 400 });
  }

  try {
    const normalized = normalizeBaseUrl(baseUrl);
    // Render the token useless before it leaves: trim newlines, require min length.
    const cleanToken = token.trim();
    if (cleanToken.length < 10) {
      return NextResponse.json({ error: "That token looks too short to be valid." }, { status: 400 });
    }

    // Verify the token against Canvas before saving anything.
    let accountName: string;
    try {
      const self = await canvasSelf({ baseUrl: normalized, token: cleanToken });
      accountName = self.name;
    } catch (error) {
      if (error instanceof LmsError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    const existing = await prisma.lmsConnection.findFirst();
    const connection = existing
      ? await prisma.lmsConnection.update({
          where: { id: existing.id },
          data: { platform: platform === "MOODLE" ? "MOODLE" : "CANVAS", baseUrl: normalized, token: cleanToken, name: name ?? accountName },
        })
      : await prisma.lmsConnection.create({
          data: { platform: platform === "MOODLE" ? "MOODLE" : "CANVAS", baseUrl: normalized, token: cleanToken, name: name ?? accountName },
        });

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
