import crypto from "crypto";
import { prisma } from "./prisma";

const TOKEN_PREFIX = "vshare_";
export const MIN_SHARE_DAYS = 1;
export const MAX_SHARE_DAYS = 90;
export const DEFAULT_SHARE_DAYS = 7;

export function generateShareToken(): { raw: string; hash: string } {
  const raw = `${TOKEN_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
  return { raw, hash: hashShareToken(raw) };
}

export function hashShareToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function clampShareDays(input: unknown): number {
  const days = Number(input ?? DEFAULT_SHARE_DAYS);
  if (!Number.isFinite(days)) return DEFAULT_SHARE_DAYS;
  return Math.min(MAX_SHARE_DAYS, Math.max(MIN_SHARE_DAYS, Math.round(days)));
}

export async function createShareLink(submissionId: string, days: number): Promise<{ token: string; expiresAt: Date }> {
  const { raw, hash } = generateShareToken();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await prisma.shareLink.create({ data: { tokenHash: hash, submissionId, expiresAt } });
  return { token: raw, expiresAt };
}

export interface ResolvedShareLink {
  submissionId: string;
  expired: boolean;
}

export async function resolveShareToken(raw: string | null): Promise<ResolvedShareLink | null> {
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;
  const hash = hashShareToken(raw);
  const link = await prisma.shareLink.findUnique({ where: { tokenHash: hash } });
  if (!link) return null;
  return { submissionId: link.submissionId, expired: link.expiresAt < new Date() };
}
