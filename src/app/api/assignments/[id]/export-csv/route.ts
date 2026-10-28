import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CSV_HEADERS = [
  "submissionId",
  "title",
  "authorName",
  "authorEmail",
  "status",
  "similarityScore",
  "aiScore",
  "wordCount",
  "characterCount",
  "createdAt",
];

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (text === "") return "";
  if (/[",\n\r]/u.test(text)) {
    return `"${text.replace(/"/gu, '""')}"`;
  }
  return text;
}

/**
 * Bulk export (CSV): GET /api/assignments/{id}/export-csv
 * One row per submission with headline scores, UTF-8 BOM for Excel.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;

  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      select: {
        title: true,
        submissions: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true, email: true } } } },
      },
    });
    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }
    if (assignment.submissions.length === 0) {
      return NextResponse.json({ error: "No submissions to export." }, { status: 400 });
    }

    const rows: string[] = [CSV_HEADERS.join(",")];
    for (const submission of assignment.submissions) {
      rows.push(
        [
          submission.id,
          submission.title,
          submission.author?.name ?? null,
          submission.author?.email ?? null,
          submission.status,
          submission.similarityScore,
          submission.aiScore,
          submission.wordCount,
          submission.characterCount,
          submission.createdAt.toISOString(),
        ]
          .map((cell) => csvCell(cell))
          .join(","),
      );
    }

    const base =
      assignment.title.trim().replace(/[^\w .-]+/gu, "").replace(/ {2,}/gu, " ").slice(0, 60) ||
      "assignment";
    const body = `\uFEFF${rows.join("\r\n")}`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}-results.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to export CSV.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
