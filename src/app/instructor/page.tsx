import Link from "next/link";
import { ClipboardList, Plus, Users } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { CreateAssignmentForm } from "@/components/CreateAssignmentForm";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InstructorPage() {
  let assignments: Array<{
    id: string;
    title: string;
    description: string | null;
    dueAt: Date | null;
    createdAt: Date;
    _count: { submissions: number };
  }> = [];
  let databaseError: string | null = null;

  try {
    assignments = await prisma.assignment.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { submissions: true } } }
    });
  } catch {
    databaseError = "The database is not reachable. Start PostgreSQL and push the schema first.";
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <AppHeader />
      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-600">
              Instructor workspace
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-950">
              Classes, assignments and rosters
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              Create assignments, review per-student similarity trends and open each report.
            </p>
          </div>
        </div>

        {databaseError ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {databaseError}
          </div>
        ) : null}

        <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <CreateAssignmentCard />
          <div className="space-y-3">
            {assignments.length === 0 && !databaseError ? (
              <div className="rounded-2xl border border-ink-200/80 bg-white px-5 py-10 text-center shadow-paper">
                <ClipboardList className="mx-auto h-8 w-8 text-ink-300" />
                <p className="mt-3 text-sm font-medium text-ink-800">No assignments yet</p>
                <p className="mt-1 text-xs text-ink-500">Create your first assignment on the left.</p>
              </div>
            ) : null}
            {assignments.map((assignment) => (
              <Link
                key={assignment.id}
                href={`/instructor/${assignment.id}`}
                className="block rounded-2xl border border-ink-200/80 bg-white p-5 shadow-paper transition hover:border-brand-500/50 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-950">{assignment.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-ink-500">
                      {assignment.description ?? "No description provided."}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-medium text-ink-600">
                    <Users className="h-3 w-3" />
                    {assignment._count.submissions}
                  </span>
                </div>
                <p className="mt-3 flex flex-wrap gap-x-4 text-[11px] text-ink-400">
                  <span>Created {formatDate(assignment.createdAt.toISOString())}</span>
                  {assignment.dueAt ? <span>Due {formatDate(assignment.dueAt.toISOString())}</span> : null}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function CreateAssignmentCard() {
  return (
    <div className="rounded-2xl border border-ink-200/80 bg-white p-5 shadow-paper">
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-brand-500" />
        <p className="text-sm font-semibold text-ink-900">Create assignment</p>
      </div>
      <CreateAssignmentForm />
    </div>
  );
}