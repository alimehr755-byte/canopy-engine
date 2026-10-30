import { prisma } from "@/lib/prisma";
import { fingerprintDocument, countWords } from "@/lib/winnowing";

const FINGERPRINT_K = 12;
const FINGERPRINT_WINDOW = 10;

export interface SyncUnit {
  docKey: string;
  title: string;
  url?: string | null;
  sourceType?: string;
  hashes: string[];
}

function hubUrl(): string {
  const value = process.env.VERITAS_HUB_URL ?? "https://veritas-engine-pearl.vercel.app";
  return value.replace(/\/+$/u, "");
}

function installationId(): string {
  return process.env.VERITAS_INSTALL_ID ?? "install-local-default";
}

function syncHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.SYNC_TOKEN) {
    headers["x-sync-token"] = process.env.SYNC_TOKEN;
  }
  return headers;
}

/**
 * Share this installation's document fingerprints with the hub. Only
 * k-gram hashes travel — never the student text itself.
 */
export async function pushToHub(since?: Date): Promise<{ pushed: number }> {
  const docs = await prisma.submission.findMany({
    where: {
      status: "COMPLETED",
      ...(since ? { updatedAt: { gte: since } } : {}),
      // Skip pulled peer docs (those carry [Peer] prefix titles) to avoid echo.
      NOT: { title: { startsWith: "[Peer]" } }
    },
    select: {
      id: true,
      title: true,
      corpusType: true,
      corpusUrl: true,
      corpusTitle: true,
      fingerprints: { select: { hash: true } },
      updatedAt: true
    },
    orderBy: { updatedAt: "asc" },
    take: 1000
  });

  const units: SyncUnit[] = docs
    .filter((doc) => doc.fingerprints.length > 0)
    .map((doc) => ({
      docKey: `${installationId()}:${doc.id}`,
      title: doc.corpusTitle ?? doc.title,
      url: doc.corpusUrl ?? null,
      sourceType: doc.corpusType ?? "REPOSITORY",
      hashes: doc.fingerprints.map((fp) => fp.hash.toString())
    }));

  if (units.length === 0) {
    return { pushed: 0 };
  }
  // Batch the push (50 units per request keeps payload modest).
  let pushed = 0;
  for (let offset = 0; offset < units.length; offset += 50) {
    const batch = units.slice(offset, offset + 50);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(`${hubUrl()}/api/sync`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify({ installationId: installationId(), units: batch }),
        signal: controller.signal
      });
      if (res.ok) {
        pushed += batch.length;
      }
    } catch {
      // hub unreachable — retry on next cycle
    } finally {
      clearTimeout(timeout);
    }
  }
  return { pushed };
}

interface PullResponse {
  units: Array<SyncUnit & { installationId?: string }>;
  cursor: string | null;
}

const CURSOR_KEY = "sync:lastCursor";

async function getCursor(): Promise<Date | undefined> {
  const row = await prisma.syncState.findUnique({ where: { key: CURSOR_KEY } });
  if (!row) {
    return undefined;
  }
  const stored = new Date(row.value);
  return Number.isNaN(stored.getTime()) ? undefined : stored;
}

async function setCursor(cursor: string): Promise<void> {
  await prisma.syncState.upsert({
    where: { key: CURSOR_KEY },
    create: { key: CURSOR_KEY, value: cursor },
    update: { value: cursor }
  });
}

/** Mirror peer fingerprint sets into the local PeerDoc table. */
export async function pullFromHub(): Promise<{ pulled: number; cursor: string | null }> {
  const since = await getCursor();
  const url = `${hubUrl()}/api/sync?installationId=${encodeURIComponent(installationId())}${since ? `&since=${encodeURIComponent(since.toISOString())}` : ""}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let payload: PullResponse;
  try {
    const res = await fetch(url, { headers: syncHeaders(), signal: controller.signal });
    if (!res.ok) {
      throw new Error(`hub responded ${res.status}`);
    }
    payload = (await res.json()) as PullResponse;
  } catch {
    return { pulled: 0, cursor: null };
  } finally {
    clearTimeout(timeout);
  }

  let pulled = 0;
  for (const unit of payload.units) {
    let hashes: bigint[];
    try {
      hashes = unit.hashes.map((hash) => BigInt(hash));
    } catch {
      continue;
    }
    if (hashes.length === 0) {
      continue;
    }
    await prisma.peerDoc.upsert({
      where: { docKey: unit.docKey },
      create: {
        installationId: unit.installationId ?? installationId(),
        docKey: unit.docKey,
        title: unit.title ?? "Peer document",
        url: unit.url ?? null,
        sourceType: unit.sourceType === "INTERNET" || unit.sourceType === "PUBLICATION" ? unit.sourceType : "REPOSITORY",
        hashes
      },
      update: { title: unit.title ?? "Peer document", hashes }
    });
    pulled += 1;
  }

  if (payload.cursor) {
    await setCursor(payload.cursor);
  }
  return { pulled, cursor: payload.cursor };
}

/** One full round-trip: push our latest, pull everyone else's. */
export async function syncRound(): Promise<{ pushed: number; pulled: number }> {
  const [{ pushed }, { pulled }] = [{ pushed: (await pushToHub()).pushed }, { pulled: (await pullFromHub()).pulled }];
  return { pushed, pulled };
}

/** Manual/eager sync entry for a single SDK-free round + a fingerprint check helper used by tests. */
export async function fingerprintUnitFor(text: string): Promise<string[]> {
  if (countWords(text) < 20) {
    return [];
  }
  const result = fingerprintDocument(text, { k: FINGERPRINT_K, windowSize: FINGERPRINT_WINDOW });
  return result.fingerprints.map((fp) => fp.hash.toString());
}
