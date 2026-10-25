import { describe, it, expect } from "vitest";
import { renderReportPdf } from "./reportPdf";
import type { ReportDTO } from "./types";

const report: ReportDTO = {
  id: "test-submission-id",
  title: "Energy Policy Capstone",
  status: "COMPLETED",
  createdAt: new Date(0).toISOString(),
  authorName: "Test Student",
  assignmentTitle: "Energy Policy Capstone Assignment",
  text: "Grid operators finance transmission and storage capacity to keep supply aligned.",
  error: null,
  scores: { similarity: 42.5, ai: 7, adjustedSimilarity: 42.5 },
  baseScores: { similarity: 50, ai: 7, adjustedSimilarity: 50 },
  filters: { excludeQuotes: true, excludeBibliography: true, minMatchWords: 10 },
  matches: [
    {
      id: "m1",
      sourceType: "INTERNET",
      sourceUrl: "https://example.com/doc",
      sourceTitle: "Doc",
      kind: "EXACT",
      similarityPercentage: 1,
      semanticScore: null,
      matchedText: "transmission and storage capacity",
      originalStart: 22,
      originalEnd: 32,
      wordCount: 5,
      excludedBy: { quotes: false, bibliography: false, smallMatch: false }
    }
  ],
  sources: [
    {
      key: "https://example.com/doc",
      sourceUrl: "https://example.com/doc",
      sourceTitle: "Doc",
      sourceType: "INTERNET",
      matchIds: ["m1"],
      percentage: 42.5,
      wordCount: 5,
      previewText: "transmission and storage capacity",
      kinds: ["EXACT"]
    }
  ],
  ai: {
    overallScore: 7,
    perplexity: 31,
    burstiness: 0.4,
    meanSentenceLength: 12,
    sentenceScores: [],
    provider: "local-heuristic",
    model: "veritas-lexical-v1",
    unavailableReason: undefined
  },
  exclusions: [{ start: 0, end: 10, reason: "quote", label: "Quoted material" }],
  findings: [],
  stats: {
    wordCount: 90,
    characterCount: 500,
    exactWordCount: 5,
    paraphraseWordCount: 0,
    quoteWordCount: 0,
    bibliographyWordCount: 0,
    sourceCount: 1,
    matchCount: 1
  }
};

describe("reportPdf", () => {
  it("renders a valid PDF with plausible size", async () => {
    const bytes = await renderReportPdf(report);
    const text = Buffer.from(bytes).subarray(0, 5).toString("latin1");
    expect(text).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
