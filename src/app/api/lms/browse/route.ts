import { NextRequest, NextResponse } from "next/server";
import { LmsError } from "@/lib/lms/types";
import { activeLmsClient } from "@/lib/lms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Outbound browse proxy used by settings UI (works on any connected platform):
 *   GET /api/lms/browse                      -> account name (sanity)
 *   GET /api/lms/browse?type=courses         -> courses
 *   GET /api/lms/browse?type=assignments&courseId=...
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { client } = await activeLmsClient();
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "self";

    if (type === "self") {
      return NextResponse.json({ name: await client.self() });
    }

    if (type === "courses") {
      const courses = await client.courses();
      return NextResponse.json({ courses });
    }

    if (type === "assignments") {
      const courseId = url.searchParams.get("courseId");
      if (!courseId) {
        return NextResponse.json({ error: "courseId is required." }, { status: 400 });
      }
      const assignments = await client.assignments(courseId);
      return NextResponse.json({ assignments });
    }

    return NextResponse.json({ error: "Unknown browse type." }, { status: 400 });
  } catch (error) {
    if (error instanceof LmsError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("lms browse error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
