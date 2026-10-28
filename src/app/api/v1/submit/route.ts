import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/apiAuth";
import { createSubmission } from "@/lib/submissions";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jsonSchema = z.object({
  title: z.string().max(200).optional(),
  text: z.string().min(1),
  authorEmail: z.string().email().optional(),
  authorName: z.string().max(120).optional(),
  assignmentId: z.string().uuid().optional(),
});

/**
 * Programmatic submission endpoint protected by API keys.
 * Auth: `x-api-key: vk_live_...` header (or `Authorization: Bearer vk_live_...`).
 * Required scope: `submit:write`.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireApiKey(req, "submit:write");
  if (!auth.ok) return auth.response as NextResponse;

  try {
    const payload: unknown = await req.json();
    const parsed = jsonSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid submission payload.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const created = await createSubmission({
      title: parsed.data.title ?? "API submission",
      text: parsed.data.text,
      authorEmail: parsed.data.authorEmail,
      authorName: parsed.data.authorName,
      assignmentId: parsed.data.assignmentId,
    });
    return NextResponse.json(
      { submission: created, reportUrl: `/api/v1/report/${created.id}` },
      { status: 201 },
    );
  } catch (error) {
    console.error("v1 submit error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
