import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ReportViewer } from "@/components/ReportViewer";
import { buildReport } from "@/lib/report";
import { normalizeFilters, parseFilters } from "@/lib/scoring";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface ReportPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: ReportPageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const submission = await prisma.submission.findUnique({
      where: { id },
      select: { title: true }
    });
    return { title: submission?.title ?? "Report" };
  } catch {
    return { title: "Report" };
  }
}

export default async function ReportPage({ params, searchParams }: ReportPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const filters = normalizeFilters(parseFilters(query));
  const report = await buildReport(id, filters);

  if (!report) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-ink-50">
      <AppHeader compact />
      <ReportViewer report={report} />
    </div>
  );
}
