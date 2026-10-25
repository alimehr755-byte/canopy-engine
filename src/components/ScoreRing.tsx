import { cn } from "@/lib/format";

interface ScoreRingProps {
  value: number;
  label: string;
  sublabel?: string;
  size?: "sm" | "md" | "lg";
  tone?: "similarity" | "ai";
}

const SIZES = {
  sm: { box: 76, stroke: 6, text: "text-lg", label: "text-[10px]" },
  md: { box: 104, stroke: 8, text: "text-2xl", label: "text-[11px]" },
  lg: { box: 136, stroke: 10, text: "text-3xl", label: "text-xs" }
};

export function ScoreRing({
  value,
  label,
  sublabel,
  size = "md",
  tone = "similarity"
}: ScoreRingProps) {
  const dimensions = SIZES[size];
  const radius = (dimensions.box - dimensions.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference - (clamped / 100) * circumference;
  const strokeClass =
    tone === "ai"
      ? clamped >= 60
        ? "stroke-violet-500"
        : clamped >= 20
          ? "stroke-amber-500"
          : "stroke-emerald-500"
      : clamped >= 45
        ? "stroke-red-500"
        : clamped >= 20
          ? "stroke-amber-500"
          : "stroke-emerald-500";

  return (
    <div className="flex items-center gap-3">
      <div className="relative" style={{ width: dimensions.box, height: dimensions.box }}>
        <svg
          viewBox={`0 0 ${dimensions.box} ${dimensions.box}`}
          className="h-full w-full -rotate-90"
          role="img"
          aria-label={`${label}: ${clamped.toFixed(0)} percent`}
        >
          <circle
            cx={dimensions.box / 2}
            cy={dimensions.box / 2}
            r={radius}
            fill="none"
            strokeWidth={dimensions.stroke}
            className="stroke-ink-200"
          />
          <circle
            cx={dimensions.box / 2}
            cy={dimensions.box / 2}
            r={radius}
            fill="none"
            strokeWidth={dimensions.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn("transition-[stroke-dashoffset] duration-700", strokeClass)}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className={cn("font-semibold tabular-nums text-ink-950", dimensions.text)}>
              {Math.round(clamped)}
              <span className="text-[0.55em] font-medium text-ink-500">%</span>
            </p>
            {sublabel ? (
              <p className={cn("font-medium uppercase tracking-wide text-ink-500", dimensions.label)}>
                {sublabel}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-ink-900">{label}</p>
        <p className="text-xs text-ink-500">
          {tone === "ai" ? "Model-estimated AI probability" : "Matched text after exclusions"}
        </p>
      </div>
    </div>
  );
}
