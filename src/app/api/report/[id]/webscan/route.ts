import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runWebScan } from "@/lib/webscan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Run a live web scan for this submission and merge the found matches. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  try {
    const submission = await prisma.submission.findUnique({ where: { id } });
    if (!submission) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }
    const summary = await runWebScan(id, 100_000);
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    if (error instanceof Error && /too short|not found/iu.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("webscan error", error);
    return NextResponse.json({ error: "Web scan failed." }, { status: 500 });
  }
}
