"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Plus, Power, Trash2 } from "lucide-react";
import { cn } from "@/lib/format";

interface WebhookItem {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export function WebhookManager({ initialWebhooks }: { initialWebhooks: WebhookItem[] }) {
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<string | null>(null);

  async function addWebhook(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !url.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const payload = (await res.json()) as { id?: string; secret?: string; error?: string };
      if (!res.ok || !payload.id) {
        throw new Error(payload.error ?? "Could not create webhook.");
      }
      if (payload.secret) {
        setShowKey(payload.secret);
      }
      setWebhooks((prev) => [
        {
          id: payload.id!,
          url: url.trim(),
          events: ["report.completed"],
          active: true,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create webhook.");
    } finally {
      setPending(false);
    }
  }

  async function toggle(webhook: WebhookItem) {
    const nextActive = !webhook.active;
    setWebhooks((prev) => prev.map((w) => (w.id === webhook.id ? { ...w, active: nextActive } : w)));
    await fetch(`/api/webhooks/${webhook.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: nextActive }),
    }).catch(() => undefined);
  }

  async function remove(webhook: WebhookItem) {
    setWebhooks((prev) => prev.filter((w) => w.id !== webhook.id));
    await fetch(`/api/webhooks/${webhook.id}`, { method: "DELETE" }).catch(() => undefined);
  }

  return (
    <div className="px-5 py-5">
      <form onSubmit={addWebhook} className="flex gap-2">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://lms.example.edu/hooks/veritas"
          className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
        />
        <button
          type="submit"
          disabled={pending || !url.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </button>
      </form>

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

      {showKey ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Webhook signing secret (shown once):</p>
          <code className="mt-1 block break-all">{showKey}</code>
        </div>
      ) : null}

      <ul className="mt-4 space-y-2">
        {webhooks.length === 0 ? (
          <li className="py-6 text-center text-xs text-ink-400">No webhooks registered.</li>
        ) : null}
        {webhooks.map((webhook) => (
          <li
            key={webhook.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border border-ink-100 px-3 py-2.5",
              webhook.active ? "bg-white" : "bg-ink-50 opacity-70"
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm text-ink-900">
                <ExternalLink className="h-3 w-3 shrink-0 text-ink-400" />
                {webhook.url}
              </p>
              <p className="text-[11px] text-ink-400">{webhook.events.join(", ")}</p>
            </div>
            <button
              type="button"
              onClick={() => toggle(webhook)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition",
                webhook.active
                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "bg-ink-100 text-ink-500 hover:bg-ink-200"
              )}
            >
              <Power className="h-3 w-3" />
              {webhook.active ? "Active" : "Off"}
            </button>
            <button
              type="button"
              onClick={() => remove(webhook)}
              className="rounded-md p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
              aria-label="Delete webhook"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
