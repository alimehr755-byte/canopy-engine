import { Worker } from "bullmq";
import { analyzeSubmission } from "./lib/analyzer";
import { prisma } from "./lib/prisma";
import { redisConnection } from "./lib/queue";

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

worker.on("completed", (job) => {
  console.log(`[worker] analysis ${job.id} completed`);
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