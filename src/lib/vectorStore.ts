import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface VectorPayload {
  submissionId: string;
  chunkIndex: number;
  text: string;
  title: string;
  url: string | null;
  sourceType: string;
}

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: VectorPayload;
}

export interface VectorHit {
  id: string;
  score: number;
  payload: VectorPayload;
}

export interface VectorStore {
  readonly name: string;
  upsert(points: readonly VectorPoint[]): Promise<void>;
  search(vector: readonly number[], limit: number): Promise<VectorHit[]>;
  deleteBySubmission(submissionId: string): Promise<void>;
  healthy(): Promise<boolean>;
}

const EMBEDDING_DIMENSIONS = 384;

function fnv1a(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const word of words) {
    tokens.push(word);
    if (word.length >= 5) {
      for (let index = 0; index <= word.length - 3; index += 1) {
        tokens.push(word.slice(index, index + 3));
      }
    }
  }
  return tokens;
}

export function embedText(text: string): number[] {
  const vector = new Float64Array(EMBEDDING_DIMENSIONS);
  const tokens = tokenize(text);

  for (const token of tokens) {
    const bucket = fnv1a(token, 2166136261) % EMBEDDING_DIMENSIONS;
    const sign = (fnv1a(token, 2166136261 ^ 0x9e3779b9) & 1) === 0 ? 1 : -1;
    const weight = 1 + Math.log(1 + token.length / 4);
    vector[bucket] = (vector[bucket] ?? 0) + sign * weight;
  }

  let norm = 0;
  for (let index = 0; index < vector.length; index += 1) {
    const value = vector[index] ?? 0;
    norm += value * value;
  }
  norm = Math.sqrt(norm);
  const result: number[] = new Array(EMBEDDING_DIMENSIONS);
  for (let index = 0; index < vector.length; index += 1) {
    result[index] = norm === 0 ? 0 : Math.round(((vector[index] ?? 0) / norm) * 1e6) / 1e6;
  }
  return result;
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function pointIdFor(submissionId: string, chunkIndex: number): string {
  const hash = createHash("sha1").update(`${submissionId}:${chunkIndex}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hash.slice(18, 20)}-${hash.slice(20, 32)}`;
}

class LocalVectorStore implements VectorStore {
  readonly name = "local-json";

  private cache: VectorPoint[] | null = null;

  private writeChain: Promise<void> = Promise.resolve();

  private get filePath(): string {
    return path.join(process.cwd(), ".data", "vectors.json");
  }

  private async load(): Promise<VectorPoint[]> {
    if (this.cache) {
      return this.cache;
    }
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      this.cache = Array.isArray(parsed) ? (parsed as VectorPoint[]) : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async persist(points: VectorPoint[]): Promise<void> {
    this.cache = points;
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(points), "utf8");
      await fs.rename(temporary, this.filePath);
    });
    await this.writeChain;
  }

  async upsert(points: readonly VectorPoint[]): Promise<void> {
    const existing = await this.load();
    const byId = new Map(existing.map((point) => [point.id, point]));
    for (const point of points) {
      byId.set(point.id, point);
    }
    await this.persist(Array.from(byId.values()));
  }

  async search(vector: readonly number[], limit: number): Promise<VectorHit[]> {
    const points = await this.load();
    return points
      .map((point) => ({
        id: point.id,
        score: cosineSimilarity(vector, point.vector),
        payload: point.payload
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, limit));
  }

  async deleteBySubmission(submissionId: string): Promise<void> {
    const points = await this.load();
    await this.persist(points.filter((point) => point.payload.submissionId !== submissionId));
  }

  async healthy(): Promise<boolean> {
    return true;
  }
}

class QdrantVectorStore implements VectorStore {
  readonly name = "qdrant";

  constructor(
    private readonly baseUrl: string,
    private readonly collection: string,
    private readonly apiKey: string | undefined,
    private readonly fallback: VectorStore
  ) {}

  private async request(pathname: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (this.apiKey) {
      headers.set("api-key", this.apiKey);
    }
    const response = await fetch(`${this.baseUrl.replace(/\/$/u, "")}${pathname}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(8000)
    });
    return response;
  }

  private async ensureCollection(): Promise<boolean> {
    try {
      const existing = await this.request(`/collections/${this.collection}`, { method: "GET" });
      if (existing.ok) {
        return true;
      }
      const created = await this.request(`/collections/${this.collection}`, {
        method: "PUT",
        body: JSON.stringify({
          vectors: { size: EMBEDDING_DIMENSIONS, distance: "Cosine" }
        })
      });
      return created.ok || created.status === 409;
    } catch {
      return false;
    }
  }

  async upsert(points: readonly VectorPoint[]): Promise<void> {
    if (!(await this.ensureCollection())) {
      await this.fallback.upsert(points);
      return;
    }
    try {
      const response = await this.request(`/collections/${this.collection}/points?wait=true`, {
        method: "PUT",
        body: JSON.stringify({
          points: points.map((point) => ({
            id: point.id,
            vector: point.vector,
            payload: point.payload
          }))
        })
      });
      if (!response.ok) {
        await this.fallback.upsert(points);
      }
    } catch {
      await this.fallback.upsert(points);
    }
  }

  async search(vector: readonly number[], limit: number): Promise<VectorHit[]> {
    if (!(await this.ensureCollection())) {
      return this.fallback.search(vector, limit);
    }
    try {
      const response = await this.request(`/collections/${this.collection}/points/search`, {
        method: "POST",
        body: JSON.stringify({
          vector,
          limit,
          with_payload: true
        })
      });
      if (!response.ok) {
        return this.fallback.search(vector, limit);
      }
      const body = (await response.json()) as {
        result?: Array<{ id: string | number; score: number; payload?: VectorPayload }>;
      };
      const hits = (body.result ?? [])
        .filter((hit) => hit.payload)
        .map((hit) => ({
          id: String(hit.id),
          score: hit.score,
          payload: hit.payload as VectorPayload
        }));
      const fallbackHits = await this.fallback.search(vector, limit);
      const merged = new Map<string, VectorHit>();
      for (const hit of [...hits, ...fallbackHits]) {
        const existing = merged.get(hit.payload.submissionId);
        if (!existing || existing.score < hit.score) {
          merged.set(hit.payload.submissionId, hit);
        }
      }
      return Array.from(merged.values()).sort((left, right) => right.score - left.score).slice(0, limit);
    } catch {
      return this.fallback.search(vector, limit);
    }
  }

  async deleteBySubmission(submissionId: string): Promise<void> {
    await this.fallback.deleteBySubmission(submissionId);
    try {
      await this.ensureCollection();
      await this.request(`/collections/${this.collection}/points/delete?wait=true`, {
        method: "POST",
        body: JSON.stringify({
          filter: {
            must: [{ key: "submissionId", match: { value: submissionId } }]
          }
        })
      });
    } catch {
      return;
    }
  }

  async healthy(): Promise<boolean> {
    try {
      const response = await this.request(`/collections/${this.collection}`, { method: "GET" });
      return response.ok;
    } catch {
      return false;
    }
  }
}

let store: VectorStore | undefined;

export function getVectorStore(): VectorStore {
  if (store) {
    return store;
  }
  const local = new LocalVectorStore();
  const qdrantUrl = process.env.QDRANT_URL;
  if (qdrantUrl) {
    store = new QdrantVectorStore(
      qdrantUrl,
      process.env.QDRANT_COLLECTION ?? "veritas_sources",
      process.env.QDRANT_API_KEY || undefined,
      local
    );
    return store;
  }
  store = local;
  return store;
}

export interface DocumentChunk {
  text: string;
  start: number;
  end: number;
  index: number;
}

export function chunkDocument(
  text: string,
  targetWords = 80,
  maxChunks = 400
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const sentences: Array<{ text: string; start: number; end: number }> = [];
  const pattern = /[^.!?]+[.!?]*/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    if (raw.trim().length === 0) {
      continue;
    }
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    const start = match.index + leading;
    sentences.push({ text: trimmed, start, end: start + trimmed.length });
  }

  let buffer: typeof sentences = [];
  let words = 0;

  const flush = (): void => {
    if (buffer.length === 0 || chunks.length >= maxChunks) {
      return;
    }
    const first = buffer[0] as { start: number };
    const last = buffer[buffer.length - 1] as { end: number };
    chunks.push({
      text: text.slice(first.start, last.end),
      start: first.start,
      end: last.end,
      index: chunks.length
    });
    buffer = [];
    words = 0;
  };

  for (const sentence of sentences) {
    const sentenceWords = sentence.text.split(/\s+/u).length;
    if (words + sentenceWords > targetWords && buffer.length > 0) {
      flush();
    }
    buffer.push(sentence);
    words += sentenceWords;
  }
  flush();

  return chunks;
}

export function buildEmbeddingPayload(
  submissionId: string,
  title: string,
  url: string | null,
  sourceType: string,
  text: string,
  chunk: DocumentChunk
): VectorPoint {
  return {
    id: pointIdFor(submissionId, chunk.index),
    vector: embedText(chunk.text),
    payload: {
      submissionId,
      chunkIndex: chunk.index,
      text: chunk.text,
      title,
      url,
      sourceType
    }
  };
}

export function semanticThreshold(): number {
  const parsed = Number(process.env.SEMANTIC_SIMILARITY_THRESHOLD ?? "0.6");
  return Number.isFinite(parsed) ? Math.min(0.99, Math.max(0.3, parsed)) : 0.6;
}
