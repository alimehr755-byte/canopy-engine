import type {
  ExclusionRange,
  MatchDTO,
  MatchExclusions,
  MatchKind,
  ReportFilters,
  ReportScores,
  SourceGroup,
  SourceType,
  TextRange
} from "./types";
import { rangeIsExcluded } from "./citationParser";
import { countWords as countWordsFromText } from "./winnowing";

export interface MatchScoringInput {
  originalStart: number;
  originalEnd: number;
  wordCount: number;
  kind: MatchKind;
  sourceType: SourceType;
  sourceUrl: string | null;
  sourceTitle: string | null;
  similarityPercentage: number;
  semanticScore?: number | null;
}

export const DEFAULT_FILTERS: ReportFilters = {
  excludeQuotes: true,
  excludeBibliography: true,
  minMatchWords: 10
};

export function normalizeFilters(input: Partial<ReportFilters> | undefined): ReportFilters {
  const minMatchWords = Number.isFinite(input?.minMatchWords) ? Number(input?.minMatchWords) : DEFAULT_FILTERS.minMatchWords;
  return {
    excludeQuotes: input?.excludeQuotes ?? DEFAULT_FILTERS.excludeQuotes,
    excludeBibliography: input?.excludeBibliography ?? DEFAULT_FILTERS.excludeBibliography,
    minMatchWords: Math.min(100, Math.max(1, Math.round(minMatchWords)))
  };
}

export function parseFilters(searchParams: URLSearchParams | Record<string, string | string[] | undefined>): ReportFilters {
  const read = (key: string): string | undefined => {
    if (searchParams instanceof URLSearchParams) {
      return searchParams.get(key) ?? undefined;
    }
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };
  return normalizeFilters({
    excludeQuotes: read("excludeQuotes") !== "false",
    excludeBibliography: read("excludeBibliography") !== "false",
    minMatchWords: read("minMatchWords") ? Number(read("minMatchWords")) : DEFAULT_FILTERS.minMatchWords
  });
}

export function exclusionFlags(
  range: TextRange,
  exclusions: readonly ExclusionRange[]
): { quote: boolean; bibliography: boolean; citation: boolean } {
  const quoteRanges = exclusions.filter((exclusion) => exclusion.reason === "quote");
  const bibliographyRanges = exclusions.filter((exclusion) => exclusion.reason === "bibliography");
  return {
    quote: rangeIsExcluded(range, quoteRanges, 0.35),
    bibliography: rangeIsExcluded(range, bibliographyRanges, 0.35),
    citation: rangeIsExcluded(
      range,
      exclusions.filter((exclusion) => exclusion.reason === "citation"),
      0.6
    )
  };
}

export function matchExclusions(
  match: { originalStart: number; originalEnd: number; wordCount: number },
  exclusions: readonly ExclusionRange[],
  filters: ReportFilters
): MatchExclusions {
  const flags = exclusionFlags(
    { start: match.originalStart, end: match.originalEnd },
    exclusions
  );
  return {
    quotes: filters.excludeQuotes && flags.quote,
    bibliography: filters.excludeBibliography && flags.bibliography,
    smallMatch: match.wordCount < filters.minMatchWords
  };
}

export function isMatchIncluded(exclusions: MatchExclusions): boolean {
  return !exclusions.quotes && !exclusions.bibliography && !exclusions.smallMatch;
}

export function isMatchExcludedBy(
  match: MatchExclusions,
  filter: "quotes" | "bibliography" | "smallMatch"
): boolean {
  if (filter === "quotes") {
    return match.quotes;
  }
  if (filter === "bibliography") {
    return match.bibliography;
  }
  return match.smallMatch;
}

export function unionCoverage(ranges: readonly TextRange[]): number {
  if (ranges.length === 0) {
    return 0;
  }
  const sorted = [...ranges]
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start);
  if (sorted.length === 0) {
    return 0;
  }
  let total = 0;
  let currentStart = (sorted[0] as TextRange).start;
  let currentEnd = (sorted[0] as TextRange).end;

  for (let index = 1; index < sorted.length; index += 1) {
    const range = sorted[index] as TextRange;
    if (range.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, range.end);
      continue;
    }
    total += currentEnd - currentStart;
    currentStart = range.start;
    currentEnd = range.end;
  }
  total += currentEnd - currentStart;
  return total;
}

export function coveragePercentage(textLength: number, ranges: readonly TextRange[]): number {
  if (textLength <= 0) {
    return 0;
  }
  const coverage = unionCoverage(ranges);
  return Math.min(100, (coverage / textLength) * 100);
}

export function computeScores(
  text: string,
  matches: ReadonlyArray<MatchScoringInput & { excludedBy?: MatchExclusions }>,
  exclusions: readonly ExclusionRange[],
  filters: ReportFilters,
  aiScore: number
): { scores: ReportScores; baseScores: ReportScores; included: boolean[] } {
  const included = matches.map((match) => {
    const flags = match.excludedBy ?? matchExclusions(match, exclusions, filters);
    return isMatchIncluded(flags);
  });

  const allRanges = matches.map((match) => ({ start: match.originalStart, end: match.originalEnd }));
  const includedRanges = allRanges.filter((_, index) => included[index] === true);
  const baseSimilarity = coveragePercentage(text.length, allRanges);
  const adjustedSimilarity = coveragePercentage(text.length, includedRanges);

  return {
    scores: {
      similarity: Math.round(adjustedSimilarity * 10) / 10,
      ai: Math.round(aiScore * 10) / 10,
      adjustedSimilarity: Math.round(baseSimilarity * 10) / 10
    },
    baseScores: {
      similarity: Math.round(baseSimilarity * 10) / 10,
      ai: Math.round(aiScore * 10) / 10,
      adjustedSimilarity: Math.round(baseSimilarity * 10) / 10
    },
    included
  };
}

export function summarizeMatches(matches: ReadonlyArray<MatchDTO>): {
  exactWordCount: number;
  paraphraseWordCount: number;
  quoteWordCount: number;
  bibliographyWordCount: number;
} {
  let exactWordCount = 0;
  let paraphraseWordCount = 0;
  let quoteWordCount = 0;
  let bibliographyWordCount = 0;

  for (const match of matches) {
    if (match.excludedBy.quotes) {
      quoteWordCount += match.wordCount;
      continue;
    }
    if (match.excludedBy.bibliography) {
      bibliographyWordCount += match.wordCount;
      continue;
    }
    if (match.excludedBy.smallMatch) {
      continue;
    }
    if (match.kind === "EXACT") {
      exactWordCount += match.wordCount;
    } else {
      paraphraseWordCount += match.wordCount;
    }
  }

  return { exactWordCount, paraphraseWordCount, quoteWordCount, bibliographyWordCount };
}

export function aggregateSources(
  matches: ReadonlyArray<MatchDTO>,
  textLength: number
): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  const ranges = new Map<string, TextRange[]>();

  for (const match of matches) {
    const key = `${match.sourceType}:${match.sourceUrl ?? match.sourceTitle ?? match.id}`;
    const existing = groups.get(key);
    const groupRanges = ranges.get(key) ?? [];
    groupRanges.push({ start: match.originalStart, end: match.originalEnd });
    ranges.set(key, groupRanges);
    if (existing) {
      existing.matchIds.push(match.id);
      existing.wordCount += match.wordCount;
      existing.kinds = Array.from(new Set([...existing.kinds, match.kind]));
      if (match.matchedText.length > existing.previewText.length) {
        existing.previewText = match.matchedText;
      }
      continue;
    }
    groups.set(key, {
      key,
      sourceUrl: match.sourceUrl,
      sourceTitle: match.sourceTitle,
      sourceType: match.sourceType,
      matchIds: [match.id],
      percentage: match.similarityPercentage,
      wordCount: match.wordCount,
      previewText: match.matchedText,
      kinds: [match.kind]
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      percentage: Math.round(coveragePercentage(textLength, ranges.get(group.key) ?? []) * 10) / 10
    }))
    .sort((left, right) => right.percentage - left.percentage);
}

export function scoreBand(score: number): "green" | "amber" | "red" {
  if (score < 20) {
    return "green";
  }
  if (score < 45) {
    return "amber";
  }
  return "red";
}

export function aiBand(score: number): "green" | "amber" | "red" {
  if (score < 20) {
    return "green";
  }
  if (score < 60) {
    return "amber";
  }
  return "red";
}

export function gradeClass(score: number): string {
  if (score < 20) {
    return "grade-1";
  }
  if (score < 45) {
    return "grade-2";
  }
  if (score < 70) {
    return "grade-3";
  }
  return "grade-4";
}

export function wordCountOf(text: string): number {
  return countWordsFromText(text);
}
