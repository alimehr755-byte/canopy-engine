import { type LmsAssignment, type LmsClient, type LmsCourse, type LmsImportItem, lmsError } from "./types";

export interface MoodleFetchOptions {
  baseUrl: string;
  token: string;
}

const USER_AGENT = "Veritas-Engine-LMS/1.0";
const SUPPORTED_EXT = [".pdf", ".docx", ".txt", ".md"];

interface MoodleMessage {
  exception?: string;
  message?: string;
}

async function moodleCall<T>(
  opts: MoodleFetchOptions,
  wsfunction: string,
  params: Record<string, string> = {},
): Promise<T> {
  const body = new URLSearchParams({
    wstoken: opts.token,
    wsfunction,
    moodlewsrestformat: "json",
    ...params,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl}/webservice/rest/server.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    throw lmsError(
      `Could not reach Moodle at ${opts.baseUrl}: ${error instanceof Error ? error.message : "network error"}`,
      502,
    );
  }
  clearTimeout(timeout);

  const payload = (await res.json().catch(() => null)) as (T & MoodleMessage) | null;
  if (payload && payload.exception) {
    // Moodle returns 200 with an exception object for auth problems.
    if (payload.exception === "moodle_exception" || /token/iu.test(payload.message ?? "")) {
      throw lmsError(`Moodle rejected the web service token: ${payload.message ?? "invalid token"}`, 401);
    }
    throw lmsError(`Moodle error: ${payload.message ?? payload.exception}`, 500);
  }
  if (!res.ok) {
    throw lmsError(`Moodle request failed (${res.status}).`, 500);
  }
  if (!payload) {
    throw lmsError("Moodle returned a non-JSON response (check the web service / REST protocol).", 500);
  }
  return payload as T;
}

interface MoodleSelf {
  fullname?: string;
  username?: string;
}

interface MoodleCoursePayload {
  courses?: { id: number; displayname?: string; fullname?: string; shortname?: string }[];
}

interface MoodleAssignPayload {
  courses?: {
    id: number;
    fullname?: string;
    assignments?: { id: number; name?: string; cmid?: number; duedate?: number }[];
  }[];
}

interface MoodlePlugin {
  type?: string;
  fileareas?: { area?: string; files?: { filename?: string; fileurl?: string; mimetype?: string; filesize?: number }[] }[];
  editorfields?: { name?: string; text?: string }[];
}

interface MoodleSubmission {
  id?: number;
  userid?: number;
  status?: string;
  plugins?: MoodlePlugin[];
}

interface MoodleSubmissionsPayload {
  assignments?: { assignmentid?: number; submissions?: MoodleSubmission[] }[];
}

interface MoodleParticipant {
  id?: number;
  fullname?: string;
  email?: string;
}

export async function moodleSelf(opts: MoodleFetchOptions): Promise<string> {
  const info = await moodleCall<MoodleSelf>(opts, "core_webservice_get_site_info");
  return info.fullname ?? info.username ?? "Moodle account";
}

export async function moodleCourses(opts: MoodleFetchOptions): Promise<LmsCourse[]> {
  const payload = await moodleCall<MoodleCoursePayload>(opts, "core_course_get_courses");
  return (payload.courses ?? []).map((course) => ({
    id: String(course.id),
    name: course.displayname ?? course.fullname ?? `Course ${course.id}`,
    code: course.shortname ?? null,
  }));
}

export async function moodleAssignments(
  opts: MoodleFetchOptions,
  courseId: string,
): Promise<LmsAssignment[]> {
  const payload = await moodleCall<MoodleAssignPayload>(opts, "mod_assign_get_assignments", {
    courseids: JSON.stringify([Number(courseId)]),
  });
  const assignments = payload.courses?.[0]?.assignments ?? [];
  return assignments.map((assignment) => ({
    id: String(assignment.id),
    name: assignment.name ?? `Assignment ${assignment.id}`,
    dueAt: assignment.duedate ? new Date(assignment.duedate * 1000).toISOString() : null,
  }));
}

async function participantsMap(
  opts: MoodleFetchOptions,
  courseId: string,
): Promise<Map<number, { name: string; email: string }>> {
  const map = new Map<number, { name: string; email: string }>();
  try {
    const people = await moodleCall<MoodleParticipant[]>(opts, "core_enrol_get_enrolled_users", {
      courseid: String(courseId),
    });
    for (const person of people) {
      if (person.id !== undefined) {
        map.set(person.id, { name: person.fullname ?? `Moodle user ${person.id}`, email: person.email ?? `moodle-${person.id}@lms.local` });
      }
    }
  } catch {
    // Token may lack enrolment access; placeholders are fine.
  }
  return map;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&/gu, "&")
    .replace(/</gu, "<")
    .replace(/>/gu, ">")
    .replace(/"/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

export async function moodleSubmissions(
  opts: MoodleFetchOptions,
  courseId: string,
  assignmentId: string,
): Promise<LmsImportItem[]> {
  const payload = await moodleCall<MoodleSubmissionsPayload>(
    opts,
    "mod_assign_get_submissions",
    { "assignments[0][assignmentid]": assignmentId },
  );
  const submissions = payload.assignments?.[0]?.submissions ?? [];
  const people = await participantsMap(opts, courseId);

  const items: LmsImportItem[] = [];
  for (const submission of submissions) {
    if (submission.status !== "submitted") {
      continue;
    }
    const userId = submission.userid ?? -1;
    const person = people.get(userId) ?? { name: `Moodle user ${userId}`, email: `moodle-${userId}@lms.local` };

    const filePlugin = (submission.plugins ?? []).find(
      (plugin) => plugin.type === "assignsubmission_file",
    );
    const files = filePlugin?.fileareas?.flatMap((filearea) => filearea.files ?? []) ?? [];
    for (const file of files) {
      const lowerName = (file.filename ?? "").toLowerCase();
      if (!file.fileurl || !SUPPORTED_EXT.some((ext) => lowerName.endsWith(ext))) {
        continue;
      }
      const downloadUrl = file.fileurl.includes("?") ? `${file.fileurl}&token=${opts.token}` : `${file.fileurl}?token=${opts.token}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      let res: Response;
      try {
        res = await fetch(downloadUrl, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
      } catch {
        clearTimeout(timeout);
        throw lmsError(`Moodle file download failed (${file.filename}).`, 502);
      }
      clearTimeout(timeout);
      if (!res.ok) {
        throw lmsError(`Moodle file download failed (${res.status}).`, 500);
      }
      items.push({
        name: person.name,
        email: person.email,
        fileName: file.filename ?? null,
        fileBuffer: Buffer.from(await res.arrayBuffer()),
        mediaType: res.headers.get("content-type"),
        text: null,
      });
    }

    const onlinetextPlugin = (submission.plugins ?? []).find(
      (plugin) => plugin.type === "assignsubmission_onlinetext",
    );
    const onlinetext = onlinetextPlugin?.editorfields?.find(
      (field) => field.name === "onlinetext",
    )?.text;
    if (!files.length && onlinetext && onlinetext.trim().length > 0) {
      const plain = stripHtml(onlinetext);
      if (plain) {
        items.push({
          name: person.name,
          email: person.email,
          fileName: `onlinetext-${submission.id ?? userId}.txt`,
          fileBuffer: Buffer.from(plain, "utf8"),
          mediaType: "text/plain",
          text: null,
        });
      }
    }
  }
  return items;
}

export function moodleClient(opts: MoodleFetchOptions): LmsClient {
  return {
    self: () => moodleSelf(opts),
    courses: () => moodleCourses(opts),
    assignments: (courseId) => moodleAssignments(opts, courseId),
    submissions: (courseId, assignmentId) => moodleSubmissions(opts, courseId, assignmentId),
  };
}
