import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        instructor: { select: { name: true, email: true } },
        submissions: {
          orderBy: { createdAt: "desc" },
          include: { author: { select: { name: true, email: true } } }
        }
      }
    });
    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    const roster = new Map<
      string,
      { name: string; email: string; submissions: number; highestSimilarity: number }
    >();
    for (const submission of assignment.submissions) {
      const email = submission.author?.email ?? "unknown@veritas.local";
      const existing = roster.get(email);
      const entry = existing ?? {
        name: submission.author?.name ?? email,
        email,
        submissions: 0,
        highestSimilarity: 0
      };
      entry.submissions += 1;
      entry.highestSimilarity = Math.max(entry.highestSimilarity, submission.similarityScore);
      roster.set(email, entry);
    }

    return NextResponse.json({
      assignment: {
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        dueAt: assignment.dueAt,
        instructor: assignment.instructor?.name ?? null,
        createdAt: assignment.createdAt
      },
      students: Array.from(roster.values()).sort((left, right) =>
        left.name.localeCompare(right.name)
      ),
      submissions: assignment.submissions.map((submission) => ({
        id: submission.id,
        title: submission.title,
        authorName: submission.author?.name ?? null,
        status: submission.status,
        similarityScore: submission.similarityScore,
        aiScore: submission.aiScore,
        wordCount: submission.wordCount,
        createdAt: submission.createdAt
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load assignment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}