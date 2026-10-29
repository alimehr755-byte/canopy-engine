import { prisma } from "@/lib/prisma";
import { canvasClient } from "@/lib/lms/canvas";
import { moodleClient } from "@/lib/lms/moodle";
import { googleClient, googleOauthConfigured, googleExchangeCode, GoogleTokenResponse } from "@/lib/lms/google";
import { LmsError, lmsError, type LmsClient } from "@/lib/lms/types";

export { LmsError };

interface LmsConnectionRow {
  id: string;
  platform: "CANVAS" | "MOODLE" | "GOOGLE";
  baseUrl: string;
  token: string;
  name: string | null;
  lastSyncAt: Date | null;
}

export async function getStoredConnection(): Promise<LmsConnectionRow | null> {
  return prisma.lmsConnection.findFirst({ orderBy: { createdAt: "desc" } });
}

function clientForConnection(connection: LmsConnectionRow): LmsClient {
  const opts = { baseUrl: connection.baseUrl, token: connection.token };
  if (connection.platform === "MOODLE") {
    return moodleClient(opts);
  }
  if (connection.platform === "GOOGLE") {
    return googleClient(opts);
  }
  return canvasClient(opts);
}

/** Build a platform-agnostic client from the stored connection. */
export async function activeLmsClient(): Promise<{ connection: LmsConnectionRow; client: LmsClient }> {
  const connection = await getStoredConnection();
  if (!connection) {
    throw lmsError("No LMS connection configured. Connect first.", 400);
  }
  return { connection, client: clientForConnection(connection) };
}

export { clientForConnection, googleOauthConfigured, googleExchangeCode };
export type { GoogleTokenResponse };
