const USER_AGENT = "Veritas-Engine-LMS/1.0";

export interface LmsFetchOptions {
  baseUrl: string;
  token: string;
}

export class LmsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "LmsError";
    this.status = status;
  }
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT };
}

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/u, "");
  const withScheme = /^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  if (!parsed.hostname) {
    throw new LmsError("Invalid LMS base URL.", 400);
  }
  return withScheme;
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
    throw new LmsError(
      `Could not reach Canvas at ${opts.baseUrl}: ${error instanceof Error ? error.message : "network error"}`,
      502,
    );
  }
  clearTimeout(timeout);

  if (res.status === 401 || res.status === 403) {
    throw new LmsError("Canvas rejected the API token (401/403).", 401);
  }
  if (res.status === 404) {
    throw new LmsError("Canvas resource not found — check the course/assignment id.", 404);
  }
  if (!res.ok) {
    throw new LmsError(`Canvas request failed (${res.status}).`, 500);
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
    throw new LmsError(
      `Attachment download failed: ${error instanceof Error ? error.message : "network error"}`,
      502,
    );
  }
  clearTimeout(timeout);
  if (!res.ok) {
    throw new LmsError(`Attachment download failed (${res.status}).`, 500);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const disposition = res.headers.get("content-disposition") ?? "";
  const filenameStar = /filename\*=(?:UTF-8'')?([^;]+)/iu.exec(disposition)?.[1];
  const filenamePlain = /filename="?([^";]+)"?/iu.exec(disposition)?.[1];
  const rawName = (filenameStar ?? filenamePlain ?? "").replace(/^["']|["']$/gu, "");
  const fileName = rawName ? decodeURIComponent(rawName) : null;
  return { buffer, contentType: res.headers.get("content-type"), fileName };
}
