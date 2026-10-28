import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AppHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className="no-print border-b border-ink-800/60 bg-ink-950 text-ink-100">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/30">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <Link href="/dashboard" className="text-sm font-semibold tracking-tight text-white">
              Veritas Engine
            </Link>
            {!compact ? (
              <p className="text-[11px] uppercase tracking-[0.18em] text-ink-400">
                Academic integrity workspace
              </p>
            ) : null}
          </div>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/dashboard"
            className="rounded-md px-3 py-1.5 text-ink-300 transition hover:bg-ink-800/70 hover:text-white"
          >
            Dashboard
          </Link>
          <Link
            href="/instructor"
            className="rounded-md px-3 py-1.5 text-ink-300 transition hover:bg-ink-800/70 hover:text-white"
          >
            Instructor
          </Link>
          <a
            href="/api/health"
            className="hidden rounded-md px-3 py-1.5 text-ink-300 transition hover:bg-ink-800/70 hover:text-white sm:block"
          >
            System status
          </a>
          <Link
            href="/settings"
            className="rounded-md px-3 py-1.5 text-ink-300 transition hover:bg-ink-800/70 hover:text-white"
          >
            Settings
          </Link>
          <ThemeToggle />
          <span className="ml-2 grid h-8 w-8 place-items-center rounded-full bg-ink-800 text-xs font-semibold text-ink-200 ring-1 ring-ink-700">
            MC
          </span>
        </nav>
      </div>
    </header>
  );
}
