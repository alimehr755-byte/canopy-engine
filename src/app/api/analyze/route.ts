import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeSubmission } from "@/lib/analyzer";
import { createSubmission, requireSubmission } from "@/lib/submissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const analyzeSchema = z.union([
  z.object({ submissionId: z.string().uuid() }),
  z.object({
    text: z.string().min(1),
    title: z.string().max(200).optional(),
    authorEmail: z.string().email().optional(),
    assignmentId: z.string().uuid().optional()
  })
]);

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = analyzeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide a submissionId or text to analyze.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    if ("submissionId" in parsed.data) {
      await requireSubmission(parsed.data.submissionId);
      const result = await analyzeSubmission(parsed.data.submissionId);
      return NextResponse.json({
        submissionId: parsed.data.submissionId,
        similarityScore: result.similarityScore,
        aiScore: result.aiScore,
        wordCount: result.wordCount,
        matchCount: result.matches.length,
        findingCount: result.findings.length
      });
    }

    const created = await createSubmission({
      title: parsed.data.title ?? "Analyzed text",
      text: parsed.data.text,
      authorEmail: parsed.data.authorEmail,
      assignmentId: parsed.data.assignmentId
    });
    return NextResponse.json({ submission: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed.";
    const status = /not found|must contain|Provide|at least/iu.test(message) ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(): Promise<NextResponse> {
  const rows = await prisma.submission.findMany({
    where: { status: { in: ["QUEUED", "PROCESSING", "FAILED"] } },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      title: true,
      status: true,
      error: true,
      createdAt: true
    }
  });
  return NextResponse.json({ queue: rows });
}
