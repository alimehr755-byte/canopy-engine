import { type LmsAssignment, type LmsClient, type LmsCourse, type LmsImportItem, lmsError } from "./types";

const USER_AGENT = "Veritas-Engine-LMS/1.0";
const CLASSROOM = "https://classroom.googleapis.com";
const DRIVE = "https://www.googleapis.com/drive/v3";
const ACCOUNTS = "https://oauth2.googleapis.com";

/**
 * Google Classroom adapter. Uses a long-lived refresh token stored on the
 * LmsConnection row (platform GOOGLE); access tokens are derived per request
 * via the token endpoint and cached briefly in-memory.
 */
export interface GoogleFetchOptions {
  baseUrl: string;
  token: string;
}

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.students.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export function googleOauthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}

export interface GoogleTokenResponse {
  refresh_token: string;
  access_token: string;
  expires_in: number;
  scope: string;
}

export async function googleExchangeCode(
  code: string,
  redirectUri: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch(`${ACCOUNTS}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error_description?: string } | null;
    throw lmsError(
      `Google token exchange failed: ${detail?.error_description ?? `HTTP ${res.status}`}`,
      502,
    );
  }
  return (await res.json()) as GoogleTokenResponse;
}

const accessCache = new Map<string, { token: string; expiresAt: number }>();

export async function googleAccessToken(opts: GoogleFetchOptions): Promise<string> {
  const cached = accessCache.get(opts.token);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }
  const res = await fetch(`${ACCOUNTS}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: opts.token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw lmsError("Google rejected the stored refresh token — reconnect Classroom.", 401);
  }
  const payload = (await res.json()) as { access_token: string; expires_in: number };
  accessCache.set(opts.token, { token: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 });
  return payload.access_token;
}

async function googleGet<T>(
  opts: GoogleFetchOptions,
  url: string,
): Promise<T> {
  const access = await googleAccessToken(opts);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  let res: Response;
  try {
    res = await fetch(url.startsWith("http") ? url : `${CLASSROOM}${url}`, {
      headers: { Authorization: `Bearer ${access}`, "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    throw lmsError(
      `Could not reach Google Classroom: ${error instanceof Error ? error.message : "network error"}`,
      502,
    );
  }
  clearTimeout(timeout);
  if (res.status === 401) {
    throw lmsError("Google returned 401 — reconnect Classroom.", 401);
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw lmsError(`Google Classroom request failed: ${detail?.error?.message ?? `HTTP ${res.status}`}`, 500);
  }
  return (await res.json()) as T;
}

interface GoogleCoursesPayload {
  courses?: { id: string; name?: string; section?: string }[];
}
interface GoogleCourseWorkPayload {
  courseWork?: { id: string; title?: string; dueDate?: { year?: number; month?: number; day?: number }; dueTime?: { hours?: number; minutes?: number }; }[];
}
interface GoogleStudentsPayload {
  students?: { userId: string; profile?: { name?: { fullName?: string }; emailAddress?: string } }[];
}
interface GoogleSubmissionsPayload {
  studentSubmissions?: {
    userId: string;
    state?: string;
    courseWorkType?: string;
    assignmentSubmission?: {
      attachments?: { driveFile?: { id: string; title?: string }; link?: { url: string; title?: string } }[];
    } | null;
  }[];
}

export async function googleCourses(opts: GoogleFetchOptions): Promise<LmsCourse[]> {
  let payload: GoogleCoursesPayload;
  try {
    payload = await googleGet<GoogleCoursesPayload>(
      opts,
      `${CLASSROOM}/v1/courses?pageSize=100&teacherId=me&courseStates=ACTIVE`,
    );
  } catch {
    // Admin tokens / delegated access: retry without the teacher filter.
    payload = await googleGet<GoogleCoursesPayload>(opts, `${CLASSROOM}/v1/courses?pageSize=100&courseStates=ACTIVE`);
  }
  return (payload.courses ?? []).map((course) => ({
    id: course.id,
    name: course.name ?? "Untitled course",
    code: course.section ?? null,
  }));
}

export async function googleAssignments(
  opts: GoogleFetchOptions,
  courseId: string,
): Promise<LmsAssignment[]> {
  const payload = await googleGet<GoogleCourseWorkPayload>(
    opts,
    `${CLASSROOM}/v1/courses/${courseId}/courseWork?pageSize=100&courseWorkStates=PUBLISHED`,
  );
  return (payload.courseWork ?? [])
    .filter((work) => work.id)
    .map((work) => ({
      id: work.id,
      name: work.title ?? "Untitled coursework",
      dueAt: dueTimestamp(work.dueDate, work.dueTime),
    }));
}

function dueTimestamp(
  date: GoogleDate | undefined,
  time: { hours?: number; minutes?: number } | undefined,
): string | null {
  if (!date) {
    return null;
  }
  const { year, month, day } = date;
  if (!year || !month || !day) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day, time?.hours ?? 0, time?.minutes ?? 0)).toISOString();
}

type GoogleDate = { year?: number; month?: number; day?: number };

async function studentProfiles(
  opts: GoogleFetchOptions,
  courseId: string,
): Promise<Map<string, { name: string; email: string }>> {
  const map = new Map<string, { name: string; email: string }>();
  try {
    const payload = await googleGet<GoogleStudentsPayload>(opts, `${CLASSROOM}/v1/courses/${courseId}/students?pageSize=100`);
    for (const student of payload.students ?? []) {
      if (student.profile) {
        map.set(student.userId, {
          name: student.profile.name?.fullName ?? "Student",
          email: student.profile.emailAddress ?? `student-${student.userId}@classroom.local`,
        });
      }
    }
  } catch {
    // Roster read is best-effort; submissions still import with placeholders.
  }
  return map;
}

export async function googleSubmissions(
  opts: GoogleFetchOptions,
  courseId: string,
  courseWorkId: string,
): Promise<LmsImportItem[]> {
  const payload = await googleGet<GoogleSubmissionsPayload>(
    opts,
    `${CLASSROOM}/v1/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions?states=TURNED_IN&states=RETURNED&pageSize=100`,
  );
  const profiles = await studentProfiles(opts, courseId);
  const items: LmsImportItem[] = [];

  for (const submission of payload.studentSubmissions ?? []) {
    if (submission.state !== "TURNED_IN" && submission.state !== "RETURNED") {
      continue;
    }
    const person =
      profiles.get(submission.userId) ?? {
        name: `Classroom user ${submission.userId}`,
        email: `student-${submission.userId}@classroom.local`,
      };
    const attachments = submission.assignmentSubmission?.attachments ?? [];
    const driveAttachments = attachments.filter((attachment) => attachment.driveFile?.id);
    const linkAttachments = attachments.filter((attachment) => attachment.link?.url);

    for (const attachment of driveAttachments) {
      const driveFile = attachment.driveFile;
      if (!driveFile?.id) {
        continue;
      }
      let res: Response;
      try {
        res = await fetch(`${DRIVE}/files/${driveFile.id}?alt=media`, {
          headers: { Authorization: `Bearer ${await googleAccessToken(opts)}`, "User-Agent": USER_AGENT },
        });
      } catch (error) {
        throw lmsError(
          `Drive download failed (${driveFile.title ?? driveFile.id}): ${error instanceof Error ? error.message : "network error"}`,
          502,
        );
      }
      if (!res.ok || res.status === 404) {
        continue; // File not shared with the OAuth account; skip silently.
      }
      const lowerName = (driveFile.title ?? "").toLowerCase();
      if (![".pdf", ".docx", ".txt", ".md"].some((ext) => lowerName.endsWith(ext))) {
        continue;
      }
      items.push({
        name: person.name,
        email: person.email,
        fileName: driveFile.title ?? `${driveFile.id}`,
        fileBuffer: Buffer.from(await res.arrayBuffer()),
        mediaType: res.headers.get("content-type"),
        text: null,
      });
    }
    if (!driveAttachments.length && linkAttachments.length) {
      continue; // Link attachments are not downloadable documents.
    }
  }
  return items;
}

export function googleClient(opts: GoogleFetchOptions): LmsClient {
  return {
    self: async () => {
      const access = await googleAccessToken(opts);
      const res = await fetch(`${ACCOUNTS}/userinfo/v2/me`, {
        headers: { Authorization: `Bearer ${access}`, "User-Agent": USER_AGENT },
      });
      if (!res.ok) {
        throw lmsError("Google rejected the stored refresh token — reconnect Classroom.", 401);
      }
      const profile = (await res.json()) as { email?: string; name?: string };
      return profile.email ?? profile.name ?? "Google account";
    },
    courses: () => googleCourses(opts),
    assignments: (courseId) => googleAssignments(opts, courseId),
    submissions: (courseId, assignmentId) => googleSubmissions(opts, courseId, assignmentId),
  };
}
