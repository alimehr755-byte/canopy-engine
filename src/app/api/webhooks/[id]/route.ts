import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { active } = body;
    const webhook = await prisma.webhook.update({
      where: { id },
      data: { active: typeof active === "boolean" ? active : undefined },
    });
    return NextResponse.json({ id: webhook.id, active: webhook.active });
  } catch (error) {
    console.error("webhook update error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.webhook.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("webhook delete error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

