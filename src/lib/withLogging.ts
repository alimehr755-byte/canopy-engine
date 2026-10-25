import type { NextRequest, NextResponse } from "next/server";
import { createRequestLogger } from "./logger";
import { recordHttpRequest } from "./metrics";

export function withLogging(
  handler: (req: NextRequest, ctx: { logger: ReturnType<typeof createRequestLogger> }) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const logger = createRequestLogger(req);
    const startedAt = Date.now();
    const route = req.nextUrl.pathname;

    logger.info({ msg: "request start" });

    try {
      const response = await handler(req, { logger });
      const durationMs = Date.now() - startedAt;
      recordHttpRequest(req.method, route, response.status, durationMs);
      logger.info({ msg: "request end", status: response.status, durationMs });
      return response;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      recordHttpRequest(req.method, route, 500, durationMs);
      logger.error({ err: error, msg: "request error", durationMs });
      throw error;
    }
  };
}