import { NextResponse } from "next/server";
import { buildReport } from "@/lib/report";
import { normalizeFilters, parseFilters } from "@/lib/scoring";

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
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to build report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
