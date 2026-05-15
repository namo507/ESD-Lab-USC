import type { ReactNode } from "react";
import { Counter } from "./Counter";
import { AreaSparkline } from "./AreaSparkline";

export type MetricAccent = "sage" | "ocean" | "sand" | "mint";

interface MetricCardProps {
  label: ReactNode;
  value: number;
  unit?: string;
  sub?: ReactNode;
  delta?: string;
  deltaKind?: "up" | "down" | "flat";
  spark?: number[];
  badge?: string;
  accent: MetricAccent;
  decimals?: number;
  /** Replay counter from 0 when this changes (e.g., force-sync). */
  syncTick?: number;
  formatter?: (v: number) => string;
}

const DOT: Record<MetricAccent, string> = {
  sage:  "var(--sage)",
  ocean: "var(--ocean)",
  sand:  "var(--sand)",
  mint:  "var(--mint-ring)",
};

const WASH: Record<MetricAccent, string> = {
  sage:  "accent-wash-sage",
  ocean: "accent-wash-ocean",
  sand:  "accent-wash-sand",
  mint:  "accent-wash-mint",
};

const DELTA_COLOR = {
  up:   "var(--sage)",
  down: "var(--red)",
  flat: "var(--warm-fg3)",
};

/**
 * Warm KPI tile from the design package — accent gradient wash + animated
 * counter + sparkline. Wraps the existing `Card` aesthetic with the new
 * blended look so the rest of the page can read the same token surface.
 */
export function MetricCard({
  label,
  value,
  unit,
  sub,
  delta,
  deltaKind = "flat",
  spark,
  badge,
  accent,
  decimals = 0,
  syncTick = 0,
  formatter,
}: MetricCardProps) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-white border border-[color:var(--warm-border)] shadow-card min-h-[152px]">
      <div className={`absolute inset-0 pointer-events-none ${WASH[accent]}`} />
      <div className="relative flex flex-col h-full p-[22px]">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: DOT[accent] }} aria-hidden />
            <span className="text-[11px] uppercase tracking-[0.08em] font-medium text-[color:var(--warm-fg3)]">
              {label}
            </span>
          </div>
          {badge && (
            <span className="text-[10px] font-mono bg-garnet text-white px-1.5 py-[3px] rounded-full tracking-[0.04em]">
              {badge}
            </span>
          )}
        </div>

        <div className="mt-3.5 flex items-baseline gap-2">
          <span className="font-serif text-[38px] font-semibold leading-none -tracking-[0.02em] text-[color:var(--warm-fg1)]">
            <Counter
              to={value}
              decimals={decimals}
              trigger={syncTick}
              formatter={formatter}
            />
          </span>
          {unit && <span className="text-[13px] font-mono text-[color:var(--warm-fg3)]">{unit}</span>}
        </div>

        {sub && <div className="text-[12px] text-[color:var(--warm-fg3)] mt-1.5 leading-snug">{sub}</div>}

        <div className="mt-auto pt-3.5 flex justify-between items-end">
          {delta && (
            <span
              className="text-[11px] font-mono inline-flex items-center gap-1"
              style={{ color: DELTA_COLOR[deltaKind] }}
            >
              <span aria-hidden>{deltaKind === "up" ? "↗" : deltaKind === "down" ? "↘" : "→"}</span>
              {delta}
            </span>
          )}
          {spark && <AreaSparkline values={spark} w={108} h={28} accent={accent} />}
        </div>
      </div>
    </div>
  );
}
