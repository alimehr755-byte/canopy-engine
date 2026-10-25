import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, FileSearch, Files, Users } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { prisma } from "@/lib/prisma";
import { cn, formatDate, formatNumber, formatPercent, statusLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assignment = await prisma.assignment
    .findUnique({
      where: { id },
      include: {
        submissions: {
          orderBy: { createdAt: "desc" },
          include: { author: { select: { name: true, email: true } } }
        }
      }
    })
    .catch(() => null);

  if (!assignment) {
    notFound();
  }

  const roster = new Map<
    string,
    { name: string; email: string; submissions: number; highestSimilarity: number; highestAi: number }
  >();
  for (const submission of assignment.submissions) {
    const email = submission.author?.email ?? "unknown@veritas.local";
    const entry =
      roster.get(email) ?? {
        name: submission.author?.name ?? email,
        email,
        submissions: 0,
        highestSimilarity: 0,
        highestAi: 0
      };
    entry.submissions += 1;
    entry.highestSimilarity = Math.max(entry.highestSimilarity, submission.similarityScore);
    entry.highestAi = Math.max(entry.highestAi, submission.aiScore);
    roster.set(email, entry);
  }
  const students = Array.from(roster.values()).sort((left, right) => left.name.localeCompare(right.name));

  const completed = assignment.submissions.filter((submission) => submission.status === "COMPLETED");
  const averageSimilarity =
    completed.length > 0
      ? completed.reduce((total, submission) => total + submission.similarityScore, 0) / completed.length
      : 0;

  return (
    <div className="min-h-screen bg-ink-50">
      <AppHeader compact />
      <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
        <Link
          href="/instructor"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 transition hover:text-ink-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All assignments
        </Link>
        <div className="mt-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950">{assignment.title}</h1>
          {assignment.description ? (
            <p className="mt-1 max-w-2xl text-sm text-ink-500">{assignment.description}</p>
          ) : null}
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <StatTile icon={Files} label="Submissions" value={formatNumber(assignment.submissions.length)} />
          <StatTile icon={Users} label="Students" value={formatNumber(students.length)} />
          <StatTile
            icon={FileSearch}
            label="Mean similarity"
            value={completed.length > 0 ? formatPercent(averageSimilarity) : "—"}
          />
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-paper">
          <div className="border-b border-ink-100 px-5 py-4">
            <h2 className="text-sm font-semibold tracking-tight text-ink-900">Class roster</h2>
            <p className="text-xs text-ink-500">Highest recorded scores per student.</p>
          </div>
          {students.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-500">
              No submissions in this assignment yet. Students submit from the dashboard.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-[11px] uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-2.5 font-medium">Student</th>
                    <th className="px-3 py-2.5 font-medium">Submissions</th>
                    <th className="px-3 py-2.5 font-medium">Peak similarity</th>
                    <th className="px-5 py-2.5 font-medium">Peak AI</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.email} className="border-b border-ink-50 last:border-0">
                      <td className="px-5 py-3">
                        <p className="font-medium text-ink-900">{student.name}</p>
                        <p className="text-[11px] text-ink-400">{student.email}</p>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-ink-600">{student.submissions}</td>
                      <td className="px-3 py-3">
                        <ScorePill value={student.highestSimilarity} kind="similarity" />
                      </td>
                      <td className="px-5 py-3">
                        <ScorePill value={student.highestAi} kind="ai" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-paper">
          <div className="border-b border-ink-100 px-5 py-4">
            <h2 className="text-sm font-semibold tracking-tight text-ink-900">Submissions</h2>
            <p className="text-xs text-ink-500">Newest first.</p>
          </div>
          {assignment.submissions.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-500">Nothing added yet.</p>
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
                    <th className="px-5 py-2.5 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {assignment.submissions.map((submission) => (
                    <tr key={submission.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/60">
                      <td className="max-w-[280px] px-5 py-3">
                        <Link
                          href={`/report/${submission.id}`}
                          className="block truncate font-medium text-ink-900 hover:text-brand-600"
                        >
                          {submission.title}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-ink-400">{statusLabel(submission.status)}</p>
                      </td>
                      <td className="px-3 py-3 text-ink-600">
                        {submission.author?.name ?? "Unassigned"}
                      </td>
                      <td className="px-3 py-3">
                        <ScorePill value={submission.similarityScore} kind="similarity" />
                      </td>
                      <td className="px-3 py-3">
                        <ScorePill value={submission.aiScore} kind="ai" />
                      </td>
                      <td className="px-3 py-3 tabular-nums text-ink-500">
                        {formatNumber(submission.wordCount)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-ink-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Bot className="h-3.5 w-3.5 text-ink-300" />
                          {formatDate(submission.createdAt.toISOString())}
                        </span>
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

function StatTile({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Files;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-ink-200/80 bg-white p-4 shadow-paper">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
        <Icon className="h-4 w-4 text-ink-300" />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-ink-950">{value}</p>
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