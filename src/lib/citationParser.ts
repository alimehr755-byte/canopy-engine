import type { ExclusionRange, TextRange } from "./types";

export interface CitationReport {
  citationStyle: "APA" | "IEEE" | "MLA" | "CHICAGO" | "HARVARD" | "UNKNOWN";
  quoteRanges: ExclusionRange[];
  citationRanges: ExclusionRange[];
  bibliographyRanges: ExclusionRange[];
  bibtexEntries: number;
  inlineCitations: number;
  hasBibliography: boolean;
}

const QUOTE_PATTERNS: RegExp[] = [
  /“[^”]{2,800}”/gu,
  /"[^"\n]{2,800}"/gu,
  /‘[^’]{2,800}’/gu,
  /«[^»]{2,800}»/gu
];

const APA_INLINE = /\((?:[^()]{0,120}?)(?:19|20)\d{2}[a-z]?(?:[^()]{0,120}?)\)/gu;
const NARRATIVE_CITATION = /\b[\p{Lu}][\p{L}'’-]+(?:\s+(?:et\s+al\.|and\s+[\p{Lu}][\p{L}'’-]+))?,?\s+(?:19|20)\d{2}\b/gu;
const IEEE_INLINE = /\[\d+(?:\s*[-,–]\s*\d+)*\]/gu;
const MLA_INLINE = /\((?:[\p{Lu}][\p{L}'’-]+)(?:\s+\d{1,4})(?:[-,]\s*\d{1,4})?\)/gu;
const BIB_HEADING =
  /^(?:#{1,6}\s*)?(references|reference list|works cited|bibliography|literature cited|sources cited|citations)\s*:?\s*$/gim;
const BIBTEX_BLOCK = /@\w+\s*\{[^}]*\}/gu;

function overlapRatio(range: TextRange, other: TextRange): number {
  const overlapStart = Math.max(range.start, other.start);
  const overlapEnd = Math.min(range.end, other.end);
  if (overlapEnd <= overlapStart) {
    return 0;
  }
  const length = Math.max(1, range.end - range.start);
  return (overlapEnd - overlapStart) / length;
}

export function rangeIsExcluded(range: TextRange, exclusions: readonly TextRange[], threshold = 0.5): boolean {
  return exclusions.some((exclusion) => overlapRatio(range, exclusion) >= threshold);
}

export function detectQuotes(text: string): ExclusionRange[] {
  const ranges: ExclusionRange[] = [];

  for (const pattern of QUOTE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        reason: "quote",
        label: "Quoted material"
      });
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
      }
    }
  }

  const blockPattern = /(?:^[ \t]{4,}\S[^\n]*(?:\n|$)){1,}|(?:^>[^\n]*(?:\n|$)){1,}/gmu;
  let block: RegExpExecArray | null;
  while ((block = blockPattern.exec(text)) !== null) {
    const value = block[0].trim();
    if (value.split(/\s+/u).length >= 12) {
      ranges.push({
        start: block.index,
        end: block.index + block[0].length,
        reason: "quote",
        label: "Block quotation"
      });
    }
    if (block[0].length === 0) {
      blockPattern.lastIndex += 1;
    }
  }

  return ranges.sort((left, right) => left.start - right.start);
}

export function detectInlineCitations(text: string): ExclusionRange[] {
  const ranges: ExclusionRange[] = [];
  const patterns: RegExp[] = [APA_INLINE, IEEE_INLINE, MLA_INLINE, NARRATIVE_CITATION];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        reason: "citation",
        label: "Inline citation"
      });
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
      }
    }
  }

  return ranges.sort((left, right) => left.start - right.start);
}

export function detectBibliography(text: string): { ranges: ExclusionRange[]; bibtexEntries: number } {
  const ranges: ExclusionRange[] = [];
  let bibtexEntries = 0;

  BIB_HEADING.lastIndex = 0;
  let heading: RegExpExecArray | null;
  while ((heading = BIB_HEADING.exec(text)) !== null) {
    ranges.push({
      start: heading.index,
      end: text.length,
      reason: "bibliography",
      label: heading[1] ?? "Bibliography"
    });
    break;
  }

  BIBTEX_BLOCK.lastIndex = 0;
  let bibtex: RegExpExecArray | null;
  while ((bibtex = BIBTEX_BLOCK.exec(text)) !== null) {
    bibtexEntries += 1;
    ranges.push({
      start: bibtex.index,
      end: bibtex.index + bibtex[0].length,
      reason: "bibliography",
      label: "BibTeX entry"
    });
  }

  ranges.sort((left, right) => left.start - right.start);
  return { ranges, bibtexEntries };
}

export function detectCitationStyle(text: string): CitationReport["citationStyle"] {
  const apaIeee = text.match(/\[\d+(?:[-,–]\s*\d+)*\]/gu)?.length ?? 0;
  const apa = text.match(/\((?:[^()]{0,80}?)(?:19|20)\d{2}[a-z]?(?:[^()]{0,80}?)\)/gu)?.length ?? 0;
  const mla = text.match(/\((?:[\p{Lu}][\p{L}'’-]+)\s+\d{1,4}\)/gu)?.length ?? 0;
  const chicago = text.match(/\bibid\.|\bop\.\s*cit\./giu)?.length ?? 0;
  const harvard = text.match(/\((?:[\p{Lu}][\p{L}'’-]+),\s*(?:19|20)\d{2}(?:,\s*p{1,2}\.\s*\d+)?\)/gu)?.length ?? 0;

  const ranking: Array<[CitationReport["citationStyle"], number]> = [
    ["IEEE", apaIeee],
    ["MLA", mla],
    ["CHICAGO", chicago],
    ["HARVARD", harvard],
    ["APA", apa]
  ];

  ranking.sort((left, right) => right[1] - left[1]);
  const best = ranking[0];
  if (!best || best[1] === 0) {
    return "UNKNOWN";
  }
  return best[0];
}

export function parseCitations(text: string): CitationReport {
  const quoteRanges = detectQuotes(text);
  const citationRanges = detectInlineCitations(text);
  const bibliography = detectBibliography(text);
  const bibHeadingRanges = bibliography.ranges.filter((range) => range.label !== "BibTeX entry");
  const inlineCitations = citationRanges.length;

  return {
    citationStyle: detectCitationStyle(text),
    quoteRanges,
    citationRanges,
    bibliographyRanges: bibliography.ranges,
    bibtexEntries: bibliography.bibtexEntries,
    inlineCitations,
    hasBibliography: bibHeadingRanges.length > 0 || bibliography.bibtexEntries > 0
  };
}

export function buildExclusionRanges(text: string): ExclusionRange[] {
  const report = parseCitations(text);
  const combined = [...report.quoteRanges, ...report.citationRanges, ...report.bibliographyRanges];
  return combined.sort((left, right) => left.start - right.start);
}

export function bibliographyStart(text: string): number | null {
  BIB_HEADING.lastIndex = 0;
  const heading = BIB_HEADING.exec(text);
  return heading ? heading.index : null;
}
