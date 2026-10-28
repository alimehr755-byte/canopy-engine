import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ReportViewer } from "@/components/ReportViewer";
import { buildReport } from "@/lib/report";
import { normalizeFilters } from "@/lib/scoring";
import { resolveShareToken } from "@/lib/shareTokens";

export const dynamic = "force-dynamic";

interface SharePageProps {
  params: Promise<{ token: string }>;
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;

  if (token.startsWith("vshare_")) {
    const link = await resolveShareToken(token);
    if (link && !link.expired) {
      const report = await buildReport(link.submissionId, normalizeFilters({}));
      if (report) {
        return (
          <div className="min-h-screen bg-ink-50">
            <AppHeader compact />
            <ReportViewer report={report} />
          </div>
        );
      }
    }
  }

  notFound();
}
