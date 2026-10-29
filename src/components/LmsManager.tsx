"use client";

import { useState } from "react";
import { CheckCircle2, GraduationCap, Loader2, LogIn, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { cn, formatDate } from "@/lib/format";

type Platform = "CANVAS" | "MOODLE" | "GOOGLE";

interface LmsConnection {
  id: string;
  platform: string;
  baseUrl: string;
  name: string | null;
  lastSyncAt: string | null;
}

interface SyncResult {
  imported: number;
  skipped: number;
  failed: number;
  course: string;
  assignment: string;
  errors: { student: string; reason: string }[];
}

const PLATFORM_LABELS: Record<Platform, string> = {
  CANVAS: "Canvas",
  MOODLE: "Moodle",
  GOOGLE: "Google Classroom",
};

export function LmsManager({
  initialConnection,
  googleConfigured,
  initialError,
}: {
  initialConnection: LmsConnection | null;
  googleConfigured: boolean;
  initialError?: string | null;
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [tab, setTab] = useState<Platform>("CANVAS");
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [assignments, setAssignments] = useState<{ id: string; name: string }[]>([]);
  const [courseId, setCourseId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !baseUrl.trim() || !token.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/lms/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: tab, baseUrl: baseUrl.trim(), token: token.trim() }),
      });
      const payload = (await res.json()) as {
        id?: string;
        platform?: string;
        baseUrl?: string;
        name?: string | null;
        error?: string;
      };
      if (!res.ok || !payload.id) {
        throw new Error(payload.error ?? "Connection failed.");
      }
      setConnection({
        id: payload.id,
        platform: payload.platform ?? tab,
        baseUrl: payload.baseUrl ?? baseUrl.trim(),
        name: payload.name ?? null,
        lastSyncAt: null,
      });
      setToken("");
      void loadCourses();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed.");
    }
  }

  async function startGoogle() {
    setError(null);
    if (!googleConfigured) {
      setError(
        "Google OAuth is not configured on this install. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local (Google Cloud Console \u2192 Credentials \u2192 OAuth client), and add /api/oauth/google/callback on this origin as an authorized redirect URI.",
      );
      return;
    }
    window.location.href = "/api/oauth/google/start";
  }

  async function loadCourses() {
    setCourses([]);
    setAssignments([]);
    setCourseId("");
    setAssignmentId("");
    try {
      const browse = await fetch("/api/lms/browse?type=courses");
      const data = (await browse.json()) as { courses?: { id: string; name: string }[]; error?: string };
      if (browse.ok) {
        setCourses(data.courses ?? []);
      } else {
        setError(data.error ?? "Could not list courses.");
      }
    } catch {
      setError("Could not list courses.");
    }
  }

  async function loadAssignments(selectedCourseId: string) {
    setCourseId(selectedCourseId);
    setAssignments([]);
    setAssignmentId("");
    if (!selectedCourseId) return;
    try {
      const res = await fetch(`/api/lms/browse?type=assignments&courseId=${encodeURIComponent(selectedCourseId)}`);
      const payload = (await res.json()) as { assignments?: { id: string; name: string }[]; error?: string };
      if (res.ok) {
        setAssignments(payload.assignments ?? []);
      } else {
        setError(payload.error ?? "Could not load assignments.");
      }
    } catch {
      setError("Could not load assignments.");
    }
  }

  async function sync() {
    if (syncing || !courseId || !assignmentId) return;
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await fetch("/api/lms/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, assignmentId }),
      });
      const payload = (await res.json()) as SyncResult & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? "Sync failed.");
      }
      setSyncResult(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    }
  }

  async function disconnect() {
    setConnection(null);
    setCourses([]);
    setAssignments([]);
    setCourseId("");
    setAssignmentId("");
    await fetch("/api/lms/connections", { method: "DELETE" }).catch(() => undefined);
  }

  const inputClass = cn(
    "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900",
    "outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
  );

  if (connection) {
    return (
      <div className="px-5 py-5">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 bg-ink-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {PLATFORM_LABELS[connection.platform as Platform]} connected
            </p>
            <p className="mt-0.5 truncate text-[11px] text-ink-400">
              {connection.name ?? "Account"} · {connection.baseUrl}
              {connection.lastSyncAt ? ` · last sync ${formatDate(connection.lastSyncAt)}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={disconnect}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-ink-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3 w-3" />
            Disconnect
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500">Course</span>
            <select
              value={courseId}
              onChange={(event) => loadAssignments(event.target.value)}
              className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
            >
              <option value="">
                {courses.length ? "Select a course…" : "Loading courses…"}
              </option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500">Assignment</span>
            <select
              value={assignmentId}
              onChange={(event) => setAssignmentId(event.target.value)}
              className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              disabled={assignments.length === 0}
            >
              <option value="">{courseId ? "Select an assignment…" : "Pick a course first…"}</option>
              {assignments.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>
                  {assignment.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={sync}
          disabled={syncing || !courseId || !assignmentId}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {syncing ? "Importing submissions…" : "Import submissions"}
        </button>

        {syncResult ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <p className="font-semibold">
              Imported {syncResult.imported} · skipped {syncResult.skipped} · failed {syncResult.failed}
            </p>
            <p className="mt-0.5 text-emerald-700">
              {syncResult.course} — {syncResult.assignment}. Pick it up on the Instructor page.
            </p>
          </div>
        ) : null}

        {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="px-5 py-5">
      <p className="flex items-center gap-1.5 text-xs text-ink-500">
        <GraduationCap className="h-3.5 w-3.5 text-ink-400" />
        Files are downloaded and analyzed locally — all traffic is outbound, no public URL required.
      </p>

      <div className="mt-3 flex gap-1 rounded-lg bg-ink-100 p-1">
        {(Object.keys(PLATFORM_LABELS) as Platform[]).map((platform) => (
          <button
            key={platform}
            type="button"
            onClick={() => {
              setTab(platform);
              setError(null);
            }}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition",
              tab === platform ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"
            )}
          >
            {PLATFORM_LABELS[platform]}
          </button>
        ))}
      </div>

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

      {tab === "CANVAS" || tab === "MOODLE" ? (
        <form onSubmit={connect} className="mt-3 space-y-2">
          <input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={tab === "CANVAS" ? "https://your-school.instructure.com" : "https://moodle.your-school.edu"}
            className={inputClass}
          />
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type="password"
            placeholder={
              tab === "CANVAS"
                ? "Canvas API access token (Account → Settings → New Access Token)"
                : "Moodle web service token (Site administration → Web services)"
            }
            className={inputClass}
          />
          <button
            type="submit"
            disabled={pending || !baseUrl.trim() || !token.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            {pending ? "Verifying token…" : `Connect ${PLATFORM_LABELS[tab]}`}
          </button>
        </form>
      ) : (
        <div className="mt-3">
          {googleConfigured ? (
            <p className="mb-2 text-[11px] text-ink-400">
              You will be redirected to Google to grant access. A refresh token is stored locally.
            </p>
          ) : (
            <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
              <p className="font-semibold">Google OAuth needs one-time setup:</p>
              <p className="mt-1">
                1. Google Cloud Console → APIs: enable <b>Classroom API</b> and <b>Drive API</b>.
              </p>
              <p>
                2. Credentials → OAuth client ID (Web app) — add authorized redirect URI
                <code className="ml-1 rounded bg-amber-100 px-1">http://localhost:3000/api/oauth/google/callback</code>
              </p>
              <p>
                3. Put <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in <code>.env.local</code>.
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={startGoogle}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-ink-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 transition hover:bg-ink-50"
          >
            <LogIn className="h-4 w-4" />
            Continue with Google
          </button>
        </div>
      )}
    </div>
  );
}
