"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { ReportDTO } from "@/lib/types";
import { cn, truncate } from "@/lib/format";

const LABELS: Record<string, string> = {
  HOMOGLYPH: "Homoglyph substitution",
  INVISIBLE_CHARACTER: "Zero-width / bidi characters",
  CONTROL_CHARACTER: "Control characters",
  PRIVATE_USE_CHARACTER: "Private-use glyphs",
  ENCODING_ANOMALY: "Encoding anomaly",
  REPLACEMENT_CHARACTER: "Replacement characters"
};

export function FlagsPanel({ report }: { report: ReportDTO }) {
  const counts = new Map<string, number>();
  for (const finding of report.findings) {
    counts.set(finding.code, (counts.get(finding.code) ?? 0) + 1);
  }
  const groups = Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  const visible = report.findings.slice(0, 8);

  return (
    <section className="no-print rounded-2xl border border-ink-200/80 bg-white shadow-paper">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "grid h-7 w-7 place-items-center rounded-lg",
              report.findings.length > 0
                ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700"
            )}
          >
            {report.findings.length > 0 ? (
              <ShieldAlert className="h-4 w-4" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Evasion flags</h2>
            <p className="text-[10px] uppercase tracking-wide text-ink-400">
              Hidden text · homoglyphs · encoding
            </p>
          </div>
        </div>
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-ink-600">
          {report.findings.length}
        </span>
      </div>

      <div className="px-4 py-3">
        {groups.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {groups.map(([code, count]) => (
              <span
                key={code}
                className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200"
              >
                {LABELS[code] ?? code} · {count}
              </span>
            ))}
          </div>
        ) : null}

        {visible.length === 0 ? (
          <p className="rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] leading-4 text-emerald-800">
            No hidden text, homoglyph substitution, or font encoding anomalies were detected.
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((finding, index) => (
              <li
                key={`${finding.code}-${finding.start}-${index}`}
                className="rounded-lg border border-ink-100 bg-ink-50/60 px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                    {LABELS[finding.code] ?? finding.code}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                      finding.severity === "high"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    )}
                  >
                    {finding.severity}
                  </span>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-ink-500">{finding.message}</p>
                <p className="mt-1 truncate font-mono text-[10px] text-ink-400">
                  {truncate(finding.sample.replace(/\n/gu, " "), 64)}
                </p>
              </li>
            ))}
            {report.findings.length > visible.length ? (
              <li className="text-center text-[10px] text-ink-400">
                +{report.findings.length - visible.length} more findings
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </section>
  );
}
