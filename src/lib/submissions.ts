import { prisma } from "./prisma";
import { extractDocument } from "./ingestion";
import { analyzeSubmission } from "./analyzer";
import { analysisMode, enqueueAnalysis } from "./queue";
import type { SubmissionStatus } from "./types";

export interface CreateSubmissionInput {
  title: string;
  text?: string;
  fileBuffer?: Buffer;
  fileName?: string | null;
  mediaType?: string | null;
  authorEmail?: string;
  authorName?: string;
  assignmentId?: string;
  corpusType?: "INTERNET" | "PUBLICATION" | "REPOSITORY";
  corpusUrl?: string | null;
}

export interface CreatedSubmission {
  id: string;
  status: SubmissionStatus;
  similarityScore: number;
  aiScore: number;
  wordCount: number;
}

function safeTitle(value: string, fallback: string): string {
  const trimmed = value.trim().replace(/\s+/gu, " ");
  if (trimmed.length === 0) {
    return fallback;
  }
  return trimmed.slice(0, 200);
}

export async function ensureInstructor(): Promise<string> {
  const instructor = await prisma.user.upsert({
    where: { email: "instructor@veritas.local" },
    update: {},
    create: {
      email: "instructor@veritas.local",
      name: "Dr. Maya Chen",
      role: "INSTRUCTOR",
      institution: "Veritas University"
    }
  });
  return instructor.id;
}

export async function ensureDefaultAssignment(): Promise<string> {
  const existing = await prisma.assignment.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) {
    return existing.id;
  }
  const instructorId = await ensureInstructor();
  const assignment = await prisma.assignment.create({
    data: {
      title: "Academic Integrity Review",
      description: "Default workspace for similarity and AI writing analysis.",
      instructorId
    }
  });
  return assignment.id;
}

export async function resolveAuthor(email?: string, name?: string): Promise<string> {
  const normalized = (email ?? "student@veritas.local").trim().toLowerCase();
  const fallbackName = normalized.split("@")[0] ?? "Student";
  const user = await prisma.user.upsert({
    where: { email: normalized },
    update: name ? { name } : {},
    create: {
      email: normalized,
      name: name?.trim() || fallbackName,
      role: "STUDENT",
      institution: "Veritas University"
    }
  });
  return user.id;
}

export async function createSubmission(input: CreateSubmissionInput): Promise<CreatedSubmission> {
  let text = input.text?.trim() ?? "";

  if (input.fileBuffer) {
    const extracted = await extractDocument(
      input.fileBuffer,
      input.fileName ?? null,
      input.mediaType ?? null
    );
    text = extracted.text;
  }

  if (text.trim().length === 0) {
    throw new Error("Provide a document file or paste at least 20 words of text.");
  }

  const title = safeTitle(input.title, input.fileName ?? "Untitled submission");
  const authorId = await resolveAuthor(input.authorEmail, input.authorName);
  const assignmentId = input.assignmentId || (await ensureDefaultAssignment());

  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) {
    throw new Error("The selected assignment does not exist.");
  }

  const submission = await prisma.submission.create({
    data: {
      title,
      rawText: text,
      cleanText: "",
      status: "QUEUED",
      authorId,
      assignmentId,
      corpusType: input.corpusType ?? null,
      corpusUrl: input.corpusUrl ?? null,
      corpusTitle: input.corpusType ? title : null
    }
  });

  if (analysisMode() === "queue") {
    try {
      await enqueueAnalysis(submission.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to enqueue analysis.";
      await prisma.submission.update({
        where: { id: submission.id },
        data: { status: "FAILED", error: message }
      });
      throw new Error(message, { cause: error });
    }

    return {
      id: submission.id,
      status: "QUEUED" as SubmissionStatus,
      similarityScore: 0,
      aiScore: 0,
      wordCount: 0
    };
  }

  try {
    await analyzeSubmission(submission.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed.";
    throw new Error(message, { cause: error });
  }

  const completed = await prisma.submission.findUnique({
    where: { id: submission.id },
    select: {
      id: true,
      status: true,
      similarityScore: true,
      aiScore: true,
      wordCount: true
    }
  });

  return {
    id: completed?.id ?? submission.id,
    status: (completed?.status ?? "FAILED") as SubmissionStatus,
    similarityScore: completed?.similarityScore ?? 0,
    aiScore: completed?.aiScore ?? 0,
    wordCount: completed?.wordCount ?? 0
  };
}

export async function requireSubmission(submissionId: string): Promise<void> {
  const count = await prisma.submission.count({ where: { id: submissionId } });
  if (count === 0) {
    throw new Error("Submission not found.");
  }
}
