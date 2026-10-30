import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { sanitizeText } from "./antiEvasion";
import { buildExclusionRanges } from "./citationParser";
import {
  countWords,
  fingerprintDocument,
  groupMatchedRanges
} from "./winnowing";
import { analyzeAiWriting } from "./aiDetector";
import {
  buildEmbeddingPayload,
  chunkDocument,
  embedText,
  getVectorStore,
  semanticThreshold
} from "./vectorStore";
import {
  DEFAULT_FILTERS,
  coveragePercentage,
  isMatchIncluded,
  matchExclusions
} from "./scoring";
import type {
  AnalysisResult,
  AntiEvasionFinding,
  ExclusionRange,
  MatchKind,
  SourceType
} from "./types";

const FINGERPRINT_K = 12;
const FINGERPRINT_WINDOW = 10;
const MIN_MATCH_WORDS = 6;
const MAX_EXACT_MATCH_CHARS = 20_000;
const MAX_SEMANTIC_CHUNKS = 160;

interface CandidateMeta {
  id: string;
  title: string;
  cleanText: string;
  corpusType: SourceType | null;
  corpusUrl: string | null;
  corpusTitle: string | null;
}

interface DraftMatch {
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceType: SourceType;
  kind: MatchKind;
  similarityPercentage: number;
  semanticScore: number | null;
  matchedText: string;
  sourceText: string | null;
  originalStart: number;
  originalEnd: number;
  wordCount: number;
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function expandToWordBounds(
  text: string,
  range: { start: number; end: number }
): { start: number; end: number } {
  let start = Math.max(0, range.start);
  let end = Math.min(text.length, range.end);
  const wordCharacter = /[\p{L}\p{N}'’-]/u;
  while (start > 0 && wordCharacter.test(text.charAt(start - 1))) {
    start -= 1;
  }
  while (end < text.length && wordCharacter.test(text.charAt(end))) {
    end += 1;
  }
  return { start, end };
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


function overlapRatio(
  a: { start: number; end: number },
  b: { start: number; end: number }
): number {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  if (end <= start) {
    return 0;
  }
  return (end - start) / Math.max(1, a.end - a.start);
}

async function loadCandidateFingerprints(
  hashes: readonly bigint[],
  submissionId: string
): Promise<Map<string, Set<string>>> {
  const bySubmission = new Map<string, Set<string>>();
  const uniqueHashes = Array.from(new Set(hashes.map((hash) => hash.toString())));

  for (const group of chunkArray(uniqueHashes, 700)) {
    const values = group.map((hash) => BigInt(hash));
    const rows = await prisma.fingerprint.findMany({
      where: {
        hash: { in: values },
        submissionId: { not: submissionId }
      },
      select: { hash: true, submissionId: true },
      take: 20_000
    });
    for (const row of rows) {
      const key = row.hash.toString();
      const existing = bySubmission.get(row.submissionId);
      if (existing) {
        existing.add(key);
      } else {
        bySubmission.set(row.submissionId, new Set([key]));
      }
    }
  }

  // Cross-institution peers: hashed fingerprint sets mirrored from the hub.
  for (const group of chunkArray(uniqueHashes, 300)) {
    const values = group.map((hash) => BigInt(hash));
    const peerRows = await prisma.peerDoc.findMany({
      where: { hashes: { hasSome: values } },
      select: { docKey: true, hashes: true },
      take: 1000
    });
    for (const row of peerRows) {
      const key = `peer:${row.docKey}`;
      const existing = bySubmission.get(key);
      if (existing) {
        continue;
      }
      bySubmission.set(key, new Set(row.hashes.map((hash) => hash.toString())));
    }
  }

  return bySubmission;
}

async function loadCandidateMetadata(ids: readonly string[]): Promise<Map<string, CandidateMeta>> {
  const result = new Map<string, CandidateMeta>();
  if (ids.length === 0) {
    return result;
  }
  const localIds = ids.filter((id) => !id.startsWith("peer:"));
  const rows = await prisma.submission.findMany({
    where: { id: { in: [...localIds] } },
    select: {
      id: true,
      title: true,
      cleanText: true,
      corpusType: true,
      corpusUrl: true,
      corpusTitle: true
    }
  });
  for (const row of rows) {
    result.set(row.id, {
      id: row.id,
      title: row.title,
      cleanText: row.cleanText,
      corpusType: row.corpusType,
      corpusUrl: row.corpusUrl,
      corpusTitle: row.corpusTitle
    });
  }

  const peerIds = ids.filter((id) => id.startsWith("peer:")).map((id) => id.slice("peer:".length));
  if (peerIds.length > 0) {
    const peerRows = await prisma.peerDoc.findMany({
      where: { docKey: { in: peerIds } },
      select: { docKey: true, title: true, url: true, sourceType: true }
    });
    for (const row of peerRows) {
      const sourceType = (["INTERNET", "PUBLICATION", "REPOSITORY"].includes(row.sourceType)
        ? row.sourceType
        : "REPOSITORY") as SourceType;
      result.set(`peer:${row.docKey}`, {
        id: `peer:${row.docKey}`,
        title: row.title,
        cleanText: "",
        corpusType: sourceType,
        corpusUrl: row.url,
        corpusTitle: row.title
      });
    }
  }
  return result;
}

async function indexSubmissionVector(
  submissionId: string,
  title: string,
  text: string,
  sourceType: SourceType,
  url: string | null
): Promise<void> {
  const store = getVectorStore();
  const chunks = chunkDocument(text).slice(0, 400);
  if (chunks.length === 0) {
    return;
  }
  const points = chunks.map((chunk) =>
    buildEmbeddingPayload(submissionId, title, url, sourceType, text, chunk)
  );
  await store.upsert(points);
}

export async function analyzeSubmission(submissionId: string): Promise<AnalysisResult> {
  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!submission) {
    throw new Error("Submission not found.");
  }

  await prisma.submission.update({
    where: { id: submissionId },
    data: { status: "PROCESSING", error: null }
  });

  try {
    const sanitized = sanitizeText(submission.rawText || submission.cleanText);
    const cleanText = sanitized.sanitizedText;
    if (countWords(cleanText) < 20) {
      throw new Error("Submission must contain at least 20 words for analysis.");
    }

    const exclusions: ExclusionRange[] = buildExclusionRanges(cleanText);
    const findings: AntiEvasionFinding[] = sanitized.findings;
    const totalWords = Math.max(1, countWords(cleanText));
    const fingerprintResult = fingerprintDocument(cleanText, {
      k: FINGERPRINT_K,
      windowSize: FINGERPRINT_WINDOW
    });

    const candidateHashes = await loadCandidateFingerprints(
      fingerprintResult.fingerprints.map((fingerprint) => fingerprint.hash),
      submissionId
    );
    const candidateMeta = await loadCandidateMetadata(Array.from(candidateHashes.keys()));

    const matches: DraftMatch[] = [];

    for (const [candidateId, hashes] of candidateHashes) {
      const meta = candidateMeta.get(candidateId);
      if (!meta) {
        continue;
      }
      const presence = new Map<string, number[]>();
      for (const hash of hashes) {
        presence.set(hash, [0]);
      }
      const ranges = groupMatchedRanges(fingerprintResult.fingerprints, presence, FINGERPRINT_K);

      for (const rawRange of ranges) {
        const range = expandToWordBounds(cleanText, rawRange);
        const matchedText = cleanText.slice(range.start, range.end);
        const wordCount = countWords(matchedText);
        if (wordCount < MIN_MATCH_WORDS) {
          continue;
        }
        matches.push({
          sourceUrl: meta.corpusUrl,
          sourceTitle: meta.corpusTitle ?? meta.title,
          sourceType: meta.corpusType ?? "REPOSITORY",
          kind: "EXACT",
          similarityPercentage: round((wordCount / totalWords) * 100),
          semanticScore: null,
          matchedText: matchedText.slice(0, MAX_EXACT_MATCH_CHARS),
          sourceText: null,
          originalStart: range.start,
          originalEnd: range.end,
          wordCount
        });
      }
    }

    const semanticCandidates = await semanticMatches(
      submissionId,
      cleanText,
      totalWords,
      matches,
      exclusions
    );

    for (const match of semanticCandidates) {
      matches.push(match);
    }

    const ai = await analyzeAiWriting(cleanText);

    const scored = matches.map((match) => ({
      ...match,
      excludedBy: matchExclusions(match, exclusions, DEFAULT_FILTERS)
    }));
    const includedRanges = scored
      .filter((match) => isMatchIncluded(match.excludedBy))
      .map((match) => ({ start: match.originalStart, end: match.originalEnd }));
    const similarityScore = round(coveragePercentage(cleanText.length, includedRanges));
    const wordCount = countWords(cleanText);

    await prisma.$transaction(async (tx) => {
      await tx.match.deleteMany({ where: { submissionId } });
      await tx.fingerprint.deleteMany({ where: { submissionId } });
      await tx.aiAnalysisResult.deleteMany({ where: { submissionId } });

      if (scored.length > 0) {
        await tx.match.createMany({
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
      }

      for (const group of chunkArray(fingerprintResult.fingerprints, 4000)) {
        await tx.fingerprint.createMany({
          data: group.map((fingerprint) => ({
            submissionId,
            hash: fingerprint.hash,
            position: fingerprint.position
          }))
        });
      }

      if (ai.sentenceScores.length > 0) {
        await tx.aiAnalysisResult.create({
          data: {
            submissionId,
            overallScore: ai.overallScore,
            perplexity: ai.perplexity,
            burstiness: ai.burstiness,
            provider: ai.provider,
            model: ai.model,
            sentenceScores: ai.sentenceScores as unknown as Prisma.InputJsonValue
          }
        });
      }

      await tx.submission.update({
        where: { id: submissionId },
        data: {
          cleanText,
          wordCount,
          characterCount: cleanText.length,
          similarityScore,
          aiScore: ai.overallScore,
          status: "COMPLETED",
          error: null,
          evasionFindings: JSON.parse(JSON.stringify(findings)) as unknown as object
        }
      });
    });

    try {
      await indexSubmissionVector(
        submissionId,
        submission.corpusTitle ?? submission.title,
        cleanText,
        submission.corpusType ?? "REPOSITORY",
        submission.corpusUrl
      );
    } catch {
      void 0;
    }

    return {
      similarityScore,
      aiScore: ai.overallScore,
      cleanText,
      wordCount,
      characterCount: cleanText.length,
      matches: scored.map((match) => ({
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
      })),
      fingerprints: fingerprintResult.fingerprints.map((fingerprint) => ({
        hash: fingerprint.hash,
        position: fingerprint.position
      })),
      ai,
      exclusions,
      findings
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed.";
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "FAILED", error: message }
    });
    throw error;
  }
}

async function semanticMatches(
  submissionId: string,
  cleanText: string,
  totalWords: number,
  exactMatches: readonly DraftMatch[],
  exclusions: readonly ExclusionRange[]
): Promise<DraftMatch[]> {
  const threshold = semanticThreshold();
  const store = getVectorStore();
  const chunks = chunkDocument(cleanText, 60).slice(0, MAX_SEMANTIC_CHUNKS);
  if (chunks.length === 0) {
    return [];
  }

  const quoteRanges = exclusions.filter(
    (exclusion) => exclusion.reason === "quote" || exclusion.reason === "bibliography"
  );
  const results: DraftMatch[] = [];
  const acceptedRanges: Array<{ start: number; end: number }> = [];

  for (const chunk of chunks) {
    if (
      exactMatches.some(
        (match) =>
          overlapRatio(chunk, { start: match.originalStart, end: match.originalEnd }) >= 0.4
      )
    ) {
      continue;
    }
    if (quoteRanges.some((range) => overlapRatio(chunk, range) >= 0.2)) {
      continue;
    }
    const hits = await store.search(embedText(chunk.text), 4);
    for (const hit of hits) {
      if (hit.score < threshold) {
        continue;
      }
      if (hit.payload.submissionId === submissionId) {
        continue;
      }
      if (acceptedRanges.some((range) => overlapRatio(chunk, range) >= 0.35)) {
        continue;
      }
      if (lexicalOverlap(chunk.text, hit.payload.text) < 0.25) {
        continue;
      }
      const wordCount = countWords(chunk.text);
      if (wordCount < MIN_MATCH_WORDS * 2) {
        continue;
      }
      acceptedRanges.push({ start: chunk.start, end: chunk.end });
      results.push({
        sourceUrl: hit.payload.url,
        sourceTitle: hit.payload.title,
        sourceType: (hit.payload.sourceType as SourceType) ?? "REPOSITORY",
        kind: "PARAPHRASE",
        similarityPercentage: round((wordCount / totalWords) * 100),
        semanticScore: round(hit.score, 3),
        matchedText: chunk.text,
        sourceText: hit.payload.text,
        originalStart: chunk.start,
        originalEnd: chunk.end,
        wordCount
      });
      break;
    }
  }

  return results;
}
