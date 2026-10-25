import { describe, it, expect } from "vitest";
import {
  bibliographyStart,
  buildExclusionRanges,
  detectBibliography,
  detectCitationStyle,
  detectInlineCitations,
  detectQuotes,
  parseCitations,
  rangeIsExcluded
} from "./citationParser";

describe("citationParser", () => {
  it("detects curly and straight quotes with labels", () => {
    const curly = detectQuotes("He said \u201cgrid supply matters\u201d clearly.");
    expect(curly.length).toBe(1);
    expect(curly[0]?.reason).toBe("quote");
    expect(curly[0]?.label).toBe("Quoted material");
    const straight = detectQuotes('He said "grid supply matters" clearly.');
    expect(straight.length).toBe(1);
  });

  it("flags indented block quotes of >=12 words", () => {
    const text = "Intro line.\n    Four indented lines make a reflective block quotation that qualifies for exclusion because it holds at least twelve words.";
    const ranges = detectQuotes(text);
    expect(ranges.some((range) => range.label === "Block quotation")).toBe(true);
  });

  it("detects APA, IEEE, MLA and narrative inline citations", () => {
    const ranges = detectInlineCitations("(Smith, 2020) [1] (Miller 12) and Smith et al., 2020 all count.");
    expect(ranges.length).toBeGreaterThanOrEqual(4);
  });

  it("identifies citations styles by signal count", () => {
    expect(detectCitationStyle("(Smith, 2020) (Jones, 2021)")).toBe("HARVARD");
    expect(detectCitationStyle("as shown [1] and [2]").trim()).toBe("IEEE");
    expect(detectCitationStyle("(Smith, 2020, pp. 4)")).toBe("HARVARD");
  });

  it("detects bibliography heading and bibtex entries", () => {
    const text = "Body text.\nReferences\n- Smith (2020). Grid systems.";
    const parsed = detectBibliography(text);
    expect(parsed.ranges.length).toBe(1);
    expect(parsed.ranges[0]?.reason).toBe("bibliography");
    expect(bibliographyStart(text)).toBe(text.indexOf("References"));
    const bibtex = detectBibliography("@article{smith2020, title={Grid}}\n@book{jones2021, title={Power}}");
    expect(bibtex.bibtexEntries).toBe(2);
    expect(bibtex.ranges.length).toBe(2);
  });

  it("parseCitations reports combined state", () => {
    const report = parseCitations("Research (Smith, 2020) continues.\nWorks Cited\n- Smith.");
    expect(report.hasBibliography).toBe(true);
    expect(report.inlineCitations).toBeGreaterThanOrEqual(1);
    expect(report.citationRanges.length).toBe(2);
    expect(report.bibliographyRanges.length).toBe(1);
  });

  it("rangeIsExcluded requires overlap ratio threshold", () => {
    expect(rangeIsExcluded({ start: 20, end: 30 }, [{ start: 15, end: 35 }])).toBe(true);
    expect(rangeIsExcluded({ start: 20, end: 30 }, [{ start: 28, end: 29 }], 0.5)).toBe(false);
  });

  it("buildExclusionRanges merges quotes, citations and bibliography sorted by start", () => {
    const text = "\u201cQuoted sentence here.\u201d Analysis (Smith, 2020) follows.\nReferences\n- Smith.";
    const ranges = buildExclusionRanges(text);
    const starts = ranges.map((range) => range.start);
    expect([...starts].sort((left, right) => left - right)).toEqual(starts);
    expect(ranges.some((range) => range.reason === "quote")).toBe(true);
    expect(ranges.some((range) => range.reason === "citation")).toBe(true);
    expect(ranges.some((range) => range.reason === "bibliography")).toBe(true);
  });
});
