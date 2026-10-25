"use client";

import { Bot, Eye, EyeOff, Gauge, Sparkles } from "lucide-react";
import type { ReportDTO } from "@/lib/types";
import { cn } from "@/lib/format";

interface AiDetectionPanelProps {
  report: ReportDTO;
  showAi: boolean;
  onToggleAi: () => void;
}

export function AiDetectionPanel({ report, showAi, onToggleAi }: AiDetectionPanelProps) {
  const ai = report.ai;
  const flagged = [...ai.sentenceScores]
    .filter((sentence) => sentence.label !== "human")
    .sort((left, right) => right.aiProbability - left.aiProbability)
    .slice(0, 12);

  return (
    <section className="no-print rounded-2xl border border-ink-200/80 bg-white shadow-paper">
      <div className="flex items-start justify-between gap-2 border-b border-ink-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-100 text-violet-700">
            <Bot className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink-900">AI writing</h2>
            <p className="text-[10px] uppercase tracking-wide text-ink-400">
              {ai.provider} · {ai.model}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleAi}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition",
            showAi
              ? "border-violet-300 bg-violet-50 text-violet-700"
              : "border-ink-200 text-ink-500 hover:border-ink-300"
          )}
        >
          {showAi ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {showAi ? "Highlighting" : "Hidden"}
        </button>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
              Estimated AI content
            </p>
            <p className="mt-0.5 text-3xl font-semibold tabular-nums tracking-tight text-ink-950">
              {Math.round(ai.overallScore)}
              <span className="text-base font-medium text-ink-400">%</span>
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              ai.overallScore >= 60
                ? "bg-violet-100 text-violet-700"
                : ai.overallScore >= 20
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
            )}
          >
            {ai.overallScore >= 60 ? "High signal" : ai.overallScore >= 20 ? "Mixed signal" : "Low signal"}
          </span>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-violet-500"
            style={{ width: `${Math.min(100, Math.max(0, ai.overallScore))}%` }}
          />
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-2">
          <Metric icon={Gauge} label="Perplexity" value={ai.perplexity.toFixed(1)} />
          <Metric icon={Sparkles} label="Burstiness" value={ai.burstiness.toFixed(2)} />
          <Metric label="Avg length" value={`${ai.meanSentenceLength.toFixed(0)}w`} />
        </dl>

        {ai.unavailableReason ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-800">
            {ai.unavailableReason}
          </p>
        ) : null}

        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
            Flagged sentences ({flagged.length})
          </p>
          {flagged.length === 0 ? (
            <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-800">
              No sentences crossed the AI-likelihood threshold.
            </p>
          ) : (
            <ul className="mt-1.5 max-h-[260px] space-y-2 overflow-y-auto pr-1 veritas-scroll">
              {flagged.map((sentence) => (
                <li
                  key={`${sentence.start}-${sentence.end}`}
                  className="rounded-lg bg-ink-50 px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-ink-400">
                      {sentence.label}
                    </span>
                    <span className="text-[10px] font-semibold tabular-nums text-ink-600">
                      {Math.round(sentence.aiProbability * 100)}%
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 font-serif text-[11px] leading-5 text-ink-600">
                    {sentence.sentence}
                  </p>
                  <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-ink-200">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        sentence.aiProbability >= 0.7 ? "bg-violet-500" : "bg-amber-500"
                      )}
                      style={{ width: `${Math.round(sentence.aiProbability * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon?: typeof Gauge;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-ink-50 px-2 py-1.5">
      <dt className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide text-ink-400">
        {Icon ? <Icon className="h-2.5 w-2.5" /> : null}
        {label}
      </dt>
      <dd className="mt-0.5 text-xs font-semibold tabular-nums text-ink-800">{value}</dd>
    </div>
  );
}
