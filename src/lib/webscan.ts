import { prisma } from "@/lib/prisma";
import {
  buildQueriesFromSentences,
  fetchCandidateText,
  searchAllEngines,
  type WebCandidate
} from "@/lib/websearch";
import { buildExclusionRanges } from "@/lib/citationParser";
import { countWords, fingerprintDocument } from "@/lib/winnowing";
import { embedText, cosineSimilarity } from "@/lib/vectorStore";
import { DEFAULT_FILTERS, coveragePercentage, isMatchIncluded, matchExclusions } from "@/lib/scoring";
import { splitSentences } from "@/lib/aiDetector";
import type { SourceType } from "@/lib/types";

export interface WebScanSummary {
  submissionId: string;
  queries: string[];
  sourcesFetched: number;
  sourcesBlocked: number;
  newMatches: number;
  webSources: number;
  corpusStored: number;
  similarityScore: number;
  durationMs: number;
}

const SCAN_SENTENCE_LIMIT = 8;
const CANDIDATE_LIMIT = 18;
const PER_DOMAIN_LIMIT = 3;
const MIN_SENTENCE_WORDS = 12;
const MAX_FETCH_CHARS = 120_000;
const PARAPHRASE_MIN = 0.62;
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function contentWords(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).slice(0, 400));
}

function lexicalOverlap(left: string, right: string): number {
  const leftWords = contentWords(left);
  const rightWords = contentWords(right);
  if (leftWords.size === 0 || rightWords.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) {
      intersection += 1;
    }
  }
  return intersection / Math.min(leftWords.size, rightWords.size);
}

async function runWebScan(submissionId: string, budgetMs = 180_000): Promise<WebScanSummary> {
  const started = Date.now();
  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!submission) {
    throw new Error("Submission not found.");
  }
  if (countWords(submission.cleanText) < 30) {
    throw new Error("Submission is too short for a web scan.");
  }

  const existingMatches = await prisma.match.findMany({ where: { submissionId } });
  const covered = new Set<string>();
  for (const match of existingMatches) {
    for (let position = match.originalStart; position < match.originalEnd; position += 50) {
      covered.add(Math.floor(position / 50).toString());
    }
  }

  const exclusions = buildExclusionRanges(submission.cleanText);
  const sentenceSpans = splitSentences(submission.cleanText);
  const probeSentences = sentenceSpans
    .map((span) => ({
      text: submission.cleanText.slice(span.start, span.end).trim(),
      start: span.start,
      end: span.end
    }))
    .filter((sentence) => countWords(sentence.text) >= MIN_SENTENCE_WORDS)
    .filter((sentence) => {
      // Prefer sentences not fully covered by existing matches.
      let coveredLength = 0;
      for (let position = sentence.start; position < sentence.end; position += 50) {
        if (covered.has(Math.floor(position / 50).toString())) {
          coveredLength += 50;
        }
      }
      return coveredLength < (sentence.end - sentence.start) * 0.4;
    })
    .sort((left, right) => (right.end - right.start) - (left.end - left.start))
    .slice(0, SCAN_SENTENCE_LIMIT);

  if (probeSentences.length === 0) {
    return {
      submissionId,
      queries: [],
      sourcesFetched: 0,
      sourcesBlocked: 0,
      newMatches: 0,
      webSources: 0,
      corpusStored: 0,
      similarityScore: submission.similarityScore,
      durationMs: Date.now() - started
    };
  }

  const queries = buildQueriesFromSentences(probeSentences.map((sentence) => sentence.text), 4);
  const candidates = await searchAllEngines(queries);
  const bounded = new Map<string, number>();
  const uniqueCandidates: WebCandidate[] = [];
  for (const candidate of candidates) {
    let domain: string;
    try {
      domain = new URL(candidate.url).hostname.toLowerCase();
    } catch {
      continue;
    }
    const seen = bounded.get(domain) ?? 0;
    if (seen >= PER_DOMAIN_LIMIT) {
      continue;
    }
    bounded.set(domain, seen + 1);
    uniqueCandidates.push(candidate);
    if (uniqueCandidates.length >= CANDIDATE_LIMIT) {
      break;
    }
  }

  let sourcesFetched = 0;
  let sourcesBlocked = 0;
  let corpusStored = 0;
  const newMatches: Array<{
    sourceUrl: string | null;
    sourceTitle: string;
    sourceType: SourceType;
    kind: "EXACT" | "PARAPHRASE";
    similarityPercentage: number;
    semanticScore: number | null;
    matchedText: string;
    sourceText: string;
    originalStart: number;
    originalEnd: number;
    wordCount: number;
  }> = [];
  const totalWords = Math.max(1, countWords(submission.cleanText));
  const usedRanges: Array<{ start: number; end: number }> = [];

  for (const candidate of uniqueCandidates) {
    if (Date.now() - started > budgetMs) {
      break;
    }
    let fetched: { text: string; blocked: boolean };
    try {
      fetched = await fetchCandidateText(candidate);
    } catch {
      fetched = { text: "", blocked: true };
    }
    if (!fetched.text || fetched.text.length < 200) {
      if (fetched.blocked) {
        sourcesBlocked += 1;
      }
      continue;
    }
    sourcesFetched += 1;
    const fullText = fetched.text.slice(0, 60_000);
    const candidateText = fetched.text.slice(0, MAX_FETCH_CHARS);
    const candidateNormalized = normalizeForMatch(candidateText);
    const candidateEmbedding = embedText(candidateText.slice(0, 6000));

    for (const sentence of probeSentences) {
      if (usedRanges.some((range) => range.start < sentence.end && range.end > sentence.start)) {
        continue;
      }
      const sentenceNormalized = normalizeForMatch(sentence.text);
      if (!sentenceNormalized || sentenceNormalized.length < 30) {
        continue;
      }
      const isExact = candidateNormalized.includes(sentenceNormalized);
      const cos = cosineSimilarity(embedText(sentence.text), candidateEmbedding);
      const isParaphrase = !isExact && cos >= PARAPHRASE_MIN && lexicalOverlap(sentence.text, fullText) >= 0.25;
      if (!isExact && !isParaphrase) {
        continue;
      }
      const sourceType: SourceType =
        candidate.engine === "pubmed" || candidate.engine === "arxiv" || candidate.engine === "crossref" || candidate.engine === "books"
          ? "PUBLICATION"
          : "INTERNET";
      usedRanges.push({ start: sentence.start, end: sentence.end });
      newMatches.push({
        sourceUrl: candidate.url,
        sourceTitle: candidate.title.slice(0, 260) || candidate.url.slice(0, 260),
        sourceType,
        kind: isExact ? "EXACT" : "PARAPHRASE",
        similarityPercentage: Math.round((countWords(sentence.text) / totalWords) * 1000) / 10,
        semanticScore: isExact ? null : Math.round(cos * 1000) / 1000,
        matchedText: sentence.text.slice(0, 2000),
        sourceText: candidateText.slice(0, 2000),
        originalStart: sentence.start,
        originalEnd: sentence.end,
        wordCount: countWords(sentence.text)
      });
      break;
    }

    // Grow the local index with every fetched page (Turnitin-style repository).
    try {
      const seen = await prisma.submission.findFirst({ where: { corpusUrl: candidate.url }, select: { id: true } });
      if (!seen && countWords(candidateText) >= 120) {
        const fingerprintResult = fingerprintDocument(candidateText, { k: 12, windowSize: 10 });
        const created = await prisma.submission.create({
          data: {
            title: `[Web] ${candidate.title}`.slice(0, 240),
            rawText: candidateText,
            cleanText: candidateText,
            wordCount: countWords(candidateText),
            characterCount: candidateText.length,
            status: "COMPLETED",
            corpusType:
              candidate.engine === "pubmed" || candidate.engine === "arxiv" || candidate.engine === "crossref" || candidate.engine === "books"
                ? "PUBLICATION"
                : "INTERNET",
            corpusUrl: candidate.url,
            corpusTitle: candidate.title.slice(0, 250),
            similarityScore: 0,
            aiScore: 0
          }
        });
        const fpGroup = fingerprintResult.fingerprints.slice(0, 40_000);
        for (let offset = 0; offset < fpGroup.length; offset += 4000) {
          await prisma.fingerprint.createMany({
            data: fpGroup.slice(offset, offset + 4000).map((fp) => ({
              submissionId: created.id,
              hash: fp.hash,
              position: fp.position
            }))
          });
        }
        corpusStored += 1;
      }
    } catch {
      // corpus storage is best-effort
    }
  }

  let similarityScore = submission.similarityScore;
  if (newMatches.length > 0) {
    const scored = newMatches.map((match) => ({
      ...match,
      excludedBy: matchExclusions(match as never, exclusions, DEFAULT_FILTERS)
    }));
    await prisma.match.createMany({
      data: scored.map((match) => ({
        submissionId,
        sourceUrl: match.sourceUrl,
        sourceTitle: match.sourceTitle,
        sourceType: match.sourceType,
        kind: match.kind,
        similarityPercentage: match.similarityPercentage,
        semanticScore: match.semanticScore,
        matchedText: match.matchedText,
        sourceText: match.sourceText,
        originalStart: match.originalStart,
        originalEnd: match.originalEnd,
        wordCount: match.wordCount
      }))
    });

    const allMatches = [
      ...existingMatches.map((match) => ({
        sourceType: match.sourceType as SourceType,
        originalStart: match.originalStart,
        originalEnd: match.originalEnd
      })),
      ...scored.map((match) => ({ sourceType: match.sourceType, originalStart: match.originalStart, originalEnd: match.originalEnd }))
    ];
    const allExclusions = buildExclusionRanges(submission.cleanText);
    const included = allMatches
      .filter((match) => isMatchIncluded(matchExclusions(match as never, allExclusions, DEFAULT_FILTERS)))
      .map((match) => ({ start: match.originalStart, end: match.originalEnd }));
    similarityScore = Math.round(coveragePercentage(submission.cleanText.length, included) * 10) / 10;
    await prisma.submission.update({ where: { id: submissionId }, data: { similarityScore } });
  }

  return {
    submissionId,
    queries,
    sourcesFetched,
    sourcesBlocked,
    newMatches: newMatches.length,
    webSources: uniqueCandidates.length,
    corpusStored,
    similarityScore,
    durationMs: Date.now() - started
  };
}

export { runWebScan };
