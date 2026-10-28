import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ensureInstructor } from "@/lib/submissions";
import { requireApiKey } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  dueAt: z.string().datetime().optional(),
});

/**
 * Programmatic assignments endpoint protected by API keys.
 * POST requires scope `submit:write`; GET requires `submit:read`.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireApiKey(req, "submit:write");
  if (!auth.ok) return auth.response as NextResponse;

  try {
    const payload: unknown = await req.json();
    const parsed = createSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid assignment payload.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const instructorId = await ensureInstructor();
    const assignment = await prisma.assignment.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
        instructorId,
      },
      include: { _count: { select: { submissions: true } } },
    });
    return NextResponse.json(
      { assignment: { ...assignment, submissionCount: assignment._count.submissions } },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create assignment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireApiKey(req, "submit:read");
  if (!auth.ok) return auth.response as NextResponse;

  try {
    const assignments = await prisma.assignment.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        instructor: { select: { name: true } },
        _count: { select: { submissions: true } },
      },
    });
    return NextResponse.json({
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        dueAt: assignment.dueAt,
        instructor: assignment.instructor?.name ?? null,
        submissionCount: assignment._count.submissions,
        createdAt: assignment.createdAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list assignments.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
