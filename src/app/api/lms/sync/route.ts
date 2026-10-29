import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LmsError } from "@/lib/lms/types";
import { activeLmsClient } from "@/lib/lms";
import { createSubmission } from "@/lib/submissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const MAX_IMPORTS = 200;

interface SyncResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: { student: string; reason: string }[];
}

/**
 * Import student submissions from any connected LMS (Canvas / Moodle /
 * Google Classroom) into the local queue. Every call is outbound; files are
 * downloaded and analyzed locally.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      courseId?: string;
      assignmentId?: string;
    };
    const { courseId, assignmentId } = body;
    if (!courseId || !assignmentId) {
      return NextResponse.json({ error: "courseId and assignmentId are required." }, { status: 400 });
    }

    const { connection, client } = await activeLmsClient();
    if (connection.platform === "CANVAS" && (!/^\d+$/u.test(courseId) || !/^\d+$/u.test(assignmentId))) {
      return NextResponse.json({ error: "Canvas ids are numeric." }, { status: 400 });
    }

    const lmsCourses = await client.courses();
    const course = lmsCourses.find((candidate) => candidate.id === String(courseId));
    if (!course) {
      return NextResponse.json({ error: "Course not found on the connected LMS." }, { status: 404 });
    }
    const lmsAssignments = await client.assignments(String(courseId));
    const assignment = lmsAssignments.find((candidate) => candidate.id === String(assignmentId));
    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found on the connected LMS." }, { status: 404 });
    }

    const localAssignmentTitle = `${course.name} — ${assignment.name}`;
    const existingAssignment = await prisma.assignment.findFirst({
      where: { title: localAssignmentTitle },
      orderBy: { createdAt: "desc" },
    });
    const localAssignmentId =
      existingAssignment?.id ??
      (
        await prisma.assignment.create({
          data: {
            title: localAssignmentTitle,
            description: `Imported from ${connection.platform.toLowerCase()} course ${courseId}, assignment ${assignmentId}.`,
          },
        })
      ).id;

    const items = await client.submissions(String(courseId), String(assignmentId));
    const result: SyncResult = { imported: 0, skipped: 0, failed: 0, errors: [] };

    // Deduplicate: skip students whose submission title already exists in the local assignment.
    const seenTitles = new Set(
      (
        await prisma.submission.findMany({
          where: { assignmentId: localAssignmentId },
          select: { title: true },
        })
      ).map((row) => row.title),
    );

    for (const item of items.slice(0, MAX_IMPORTS)) {
      const title = `${item.name} — ${assignment.name}`;
      if (seenTitles.has(title)) {
        result.skipped += 1;
        continue;
      }
      seenTitles.add(title);
      try {
        if (item.fileBuffer) {
          await createSubmission({
            title,
            fileBuffer: item.fileBuffer,
            fileName: item.fileName,
            mediaType: item.mediaType,
            authorEmail: item.email,
            authorName: item.name,
            assignmentId: localAssignmentId,
          });
          result.imported += 1;
        } else if (item.text && item.text.trim().length > 0) {
          await createSubmission({
            title,
            text: item.text.trim(),
            authorEmail: item.email,
            authorName: item.name,
            assignmentId: localAssignmentId,
          });
          result.imported += 1;
        } else {
          result.skipped += 1;
        }
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          student: item.name,
          reason: error instanceof Error ? error.message.slice(0, 200) : "import failed",
        });
      }
    }

    await prisma.lmsConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json(
      {
        platform: connection.platform,
        course: course.name,
        assignment: assignment.name,
        localAssignmentId,
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
