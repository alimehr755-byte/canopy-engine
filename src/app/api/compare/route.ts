import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CompareEntry {
  id: string;
  title: string;
  authorName: string | null;
  status: string;
  similarityScore: number;
  aiScore: number;
  wordCount: number;
  fingerprintCount: number;
}

interface SharedSource {
  key: string;
  url: string | null;
  title: string | null;
  aWords: number;
  bWords: number;
}

function sameSource(
  aUrl: string | null,
  aTitle: string | null,
  bUrl: string | null,
  bTitle: string | null
): boolean {
  if (aUrl && bUrl) return aUrl.toLowerCase() === bUrl.toLowerCase();
  if (aTitle && bTitle) return aTitle.toLowerCase() === bTitle.toLowerCase();
  return false;
}

/**
 * Side-by-side comparison of two submissions for collusion review.
 * GET /api/compare?a=<id>&b=<id>
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const a = url.searchParams.get("a");
  const b = url.searchParams.get("b");
  if (!a || !b || a === b) {
    return NextResponse.json({ error: "Provide two distinct submission ids (?a=&b=)." }, { status: 400 });
  }

  try {
    const submissions = await prisma.submission.findMany({
      where: { id: { in: [a, b] } },
      include: {
        author: { select: { name: true } },
        matches: {
          select: { sourceUrl: true, sourceTitle: true, wordCount: true },
        },
      },
    });

    const byId = new Map(submissions.map((s) => [s.id, s]));
    const first = byId.get(a);
    const second = byId.get(b);
    if (!first || !second) {
      return NextResponse.json({ error: "One or both submissions were not found." }, { status: 404 });
    }

    const [aFingerprints, bFingerprints] = await Promise.all([
      prisma.fingerprint.findMany({ where: { submissionId: a }, select: { hash: true }, distinct: ["hash"] }),
      prisma.fingerprint.findMany({ where: { submissionId: b }, select: { hash: true }, distinct: ["hash"] }),
    ]);
    const aHashSet = new Set(aFingerprints.map((f) => f.hash.toString()));
    const bHashSet = new Set(bFingerprints.map((f) => f.hash.toString()));
    let sharedFingerprints = 0;
    for (const hash of aHashSet) {
      if (bHashSet.has(hash)) sharedFingerprints += 1;
    }
    const overlapScore =
      Math.min(aHashSet.size, bHashSet.size) > 0
        ? Math.round((sharedFingerprints / Math.min(aHashSet.size, bHashSet.size)) * 100)
        : 0;

    const toEntry = (s: typeof first, fingerprintCount: number): CompareEntry => ({
      id: s.id,
      title: s.title,
      authorName: s.author?.name ?? null,
      status: s.status,
      similarityScore: s.similarityScore,
      aiScore: s.aiScore,
      wordCount: s.wordCount,
      fingerprintCount,
    });

    const grouped = (
      submission: typeof first
    ): Map<string, { url: string | null; title: string | null; words: number }> => {
      const map = new Map<string, { url: string | null; title: string | null; words: number }>();
      for (const match of submission.matches) {
        if (!match.sourceUrl && !match.sourceTitle) continue;
        const key = (match.sourceUrl ?? match.sourceTitle ?? "").toLowerCase();
        const entry = map.get(key);
        if (entry) {
          entry.words += match.wordCount;
        } else {
          map.set(key, { url: match.sourceUrl, title: match.sourceTitle, words: match.wordCount });
        }
      }
      return map;
    };

    const aMap = grouped(first);
    const bMap = grouped(second);
    const sharedSources: SharedSource[] = [];
    for (const [key, aEntry] of aMap.entries()) {
      for (const [, bEntry] of bMap.entries()) {
        if (sameSource(aEntry.url, aEntry.title, bEntry.url, bEntry.title)) {
          sharedSources.push({
            key,
            url: aEntry.url ?? bEntry.url,
            title: aEntry.title ?? bEntry.title,
            aWords: aEntry.words,
            bWords: bEntry.words,
          });
          break;
        }
      }
    }
    sharedSources.sort(
      (left, right) => Math.max(right.aWords, right.bWords) - Math.max(left.aWords, left.bWords)
    );

    return NextResponse.json({
      a: toEntry(first, aHashSet.size),
      b: toEntry(second, bHashSet.size),
      sharedAssignment: first.assignmentId !== null && first.assignmentId === second.assignmentId,
      sharedSources,
      sharedFingerprints,
      overlapScore,
    });
  } catch (error) {
    console.error("compare error", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
