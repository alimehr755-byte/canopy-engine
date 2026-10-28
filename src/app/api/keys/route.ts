import { NextRequest, NextResponse } from "next/server";
import { createApiKey } from "@/lib/apiKey";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, scopes, userEmail, expiresInDays, expiresAt } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    let userId: string | undefined;
    if (userEmail) {
      const user = await prisma.user.findUnique({ where: { email: userEmail } });
      if (!user) {
        return NextResponse.json({ error: "user not found" }, { status: 404 });
      }
      userId = user.id;
    }

    let expiry: Date | undefined;
    if (expiresAt) {
      expiry = new Date(expiresAt);
    } else if (expiresInDays) {
      expiry = new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000);
    }

    const result = await createApiKey(name, scopes, userId, expiry);

    // The raw key is returned exactly once and never stored in plaintext.
    return NextResponse.json(
      { id: result.id, name, prefix: result.prefix, scopes: result.scopes, key: result.raw },
      { status: 201 },
    );
  } catch (error) {
    console.error("api key create error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ keys });
  } catch (error) {
    console.error("api key list error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
