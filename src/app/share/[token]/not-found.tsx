import Link from "next/link";
import { Lock } from "lucide-react";

export default function ShareNotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-ink-100 text-ink-500">
        <Lock className="h-5 w-5" />
      </span>
      <h1 className="mt-4 text-lg font-semibold tracking-tight text-ink-950">
        This report link is unavailable
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        The link is invalid, revoked, or its access window has ended. Ask the person who shared
        this report for a fresh link.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-ink-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800"
      >
        Go to dashboard
      </Link>
    </main>
  );
}
