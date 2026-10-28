import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clampShareDays, createShareLink } from "@/lib/shareTokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create an expiring share link for a report.
 * POST /api/report/{id}/share  body: {"expiresInDays": 7}  (1..90, default 7)
 * Returns a token usable at /share/{token}.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const days = clampShareDays((body as { expiresInDays?: unknown }).expiresInDays);

  try {
    const submission = await prisma.submission.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!submission) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }
    if (submission.status !== "COMPLETED") {
      return NextResponse.json({ error: "Report is not ready to share yet." }, { status: 400 });
    }

    // Tokens are stored hashed, so old links cannot be reissued. Rotate: delete
    // previous links and hand out a fresh token (all share tokens stay valid
    // until expiry otherwise).
    await prisma.shareLink.deleteMany({ where: { submissionId: id, expiresAt: { gt: new Date() } } });

    const link = await createShareLink(id, days);
    return NextResponse.json(
      {
        sharePath: `/share/${link.token}`,
        expiresInDays: days,
        expiresAt: link.expiresAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("share link error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
