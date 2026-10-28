"use client";

import { useState } from "react";
import { Copy, KeyRound, Loader2, Plus, Ban, Trash2 } from "lucide-react";
import { cn, formatDate } from "@/lib/format";

interface KeyItem {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  revoked: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export function ApiKeyManager({ initialKeys }: { initialKeys: KeyItem[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRaw, setCreatedRaw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !name.trim()) return;
    setPending(true);
    setError(null);
    setCreatedRaw(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const payload = (await res.json()) as {
        id?: string;
        prefix?: string;
        key?: string;
        error?: string;
      };
      if (!res.ok || !payload.id || !payload.key || !payload.prefix) {
        throw new Error(payload.error ?? "Could not create API key.");
      }
      setKeys((prev) => [
        {
          id: payload.id!,
          name: name.trim(),
          prefix: payload.prefix!,
          scopes: ["submit:read", "submit:write", "report:read"],
          revoked: false,
          lastUsedAt: null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setCreatedRaw(payload.key);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create API key.");
    } finally {
      setPending(false);
    }
  }

  async function revoke(key: KeyItem) {
    setKeys((prev) => prev.map((k) => (k.id === key.id ? { ...k, revoked: true } : k)));
    await fetch(`/api/keys/${key.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revoked: true }),
    }).catch(() => undefined);
  }

  async function remove(key: KeyItem) {
    setKeys((prev) => prev.filter((k) => k.id !== key.id));
    await fetch(`/api/keys/${key.id}`, { method: "DELETE" }).catch(() => undefined);
  }

  function copyRaw() {
    if (createdRaw) {
      void navigator.clipboard.writeText(createdRaw).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  return (
    <div className="px-5 py-5">
      <form onSubmit={createKey} className="flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Key name, e.g. lms-integration"
          className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
        />
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create
        </button>
      </form>

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

      {createdRaw ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">New API key (copy it now — it is hidden after you leave):</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="block flex-1 break-all">{createdRaw}</code>
            <button
              type="button"
              onClick={copyRaw}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 font-medium text-amber-900 transition hover:bg-amber-100"
            >
              <Copy className="h-3 w-3" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}

      <ul className="mt-4 space-y-2">
        {keys.length === 0 ? (
          <li className="py-6 text-center text-xs text-ink-400">No API keys yet.</li>
        ) : null}
        {keys.map((key) => (
          <li
            key={key.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border border-ink-100 px-3 py-2.5",
              key.revoked ? "bg-ink-50 opacity-70" : "bg-white"
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
                <KeyRound className="h-3 w-3 shrink-0 text-ink-400" />
                {key.name}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-400">
                <code className="rounded bg-ink-100 px-1">{key.prefix}…</code>
                {key.lastUsedAt ? ` · used ${formatDate(new Date(key.lastUsedAt).toISOString())}` : " · never used"}
              </p>
            </div>
            {!key.revoked ? (
              <button
                type="button"
                onClick={() => revoke(key)}
                className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2 py-1 text-[11px] font-medium text-ink-600 transition hover:bg-ink-200"
              >
                <Ban className="h-3 w-3" />
                Revoke
              </button>
            ) : (
              <span className="text-[11px] font-medium text-ink-400">Revoked</span>
            )}
            <button
              type="button"
              onClick={() => remove(key)}
              className="rounded-md p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
              aria-label="Delete key"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
