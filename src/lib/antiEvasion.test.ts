import { describe, it, expect } from "vitest";
import {
  detectEncodingAnomalies,
  detectFontManipulationSignals,
  detectHiddenText,
  detectHomoglyphs,
  normalizeHomoglyphs,
  sanitizeText,
  stripInvisibleCharacters
} from "./antiEvasion";

describe("antiEvasion", () => {
  it("detects cyrillic homoglyphs in latin text", () => {
    const text = "hidden \u0441hara\u0441ters";
    const findings = detectHomoglyphs(text);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.every((finding) => finding.code.startsWith("HOMOGLYPH"))).toBe(true);
  });

  it("normalizeHomoglyphs maps lookalikes to ASCII", () => {
    const normalized = normalizeHomoglyphs("оrange рiа");
    expect(normalized).not.toMatch(/[\u0400-\u04FF]/u);
  });

  it("detects zero-width and bidi hidden characters", () => {
    const findings = detectHiddenText("stealth\u200Btext\u200Dhere\u202Eflip");
    expect(findings.length).toBeGreaterThanOrEqual(3);
  });

  it("stripInvisibleCharacters removes zero-width and bidi and leaves normal text", () => {
    const out = stripInvisibleCharacters("keep\u200Bthis\u2060too\nnormal\uFEFFspace");
    expect(out).not.toMatch(/[\u200B-\u200F\u2060-\u2064\uFEFF]/u);
    expect(stripInvisibleCharacters("plain text")).toBe("plain text");
  });

  it("detects unusual encoding anomalies", () => {
    const findings = detectEncodingAnomalies("mixed \uFFFDreplacement \u00A0nbsp");
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("detectFontManipulationSignals flags decoy characters", () => {
    const signals = detectFontManipulationSignals("extra \u2061invisible operator chars");
    expect(signals.length).toBeGreaterThanOrEqual(1);
    expect(detectFontManipulationSignals("clean text").length).toBe(0);
  });

  it("sanitizeText aggregates counts and returns sanitized text", () => {
    const report = sanitizeText("g\u0441ost\u200B \u202Eflip\u00A0 \u2061 ops\uffFDgone");
    expect(report.homoglyphCount).toBeGreaterThanOrEqual(1);
    expect(report.hiddenCharacterCount).toBeGreaterThanOrEqual(1);
    expect(report.encodingAnomalyCount).toBeGreaterThanOrEqual(1);
    expect(report.findings.length).toBe(report.homoglyphCount + report.hiddenCharacterCount + report.encodingAnomalyCount);
    expect(report.sanitizedText.length).toBeLessThan("g\u0441ost\u200B \u202Eflip\u00A0 \u2061 ops\uffFDgone".length);
  });

  it("clean text produces empty report", () => {
    const report = sanitizeText("A perfectly ordinary sentence about grid markets.");
    expect(report.findings.length).toBe(0);
    expect(report.homoglyphCount).toBe(0);
    expect(report.hiddenCharacterCount).toBe(0);
    expect(report.encodingAnomalyCount).toBe(0);
    expect(report.sanitizedText).toBe("A perfectly ordinary sentence about grid markets.");
  });
});
