import { Worker } from "bullmq";
import { analyzeSubmission } from "./lib/analyzer";
import { prisma } from "./lib/prisma";
import { redisConnection } from "./lib/queue";
import { deliverWebhook } from "./lib/webhook";

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
    }
  } catch (e) {
    console.error("[worker] webhook dispatch error", e);
  }
});

worker.on("failed", (job, error) => {
  console.error(`[worker] analysis ${job?.id ?? "?"} failed: ${error.message}`);
});

async function shutdown(): Promise<void> {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[worker] veritas-analysis worker listening (concurrency ${CONCURRENCY})`);