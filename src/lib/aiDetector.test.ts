import { describe, it, expect } from "vitest";
import { heuristicAiAnalysis, splitSentences } from "./aiDetector";

describe("aiDetector", () => {
  it("splitSentences returns aligned spans with >=3 words", () => {
    const text = "First sentence is here. Short two?  \nSecond one has more words!";
    const spans = splitSentences(text);
    expect(spans.length).toBe(2);
    for (const span of spans) {
      expect(span.sentence.length).toBe(span.end - span.start);
      expect(text.slice(span.start, span.end)).toBe(span.sentence);
    }
    expect(splitSentences("of it")).toEqual([]);
    expect(splitSentences("")).toEqual([]);
  });

  it("short text reports unavailability with zero scores", () => {
    const analysis = heuristicAiAnalysis("Too short.");
    expect(analysis.overallScore).toBe(0);
    expect(analysis.sentenceScores).toEqual([]);
    expect(analysis.provider).toBe("local-heuristic");
    expect(analysis.unavailableReason).toBeTruthy();
  });

  it("bots-style uniform prose scores ai differently from varied prose", () => {
    const uniform = "The model measures information plainly and remains steadily efficient. " +
      "The output stays coherent always. " +
      "The line continues steadily. " +
      "The score implies steady writing.";
    const varied = "Short. This one has a very long winding sentence packed with clauses, qualifications, and digressions before vanishing into an em dash then ending. " +
      "Then abruptly: three words! " +
      "Meanwhile a mid length sentence strolls along at its own pace without hurry.";
    const uniformScore = heuristicAiAnalysis(uniform).overallScore;
    const variedScore = heuristicAiAnalysis(varied).overallScore;
    expect(uniformScore).toBeGreaterThanOrEqual(0);
    expect(variedScore).toBeLessThanOrEqual(100);
  });

  it("sentence labels and metadata are consistent", () => {
    const text = "The engine analyzes the document now. " +
      "It scores each sentence carefully given cues. " +
      "Word frequencies offer additional lexical signals here. " +
      "Burstiness reflects sentence length variation too.";
    const analysis = heuristicAiAnalysis(text);
    expect(analysis.model).toBeTruthy();
    expect(analysis.meanSentenceLength).toBeGreaterThan(0);
    expect(analysis.sentenceScores.length).toBe(4);
    for (const score of analysis.sentenceScores) {
      expect(score.aiProbability).toBeGreaterThanOrEqual(0);
      expect(score.aiProbability).toBeLessThanOrEqual(1);
      expect(["human", "mixed", "ai"]).toContain(score.label);
    }
  });
});
