import { describe, expect, it } from "vitest";
import { clampShareDays, generateShareToken, hashShareToken } from "./shareTokens";

describe("share tokens", () => {
  it("generates prefixed tokens whose hash is stable", () => {
    const { raw, hash } = generateShareToken();
    expect(raw.startsWith("vshare_")).toBe(true);
    expect(hashShareToken(raw)).toBe(hash);
  });

  it("hashes different tokens differently", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a.hash).not.toBe(b.hash);
  });

  it("clamps expiry days into the 1..90 window", () => {
    expect(clampShareDays(undefined)).toBe(7);
    expect(clampShareDays(0)).toBe(1);
    expect(clampShareDays(-5)).toBe(1);
    expect(clampShareDays(500)).toBe(90);
    expect(clampShareDays("14")).toBe(14);
    expect(clampShareDays(Number.NaN)).toBe(7);
  });
});
