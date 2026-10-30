import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SyncUnit {
  docKey: string;
  title: string;
  url?: string | null;
  sourceType?: string;
  hashes: string[];
}

/**
 * Fingerprint-share hub: instantiations sync outbound. UNITS ARE HASH SETS —
 * no document text ever leaves an installation. Optional shared token config.
 */
function checkToken(req: NextRequest): boolean {
  const expected = process.env.SYNC_TOKEN;
  if (!expected) return true;
  return req.headers.get("x-sync-token") === expected;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!checkToken(req)) {
    return NextResponse.json({ error: "Invalid sync token." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    installationId?: string;
    units?: SyncUnit[];
  } | null;
  if (!body?.installationId || !Array.isArray(body.units)) {
    return NextResponse.json({ error: "installationId and units[] are required." }, { status: 400 });
  }
  const installationId = String(body.installationId).slice(0, 128);
  let accepted = 0;
  for (const unit of body.units.slice(0, 1000)) {
    if (!unit.docKey || !Array.isArray(unit.hashes) || unit.hashes.length === 0) {
      continue;
    }
    let hashes: bigint[];
    try {
      hashes = unit.hashes.slice(0, 60_000).map((hash) => BigInt(hash));
    } catch {
      continue;
    }
    await prisma.syncDoc.upsert({
      where: { docKey: String(unit.docKey).slice(0, 160) },
      create: {
        installationId,
        docKey: String(unit.docKey).slice(0, 160),
        title: String(unit.title ?? "Untitled").slice(0, 250),
        url: unit.url ? String(unit.url).slice(0, 500) : null,
        sourceType: unit.sourceType === "INTERNET" || unit.sourceType === "PUBLICATION" ? unit.sourceType : "REPOSITORY",
        hashes
      },
      update: {
        title: String(unit.title ?? "Untitled").slice(0, 250),
        url: unit.url ? String(unit.url).slice(0, 500) : null,
        hashes,
        updatedAt: new Date()
      }
    });
    accepted += 1;
  }
  return NextResponse.json({ accepted, installationId }, { status: 201 });
}

/** Pull fingerprint units from other installations. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!checkToken(req)) {
    return NextResponse.json({ error: "Invalid sync token." }, { status: 401 });
  }
  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const installationId = url.searchParams.get("installationId") ?? "unknown";
  const cursor = since ? new Date(since) : null;

  const rows = await prisma.syncDoc.findMany({
    where: {
      installationId: { not: installationId },
      ...(cursor && !Number.isNaN(cursor.getTime()) ? { updatedAt: { gt: cursor } } : {})
    },
    orderBy: { updatedAt: "asc" },
    take: 500
  });

  const units = rows.map((row) => ({
    installationId: row.installationId,
    docKey: row.docKey,
    title: row.title,
    url: row.url,
    sourceType: row.sourceType,
    hashes: row.hashes.map((hash) => hash.toString()),
    updatedAt: row.updatedAt.toISOString()
  }));
  const lastRow = rows[rows.length - 1];
  const newCursor = lastRow ? lastRow.updatedAt.toISOString() : since ?? new Date(0).toISOString();
  return NextResponse.json({ units, cursor: newCursor });
}
