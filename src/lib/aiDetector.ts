import type { AiAnalysis, AiDetectorResponse, AiLabel, SentenceScore } from "./types";

interface SentenceSpan {
  sentence: string;
  start: number;
  end: number;
}

const SENTENCE_PATTERN = /[^.!?\n]+[.!?]+["')\]]*|[^.!?\n]+$/gu;
const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

export function splitSentences(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  SENTENCE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SENTENCE_PATTERN.exec(text)) !== null) {
    const raw = match[0];
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const start = match.index + leading;
    const words = trimmed.match(WORD_PATTERN) ?? [];
    if (words.length < 3) {
      continue;
    }
    spans.push({ sentence: trimmed, start, end: start + trimmed.length });
  }

  return spans;
}

function sentenceLabel(probability: number): AiLabel {
  if (probability < 0.45) {
    return "human";
  }
  if (probability < 0.7) {
    return "mixed";
  }
  return "ai";
}

function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function heuristicAiAnalysis(text: string, reason?: string): AiAnalysis {
  const spans = splitSentences(text);
  if (spans.length === 0) {
    return {
      overallScore: 0,
      perplexity: 0,
      burstiness: 0,
      meanSentenceLength: 0,
      sentenceScores: [],
      provider: "local-heuristic",
      model: "veritas-lexical-v1",
      unavailableReason: reason ?? "Text is too short for AI writing analysis."
    };
  }

  const lengths = spans.map((span) => (span.sentence.match(WORD_PATTERN) ?? []).length);
  const meanLength = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, value) => sum + (value - meanLength) ** 2, 0) / lengths.length;
  const standardDeviation = Math.sqrt(variance);
  const burstiness = meanLength > 0 ? standardDeviation / meanLength : 0;

  const allWords = text.toLowerCase().match(WORD_PATTERN) ?? [];
  const frequencies = new Map<string, number>();
  for (const word of allWords) {
    frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  }
  const uniqueRatio = allWords.length > 0 ? frequencies.size / allWords.length : 1;

  let logLikelihood = 0;
  for (const word of allWords) {
    const frequency = frequencies.get(word) ?? 1;
    logLikelihood += Math.log(frequency / Math.max(1, allWords.length));
  }
  const perplexity = allWords.length > 0 ? Math.exp(-logLikelihood / allWords.length) : 0;

  const uniformity = 1 / (1 + burstiness * 2.2);
  const lexicalFlatness = 1 - Math.min(1, uniqueRatio * 1.8);
  const repetition = 1 - Math.min(1, frequencies.size / Math.max(1, Math.sqrt(allWords.length) * 8));

  const overall = Math.min(
    100,
    Math.max(
      0,
      (uniformity * 0.42 + lexicalFlatness * 0.38 + repetition * 0.2) * 118 - 12
    )
  );

  const sentenceScores: SentenceScore[] = spans.map((span) => {
    const words = (span.sentence.match(WORD_PATTERN) ?? []).map((word) => word.toLowerCase());
    const localUnique = words.length > 0 ? new Set(words).size / words.length : 1;
    const localFrequencies = words.map((word) => frequencies.get(word) ?? 1);
    const averageFrequency =
      localFrequencies.reduce((sum, value) => sum + value, 0) / Math.max(1, localFrequencies.length);
    const lengthDeviation =
      meanLength > 0 ? Math.abs(words.length - meanLength) / Math.max(1, meanLength) : 0;
    const probability = Math.min(
      0.97,
      Math.max(
        0.03,
        0.5 +
          (1 - localUnique) * 0.35 +
          Math.min(0.25, averageFrequency / 12) -
          Math.min(0.3, lengthDeviation * 0.5)
      )
    );
    return {
      sentence: span.sentence,
      start: span.start,
      end: span.end,
      aiProbability: round(probability, 3),
      label: sentenceLabel(probability)
    };
  });

  return {
    overallScore: round(overall),
    perplexity: round(perplexity, 1),
    burstiness: round(burstiness, 2),
    meanSentenceLength: round(meanLength, 1),
    sentenceScores,
    provider: "local-heuristic",
    model: "veritas-lexical-v1",
    unavailableReason: reason
  };
}

function isDetectorResponse(value: unknown): value is AiDetectorResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.overall_score === "number" &&
    typeof candidate.perplexity === "number" &&
    typeof candidate.burstiness === "number" &&
    Array.isArray(candidate.sentence_scores)
  );
}

export async function analyzeAiWriting(text: string): Promise<AiAnalysis> {
  const engineUrl = process.env.AI_ENGINE_URL;
  if (!engineUrl || text.trim().length < 120) {
    return heuristicAiAnalysis(
      text,
      text.trim().length < 120 ? "Text is too short for model-based AI detection." : undefined
    );
  }

  try {
    const response = await fetch(`${engineUrl.replace(/\/$/u, "")}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, model: process.env.AI_ENGINE_MODEL ?? "gpt2" }),
      signal: AbortSignal.timeout(25_000)
    });

    if (!response.ok) {
      return heuristicAiAnalysis(text, `AI engine responded with status ${response.status}.`);
    }

    const payload: unknown = await response.json();
    if (!isDetectorResponse(payload)) {
      return heuristicAiAnalysis(text, "AI engine returned an unexpected payload.");
    }

    const sentenceScores: SentenceScore[] = payload.sentence_scores.map((score) => ({
      sentence: score.sentence,
      start: Math.max(0, score.start_index),
      end: Math.max(score.start_index + 1, score.end_index),
      aiProbability: Math.min(1, Math.max(0, score.ai_probability)),
      label: score.label
    }));

    return {
      overallScore: round(Math.min(100, Math.max(0, payload.overall_score))),
      perplexity: round(payload.perplexity, 1),
      burstiness: round(payload.burstiness, 2),
      meanSentenceLength: round(payload.mean_sentence_length ?? 0, 1),
      sentenceScores,
      provider: payload.provider ?? "python-engine",
      model: payload.model ?? process.env.AI_ENGINE_MODEL ?? "gpt2"
    };
  } catch {
    return heuristicAiAnalysis(text, "AI engine unavailable; lexical fallback applied.");
  }
}
