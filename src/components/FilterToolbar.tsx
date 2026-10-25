"use client";

import Link from "next/link";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { ReportDTO, ReportFilters } from "@/lib/types";
import { cn } from "@/lib/format";

export function FilterToolbar({ report }: { report: ReportDTO }) {
  const filters = report.filters;

  const href = (patch: Partial<ReportFilters>): string => {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams({
      excludeQuotes: String(next.excludeQuotes),
      excludeBibliography: String(next.excludeBibliography),
      minMatchWords: String(next.minMatchWords)
    });
    return `/report/${report.id}?${params.toString()}`;
  };

  const included = report.matches.filter(
    (match) => !match.excludedBy.quotes && !match.excludedBy.bibliography && !match.excludedBy.smallMatch
  ).length;

  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-ink-200/80 bg-white px-3 py-2 shadow-sm">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
      </span>

      <ToggleLink
        label="Exclude quotes"
        active={filters.excludeQuotes}
        href={href({ excludeQuotes: !filters.excludeQuotes })}
      />
      <ToggleLink
        label="Exclude bibliography"
        active={filters.excludeBibliography}
        href={href({ excludeBibliography: !filters.excludeBibliography })}
      />

      <span className="mx-1 h-4 w-px bg-ink-200" />

      <span className="text-[11px] text-ink-500">Min match</span>
      <div className="flex rounded-md bg-ink-100 p-0.5">
        {[5, 10, 15, 25].map((value) => (
          <Link
            key={value}
            href={href({ minMatchWords: value })}
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums transition",
              filters.minMatchWords === value
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-500 hover:text-ink-800"
            )}
          >
            {value}
          </Link>
        ))}
      </div>

      <span className="ml-auto flex items-center gap-2">
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600">
          {included} / {report.matches.length} passages
        </span>
        <Link
          href={`/report/${report.id}`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-ink-500 transition hover:bg-ink-100 hover:text-ink-800"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </Link>
      </span>

      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 pt-1.5 text-[10px] text-ink-500">
        <Legend className="match-exact" label="Exact match" />
        <Legend className="match-paraphrase" label="Paraphrase" />
        {filters.excludeQuotes ? <Legend className="exclusion-quote" label="Quoted text (excluded)" /> : null}
        {filters.excludeBibliography ? (
          <Legend className="exclusion-bibliography" label="Bibliography (excluded)" />
        ) : null}
        <Legend className="ai-flag" label="AI-likely sentence" />
      </div>
    </div>
  );
}

function ToggleLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition",
        active
          ? "border-ink-900 bg-ink-950 text-white"
          : "border-ink-200 bg-white text-ink-500 hover:border-ink-300 hover:text-ink-800"
      )}
    >
      <span
        className={cn(
          "relative h-2.5 w-4 rounded-full transition",
          active ? "bg-emerald-400/80" : "bg-ink-300"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-1.5 w-1.5 rounded-full bg-white transition",
            active ? "left-2" : "left-0.5"
          )}
        />
      </span>
      {label}
    </Link>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-4 rounded-[2px]", className)} />
      {label}
    </span>
  );
}
