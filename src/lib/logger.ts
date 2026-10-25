import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: "veritas-web",
    env: process.env.NODE_ENV ?? "development",
  },
});

export function createRequestLogger(req: Request) {
  return logger.child({
    reqId: crypto.randomUUID(),
    method: req.method,
    url: req.url,
  });
}