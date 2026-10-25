"use client";

import { useEffect, useMemo } from "react";
import type { MatchDTO, ReportDTO } from "@/lib/types";
import { cn, sourceTypeLabel } from "@/lib/format";

interface Segment {
  key: number;
  start: number;
  end: number;
  kind: "match" | "quote" | "bibliography" | "ai" | "plain";
  match?: MatchDTO;
}

interface HighlightedDocumentProps {
  report: ReportDTO;
  activeMatchId: string | null;
  onSelectMatch: (matchId: string) => void;
  showAi: boolean;
}

export function HighlightedDocument({
  report,
  activeMatchId,
  onSelectMatch,
  showAi
}: HighlightedDocumentProps) {
  const text = report.text;
  const segments = useMemo(() => buildSegments(report, showAi), [report, showAi]);

  useEffect(() => {
    if (!activeMatchId) {
      return;
    }
    const element = document.querySelector<HTMLElement>(
      `[data-match-id="${windowCSSEscape(activeMatchId)}"]`
    );
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeMatchId]);

  if (text.trim().length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-200 px-6 py-16 text-center text-sm text-ink-500">
        There is no stored document text for this submission.
      </div>
    );
  }

  return (
    <article className="whitespace-pre-wrap break-words font-serif text-[15px] leading-8 text-ink-800">
      {segments.map((segment) => {
        const value = text.slice(segment.start, segment.end);
        if (segment.kind === "match" && segment.match) {
          const match = segment.match;
          return (
            <mark
              key={segment.key}
              data-match-id={match.id}
              data-active={activeMatchId === match.id}
              onClick={() => onSelectMatch(match.id)}
              title={`${sourceTypeLabel(match.sourceType)} · ${match.similarityPercentage.toFixed(
                1
              )}% match${match.sourceTitle ? ` · ${match.sourceTitle}` : ""}`}
              className={cn(
                "cursor-pointer decoration-2 underline-offset-2 transition",
                match.kind === "EXACT" ? "match-exact" : "match-paraphrase"
              )}
            >
              {value}
            </mark>
          );
        }
        if (segment.kind === "quote") {
          return (
            <mark key={segment.key} className="exclusion-quote" title="Excluded quotation">
              {value}
            </mark>
          );
        }
        if (segment.kind === "bibliography") {
          return (
            <span key={segment.key} className="exclusion-bibliography" title="Excluded bibliography">
              {value}
            </span>
          );
        }
        if (segment.kind === "ai") {
          return (
            <mark key={segment.key} className="ai-flag" title="AI-likely sentence">
              {value}
            </mark>
          );
        }
        return <span key={segment.key}>{value}</span>;
      })}
    </article>
  );
}

function buildSegments(report: ReportDTO, showAi: boolean): Segment[] {
  const text = report.text;
  const includedMatches = report.matches
    .filter(
      (match) =>
        !match.excludedBy.quotes && !match.excludedBy.bibliography && !match.excludedBy.smallMatch
    )
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "EXACT" ? -1 : 1;
      }
      return right.originalEnd - right.originalStart - (left.originalEnd - left.originalStart);
    });

  const quoteRanges = report.filters.excludeQuotes
    ? report.exclusions.filter((exclusion) => exclusion.reason === "quote")
    : [];
  const bibliographyRanges = report.filters.excludeBibliography
    ? report.exclusions.filter((exclusion) => exclusion.reason === "bibliography")
    : [];
  const aiRanges = showAi
    ? report.ai.sentenceScores.filter((sentence) => sentence.label !== "human")
    : [];

  const boundaries = new Set<number>([0, text.length]);
  for (const range of [
    ...includedMatches.map((match) => ({ start: match.originalStart, end: match.originalEnd })),
    ...quoteRanges,
    ...bibliographyRanges,
    ...aiRanges
  ]) {
    if (range.start > 0 && range.start < text.length) {
      boundaries.add(range.start);
    }
    if (range.end > 0 && range.end < text.length) {
      boundaries.add(range.end);
    }
  }

  const points = Array.from(boundaries).sort((left, right) => left - right);
  const segments: Segment[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index] as number;
    const end = points[index + 1] as number;
    if (end <= start) {
      continue;
    }
    const midpoint = (start + end) / 2;
    const match = includedMatches.find(
      (candidate) => midpoint >= candidate.originalStart && midpoint < candidate.originalEnd
    );
    if (match) {
      segments.push({ key: segments.length, start, end, kind: "match", match });
      continue;
    }
    if (quoteRanges.some((range) => midpoint >= range.start && midpoint < range.end)) {
      segments.push({ key: segments.length, start, end, kind: "quote" });
      continue;
    }
    if (bibliographyRanges.some((range) => midpoint >= range.start && midpoint < range.end)) {
      segments.push({ key: segments.length, start, end, kind: "bibliography" });
      continue;
    }
    if (aiRanges.some((range) => midpoint >= range.start && midpoint < range.end)) {
      segments.push({ key: segments.length, start, end, kind: "ai" });
      continue;
    }
    segments.push({ key: segments.length, start, end, kind: "plain" });
  }

  return segments;
}

function windowCSSEscape(value: string): string {
  if (typeof window !== "undefined" && "CSS" in window && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return value.replace(/["\\]/gu, "\\$&");
}
