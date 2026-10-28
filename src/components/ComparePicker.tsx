"use client";

import { useState } from "react";
import Link from "next/link";
import { GitCompareArrows, Loader2 } from "lucide-react";

interface CompareResult {
  a: { id: string; title: string; similarityScore: number; aiScore: number };
  b: { id: string; title: string; similarityScore: number; aiScore: number };
  overlapScore: number;
  sharedFingerprints: number;
  sharedSources: { key: string; title: string | null; url: string | null; aWords: number; bWords: number }[];
}

export function ComparePicker({ submissions }: { submissions: { id: string; title: string }[] }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !a || !b || a === b) {
      if (a && a === b) setError("Pick two different submissions.");
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/compare?a=${a}&b=${b}`);
      const payload = (await res.json()) as CompareResult & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? "Comparison failed.");
      }
      setResult(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comparison failed.");
    } finally {
      setPending(false);
    }
  }

  const latest = submissions.slice(0, 50);

  return (
    <div className="rounded-2xl border border-ink-200/80 bg-white shadow-paper">
      <div className="border-b border-ink-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-semibold tracking-tight text-ink-900">Collusion check</h2>
        </div>
        <p className="mt-0.5 text-xs text-ink-500">
          Compare two completed submissions: shared fingerprints and cited sources.
        </p>
      </div>

      <form onSubmit={run} className="flex flex-wrap items-end gap-2 px-5 py-4">
        <label className="min-w-40 flex-1">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Submission A
          </span>
          <select
            value={a}
            onChange={(event) => setA(event.target.value)}
            className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
          >
            <option value="">Select…</option>
            {latest.map((submission) => (
              <option key={submission.id} value={submission.id}>
                {submission.title.slice(0, 50)}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-40 flex-1">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            versus B
          </span>
          <select
            value={b}
            onChange={(event) => setB(event.target.value)}
            className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
          >
            <option value="">Select…</option>
            {latest.map((submission) => (
              <option key={submission.id} value={submission.id}>
                {submission.title.slice(0, 50)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending || !a || !b || a === b}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Compare
        </button>
      </form>

      {error ? <p className="px-5 pb-3 text-xs text-red-700">{error}</p> : null}

      {result ? (
        <div className="border-t border-ink-100 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Overlap score" value={`${result.overlapScore}%`} />
            <Metric label="Shared fingerprints" value={String(result.sharedFingerprints)} />
            <Metric label="Shared sources" value={String(result.sharedSources.length)} />
          </div>
          {result.sharedSources.length > 0 ? (
            <ul className="mt-3 space-y-1.5 text-xs">
              {result.sharedSources.slice(0, 10).map((source) => (
                <li key={source.key} className="truncate rounded-md border border-ink-100 bg-ink-50 px-2.5 py-1.5 text-ink-700">
                  <span className="font-medium">{source.title ?? source.url}</span>
                  <span className="text-ink-400"> · A {source.aWords}w / B {source.bWords}w</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-500">
            <Link href={`/report/${result.a.id}`} className="underline hover:text-ink-800">
              Report A ↗
            </Link>
            <Link href={`/report/${result.b.id}`} className="underline hover:text-ink-800">
              Report B ↗
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-ink-50 px-3 py-2.5 text-center">
      <p className="text-lg font-semibold tabular-nums text-ink-950">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
    </div>
  );
}
