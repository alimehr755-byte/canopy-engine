import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { revoked } = body;

    const key = await prisma.apiKey.update({
      where: { id },
      data: {
        revokedAt: revoked === false ? null : revoked === true ? new Date() : undefined,
      },
      select: { id: true, revokedAt: true },
    });
    return NextResponse.json({ id: key.id, revokedAt: key.revokedAt });
  } catch (error) {
    console.error("api key update error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.apiKey.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("api key delete error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
