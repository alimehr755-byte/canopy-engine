import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildReport } from "@/lib/report";
import { normalizeFilters, parseFilters } from "@/lib/scoring";
import { renderReportPdf } from "@/lib/reportPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_REPORTS = 50;

function safeName(name: string, fallbackIndex: number): string {
  const cleaned = name.trim().replace(/[^\w .-]+/gu, "").replace(/ {2,}/gu, " ").slice(0, 60);
  return cleaned || `report-${fallbackIndex}`;
}

/**
 * Bulk export: GET /api/assignments/{id}/bulk-pdf
 * Query params mirror report filters (excludeQuotes, excludeBibliography, minMatchWords).
 * format=zip (default) -> archive of per-submission PDFs
 * format=merged        -> one concatenated PDF
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  const url = new URL(req.url);
  const filters = normalizeFilters(parseFilters(url.searchParams));
  const merged = url.searchParams.get("format") === "merged";

  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id },
      select: { title: true, submissions: { where: { status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: MAX_REPORTS, select: { id: true, title: true } } },
    });
    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }
    if (assignment.submissions.length === 0) {
      return NextResponse.json({ error: "No completed submissions to export." }, { status: 400 });
    }

    const pdfs: { name: string; bytes: Uint8Array }[] = [];
    for (const submission of assignment.submissions) {
      const report = await buildReport(submission.id, filters);
      if (!report) continue;
      const bytes = await renderReportPdf(report);
      pdfs.push({ name: `${safeName(report.title, pdfs.length + 1)}.pdf`, bytes });
    }
    if (pdfs.length === 0) {
      return NextResponse.json({ error: "Reports could not be rendered." }, { status: 500 });
    }

    const base = safeName(assignment.title, 1) || "assignment";

    if (merged) {
      const bytes = await mergePdfs(pdfs.map((p) => p.bytes));
      return new NextResponse(bytes as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${base}-reports.pdf"`,
        },
      });
    }

    const zip = new JSZip();
    for (const pdf of pdfs) {
      zip.file(pdf.name, pdf.bytes);
    }
    const archive = await zip.generateAsync({ type: "uint8array" });
    return new NextResponse(archive as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${base}-reports.zip"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to export reports.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function mergePdfs(buffers: Uint8Array[]): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();
  for (const buffer of buffers) {
    const doc = await PDFDocument.load(buffer);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }
  return merged.save();
}
