import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  canvasAssignments,
  canvasCourses,
  canvasSubmissions,
  downloadCanvasFile,
  LmsError,
  type CanvasSubmission,
} from "@/lib/lms/canvas";
import { createSubmission } from "@/lib/submissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const MAX_IMPORTS = 200;
const SUPPORTED_EXT = [".pdf", ".docx", ".txt", ".md"];

interface SyncResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: { student: string; reason: string }[];
}

/**
 * Import student submissions from a Canvas assignment into the local queue.
 * Every connection is outbound; files are downloaded and analyzed locally.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      courseId?: number;
      assignmentId?: number;
      importText?: boolean;
    };
    const courseId = Number(body.courseId);
    const assignmentId = Number(body.assignmentId);
    if (!Number.isFinite(courseId) || !Number.isFinite(assignmentId)) {
      return NextResponse.json({ error: "courseId and assignmentId are required (numbers)." }, { status: 400 });
    }

    const connection = await prisma.lmsConnection.findFirst();
    if (!connection) {
      return NextResponse.json({ error: "No LMS connection configured. Connect first." }, { status: 400 });
    }
    const opts = { baseUrl: connection.baseUrl, token: connection.token };

    const canvasCourses = await canvasCoursesSafe(opts);
    if (!canvasCourses) {
      return NextResponse.json({ error: "Could not list Canvas courses." }, { status: 502 });
    }
    const course = canvasCourses.find((c) => c.id === courseId);
    const assignment = (await canvasAssignments(opts, courseId)).find((a) => a.id === assignmentId);
    if (!course || !assignment) {
      return NextResponse.json({ error: "Course or assignment not found on Canvas." }, { status: 404 });
    }

    // Local assignment (created once per Canvas assignment)
    const localAssignmentTitle = `${course.name} — ${assignment.name}`;
    const existingAssignment = await prisma.assignment.findFirst({
      where: { title: localAssignmentTitle },
      orderBy: { createdAt: "desc" },
    });
    const assignmentIdLocal =
      existingAssignment?.id ??
      (
        await prisma.assignment.create({
          data: {
            title: localAssignmentTitle,
            description: `Imported from Canvas course ${courseId}, assignment ${assignmentId}.`,
          },
        })
      ).id;

    const submissions = await canvasSubmissions(opts, courseId, assignmentId);
    const importable = submissions.filter(
      (sub: CanvasSubmission) => sub.workflow_state !== "unsubmitted" || (sub.attachments?.length ?? 0) > 0
    );

    const result: SyncResult = { imported: 0, skipped: 0, failed: 0, errors: [] };
    for (const sub of importable.slice(0, MAX_IMPORTS)) {
      const studentName = sub.user?.name ?? `Canvas user ${sub.user_id}`;
      const studentEmail = sub.user?.login_id?.includes("@")
        ? sub.user.login_id
        : `canvas-${sub.user_id}@lms.local`;
      const attachment = sub.attachments?.find((a) => a.url) ?? null;

      try {
        if (attachment?.url) {
          const lowerName = (attachment.filename ?? "").toLowerCase();
          if (SUPPORTED_EXT.some((ext) => lowerName.endsWith(ext))) {
            const download = await downloadCanvasFile(opts, attachment.url);
            await prisma.submission.findFirst;
            await createSubmission({
              title: `${studentName} — ${assignment.name}`,
              fileBuffer: download.buffer,
              fileName: attachment.filename ?? null,
              mediaType: download.contentType,
              authorEmail: studentEmail,
              authorName: studentName,
              assignmentId: assignmentIdLocal,
            });
            result.imported += 1;
            continue;
          }
          result.skipped += 1;
          result.errors.push({ student: studentName, reason: `unsupported file type: ${attachment.filename}` });
          continue;
        }

        if (body.importText !== false && (sub.body ?? "").trim().length > 0) {
          await createSubmission({
            title: `${studentName} — ${assignment.name}`,
            text: sub.body ?? "",
            authorEmail: studentEmail,
            authorName: studentName,
            assignmentId: assignmentIdLocal,
          });
          result.imported += 1;
          continue;
        }

        result.skipped += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          student: studentName,
          reason: error instanceof Error ? error.message.slice(0, 200) : "import failed",
        });
      }
    }

    await prisma.lmsConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date() } });

    return NextResponse.json(
      {
        course: course.name,
        assignment: assignment.name,
        localAssignmentId: assignmentIdLocal,
        ...result,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof LmsError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("lms sync error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

async function canvasCoursesSafe(opts: Parameters<typeof canvasCourses>[0]) {
  try {
    return await canvasCourses(opts);
  } catch {
    return null;
  }
}
