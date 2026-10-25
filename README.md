# Veritas Engine

Production-grade academic integrity platform: plagiarism similarity detection (exact + paraphrase), evasion detection (homoglyphs, zero-width characters, hidden text), citation-aware exclusions, and AI writing analysis. Turnitin-style Feedback Studio report viewer.

## Stack

- **Web**: Next.js 15.5 (App Router), React 19, TypeScript strict, Tailwind 3.4
- **Data**: PostgreSQL (Prisma 6.19), Qdrant (or local JSON fallback), Redis (queue)
- **Queue**: BullMQ — submissions analyzed asynchronously by a standalone worker
- **AI engine**: Python FastAPI microservice (GPT-2 perplexity/burstiness), with a lexical heuristic fallback when offline
- **Documents**: PDF (unpdf) and DOCX (mammoth) ingestion, up to 15 MB

## Pipeline

1. **Sanitize** — NFKC normalization, homoglyph mapping, zero-width/bidi stripping, anomaly flags
2. **Fingerprint** — Rabin-Karp rolling hashes + winnowing (k=12, window 10)
3. **Compare** — exact fingerprints against repository corpus; sentence-chunk semantic paraphrase detection (hashed 384-dim embeddings, cosine >= 0.6, lexical guard)
4. **Explain** — quote/bibliography/citation exclusion ranges, small-match filters, per-sentence AI scores

## Quickstart (Docker)

```bash
cp .env.example .env
docker compose up -d --build
docker compose run --rm migrate npx prisma db push --skip-generate
docker compose run --rm worker npx tsx prisma/seed.ts
# open http://localhost:3000
```

Services: `db` (Postgres 16), `redis`, `qdrant`, `engine` (AI), `migrate`, `web` (:3000), `worker`.

## Local development (no Docker)

Requires local PostgreSQL (and Redis for queue mode).

```bash
npm install
npx prisma generate
cp .env.example .env   # point DATABASE_URL at your Postgres
npx prisma db push
npm run db:seed        # seeds corpus + demo report
npm run dev            # inline analysis mode (default)
npm run smoke          # endpoint test suite against :3000 (or SMOKE_BASE_URL)
```

Queue mode (mirrors production):

```bash
ANALYSIS_MODE=queue npx tsx src/worker.ts   # separate terminal
# web then returns QUEUED instantly and the worker processes the job
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `REDIS_URL` | `redis://127.0.0.1:6379` | BullMQ queue connection |
| `ANALYSIS_MODE` | `inline` | `queue` to enqueue via Redis, `inline` to analyze in-request |
| `AI_ENGINE_URL` | — | Python AI engine base URL; heuristic fallback when unset |
| `QDRANT_URL` | — | Qdrant base URL; local `.data/vectors.json` fallback when unset |
| `QDRANT_COLLECTION` | `veritas_sources` | Qdrant collection name |
| `SEMANTIC_SIMILARITY_THRESHOLD` | `0.6` | Vector cosine threshold for paraphrase matches |
| `MAX_UPLOAD_BYTES` | `15728640` | Upload size limit |
| `EMBEDDING_PROVIDER` | `local` | Embedding strategy |

## API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/health` | GET | DB + engine status |
| `/api/metrics` | GET | Prometheus metrics |
| `/api/submit` | GET/POST | List submissions; create (JSON `text` or multipart `file`) |
| `/api/analyze` | POST/GET | Re-analyze by id/text; queue peek |
| `/api/report/{id}` | GET | Full report with `?excludeQuotes&excludeBibliography&minMatchWords` |
| `/api/report/{id}/pdf` | GET | PDF download honoring current filters |
| `/api/assignments` | GET/POST | Instructor assignment management |
| `/api/assignments/{id}` | GET | Roster + submissions summary |

## Testing

```bash
npx tsc --noEmit     # typecheck
npx vitest run       # unit tests
python -m py_compile python-engine/*.py
npm run smoke        # full endpoint suite against a running instance
```

## Scoring model

Similarity = union coverage of included match ranges over the document (default filters exclude quotes and bibliography, and matches under 10 words). Base similarity uses all matches. AI score = aggregated per-sentence probability from the engine, with lexical fallback. Scores are investigative signals, not findings of misconduct.
