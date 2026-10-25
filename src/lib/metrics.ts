import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";

export const register = new Registry();
collectDefaultMetrics({ register, prefix: "veritas_" });

export const httpRequestsTotal = new Counter({
  name: "veritas_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: "veritas_http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export const analysisQueueSize = new Gauge({
  name: "veritas_analysis_queue_size",
  help: "Number of submissions waiting for analysis",
  registers: [register],
});

export const activeAnalyses = new Gauge({
  name: "veritas_active_analyses",
  help: "Number of currently running analyses",
  registers: [register],
});

export function recordHttpRequest(method: string, route: string, status: number, durationMs: number): void {
  httpRequestsTotal.inc({ method, route, status: String(status) });
  httpRequestDuration.observe({ method, route }, durationMs / 1000);
}