import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canvasAssignments, canvasCourses, canvasSelf, LmsError } from "@/lib/lms/canvas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Outbound proxy used by settings UI:
 *   GET /api/lms/browse                      -> account name (sanity)
 *   GET /api/lms/browse?type=courses         -> teacher courses
 *   GET /api/lms/browse?type=assignments&courseId=...
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const connection = await prisma.lmsConnection.findFirst();
    if (!connection) {
      return NextResponse.json({ error: "No LMS connection configured. Connect first." }, { status: 400 });
    }
    const opts = { baseUrl: connection.baseUrl, token: connection.token };
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "courses";

    if (type === "self") {
      const self = await canvasSelf(opts);
      return NextResponse.json({ name: self.name });
    }

    if (type === "courses") {
      const courses = await canvasCourses(opts);
      return NextResponse.json({
        courses: courses.map((course) => ({ id: course.id, name: course.name, code: course.code ?? null })),
      });
    }

    if (type === "assignments") {
      const courseId = Number(url.searchParams.get("courseId"));
      if (!Number.isFinite(courseId) || courseId <= 0) {
        return NextResponse.json({ error: "courseId is required." }, { status: 400 });
      }
      const assignments = await canvasAssignments(opts, courseId);
      return NextResponse.json({
        assignments: assignments.map((assignment) => ({
          id: assignment.id,
          name: assignment.name,
          dueAt: assignment.due_at ?? null,
          points: assignment.points_possible ?? null,
        })),
      });
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
