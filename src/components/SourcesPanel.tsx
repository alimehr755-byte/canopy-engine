"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, FileText } from "lucide-react";
import type { MatchDTO, ReportDTO } from "@/lib/types";
import { cn, formatNumber, sourceTypeLabel, truncate } from "@/lib/format";

interface SourcesPanelProps {
  report: ReportDTO;
  activeMatchId: string | null;
  onSelectMatch: (matchId: string) => void;
}

export function SourcesPanel({ report, activeMatchId, onSelectMatch }: SourcesPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const activeMatch = report.matches.find((match) => match.id === activeMatchId) ?? null;
  const included = report.matches.filter(
    (match) => !match.excludedBy.quotes && !match.excludedBy.bibliography && !match.excludedBy.smallMatch
  );

  function toggle(key: string): void {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <aside className="no-print space-y-3">
      <div className="rounded-2xl border border-ink-200/80 bg-white shadow-paper">
        <div className="border-b border-ink-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">Sources</h2>
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">
              {report.sources.length}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-ink-500">
            {included.length} of {report.matches.length} passages included
          </p>
        </div>

        {report.sources.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <FileText className="mx-auto h-6 w-6 text-ink-300" />
            <p className="mt-2 text-xs font-medium text-ink-700">No matching sources</p>
            <p className="mt-1 text-[11px] text-ink-400">
              This passage did not match the repository under the current filters.
            </p>
          </div>
        ) : (
          <ul className="max-h-[420px] divide-y divide-ink-50 overflow-y-auto veritas-scroll">
            {report.sources.map((source) => {
              const isOpen = expanded.has(source.key);
              const label =
                source.sourceTitle ??
                (source.sourceUrl ? safeHost(source.sourceUrl) : "Unnamed source");
              const sourceMatches = report.matches.filter((match) => source.matchIds.includes(match.id));
              return (
                <li key={source.key} className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggle(source.key)}
                    className="flex w-full items-start gap-2 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                    ) : (
                      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-ink-900">{label}</span>
                        <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-600">
                          {source.percentage.toFixed(0)}%
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-ink-400">
                        {sourceTypeLabel(source.sourceType)} · {formatNumber(source.wordCount)} words
                        {source.kinds.length > 1
                          ? " · exact + paraphrase"
                          : source.kinds[0] === "PARAPHRASE"
                            ? " · paraphrase"
                            : " · exact"}
                      </span>
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="mt-2 space-y-1.5 pl-5">
                      {source.sourceUrl ? (
                        <a
                          href={source.sourceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-600 hover:underline"
                        >
                          Open source <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      ) : null}
                      {sourceMatches.slice(0, 6).map((match) => (
                        <button
                          key={match.id}
                          type="button"
                          onClick={() => onSelectMatch(match.id)}
                          className={cn(
                            "block w-full rounded-md border px-2 py-1.5 text-left text-[11px] leading-4 transition",
                            activeMatchId === match.id
                              ? "border-red-300 bg-red-50 text-ink-900"
                              : "border-ink-100 bg-ink-50/50 text-ink-600 hover:border-ink-200 hover:bg-ink-50"
                          )}
                        >
                          <span className="line-clamp-2">{truncate(match.matchedText, 110)}</span>
                          <span className="mt-0.5 block text-[9px] uppercase tracking-wide text-ink-400">
                            {match.kind} · {match.wordCount} words ·{" "}
                            {match.similarityPercentage.toFixed(1)}%
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {activeMatch ? <MatchDetail match={activeMatch} /> : <ScoreBreakdown report={report} />}
    </aside>
  );
}

function MatchDetail({ match }: { match: MatchDTO }) {
  return (
    <div className="rounded-2xl border border-ink-200/80 bg-white p-4 shadow-paper">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          Selected passage
        </p>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            match.kind === "EXACT" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
          )}
        >
          {match.kind === "EXACT" ? "Exact" : "Paraphrase"}
        </span>
      </div>
      <p className="mt-2 text-xs font-medium text-ink-900">
        {match.sourceTitle ?? (match.sourceUrl ? safeHost(match.sourceUrl) : "Repository source")}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-ink-400">
        {sourceTypeLabel(match.sourceType)} · {match.wordCount} words ·{" "}
        {match.similarityPercentage.toFixed(1)}%
        {match.semanticScore ? ` · semantic ${match.semanticScore.toFixed(2)}` : ""}
      </p>
      <blockquote className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-ink-50 px-2.5 py-2 font-serif text-[11px] leading-5 text-ink-600 veritas-scroll">
        {match.matchedText}
      </blockquote>
      {match.sourceText ? (
        <>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
            Source excerpt
          </p>
          <p className="mt-1 max-h-32 overflow-y-auto font-serif text-[11px] leading-5 text-ink-500 veritas-scroll">
            {match.sourceText}
          </p>
        </>
      ) : null}
      {match.sourceUrl ? (
        <a
          href={match.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline"
        >
          Inspect source <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}

function ScoreBreakdown({ report }: { report: ReportDTO }) {
  return (
    <div className="rounded-2xl border border-ink-200/80 bg-white p-4 shadow-paper">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Score breakdown</p>
      <dl className="mt-2 space-y-1.5 text-xs">
        <Row label="Raw similarity" value={`${report.baseScores.similarity.toFixed(1)}%`} />
        <Row
          label="After quote/bib exclusions"
          value={`${report.scores.adjustedSimilarity.toFixed(1)}%`}
        />
        <Row label="Current view" value={`${report.scores.similarity.toFixed(1)}%`} strong />
        <Row label="Exact passages" value={formatNumber(report.stats.exactWordCount)} />
        <Row label="Paraphrased passages" value={formatNumber(report.stats.paraphraseWordCount)} />
        <Row label="Quoted words" value={formatNumber(report.stats.quoteWordCount)} />
      </dl>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-ink-500">{label}</dt>
      <dd className={cn("tabular-nums", strong ? "font-semibold text-ink-900" : "text-ink-700")}>
        {value}
      </dd>
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
}
