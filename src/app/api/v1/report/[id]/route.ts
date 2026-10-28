import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/apiAuth";
import { buildReport } from "@/lib/report";
import { normalizeFilters, parseFilters } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Programmatic report endpoint protected by API keys.
 * Required scope: `report:read`.
 * Filters mirror /api/report (minMatchWords etc.) via query params.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireApiKey(req, "report:read");
  if (!auth.ok) return auth.response as NextResponse;

  const { id } = await context.params;
  const url = new URL(req.url);
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
