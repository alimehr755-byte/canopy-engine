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
| `/api/keys` | GET/POST | Create + list API keys (raw key returned once at creation) |
| `/api/keys/{id}` | POST/DELETE | Revoke (`{"revoked": true}`) or delete a key |
| `/api/webhooks` | GET/POST | Register + list webhooks (`report.completed` events, HMAC-signed) |
| `/api/webhooks/{id}` | POST/DELETE | Activate/deactivate (`{"active": false}`) or delete |
| `/api/v1/submit` | POST | **API-key protected** submit; scope `submit:write` |
| `/api/v1/report/{id}` | GET | **API-key protected** report; scope `report:read` |
| `/api/v1/assignments` | GET/POST | **API-key protected** assignments; scopes `submit:read` / `submit:write` |
| `/api/lms/connections` | GET/POST/DELETE | LMS connection (Canvas/Moodle token; Google via OAuth) |
| `/api/lms/browse` | GET | Course/assignment listing from the connected LMS |
| `/api/lms/sync` | POST | Import LMS submissions as local submissions (outbound pull) |
| `/api/oauth/google/start` | GET | Begin Google Classroom OAuth flow |
| `/api/compare?a={id}&b={id}` | GET | Cross-submission shared-source comparison |
| `/api/report/{id}/share` | POST | Create time-limited public share link |
| `/api/assignments/{id}/bulk-pdf` | GET | Bulk PDF export (zip or `?format=merged`) |
| `/api/assignments/{id}/export-csv` | GET | Roster results CSV export |
| `/api/submit/batch` | POST | Zip batch upload (≤50 docs, 60 MB) |

### Programmatic access (API keys)

```bash
# 1. Create a key (save the raw key — it is shown exactly once)
curl -X POST http://localhost:3000/api/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "lms-integration"}'

# 2. Submit and fetch reports with the key
curl -X POST http://localhost:3000/api/v1/submit \
  -H "x-api-key: vk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"text": "student work goes here", "title": "Essay 1"}'

curl http://localhost:3000/api/v1/report/<submissionId> -H "x-api-key: vk_live_..."
```

Keys are stored as SHA-256 hashes; scopes: `submit:read`, `submit:write`, `report:read`. Webhooks receive `POST` payloads with an `X-Veritas-Signature: sha256=<hmac>` header when a report completes.

## LMS integrations (Canvas / Moodle / Google Classroom)

All three platforms use an **outbound pull model**: the local Veritas install connects
to the LMS API over the internet from your own machine — no public URL, no HTTPS on
localhost, no tunnels. Configure on **Settings → Learning Management System**.

### Canvas (token)
1. Canvas → Account → Settings → *New Access Token* (instructor account).
2. Paste the base URL (`https://your-school.instructure.com`) and token into the Canvas tab.
3. Pick a course and an assignment, then **Import submissions** — each attached file
   (`.pdf`, `.docx`, `.txt`, `.md`) or inline text body is downloaded and analyzed
   into a local assignment named `<course> — <assignment>`.

### Moodle (token)
1. Site administration → Server → Web services → *Manage tokens* (or create a web
   service and a token granting: `core_webservice_get_site_info`,
   `core_course_get_courses`, `mod_assign_get_assignments`,
   `mod_assign_get_submissions`, `core_enrol_get_enrolled_users`).
2. Paste the site base URL and the token into the Moodle tab. File submissions and
   onlinetext submissions are both imported.

### Google Classroom (OAuth)
One-time setup on the Google side:
1. Google Cloud Console → APIs & Services → enable **Classroom API** and **Drive API**.
2. Credentials → *Create OAuth client ID* → Web application; add
   `http://localhost:3000/api/oauth/google/callback` as an authorized redirect URI.
3. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`, then use the
   **Continue with Google** button in Settings. Access is refreshed automatically;
   student Drive attachments are downloaded via `drive.readonly`.

Endpoints backing this feature: `POST /api/lms/connections` (connect),
`DELETE /api/lms/connections`, `GET /api/lms/browse?type=courses|assignments&courseId=…`,
`POST /api/lms/sync` (`courseId`, `assignmentId`), plus
`GET /api/oauth/google/start` → `GET /api/oauth/google/callback`.

## Testing

```bash
npx tsc --noEmit     # typecheck
npx vitest run       # unit tests
python -m py_compile python-engine/*.py
npm run smoke        # full endpoint suite against a running instance
```

## Scoring model

Similarity = union coverage of included match ranges over the document (default filters exclude quotes and bibliography, and matches under 10 words). Base similarity uses all matches. AI score = aggregated per-sentence probability from the engine, with lexical fallback. Scores are investigative signals, not findings of misconduct.
