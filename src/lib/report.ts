import { heuristicAiAnalysis } from "./aiDetector";
import { buildExclusionRanges } from "./citationParser";
import { prisma } from "./prisma";
import {
  DEFAULT_FILTERS,
  aggregateSources,
  coveragePercentage,
  isMatchIncluded,
  matchExclusions,
  normalizeFilters,
  summarizeMatches
} from "./scoring";
import type {
  AiAnalysis,
  AntiEvasionFinding,
  ExclusionRange,
  MatchDTO,
  MatchKind,
  ReportDTO,
  ReportFilters,
  SentenceScore,
  SourceType
} from "./types";

export async function buildReport(
  submissionId: string,
  filterInput?: Partial<ReportFilters>
): Promise<ReportDTO | null> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      matches: { orderBy: { originalStart: "asc" } },
      aiResult: true,
      author: true,
      assignment: true
    }
  });

  if (!submission) {
    return null;
  }

  const text = submission.cleanText || submission.rawText;
  const exclusions: ExclusionRange[] = buildExclusionRanges(text);
  const filters = normalizeFilters(filterInput);
  const ai = buildAiAnalysis(submission.aiResult, text);
  const findings = Array.isArray(submission.evasionFindings)
    ? (submission.evasionFindings as unknown as AntiEvasionFinding[])
    : [];

  const matches: MatchDTO[] = submission.matches.map((match) => ({
    id: match.id,
    sourceUrl: match.sourceUrl,
    sourceTitle: match.sourceTitle,
    sourceType: match.sourceType as SourceType,
    kind: match.kind as MatchKind,
    similarityPercentage: match.similarityPercentage,
    semanticScore: match.semanticScore,
    matchedText: match.matchedText,
    sourceText: match.sourceText,
    originalStart: match.originalStart,
    originalEnd: match.originalEnd,
    wordCount: match.wordCount,
    excludedBy: matchExclusions(match, exclusions, filters)
  }));

  const includedMatches = matches.filter((match) => isMatchIncluded(match.excludedBy));
  const alreadyScored = matches.filter((match) => {
    const defaults = matchExclusions(match, exclusions, DEFAULT_FILTERS);
    return isMatchIncluded(defaults);
  });

  const baseSimilarity = coveragePercentage(
    text.length,
    matches.map((match) => ({ start: match.originalStart, end: match.originalEnd }))
  );
  const adjustedSimilarity = coveragePercentage(
    text.length,
    alreadyScored.map((match) => ({ start: match.originalStart, end: match.originalEnd }))
  );
  const filteredSimilarity = coveragePercentage(
    text.length,
    includedMatches.map((match) => ({ start: match.originalStart, end: match.originalEnd }))
  );

  const sources = aggregateSources(includedMatches, text.length);
  const summary = summarizeMatches(matches);

  return {
    id: submission.id,
    title: submission.title,
    status: submission.status,
    createdAt: submission.createdAt.toISOString(),
    authorName: submission.author?.name ?? null,
    assignmentTitle: submission.assignment?.title ?? null,
    text,
    error: submission.error,
    scores: {
      similarity: round(filteredSimilarity),
      ai: round(submission.aiScore),
      adjustedSimilarity: round(adjustedSimilarity)
    },
    baseScores: {
      similarity: round(baseSimilarity),
      ai: round(ai.overallScore),
      adjustedSimilarity: round(adjustedSimilarity)
    },
    filters,
    matches,
    sources,
    ai,
    exclusions,
    findings,
    stats: {
      wordCount: submission.wordCount,
      characterCount: submission.characterCount,
      exactWordCount: summary.exactWordCount,
      paraphraseWordCount: summary.paraphraseWordCount,
      quoteWordCount: summary.quoteWordCount,
      bibliographyWordCount: summary.bibliographyWordCount,
      sourceCount: sources.length,
      matchCount: includedMatches.length
    }
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildAiAnalysis(
  result: {
    overallScore: number;
    perplexity: number;
    burstiness: number;
    provider: string;
    model: string;
    sentenceScores: unknown;
  } | null,
  text: string
): AiAnalysis {
  if (!result) {
    return heuristicAiAnalysis(text, "No stored AI analysis is available for this submission.");
  }
  const sentenceScores = Array.isArray(result.sentenceScores)
    ? (result.sentenceScores as unknown as SentenceScore[])
    : [];
  const meanSentenceLength =
    sentenceScores.length > 0
      ? Math.round(
          (sentenceScores.reduce(
            (sum, sentence) => sum + sentence.sentence.split(/\s+/u).filter(Boolean).length,
            0
          ) /
            sentenceScores.length) *
            10
        ) / 10
      : 0;

  return {
    overallScore: result.overallScore,
    perplexity: result.perplexity,
    burstiness: result.burstiness,
    meanSentenceLength,
    sentenceScores,
    provider: result.provider,
    model: result.model
  };
}

export async function listRecentSubmissions(limit = 25): Promise<
  Array<{
    id: string;
    title: string;
    authorName: string | null;
    assignmentTitle: string | null;
    status: string;
    similarityScore: number;
    aiScore: number;
    wordCount: number;
    createdAt: string;
  }>
> {
  const rows = await prisma.submission.findMany({
    where: { authorId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: Math.min(100, Math.max(1, limit)),
    include: { author: true, assignment: true }
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    authorName: row.author?.name ?? null,
    assignmentTitle: row.assignment?.title ?? null,
    status: row.status,
    similarityScore: row.similarityScore,
    aiScore: row.aiScore,
    wordCount: row.wordCount,
    createdAt: row.createdAt.toISOString()
  }));
}

export async function getDashboardStats(): Promise<{
  submissions: number;
  averageSimilarity: number;
  averageAi: number;
  flaggedSources: number;
}> {
  const [count, aggregate, matches] = await Promise.all([
    prisma.submission.count({ where: { authorId: { not: null } } }),
    prisma.submission.aggregate({
      where: { authorId: { not: null }, status: "COMPLETED" },
      _avg: { similarityScore: true, aiScore: true }
    }),
    prisma.match.count()
  ]);

  return {
    submissions: count,
    averageSimilarity: round(aggregate._avg.similarityScore ?? 0),
    averageAi: round(aggregate._avg.aiScore ?? 0),
    flaggedSources: matches
  };
}
