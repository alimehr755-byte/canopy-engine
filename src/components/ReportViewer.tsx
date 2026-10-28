"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookDown, Calendar, Check, FileText, Link2, Loader2, Printer, UserRound } from "lucide-react";
import { AiDetectionPanel } from "@/components/AiDetectionPanel";
import { FilterToolbar } from "@/components/FilterToolbar";
import { FlagsPanel } from "@/components/FlagsPanel";
import { HighlightedDocument } from "@/components/HighlightedDocument";
import { ScoreRing } from "@/components/ScoreRing";
import { SourcesPanel } from "@/components/SourcesPanel";
import { formatDate, formatNumber } from "@/lib/format";
import type { ReportDTO } from "@/lib/types";

export function ReportViewer({ report }: { report: ReportDTO }) {
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [showAi, setShowAi] = useState(true);
  const [shareState, setShareState] = useState<"idle" | "pending" | "copied" | "error">("idle");

  async function shareReport() {
    if (shareState === "pending") return;
    setShareState("pending");
    try {
      const res = await fetch(`/api/report/${report.id}/share`, { method: "POST" });
      const payload = (await res.json()) as { sharePath?: string; error?: string };
      if (!res.ok || !payload.sharePath) {
        throw new Error(payload.error ?? "Could not create share link.");
      }
      const absolute = `${window.location.origin}${payload.sharePath}`;
      await navigator.clipboard.writeText(absolute).catch(() => undefined);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 4000);
    } catch {
      setShareState("error");
      setTimeout(() => setShareState("idle"), 4000);
    }
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All submissions
        </Link>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
            Feedback Studio view
          </span>
          <a
            href={`/api/report/${report.id}/pdf`}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-600 transition hover:border-ink-300 hover:text-ink-900"
          >
            <BookDown className="h-3.5 w-3.5" />
            Download PDF
          </a>
          <button
            type="button"
            onClick={shareReport}
            disabled={shareState === "pending"}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-600 transition hover:border-ink-300 hover:text-ink-900 disabled:opacity-60"
          >
            {shareState === "pending" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : shareState === "copied" ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            ) : shareState === "error" ? (
              <span className="text-red-600">Failed</span>
            ) : null}
            <Link2 className={shareState === "pending" || shareState === "error" ? "hidden" : "h-3.5 w-3.5"} />
            {shareState === "copied" ? "Link copied" : shareState === "error" ? "Try again" : "Share link"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-600 transition hover:border-ink-300 hover:text-ink-900"
          >
            <Printer className="h-3.5 w-3.5" />
            Print report
          </button>
        </div>
      </div>

      <header className="rounded-2xl border border-ink-200/80 bg-white p-5 shadow-paper">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600">
              Originality report
            </p>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-ink-950 sm:text-2xl">
              {report.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1">
                <UserRound className="h-3 w-3" />
                {report.authorName ?? "Unassigned author"}
              </span>
              {report.assignmentTitle ? (
                <span className="inline-flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {report.assignmentTitle}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(report.createdAt)}
              </span>
              <span className="tabular-nums">
                {formatNumber(report.stats.wordCount)} words · {formatNumber(report.stats.sourceCount)}{" "}
                sources
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <ScoreRing value={report.scores.similarity} label="Similarity" size="md" />
            <span className="hidden h-14 w-px bg-ink-100 sm:block" />
            <ScoreRing value={report.ai.overallScore} label="AI writing" size="md" tone="ai" />
          </div>
        </div>

        {report.status !== "COMPLETED" ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {report.status === "FAILED"
              ? `Analysis failed${report.error ? `: ${report.error}` : ""}. Re-submit the document or retry the analysis endpoint.`
              : "Analysis is still pending. Refresh this page in a few moments."}
          </div>
        ) : null}
      </header>

      <div className="mt-4 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_330px]">
        <SourcesPanel
          report={report}
          activeMatchId={activeMatchId}
          onSelectMatch={setActiveMatchId}
        />

        <section className="min-w-0">
          <FilterToolbar report={report} />
          <div className="mt-3 rounded-2xl border border-ink-200/80 bg-paper px-5 py-6 shadow-paper sm:px-10 sm:py-9">
            <div className="mb-5 flex items-center justify-between border-b border-ink-200/70 pb-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-400">
                  Submitted document
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  Click any highlight to inspect the source passage.
                </p>
              </div>
              <span className="no-print rounded-full bg-white px-2.5 py-1 text-[10px] font-medium tabular-nums text-ink-500 ring-1 ring-ink-200">
                {report.scores.similarity.toFixed(1)}% matched
              </span>
            </div>
            <div className="max-h-[calc(100vh-260px)] overflow-y-auto pr-1 veritas-scroll">
              <HighlightedDocument
                report={report}
                activeMatchId={activeMatchId}
                onSelectMatch={setActiveMatchId}
                showAi={showAi}
              />
            </div>
          </div>
        </section>

        <aside className="space-y-3">
          <AiDetectionPanel
            report={report}
            showAi={showAi}
            onToggleAi={() => setShowAi((value) => !value)}
          />
          <FlagsPanel report={report} />
          <section className="no-print rounded-2xl border border-ink-200/80 bg-white p-4 shadow-paper">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Submission stats</p>
            <dl className="mt-2 space-y-1.5 text-xs">
              <Row label="Words" value={formatNumber(report.stats.wordCount)} />
              <Row label="Characters" value={formatNumber(report.stats.characterCount)} />
              <Row label="Included matches" value={formatNumber(report.stats.matchCount)} />
              <Row label="Exact words" value={formatNumber(report.stats.exactWordCount)} />
              <Row label="Paraphrased words" value={formatNumber(report.stats.paraphraseWordCount)} />
              <Row
                label="Quoted / bib words"
                value={formatNumber(report.stats.quoteWordCount + report.stats.bibliographyWordCount)}
              />
            </dl>
          </section>
        </aside>
      </div>

      <p className="no-print mt-6 text-center text-[10px] leading-4 text-ink-400">
        Similarity scores are investigative signals, not findings of misconduct. AI writing scores are
        probabilistic and should be reviewed alongside drafts and source context.
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-ink-500">{label}</dt>
      <dd className="tabular-nums text-ink-800">{value}</dd>
    </div>
  );
}
