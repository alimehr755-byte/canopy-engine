import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { createSubmission } from "@/lib/submissions";
import { ingestionLimits } from "@/lib/ingestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FILES = 50;
const SUPPORTED = [".txt", ".md", ".pdf", ".docx"];

interface BatchResult {
  fileName: string;
  ok: boolean;
  submissionId?: string;
  error?: string;
}

function stripFolders(name: string): string {
  return name.split("/").pop() ?? name;
}

function isUsableEntry(path: string): boolean {
  if (path.startsWith("__MACOSX/") || path.endsWith("/")) return false;
  const base = stripFolders(path);
  if (base.startsWith(".")) return false;
  return SUPPORTED.some((ext) => base.toLowerCase().endsWith(ext));
}

function titleFromName(name: string): string {
  return name.replace(/\.[^.]+$/, "").slice(0, 200) || "Batch submission";
}

/**
 * Batch upload: accepts multipart/form-data with a `file` field containing a .zip
 * of .txt/.md/.pdf/.docx documents. Each entry becomes its own submission.
 * Optional form fields: `assignmentId`, `authorEmail`, `authorName`.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const form = await req.formData();
    const fileValue = form.get("file");
    if (!(fileValue instanceof File) || fileValue.size === 0) {
      return NextResponse.json({ error: "A .zip file is required (multipart field `file`)." }, { status: 400 });
    }

    const limits = ingestionLimits();
    if (fileValue.size > limits.maxBytes * 4) {
      return NextResponse.json(
        { error: `Archive exceeds the ${((limits.maxBytes * 4) / (1024 * 1024)).toFixed(0)} MB limit.` },
        { status: 400 },
      );
    }

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(await fileValue.arrayBuffer());
    } catch {
      return NextResponse.json({ error: "Could not read archive. Upload a valid .zip file." }, { status: 400 });
    }

    const entries = Object.keys(zip.files).filter((path) => isUsableEntry(path));
    if (entries.length === 0) {
      return NextResponse.json(
        { error: `No usable documents found. Supported types: ${SUPPORTED.join(", ")}.` },
        { status: 400 },
      );
    }
    if (entries.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Archive contains ${entries.length} documents; limit is ${MAX_FILES}.` },
        { status: 400 },
      );
    }

    const assignmentValue = form.get("assignmentId");
    const assignmentId = typeof assignmentValue === "string" && assignmentValue ? assignmentValue : undefined;
    const emailValue = form.get("authorEmail");
    const authorEmail = typeof emailValue === "string" && emailValue ? emailValue : undefined;
    const nameValue = form.get("authorName");
    const authorName = typeof nameValue === "string" && nameValue ? nameValue : undefined;

    const results: BatchResult[] = [];
    for (const path of entries) {
      const base = stripFolders(path);
      try {
        const buffer: Buffer = await zip.files[path]!.async("nodebuffer");
        if (buffer.length === 0) {
          results.push({ fileName: base, ok: false, error: "empty file" });
          continue;
        }
        const created = await createSubmission({
          title: titleFromName(base),
          fileBuffer: buffer,
          fileName: base,
          mediaType: null,
          authorEmail,
          authorName,
          assignmentId,
        });
        results.push({ fileName: base, ok: true, submissionId: created.id });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to process file.";
        results.push({ fileName: base, ok: false, error: message });
      }
    }

    const succeeded = results.filter((r) => r.ok);
    return NextResponse.json(
      {
        total: results.length,
        succeeded: succeeded.length,
        failed: results.length - succeeded.length,
        results,
      },
      { status: succeeded.length > 0 ? 201 : 400 },
    );
  } catch (error) {
    console.error("batch upload error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
