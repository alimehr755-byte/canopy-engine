export interface NormalizedText {
  text: string;
  indexMap: Int32Array;
}

export interface KGram {
  hash: bigint;
  start: number;
  end: number;
}

export interface Fingerprint {
  hash: bigint;
  position: number;
  start: number;
  end: number;
}

export interface FingerprintResult {
  fingerprints: Fingerprint[];
  k: number;
  windowSize: number;
  normalizedLength: number;
  kgramCount: number;
}

export interface MatchedRange {
  start: number;
  end: number;
  hashCount: number;
}

export interface FingerprintOptions {
  k?: number;
  windowSize?: number;
}

const DEFAULT_K = 12;
const DEFAULT_WINDOW = 10;
const RABIN_KARP_BASE = 257n;
const UINT64_MASK = (1n << 64n) - 1n;
const ALPHANUMERIC = /[\p{L}\p{N}]/u;

export function normalizeForFingerprint(text: string): NormalizedText {
  const chars: string[] = [];
  const positions: number[] = [];
  let pendingSpace = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (ALPHANUMERIC.test(character)) {
      if (pendingSpace && chars.length > 0) {
        chars.push(" ");
        positions.push(index);
      }
      const lowered = character.toLowerCase();
      for (let offset = 0; offset < lowered.length; offset += 1) {
        const candidate = lowered.charAt(offset);
        if (ALPHANUMERIC.test(candidate)) {
          chars.push(candidate);
          positions.push(index);
        }
      }
      pendingSpace = true;
    } else if (chars.length > 0) {
      pendingSpace = true;
    }
  }

  return {
    text: chars.join(""),
    indexMap: Int32Array.from(positions)
  };
}

export function rollingHashes(normalized: string, k: number): bigint[] {
  if (!Number.isInteger(k) || k < 1) {
    throw new Error("k must be a positive integer");
  }
  if (normalized.length < k) {
    return [];
  }

  const hashes: bigint[] = [];
  let hash = 0n;
  let highestPower = 1n;

  for (let index = 0; index < k; index += 1) {
    const code = BigInt(normalized.charCodeAt(index)) + 1n;
    hash = (hash * RABIN_KARP_BASE + code) & UINT64_MASK;
    if (index < k - 1) {
      highestPower = (highestPower * RABIN_KARP_BASE) & UINT64_MASK;
    }
  }

  hashes.push(BigInt.asIntN(64, hash));

  for (let index = k; index < normalized.length; index += 1) {
    const outgoing = BigInt(normalized.charCodeAt(index - k)) + 1n;
    const incoming = BigInt(normalized.charCodeAt(index)) + 1n;
    hash = ((hash - outgoing * highestPower) * RABIN_KARP_BASE + incoming) & UINT64_MASK;
    hashes.push(BigInt.asIntN(64, hash));
  }

  return hashes;
}

export function getKGrams(text: string, k: number = DEFAULT_K): KGram[] {
  const normalized = normalizeForFingerprint(text).text;
  const hashes = rollingHashes(normalized, k);
  return hashes.map((hash, position) => ({
    hash,
    start: position,
    end: position + k
  }));
}

export function winnow(hashes: readonly number[], windowSize: number): number[];
export function winnow(items: readonly KGram[], windowSize?: number): KGram[];
export function winnow(
  items: readonly KGram[] | readonly number[],
  windowSize: number = DEFAULT_WINDOW
): KGram[] | number[] {
  if (items.length === 0) {
    return [];
  }
  if (typeof items[0] === "number") {
    const numbers = items as readonly number[];
    const kgrams: KGram[] = numbers.map((hash, position) => ({
      hash: BigInt(hash),
      start: position,
      end: position + 1
    }));
    return winnowKgrams(kgrams, windowSize).map((kgram) => kgram.start);
  }
  return winnowKgrams(items as readonly KGram[], windowSize);
}

function winnowKgrams(items: readonly KGram[], windowSize: number): KGram[] {
  if (!Number.isInteger(windowSize) || windowSize < 1) {
    throw new Error("windowSize must be a positive integer");
  }
  if (items.length === 0) {
    return [];
  }
  if (items.length <= windowSize) {
    let minimum = items[0] as KGram;
    for (let index = 1; index < items.length; index += 1) {
      const current = items[index] as KGram;
      if (current.hash <= minimum.hash) {
        minimum = current;
      }
    }
    return [minimum];
  }

  const selected: KGram[] = [];
  let lastPosition = -1;

  for (let windowStart = 0; windowStart <= items.length - windowSize; windowStart += 1) {
    let minimum = items[windowStart] as KGram;
    for (let offset = 1; offset < windowSize; offset += 1) {
      const candidate = items[windowStart + offset] as KGram;
      if (candidate.hash <= minimum.hash) {
        minimum = candidate;
      }
    }
    if (minimum.start !== lastPosition) {
      selected.push(minimum);
      lastPosition = minimum.start;
    }
  }

  return selected;
}

export function fingerprintDocument(
  text: string,
  options: FingerprintOptions = {}
): FingerprintResult {
  const k = options.k ?? DEFAULT_K;
  const windowSize = options.windowSize ?? DEFAULT_WINDOW;
  const normalized = normalizeForFingerprint(text);
  const hashes = rollingHashes(normalized.text, k);

  const kgrams: KGram[] = hashes.map((hash, position) => ({
    hash,
    start: position,
    end: position + k
  }));

  const selected = winnow(kgrams, windowSize);
  const fingerprints: Fingerprint[] = selected.map((kgram) => {
    const originalStart = normalized.indexMap[kgram.start] ?? 0;
    const originalEnd = (normalized.indexMap[kgram.end - 1] ?? originalStart) + 1;
    return {
      hash: kgram.hash,
      position: kgram.start,
      start: originalStart,
      end: Math.max(originalEnd, originalStart + 1)
    };
  });

  return {
    fingerprints,
    k,
    windowSize,
    normalizedLength: normalized.text.length,
    kgramCount: kgrams.length
  };
}

export function groupMatchedRanges(
  source: readonly Fingerprint[],
  targetHashes: ReadonlyMap<string, readonly number[]>,
  k: number = DEFAULT_K
): MatchedRange[] {
  const candidates: Array<{ position: number; start: number; end: number }> = [];

  for (const fingerprint of source) {
    const matches = targetHashes.get(fingerprint.hash.toString());
    if (!matches || matches.length === 0) {
      continue;
    }
    candidates.push({
      position: fingerprint.position,
      start: fingerprint.start,
      end: fingerprint.end
    });
  }

  if (candidates.length === 0) {
    return [];
  }

  candidates.sort((left, right) => left.position - right.position);

  const maxGap = Math.max(k * 2, 8);
  const ranges: MatchedRange[] = [];
  let current = { ...(candidates[0] as { position: number; start: number; end: number }) };
  let hashCount = 1;

  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index] as { position: number; start: number; end: number };
    if (candidate.position - current.position <= maxGap) {
      current.end = Math.max(current.end, candidate.end);
      current.position = candidate.position;
      hashCount += 1;
      continue;
    }
    ranges.push({ start: current.start, end: current.end, hashCount });
    current = { ...candidate };
    hashCount = 1;
  }

  ranges.push({ start: current.start, end: current.end, hashCount });
  return ranges;
}

export function compareFingerprints(
  source: readonly Fingerprint[],
  target: readonly Fingerprint[],
  k: number = DEFAULT_K
): MatchedRange[] {
  const index = new Map<string, number[]>();
  for (const fingerprint of target) {
    const key = fingerprint.hash.toString();
    const bucket = index.get(key);
    if (bucket) {
      bucket.push(fingerprint.position);
    } else {
      index.set(key, [fingerprint.position]);
    }
  }
  return groupMatchedRanges(source, index, k);
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}

export function buildTargetHashIndex(
  fingerprints: ReadonlyArray<{ hash: bigint; position: number }>
): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (const fingerprint of fingerprints) {
    const key = fingerprint.hash.toString();
    const bucket = index.get(key);
    if (bucket) {
      bucket.push(fingerprint.position);
    } else {
      index.set(key, [fingerprint.position]);
    }
  }
  return index;
}
