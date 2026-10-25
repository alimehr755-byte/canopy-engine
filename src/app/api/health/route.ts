import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withLogging } from "@/lib/withLogging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(): Promise<NextResponse> {
  const startedAt = Date.now();
  let databaseHealth: boolean;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseHealth = true;
  } catch {
    databaseHealth = false;
  }

  const engineUrl = process.env.AI_ENGINE_URL;
  let engine = false;
  if (engineUrl) {
    try {
      const response = await fetch(`${engineUrl.replace(/\/$/u, "")}/health`, {
        signal: AbortSignal.timeout(2500)
      });
      engine = response.ok;
    } catch {
      engine = false;
    }
  }

  return NextResponse.json(
    {
      status: databaseHealth ? "ok" : "degraded",
      database: databaseHealth,
      engine,
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    },
    { status: databaseHealth ? 200 : 503 }
  );
}

export const GET = withLogging(handler);