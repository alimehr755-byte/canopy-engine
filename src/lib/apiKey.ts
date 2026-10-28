import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const KEY_PREFIX = "vk_live";
const KEY_BYTES = 32;

export interface ApiKeyContext {
  id: string;
  name: string;
  scopes: string[];
  userId: string | null;
}

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const secret = crypto.randomBytes(KEY_BYTES).toString("hex");
  const raw = `${KEY_PREFIX}_${secret}`;
  const prefix = raw.slice(0, 12);
  const hash = hashApiKey(raw);
  return { raw, prefix, hash };
}

export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function createApiKey(
  name: string,
  scopes?: string[],
  userId?: string,
  expiresAt?: Date
): Promise<{ id: string; raw: string; prefix: string; scopes: string[] }> {
  const { raw, prefix, hash } = generateApiKey();
  const key = await prisma.apiKey.create({
    data: {
      name,
      prefix,
      keyHash: hash,
      scopes: scopes && scopes.length > 0 ? scopes : ["submit:read", "submit:write", "report:read"],
      userId,
      expiresAt,
    },
  });
  return { id: key.id, raw, prefix, scopes: key.scopes };
}

export async function authenticateApiKey(
  headerValue: string | null
): Promise<ApiKeyContext | null> {
  if (!headerValue) return null;
  const raw = headerValue.trim();
  if (!raw.startsWith(`${KEY_PREFIX}_`)) return null;

  const hash = hashApiKey(raw);
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
  if (!key) return null;
  if (key.revokedAt) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;

  // Update lastUsedAt asynchronously (fire-and-forget)
  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return { id: key.id, name: key.name, scopes: key.scopes, userId: key.userId };
}

export function hasScope(ctx: ApiKeyContext, scope: string): boolean {
  return ctx.scopes.includes(scope) || ctx.scopes.includes("*");
}
