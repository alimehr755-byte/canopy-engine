"use client";

import { useState } from "react";
import { CheckCircle2, GraduationCap, Loader2, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { cn, formatDate } from "@/lib/format";

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

export function LmsManager({ initialConnection }: { initialConnection: LmsConnection | null }) {
  const [connection, setConnection] = useState(initialConnection);
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<{ id: number; name: string }[]>([]);
  const [assignments, setAssignments] = useState<{ id: number; name: string }[]>([]);
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
        body: JSON.stringify({ platform: "CANVAS", baseUrl: baseUrl.trim(), token: token.trim() }),
      });
      const payload = (await res.json()) as {
        id?: string;
        baseUrl?: string;
        name?: string | null;
        error?: string;
      };
      if (!res.ok || !payload.id) {
        throw new Error(payload.error ?? "Connection failed.");
      }
      setConnection({
        id: payload.id,
        platform: "CANVAS",
        baseUrl: payload.baseUrl ?? baseUrl.trim(),
        name: payload.name ?? null,
        lastSyncAt: null,
      });
      setToken("");
      let courseList: { id: number; name: string }[] = [];
      try {
        const browse = await fetch("/api/lms/browse?type=courses");
        if (browse.ok) {
          const data = (await browse.json()) as { courses?: { id: number; name: string }[] };
          courseList = data.courses ?? [];
        }
      } catch {
        // course listing is best-effort
      }
      setCourses(courseList);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed.");
    } finally {
      setPending(false);
    }
  }

  async function loadAssignments(selectedCourseId: string) {
    setCourseId(selectedCourseId);
    setAssignments([]);
    setAssignmentId("");
    if (!selectedCourseId) return;
    try {
      const res = await fetch(`/api/lms/browse?type=assignments&courseId=${selectedCourseId}`);
      const payload = (await res.json()) as { assignments?: { id: number; name: string }[]; error?: string };
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
        body: JSON.stringify({ courseId: Number(courseId), assignmentId: Number(assignmentId) }),
      });
      const payload = (await res.json()) as SyncResult & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? "Sync failed.");
      }
      setSyncResult(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
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

  if (connection) {
    return (
      <div className="px-5 py-5">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 bg-ink-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Canvas connected
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
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Course
            </span>
            <select
              value={courseId}
              onChange={(event) => loadAssignments(event.target.value)}
              className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
            >
              <option value="">Select a Canvas course…</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              Assignment
            </span>
            <select
              value={assignmentId}
              onChange={(event) => setAssignmentId(event.target.value)}
              className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              disabled={assignments.length === 0}
            >
              <option value="">
                {courseId ? "Select an assignment…" : "Pick a course first…"}
              </option>
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
        Enter your Canvas instance URL and an API access token. Files are downloaded and analyzed
        locally — all traffic is outbound, no public URL required.
      </p>
      <form onSubmit={connect} className="mt-3 space-y-2">
        <input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://your-school.instructure.com"
          className={cn(
            "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900",
            "outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
          )}
        />
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          type="password"
          placeholder="Canvas API access token (Account → Settings → New Access Token)"
          className={cn(
            "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900",
            "outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
          )}
        />
        <button
          type="submit"
          disabled={pending || !baseUrl.trim() || !token.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
          {pending ? "Verifying token…" : "Connect Canvas"}
        </button>
      </form>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
