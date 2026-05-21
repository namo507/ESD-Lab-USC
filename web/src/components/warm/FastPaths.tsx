import { useState } from "react";
import { Icon } from "@/components/primitives";

/**
 * FastPaths — precise prompt shortcuts grouped by surface.
 *
 * Three lanes (QA · Model perf · REDCap) each hold 2–3 tightly scoped prompts
 * that the operator hits often. Picking a chip fires `onSelect(prompt)`, which
 * the parent routes to LM Studio (AgenticQAPanel) or ESD Buddy (ChatDrawer).
 *
 * The lane labels are fixed-width so chip rows align column-wise — symmetry
 * stays intact across surfaces. Tone variants (`dark` / `light`) keep contrast
 * legible on both the dark agentic panel and the cream glass chat drawer.
 */
export type FastPathLane = "qa" | "model" | "redcap" | "matlab";

export interface FastPathPrompt {
  lane: FastPathLane;
  label: string;
  prompt: string;
}

export const FAST_PATHS: FastPathPrompt[] = [
  {
    lane: "qa",
    label: "NANO-0173 ectopic audit",
    prompt:
      "Summarise the ectopic-beat distribution across NANO-0173 cga_6mo epochs — flagged 14/64. Which epochs need human QA?",
  },
  {
    lane: "qa",
    label: "SQI < 0.4 sweep",
    prompt:
      "Sweep tonight's epochs with SQI < 0.4 and explain why Pan-Tompkins under-detected R-peaks on each. Rank by severity.",
  },
  {
    lane: "qa",
    label: "Median yield · 24 h",
    prompt:
      "Report median per-visit QA yield over the last 24 h. Call out any visit below 75% accepted-epoch yield.",
  },
  {
    lane: "model",
    label: "SHAP top-5 movers",
    prompt:
      "List the top-5 SHAP feature movers vs the prior nightly run for the VPT vs TD classifier. Flag any sign flips.",
  },
  {
    lane: "model",
    label: "DBSCAN cluster shift",
    prompt:
      "Compare today's DBSCAN cluster centroids against the 7-day baseline. Which cohort drifted most and why?",
  },
  {
    lane: "model",
    label: "ROC + calibration",
    prompt:
      "Give me the latest risk-classifier AUROC, Brier score, and calibration slope by site. Flag drops > 0.03 AUROC.",
  },
  {
    lane: "redcap",
    label: "medical_history_v1 PHI",
    prompt:
      "Audit medical_history_v1 sync events from the last hour. Confirm every PHI column was stripped before processed/ landed.",
  },
  {
    lane: "redcap",
    label: "Bayley-4 mapping diff",
    prompt:
      "Show the diff between today's Bayley-4 field map and yesterday's. Highlight any new fields that need a PHI verdict.",
  },
  {
    lane: "redcap",
    label: "Missing DOB · open",
    prompt:
      "List every open Intake record missing DOB or MRN. Group by site and surface the assigned coordinator.",
  },
];

const LANE_META: Record<FastPathLane, { label: string; iconKind: string; dot: string }> = {
  qa:     { label: "QA",        iconKind: "shield-check",    dot: "var(--green)" },
  model:  { label: "Model",     iconKind: "activity",        dot: "var(--ocean-ring)" },
  redcap: { label: "REDCap",    iconKind: "database",        dot: "var(--usc-gold)" },
  matlab: { label: "MATLAB",    iconKind: "function-square", dot: "var(--usc-garnet)" },
};

interface Props {
  /** Prompt selected — parent should route to LM Studio or Buddy. */
  onSelect: (prompt: string) => void;
  /** Tone variant. `dark` for terminal-style surfaces, `light` for glass panels. */
  tone?: "dark" | "light";
  /** Override prompt list. Defaults to `FAST_PATHS`. */
  prompts?: FastPathPrompt[];
  /** Compact removes lane labels. Wide keeps the column-locked layout. */
  density?: "compact" | "wide";
}

export function FastPaths({ onSelect, tone = "dark", prompts = FAST_PATHS, density = "wide" }: Props) {
  const [active, setActive] = useState<FastPathLane | "all">("all");
  const lanes: FastPathLane[] = ["qa", "model", "redcap", "matlab"];

  const dark = tone === "dark";
  const baseChip = dark
    ? "bg-white/[0.04] border-white/[0.08] text-[color:#d8d4cc] hover:bg-white/[0.08] hover:border-gold/40 hover:text-gold"
    : "bg-white/70 border-[color:var(--glass-stroke-soft)] text-[color:var(--warm-700)] hover:bg-white hover:text-[color:var(--ink)] hover:border-[color:var(--usc-garnet)]";
  const baseLabel = dark
    ? "text-[10px] font-mono uppercase tracking-[0.12em] text-[color:#9c9893]"
    : "text-[10px] font-mono uppercase tracking-[0.12em] text-[color:var(--warm-500)]";

  const filterTab = (l: FastPathLane | "all", label: string) => {
    const on = active === l;
    return (
      <button
        key={l}
        type="button"
        onClick={() => setActive(l)}
        className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-[0.1em] uppercase transition ${
          on
            ? dark
              ? "bg-gold/15 border border-gold/40 text-gold"
              : "bg-[color:var(--usc-garnet)] border border-[color:var(--usc-garnet)] text-[color:var(--cream)]"
            : dark
              ? "bg-white/[0.04] border border-white/[0.08] text-[color:#9c9893] hover:text-[color:#e8e6e2]"
              : "bg-white/60 border border-[color:var(--glass-stroke-soft)] text-[color:var(--warm-600)] hover:text-[color:var(--ink)]"
        }`}
        aria-pressed={on}
      >
        {label}
      </button>
    );
  };

  const filtered = active === "all" ? prompts : prompts.filter((p) => p.lane === active);
  const grouped: Record<FastPathLane, FastPathPrompt[]> = { qa: [], model: [], redcap: [], matlab: [] };
  filtered.forEach((p) => grouped[p.lane].push(p));

  return (
    <div className="flex flex-col gap-2.5" aria-label="Fast-path prompts">
      <div className="flex items-center justify-between gap-2">
        <span className={baseLabel}>Fast-paths · QA · Model · REDCap · MATLAB</span>
        <div className="flex gap-1.5">
          {filterTab("all", "all")}
          {lanes.map((l) => filterTab(l, LANE_META[l].label))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {lanes.map((l) => {
          const rows = grouped[l];
          if (!rows.length) return null;
          return (
            <div
              key={l}
              className={
                density === "wide"
                  ? "grid grid-cols-[68px_1fr] gap-2.5 items-center"
                  : "flex flex-wrap gap-1.5 items-center"
              }
            >
              {density === "wide" && (
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: LANE_META[l].dot, boxShadow: `0 0 8px ${LANE_META[l].dot}` }}
                    aria-hidden
                  />
                  <span className={baseLabel}>{LANE_META[l].label}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {rows.map((p) => (
                  <button
                    key={p.prompt}
                    type="button"
                    onClick={() => onSelect(p.prompt)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border transition ${baseChip}`}
                    title={p.prompt}
                  >
                    <Icon
                      name={LANE_META[l].iconKind}
                      size={11}
                      stroke={1.5}
                      color={dark ? "var(--usc-gold)" : "var(--usc-garnet)"}
                    />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
