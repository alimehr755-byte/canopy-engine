import { describe, it, expect } from "vitest";
import {
  DEFAULT_FILTERS,
  aggregateSources,
  computeScores,
  coveragePercentage,
  exclusionFlags,
  matchExclusions,
  normalizeFilters,
  isMatchIncluded,
  parseFilters,
  scoreBand,
  aiBand,
  unionCoverage,
  summarizeMatches
} from "./scoring";
import type { MatchDTO } from "./types";

function match(id: string, overrides: Partial<MatchDTO> = {}): MatchDTO {
  return {
    id,
    sourceType: "INTERNET",
    sourceUrl: "https://example.com/a",
    sourceTitle: "Source A",
    kind: "EXACT",
    similarityPercentage: 1,
    semanticScore: null,
    matchedText: "sample text",
    originalStart: 0,
    originalEnd: 10,
    wordCount: 2,
    excludedBy: { quotes: false, bibliography: false, smallMatch: false },
    ...overrides
  };
}

describe("scoring", () => {
  it("normalizeFilters clamps and defaults", () => {
    const filters = normalizeFilters({ minMatchWords: 500 });
    expect(filters.minMatchWords).toBe(100);
    expect(normalizeFilters(undefined)).toEqual(DEFAULT_FILTERS);
  });

  it("parseFilters reads searchParams sensibly", () => {
    const params = new URLSearchParams("minMatchWords=5");
    const filters = parseFilters(params);
    expect(filters.minMatchWords).toBe(5);
    expect(filters.excludeQuotes).toBe(true);
  });

  it("unionCoverage merges overlapping ranges", () => {
    expect(unionCoverage([{ start: 0, end: 10 }, { start: 5, end: 20 }, { start: 30, end: 40 }])).toBe(30);
    expect(unionCoverage([{ start: 5, end: 5 }])).toBe(0);
  });

  it("coveragePercentage respects text length and caps at 100", () => {
    expect(coveragePercentage(100, [{ start: 0, end: 25 }])).toBe(25);
    expect(coveragePercentage(10, [{ start: 0, end: 500 }])).toBe(100);
    expect(coveragePercentage(0, [{ start: 0, end: 10 }])).toBe(0);
  });

  it("matchExclusions honors flags and word thresholds", () => {
    const flags = exclusionFlags({ start: 0, end: 5 }, [{ start: 0, end: 5, reason: "quote", label: "Quote" }]);
    const exclusions = matchExclusions({ originalStart: 0, originalEnd: 5, wordCount: 2 }, [{ start: 0, end: 5, reason: "quote", label: "Quote" }], { ...DEFAULT_FILTERS, minMatchWords: 10 });
    expect(flags.quote).toBe(true);
    expect(exclusions.quotes).toBe(true);
    expect(exclusions.smallMatch).toBe(true);
    expect(isMatchIncluded(exclusions)).toBe(false);
    expect(isMatchIncluded({ quotes: false, bibliography: false, smallMatch: false })).toBe(true);
  });

  it("computeScores splits base vs adjusted", () => {
    const result = computeScores(
      "0123456789abcdef",
      [
        { originalStart: 0, originalEnd: 10, wordCount: 8, kind: "EXACT", sourceType: "INTERNET", sourceUrl: null, sourceTitle: null, similarityPercentage: 50 },
        { originalStart: 10, originalEnd: 16, wordCount: 20, kind: "PARAPHRASE", sourceType: "PUBLICATION", sourceUrl: null, sourceTitle: null, similarityPercentage: 25 }
      ],
      [],
      { ...DEFAULT_FILTERS, minMatchWords: 10 },
      12.4
    );
    expect(result.baseScores.similarity).toBe(100);
    expect(result.scores.similarity).toBe(37.5);
    expect(result.included).toEqual([false, true]);
    expect(result.scores.ai).toBeCloseTo(12.4);
  });

  it("aggregateSources groups and unions percentage", () => {
    const groups = aggregateSources(
      [
        match("1", { originalStart: 0, originalEnd: 50 }),
        match("2", { originalStart: 25, originalEnd: 75, sourceUrl: "https://example.com/a" })
      ],
      100
    );
    expect(groups.length).toBe(1);
    expect(groups[0]?.matchIds.length).toBe(2);
    expect(groups[0]?.percentage).toBe(75);
  });

  it("summarizeMatches bins kinds and exclusions", () => {
    const summary = summarizeMatches([
      match("1", { kind: "EXACT" }),
      match("2", { kind: "PARAPHRASE" }),
      match("3", { excludedBy: { quotes: true, bibliography: false, smallMatch: false } }),
      match("4", { excludedBy: { quotes: false, bibliography: true, smallMatch: false } }),
      match("5", { excludedBy: { quotes: false, bibliography: false, smallMatch: true } })
    ]);
    expect(summary.exactWordCount).toBe(2);
    expect(summary.paraphraseWordCount).toBe(2);
    expect(summary.quoteWordCount).toBe(2);
    expect(summary.bibliographyWordCount).toBe(2);
  });

  it("bands match thresholds", () => {
    expect(scoreBand(10)).toBe("green");
    expect(scoreBand(30)).toBe("amber");
    expect(scoreBand(90)).toBe("red");
    expect(aiBand(10)).toBe("green");
    expect(aiBand(50)).toBe("amber");
    expect(aiBand(90)).toBe("red");
  });
});
