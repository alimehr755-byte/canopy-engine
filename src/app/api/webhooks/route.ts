import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, secret, events } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "invalid url" }, { status: 400 });
    }

    const webhookSecret = secret || crypto.randomBytes(32).toString("hex");

    const webhook = await prisma.webhook.create({
      data: {
        url,
        secret: webhookSecret,
        events: Array.isArray(events) && events.length > 0 ? events : ["report.completed"],
        active: true,
      },
    });

    return NextResponse.json(
      { id: webhook.id, url: webhook.url, events: webhook.events, secret: webhookSecret },
      { status: 201 },
    );
  } catch (error) {
    console.error("webhook create error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const webhooks = await prisma.webhook.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, url: true, events: true, active: true, createdAt: true },
    });
    return NextResponse.json({ webhooks });
  } catch (error) {
    console.error("webhook list error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
