# Deploy to Vercel + Neon + Upstash (Free, No Card)

## 1. Create Neon Postgres (free tier)
1. Go to https://neon.tech → Sign up with GitHub
2. Create project → name `canopy-engine` → region `US East`
3. Copy **Connection string** (looks like `postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/veritas?sslmode=require`)
4. Save it — you'll need it for Vercel env vars

## 2. Create Upstash Redis (free tier)
1. Go to https://upstash.com → Sign up with GitHub
2. Create database → name `canopy-redis` → region `US East (Virginia)` → type `Redis`
3. Copy **Connection string** (looks like `rediss://default:pass@canopy-redis.upstash.io:6379`)
4. Save it

## 3. Deploy to Vercel
1. Go to https://vercel.com → Sign up with GitHub
2. Click **"Add New..."** → **"Project"**
3. Import `alimehr755-byte/canopy-engine`
4. Vercel detects Next.js → click **"Deploy"**
5. Wait for build to complete

## 4. Add Environment Variables in Vercel
In Vercel dashboard → Project → Settings → Environment Variables → Add:

| Name | Value | Environment |
|------|-------|-------------|
| `DATABASE_URL` | Your Neon connection string | Production, Preview, Development |
| `REDIS_URL` | Your Upstash connection string | Production, Preview, Development |
| `ANALYSIS_MODE` | `inline` | Production, Preview, Development |
| `SEMANTIC_SIMILARITY_THRESHOLD` | `0.6` | Production, Preview, Development |

**Important:** Set `ANALYSIS_MODE=inline` (not `queue`) because Vercel serverless functions can't run long-running BullMQ workers. The worker service won't deploy on Vercel — analysis runs inline in the API request.

## 5. Run Database Migration & Seed
After first deploy, in Vercel dashboard → Project → Functions → View logs → or use Vercel CLI:

```bash
npx vercel env pull .env.local
npx prisma db push
npx tsx prisma/seed.ts
```

Or use Neon's SQL editor to run the migration, then seed via a one-off script.

## 6. Python AI Engine (Optional)
Deploy separately to a free service that supports long-running processes:
- **Render** (free web service, needs card)
- **Railway** (when signups reopen)
- **Fly.io** (needs card)
- **Self-hosted VPS** ($4-6/mo)

Or skip it — the app uses a heuristic AI detector fallback when `AI_ENGINE_URL` is unset.

## Architecture
```
┌─────────────┐     ┌─────────────┐
│   Vercel    │────▶│   Neon      │
│  (Next.js)  │     │ (Postgres)  │
└─────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│  Upstash    │
│   (Redis)   │  ← Only used if you switch to queue mode later
└─────────────┘
```

## Notes
- **Queue mode not supported on Vercel** — serverless functions have 60s max duration, can't run persistent workers
- **Inline mode works perfectly** — analysis runs in the API request (slightly slower response, but simpler)
- **Auto-deploy** on every push to `main`
- **Custom domain** free on Vercel
- **All free tiers** — no credit card ever