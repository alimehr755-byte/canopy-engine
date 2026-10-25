import { Queue } from "bullmq";

const REDIS_URL = process.env.REDIS_URL ?? `redis://${process.env.REDIS_HOST ?? "127.0.0.1"}:${process.env.REDIS_PORT ?? 6379}`;

function parseRedisUrl(url: string): { host: string; port: number } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "127.0.0.1",
      port: Number(parsed.port || 6379)
    };
  } catch {
    return { host: "127.0.0.1", port: 6379 };
  }
}

export const redisConnection = {
  ...parseRedisUrl(REDIS_URL),
  maxRetriesPerRequest: null
};

const connection = {
  host: redisConnection.host,
  port: redisConnection.port,
  maxRetriesPerRequest: null
};

let cached: Queue<{ submissionId: string }> | null = null;

export function analysisMode(): "queue" | "inline" {
  return process.env.ANALYSIS_MODE === "queue" ? "queue" : "inline";
}

export function getAnalysisQueue(): Queue<{ submissionId: string }> {
  cached ??= new Queue("veritas-analysis", {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 500
    }
  });
  return cached;
}

export async function enqueueAnalysis(submissionId: string): Promise<void> {
  await getAnalysisQueue().add("analyze", { submissionId }, { jobId: `analyze-${submissionId}` });
}

export async function closeAnalysisQueue(): Promise<void> {
  if (cached) {
    await cached.close();
    cached = null;
  }
}