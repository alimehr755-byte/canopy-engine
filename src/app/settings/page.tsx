import Link from "next/link";
import { ArrowLeft, GraduationCap, KeyRound, Webhook } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { WebhookManager } from "@/components/WebhookManager";
import { ApiKeyManager } from "@/components/ApiKeyManager";
import { LmsManager } from "@/components/LmsManager";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const rawError = params.google_error;
  const initialGoogleError = typeof rawError === "string" ? rawError : null;
  const [webhooks, apiKeys, lmsConnection] = await Promise.all([
    prisma.webhook.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.lmsConnection.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="min-h-screen bg-ink-50">
      <AppHeader compact />
      <main className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 transition hover:text-ink-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>
         <div className="mt-3">
           <h1 className="text-2xl font-semibold tracking-tight text-ink-950">Integrations</h1>
           <p className="mt-1 text-sm text-ink-500">
             LMS sync, outbound webhooks, and API keys for programmatic access.
           </p>
         </div>

         <section className="mt-6 rounded-2xl border border-ink-200/80 bg-white shadow-paper">
           <div className="border-b border-ink-100 px-5 py-4">
             <div className="flex items-center gap-2">
               <GraduationCap className="h-4 w-4 text-brand-500" />
               <h2 className="text-sm font-semibold tracking-tight text-ink-900">Learning Management System</h2>
             </div>
             <p className="mt-0.5 text-xs text-ink-500">
               Import assignments and student submissions straight from Canvas — analyzed and scored
               automatically, ready for export.
             </p>
           </div>
           <LmsManager
             googleConfigured={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
             initialError={initialGoogleError}
             initialConnection={
               lmsConnection
                 ? {
                     id: lmsConnection.id,
                     platform: lmsConnection.platform,
                     baseUrl: lmsConnection.baseUrl,
                     name: lmsConnection.name,
                     lastSyncAt: lmsConnection.lastSyncAt ? lmsConnection.lastSyncAt.toISOString() : null,
                   }
                 : null
             }
           />
         </section>

        <section className="mt-6 rounded-2xl border border-ink-200/80 bg-white shadow-paper">
          <div className="border-b border-ink-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-brand-500" />
              <h2 className="text-sm font-semibold tracking-tight text-ink-900">Webhooks</h2>
            </div>
            <p className="mt-0.5 text-xs text-ink-500">
              A signed <code className="rounded bg-ink-100 px-1 text-[11px]">report.completed</code> event
              is POSTed to each URL when an analysis finishes.
            </p>
          </div>
          <WebhookManager
            initialWebhooks={webhooks.map((webhook) => ({
              id: webhook.id,
              url: webhook.url,
              events: webhook.events,
              active: webhook.active,
              createdAt: webhook.createdAt.toISOString(),
            }))}
          />
        </section>

        <section className="mt-6 rounded-2xl border border-ink-200/80 bg-white shadow-paper">
          <div className="border-b border-ink-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-brand-500" />
              <h2 className="text-sm font-semibold tracking-tight text-ink-900">API keys</h2>
            </div>
            <p className="mt-0.5 text-xs text-ink-500">
              Use keys with <code className="rounded bg-ink-100 px-1 text-[11px]">/api/v1/*</code> endpoints
              via the <code className="rounded bg-ink-100 px-1 text-[11px]">x-api-key</code> header. The raw
              key is shown exactly once at creation.
            </p>
          </div>
          <ApiKeyManager
            initialKeys={apiKeys.map((key) => ({
              id: key.id,
              name: key.name,
              prefix: key.prefix,
              scopes: key.scopes,
              revoked: key.revokedAt !== null,
              lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
              createdAt: key.createdAt.toISOString(),
            }))}
          />
        </section>
      </main>
    </div>
  );
}
