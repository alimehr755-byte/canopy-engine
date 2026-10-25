import { NextResponse } from "next/server";
import { z } from "zod";
import { createSubmission } from "@/lib/submissions";
import { listRecentSubmissions } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const jsonSchema = z.object({
  title: z.string().max(200).optional(),
  text: z.string().min(1),
  authorEmail: z.string().email().optional(),
  authorName: z.string().max(120).optional(),
  assignmentId: z.string().uuid().optional()
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const payload: unknown = await request.json();
      const parsed = jsonSchema.safeParse(payload);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid submission payload.", details: parsed.error.flatten() },
          { status: 400 }
        );
      }
      const created = await createSubmission({
        title: parsed.data.title ?? "Pasted submission",
        text: parsed.data.text,
        authorEmail: parsed.data.authorEmail,
        authorName: parsed.data.authorName,
        assignmentId: parsed.data.assignmentId
      });
      return NextResponse.json({ submission: created }, { status: 201 });
    }

    const form = await request.formData();
    const fileValue = form.get("file");
    const textValue = form.get("text");
    const titleValue = form.get("title");
    const emailValue = form.get("authorEmail");
    const nameValue = form.get("authorName");
    const assignmentValue = form.get("assignmentId");

    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
    const text = typeof textValue === "string" ? textValue : "";
    if (!file && text.trim().length === 0) {
      return NextResponse.json(
        { error: "Upload a PDF/DOCX/TXT file or paste at least 20 words of text." },
        { status: 400 }
      );
    }

    const assignmentId =
      typeof assignmentValue === "string" && assignmentValue.length > 0 ? assignmentValue : undefined;

    const fileBuffer = file ? Buffer.from(await file.arrayBuffer()) : undefined;
    const created = await createSubmission({
      title: typeof titleValue === "string" && titleValue.trim().length > 0 ? titleValue : file?.name ?? "Text submission",
      text: file ? undefined : text,
      fileBuffer,
      fileName: file?.name ?? null,
      mediaType: file?.type ?? null,
      authorEmail: typeof emailValue === "string" && emailValue.length > 0 ? emailValue : undefined,
      authorName: typeof nameValue === "string" && nameValue.length > 0 ? nameValue : undefined,
      assignmentId
    });

    return NextResponse.json({ submission: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Submission failed.";
    const status = /not found|does not exist|must contain|Provide a document|legacy|empty|readable|unsupported|exceeds/iu.test(
      message
    )
      ? 422
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const submissions = await listRecentSubmissions(30);
    return NextResponse.json({ submissions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load submissions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
