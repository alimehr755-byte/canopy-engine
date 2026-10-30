import { Worker } from "bullmq";
import { analyzeSubmission } from "./lib/analyzer";
import { prisma } from "./lib/prisma";
import { redisConnection } from "./lib/queue";
import { deliverWebhook } from "./lib/webhook";
import { syncRound } from "./lib/sync";

const connection = redisConnection;

const CONCURRENCY = Math.max(1, Number(process.env.ANALYSIS_CONCURRENCY ?? "2"));

const worker = new Worker<{ submissionId: string }>(
  "veritas-analysis",
  async (job) => {
    const { submissionId } = job.data;
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true }
    });
    if (!submission) {
      return;
    }
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: "QUEUED", error: null }
    });
    await analyzeSubmission(submissionId);
  },
  { connection, concurrency: CONCURRENCY }
);

async function shutdown(): Promise<void> {
  await worker.close();
  if (syncTimer) {
    clearInterval(syncTimer);
  }
  await prisma.$disconnect();
  process.exit(0);
}

// Cross-institution sync loop: push new fingerprint units to the hub and pull
// peer fingerprints every 5 minutes (disabled with SYNC_DISABLED=1). Only
// hashes travel — never student text.
const SYNC_INTERVAL_MS = Math.max(60_000, Number(process.env.SYNC_INTERVAL_MS ?? "300_000"));
let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncRunning = false;

async function runSyncCycle(): Promise<void> {
  if (syncRunning) return;
  syncRunning = true;
  try {
    const { pushed, pulled } = await syncRound();
    if (pushed || pulled) {
      console.log(`[sync] pushed ${pushed} fingerprint unit(s), pulled ${pulled}`);
    }
  } catch (error) {
    console.error("[sync] cycle failed", error);
  } finally {
    syncRunning = false;
  }
}

// Web scan completed submissions right after analysis (Turnitin-style
// automatic web check; skipped when WEBSCAN_MODE=manual).
async function webScanAfter(submissionId: string): Promise<void> {
  if (process.env.WEBSCAN_MODE === "manual") return;
  try {
    const { runWebScan } = await import("./lib/webscan");
    const summary = await runWebScan(submissionId, 120_000);
    console.log(
      `[webscan] ${submissionId.slice(0, 8)}: ${summary.newMatches} web match(es), +${summary.corpusStored} corpus docs`
    );
  } catch (error) {
    console.error("[webscan] failed", error);
  }
}

worker.on("completed", async (job) => {
  console.log(`[worker] analysis ${job.id} completed`);
  const { submissionId } = job.data;
  try {
    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, status: true },
    });
    if (sub?.status === "COMPLETED") {
      const webhooks = await prisma.webhook.findMany({ where: { active: true } });
      const data = { submissionId: sub.id, status: sub.status };
      await Promise.allSettled(webhooks.map((w) => deliverWebhook(w.id, "report.completed", data)));
      void webScanAfter(sub.id);
    }
  } catch (e) {
    console.error("[worker] webhook dispatch error", e);
  }
});

worker.on("failed", (job, error) => {
  console.error(`[worker] analysis ${job?.id ?? "?"} failed: ${error.message}`);
});

if (process.env.SYNC_DISABLED !== "1") {
  syncTimer = setInterval(() => void runSyncCycle(), SYNC_INTERVAL_MS);
  void runSyncCycle();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[worker] veritas-analysis worker listening (concurrency ${CONCURRENCY})`);