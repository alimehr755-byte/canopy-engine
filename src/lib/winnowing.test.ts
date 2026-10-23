import { describe, it, expect } from "vitest";
import type { Fingerprint } from "./winnowing";
import {
  fingerprintDocument,
  winnow,
  compareFingerprints,
  countWords,
} from "./winnowing";

describe("winnowing", () => {
  it("produces stable fingerprints for identical text", () => {
    const text = "The quick brown fox jumps over the lazy dog.";
    const a = fingerprintDocument(text, { k: 5, windowSize: 4 });
    const b = fingerprintDocument(text, { k: 5, windowSize: 4 });
    expect(a.fingerprints.map(f => f.hash)).toEqual(b.fingerprints.map(f => f.hash));
  });

  it("winnow selects minimum hash per window", () => {
    const hashes = [10, 5, 8, 2, 7, 3, 9, 1, 6, 4];
    const selected = winnow(hashes, 4);
    expect(selected.length).toBeLessThan(hashes.length);
    expect(selected.every(h => hashes.includes(h))).toBe(true);
  });

  it("compareFingerprints returns matched ranges", () => {
    const a: Fingerprint[] = [
      { hash: 1n, position: 0, start: 0, end: 5 },
      { hash: 2n, position: 1, start: 5, end: 10 },
      { hash: 3n, position: 2, start: 10, end: 15 },
      { hash: 4n, position: 3, start: 15, end: 20 },
    ];
    const b: Fingerprint[] = [
      { hash: 3n, position: 0, start: 0, end: 5 },
      { hash: 4n, position: 1, start: 5, end: 10 },
      { hash: 5n, position: 2, start: 10, end: 15 },
      { hash: 6n, position: 3, start: 15, end: 20 },
    ];
    const ranges = compareFingerprints(a, b);
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges[0]).toHaveProperty("start");
    expect(ranges[0]).toHaveProperty("end");
  });

  it("countWords handles punctuation and whitespace", () => {
    expect(countWords("Hello, world!")).toBe(2);
    expect(countWords("  multiple   spaces  ")).toBe(2);
    expect(countWords("single")).toBe(1);
    expect(countWords("")).toBe(0);
  });
});