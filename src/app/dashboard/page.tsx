import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenCheck,
  Bot,
  FileSearch,
  Files,
  Fingerprint,
  ScanSearch,
  ShieldAlert
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { UploadForm } from "@/components/UploadForm";
import { getDashboardStats, listRecentSubmissions } from "@/lib/report";
import { cn, formatDate, formatNumber, formatPercent, statusLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const STAGES = [
  {
    title: "Sanitize",
    body: "Normalizes Unicode, strips zero-width and bidi characters, and resolves homoglyphs.",
    icon: ScanSearch
  },
  {
    title: "Fingerprint",
    body: "Rabin-Karp rolling hashes with winnowing keep only the strongest document fingerprints.",
    icon: Fingerprint
  },
  {
    title: "Compare",
    body: "Exact matches against papers, web sources and publications, plus semantic paraphrase recall.",
    icon: FileSearch
  },
  {
    title: "Explain",
    body: "Citation-aware exclusions, evasion flags and sentence-level AI writing probabilities.",
    icon: BookOpenCheck
  }
];

export default async function DashboardPage() {
  let stats = { submissions: 0, averageSimilarity: 0, averageAi: 0, flaggedSources: 0 };
  let submissions: Awaited<ReturnType<typeof listRecentSubmissions>> = [];
  let databaseError: string | null = null;

  try {
    [stats, submissions] = await Promise.all([getDashboardStats(), listRecentSubmissions(20)]);
  } catch {
    databaseError =
      "The database is not reachable yet. Start PostgreSQL and run `npx prisma db push && npm run db:seed`.";
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <AppHeader />
      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-600">
              Integrity dashboard
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-950">
              Review submissions before they become incidents.
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-500">
              Upload a paper to generate a Feedback Studio-style report with source matches,
              citation-aware exclusions, evasion flags and AI writing analysis.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs text-ink-500 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Repository matching active
          </div>
        </div>

        {databaseError ? (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Setup required</p>
              <p className="mt-0.5 text-amber-800">{databaseError}</p>
            </div>
          </div>
        ) : null}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Submissions"
            value={formatNumber(stats.submissions)}
            hint="Papers analyzed in this workspace"
            icon={Files}
          />
          <StatCard
            label="Mean similarity"
            value={formatPercent(stats.averageSimilarity)}
            hint="Excluding quotes and bibliography"
            icon={FileSearch}
          />
          <StatCard
            label="Mean AI signal"
            value={formatPercent(stats.averageAi)}
            hint="Model-estimated across sentences"
            icon={Bot}
          />
          <StatCard
            label="Matched sources"
            value={formatNumber(stats.flaggedSources)}
            hint="Internet, publications and papers"
            icon={ShieldAlert}
          />
        </section>

        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <UploadForm />

          <section className="rounded-2xl border border-ink-200/80 bg-white p-5 shadow-paper">
            <h2 className="text-sm font-semibold tracking-tight text-ink-900">How the engine reads a paper</h2>
            <p className="mt-1 text-xs leading-5 text-ink-500">
              Four deterministic stages, then a graceful fallback if the AI microservice is offline.
            </p>
            <ol className="mt-4 space-y-4">
              {STAGES.map((stage, index) => (
                <li key={stage.title} className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-950 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                      <stage.icon className="h-3.5 w-3.5 text-brand-500" />
                      {stage.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-ink-500">{stage.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-xl bg-ink-950 px-4 py-3 text-ink-100">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-400">
                Matching corpus
              </p>
              <p className="mt-1 text-sm">
                Student repository · web pages · publications · 170+ language normalization
              </p>
            </div>
          </section>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-paper">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-ink-900">Recent submissions</h2>
              <p className="text-xs text-ink-500">Most recent 20 analyses, newest first.</p>
            </div>
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-medium text-ink-600">
              {submissions.length} shown
            </span>
          </div>

          {submissions.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Files className="mx-auto h-8 w-8 text-ink-300" />
              <p className="mt-3 text-sm font-medium text-ink-800">No submissions yet</p>
              <p className="mt-1 text-xs text-ink-500">
                Analyze your first paper to populate the repository and reports.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-[11px] uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-2.5 font-medium">Submission</th>
                    <th className="px-3 py-2.5 font-medium">Author</th>
                    <th className="px-3 py-2.5 font-medium">Similarity</th>
                    <th className="px-3 py-2.5 font-medium">AI</th>
                    <th className="px-3 py-2.5 font-medium">Words</th>
                    <th className="px-3 py-2.5 font-medium">Created</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((submission) => (
                    <tr
                      key={submission.id}
                      className="group border-b border-ink-50 transition last:border-0 hover:bg-ink-50/60"
                    >
                      <td className="max-w-[280px] px-5 py-3">
                        <Link
                          href={`/report/${submission.id}`}
                          className="block truncate font-medium text-ink-900 hover:text-brand-600"
                        >
                          {submission.title}
                        </Link>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-400">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              submission.status === "COMPLETED"
                                ? "bg-emerald-500"
                                : submission.status === "FAILED"
                                  ? "bg-red-500"
                                  : "bg-amber-500"
                            )}
                          />
                          {statusLabel(submission.status)}
                          {submission.assignmentTitle ? ` · ${submission.assignmentTitle}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-ink-600">{submission.authorName ?? "Unassigned"}</td>
                      <td className="px-3 py-3">
                        <ScorePill value={submission.similarityScore} kind="similarity" />
                      </td>
                      <td className="px-3 py-3">
                        <ScorePill value={submission.aiScore} kind="ai" />
                      </td>
                      <td className="px-3 py-3 tabular-nums text-ink-500">
                        {formatNumber(submission.wordCount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-400">
                        {formatDate(submission.createdAt)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/report/${submission.id}`}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
                        >
                          Open
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Files;
}) {
  return (
    <div className="rounded-2xl border border-ink-200/80 bg-white p-4 shadow-paper">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
        <Icon className="h-4 w-4 text-ink-300" />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-ink-950">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink-500">{hint}</p>
    </div>
  );
}

function ScorePill({ value, kind }: { value: number; kind: "similarity" | "ai" }) {
  const band =
    kind === "ai"
      ? value >= 60
        ? "bg-violet-100 text-violet-800"
        : value >= 20
          ? "bg-amber-100 text-amber-800"
          : "bg-emerald-100 text-emerald-800"
      : value >= 45
        ? "bg-red-100 text-red-800"
        : value >= 20
          ? "bg-amber-100 text-amber-800"
          : "bg-emerald-100 text-emerald-800";
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", band)}>
      {value.toFixed(0)}%
    </span>
  );
}
