import { NextResponse } from "next/server";
import { buildReport } from "@/lib/report";
import { normalizeFilters, parseFilters } from "@/lib/scoring";
import { renderReportPdf } from "@/lib/reportPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  const url = new URL(request.url);
  const filters = normalizeFilters(parseFilters(url.searchParams));

  try {
    const report = await buildReport(id, filters);
    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }
    const pdf = await renderReportPdf(report);
    const fileName = `veritas-${report.title.slice(0, 40).replace(/[^\w-]+/gu, "-")}.pdf`;
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to render PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}