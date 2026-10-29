/** Shared contract every LMS adapter must fulfil. */

export class LmsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "LmsError";
    this.status = status;
  }
}

export function lmsError(message: string, status: number): LmsError {
  return new LmsError(message, status);
}

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/u, "");
  const withScheme = /^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname) {
      throw new Error("no hostname");
    }
  } catch {
    throw new LmsError("Invalid LMS base URL.", 400);
  }
  return withScheme;
}

export interface LmsCourse {
  id: string;
  name: string;
  code?: string | null;
}

export interface LmsAssignment {
  id: string;
  name: string;
  dueAt?: string | null;
}

/** A ready-to-import submission: file bytes already downloaded, or inline text. */
export interface LmsImportItem {
  name: string;
  email: string;
  fileName: string | null;
  fileBuffer: Buffer | null;
  mediaType: string | null;
  text: string | null;
}

export interface LmsClient {
  /** Sanity check: fetch the connected account's display name or email. */
  self(): Promise<string>;
  courses(): Promise<LmsCourse[]>;
  assignments(courseId: string): Promise<LmsAssignment[]>;
  /** Downloads files and normalizes into import items. */
  submissions(courseId: string, assignmentId: string): Promise<LmsImportItem[]>;
}
