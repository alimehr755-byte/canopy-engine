const USER_AGENT = "Veritas-Engine-LMS/1.0";

export { LmsError, lmsError, normalizeBaseUrl } from "./types";
import { lmsError } from "./types";
import type { LmsClient, LmsImportItem } from "./types";

export interface LmsFetchOptions {
  baseUrl: string;
  token: string;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT };
}

export async function canvasGet<T>(opts: LmsFetchOptions, path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl}${path}`, {
      headers: authHeaders(opts.token),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    throw lmsError(
      `Could not reach Canvas at ${opts.baseUrl}: ${error instanceof Error ? error.message : "network error"}`,
      502,
    );
  }
  clearTimeout(timeout);

  if (res.status === 401 || res.status === 403) {
    throw lmsError("Canvas rejected the API token (401/403).", 401);
  }
  if (res.status === 404) {
    throw lmsError("Canvas resource not found â€” check the course/assignment id.", 404);
  }
  if (!res.ok) {
    throw lmsError(`Canvas request failed (${res.status}).`, 500);
  }
  return (await res.json()) as T;
}

export interface CanvasUser {
  id: number;
  name: string;
  login_id?: string;
}

export interface CanvasCourse {
  id: number;
  name: string;
  code?: string;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  due_at?: string | null;
  points_possible?: number;
}

export interface CanvasAttachment {
  id: number;
  filename: string;
  url: string | null;
  "content-type": string | null;
  size: number | null;
}

export interface CanvasSubmission {
  id: number;
  user_id: number;
  workflow_state: string;
  attachments?: CanvasAttachment[] | null;
  submission_comments?: unknown;
  body?: string | null;
  user?: CanvasUser;
}

export async function canvasSelf(opts: LmsFetchOptions): Promise<CanvasUser> {
  return canvasGet<CanvasUser>(opts, "/api/v1/users/self");
}

export async function canvasCourses(opts: LmsFetchOptions): Promise<CanvasCourse[]> {
  return canvasGet<CanvasCourse[]>(opts, "/api/v1/courses?enrollment_type=teacher&per_page=100");
}

export async function canvasAssignments(
  opts: LmsFetchOptions,
  courseId: number
): Promise<CanvasAssignment[]> {
  return canvasGet<CanvasAssignment[]>(
    opts,
    `/api/v1/courses/${courseId}/assignments?per_page=100&order_by=due_at`
  );
}

export async function canvasSubmissions(
  opts: LmsFetchOptions,
  courseId: number,
  assignmentId: number
): Promise<CanvasSubmission[]> {
  const all: CanvasSubmission[] = [];
  let page = 1;
  for (;;) {
    const batch = await canvasGet<CanvasSubmission[]>(
      opts,
      `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions?include[]=user&include[]=attachments&per_page=100&page=${page}`
    );
    all.push(...batch);
    if (batch.length < 100) {
      break;
    }
    page += 1;
  }
  return all;
}

export function canvasClient(opts: LmsFetchOptions): LmsClient {
  return {
    self: async () => (await canvasSelf(opts)).name,
    courses: async () =>
      (await canvasCourses(opts)).map((course) => ({
        id: String(course.id),
        name: course.name,
        code: course.code ?? null,
      })),
    assignments: async (courseId) =>
      (await canvasAssignments(opts, Number(courseId))).map((assignment) => ({
        id: String(assignment.id),
        name: assignment.name,
        dueAt: assignment.due_at ?? null,
      })),
    submissions: async (courseId, assignmentId) => {
      const canvas = await canvasSubmissions(opts, Number(courseId), Number(assignmentId));
      const items: LmsImportItem[] = [];
      for (const sub of canvas) {
        if (sub.workflow_state === "unsubmitted" && !(sub.attachments?.length ?? 0)) {
          continue;
        }
        const person = sub.user
          ? { name: sub.user.name, email: sub.user.login_id?.includes("@") ? sub.user.login_id : `canvas-${sub.user_id}@lms.local` }
          : { name: `Canvas user ${sub.user_id}`, email: `canvas-${sub.user_id}@lms.local` };
        const attachment = sub.attachments?.find((candidate) => candidate.url) ?? null;
        if (attachment?.url) {
          const lowerName = (attachment.filename ?? "").toLowerCase();
          if (![".pdf", ".docx", ".txt", ".md"].some((ext) => lowerName.endsWith(ext))) {
            continue;
          }
          const download = await downloadCanvasFile(opts, attachment.url);
          items.push({
            name: person.name,
            email: person.email,
            fileName: attachment.filename ?? null,
            fileBuffer: download.buffer,
            mediaType: download.contentType,
            text: null,
          });
          continue;
        }
        if ((sub.body ?? "").trim()) {
          items.push({
            name: person.name,
            email: person.email,
            fileName: null,
            fileBuffer: null,
            mediaType: null,
            text: sub.body ?? "",
          });
        }
      }
      return items;
    },
  };
}

export async function downloadCanvasFile(
  opts: LmsFetchOptions,
  url: string
): Promise<{ buffer: Buffer; contentType: string | null; fileName: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(url, { headers: authHeaders(opts.token), signal: controller.signal });
  } catch (error) {
    clearTimeout(timeout);
    throw lmsError(
      `Attachment download failed: ${error instanceof Error ? error.message : "network error"}`,
      502,
    );
  }
  clearTimeout(timeout);
  if (!res.ok) {
    throw lmsError(`Attachment download failed (${res.status}).`, 500);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const disposition = res.headers.get("content-disposition") ?? "";
  const filenameStar = /filename\*=(?:UTF-8'')?([^;]+)/iu.exec(disposition)?.[1];
  const filenamePlain = /filename="?([^";]+)"?/iu.exec(disposition)?.[1];
  const rawName = (filenameStar ?? filenamePlain ?? "").replace(/^["']|["']$/gu, "");
  const fileName = rawName ? decodeURIComponent(rawName) : null;
  return { buffer, contentType: res.headers.get("content-type"), fileName };
}

