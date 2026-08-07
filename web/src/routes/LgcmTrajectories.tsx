import { useMemo, useState } from "react";
import { Card, SectionLabel, Segmented, Badge } from "@/components/primitives";
import { useStudyData, type LgcmOutcomeData, type GrowthPointData } from "@/api/studyData";
import styles from "./LgcmTrajectories.module.css";

/**
 * NANO Aim 1 — Latent Growth Curve Models.
 *
 * Group means (ASIB / PT / TD) with bootstrapped 95% CI ribbons across the
 * 1–3 month timepoints. Individual traces and group-difference estimates are
 * rendered only when the approved dashboard release includes them. Every value is read from
 * `dashboard_data.json → nano.lgcm_results`; nothing is hardcoded.
 */
type Outcome = "pct_sa" | "hr_decel" | "rsa";
type Group = "asib" | "pt" | "td";

const OUTCOME_OPTIONS: Array<{ value: Outcome; label: string }> = [
  { value: "pct_sa", label: "% Sustained Attn" },
  { value: "hr_decel", label: "HR Deceleration" },
  { value: "rsa", label: "RSA baseline" },
];

const GROUP_META: Record<Group, { label: string; color: string }> = {
  asib: { label: "ASIB", color: "var(--fg3)" },
  pt: { label: "PT", color: "var(--science)" },
  td: { label: "TD", color: "var(--blue)" },
};

const OUTCOME_UNIT: Record<Outcome, string> = { pct_sa: "%", hr_decel: "bpm", rsa: "ln(ms²)" };

function hasSignificanceResults(result: LgcmOutcomeData): boolean {
  return [
    result.asib_vs_td_intercept_p,
    result.asib_vs_td_slope_p,
    result.pt_vs_td_intercept_p,
    result.pt_vs_td_slope_p,
  ].some((value) => typeof value === "number" && Number.isFinite(value));
}

export function LgcmTrajectories() {
  const { data, isLoading, isError } = useStudyData();
  const [outcome, setOutcome] = useState<Outcome>("pct_sa");
  const [groups, setGroups] = useState<Record<Group, boolean>>({ asib: true, pt: true, td: true });

  const result = data?.nano.lgcm_results[outcome];
  const hasIndividualTraces = Boolean(result?.individual_traces.length);
  const hasSignificance = Boolean(result && hasSignificanceResults(result));

  function toggleGroup(g: Group) {
    setGroups((prev) => ({ ...prev, [g]: !prev[g] }));
  }

  return (
    <div className={`${styles.page} flex flex-col gap-6 p-9 max-[768px]:px-4 max-[768px]:py-6`}>
      <header className={styles.routeHeader}>
        <div className={styles.eyebrow}>
          Aim 1 · Latent growth curves · R01MH132925
        </div>
        <h1>
          LGCM Growth Trajectories
        </h1>
        <p>
          Latent growth curve intercepts and slopes on heart-defined attention and RSA from 1–3 months,
          in corrected age. One question, one live chart, and one model table. Group means use bootstrapped 95% CI ribbons when available.{" "}
          {result
            ? hasIndividualTraces
              ? "Dimmed lines show the individual traces included in this approved data release."
              : "Individual traces are not included in this data release."
            : "No trajectory release is available for this outcome yet."}
        </p>
      </header>

      <Card pad={16} className={styles.controlCard}>
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">Outcome</span>
            <Segmented options={OUTCOME_OPTIONS} value={outcome} onChange={(v) => setOutcome(v)} size="sm" ariaLabel="LGCM outcome" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">Groups</span>
            {(Object.keys(GROUP_META) as Group[]).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={groups[g]}
                onClick={() => toggleGroup(g)}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition ${
                  groups[g] ? "text-white border-transparent" : "text-[color:var(--warm-fg3)] border-[color:var(--warm-border)]"
                }`}
                style={groups[g] ? { background: GROUP_META[g].color } : undefined}
              >
                {GROUP_META[g].label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {isLoading && <Card pad={20} className={styles.routeCard}><span className="text-[13px] text-[color:var(--warm-fg3)]">Loading trajectories…</span></Card>}
      {(isError || (!isLoading && !result)) && (
        <Card pad={20} className={styles.routeCard}>
          <span className="text-[13px] text-[color:var(--warm-fg3)]">
            No LGCM results available yet. Run the NANO Aim 1 stage of the dashboard build to populate this view.
          </span>
        </Card>
      )}

      {result && (
        <>
          <Card pad={20} className={styles.chartCard}>
            <SectionLabel>Growth curve · {OUTCOME_OPTIONS.find((o) => o.value === outcome)?.label}</SectionLabel>
            <GrowthChart result={result} visible={groups} unit={OUTCOME_UNIT[outcome]} />
          </Card>

          <Card pad={20} className={styles.routeCard}>
            <SectionLabel>{hasSignificance ? "Group difference significance" : "Group comparison availability"}</SectionLabel>
            {hasSignificance ? (
              <SignificanceTable result={result} />
            ) : (
              <p role="status" className="mt-2 text-[13px] text-[color:var(--warm-fg3)]">
                Group-difference significance estimates are not available in this data release.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

const CHART_W = 720;
const CHART_H = 320;
const CHART_M = { top: 16, right: 16, bottom: 34, left: 44 };

function GrowthChart({ result, visible, unit }: { result: LgcmOutcomeData; visible: Record<Group, boolean>; unit: string }) {
  const W = CHART_W;
  const H = CHART_H;
  const M = CHART_M;

  const geom = useMemo(() => {
    const curves = result.growth_curves;
    if (!curves.length) return null;
    const times = [...new Set(curves.map((c) => c.timepoint_m))].sort((a, b) => a - b);
    const shown = curves.filter((c) => visible[c.group]);
    const traces = result.individual_traces.filter((t) => visible[t.group]);
    const allY = [
      ...shown.flatMap((c) => [c.ci_low, c.ci_high, c.mean]),
      ...traces.flatMap((t) => t.values.map((v) => v.value)),
    ];
    if (!allY.length) return { times, byGroup: {}, traces: [], sx: (_: number) => 0, sy: (_: number) => 0, yTicks: [] as number[] };
    const yMin = Math.min(...allY);
    const yMax = Math.max(...allY);
    const pad = (yMax - yMin) * 0.08 || 1;
    const lo = yMin - pad;
    const hi = yMax + pad;
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const sx = (t: number) => M.left + ((t - tMin) / (tMax - tMin || 1)) * (W - M.left - M.right);
    const sy = (y: number) => M.top + (1 - (y - lo) / (hi - lo || 1)) * (H - M.top - M.bottom);
    const byGroup: Partial<Record<Group, GrowthPointData[]>> = {};
    for (const c of shown) {
      (byGroup[c.group] ??= []).push(c);
    }
    for (const g of Object.keys(byGroup) as Group[]) byGroup[g]!.sort((a, b) => a.timepoint_m - b.timepoint_m);
    const yTicks = [lo, (lo + hi) / 2, hi];
    return { times, byGroup, traces, sx, sy, yTicks };
  }, [result, visible, W, H, M]);

  if (!geom) return <div className="text-[13px] text-[color:var(--warm-fg3)] py-6">No growth-curve points.</div>;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`${styles.growthChart} w-full h-auto mt-2`} role="img" aria-label="LGCM growth curves">
      {/* axes */}
      <line x1={M.left} y1={H - M.bottom} x2={W - M.right} y2={H - M.bottom} stroke="var(--warm-border)" />
      <line x1={M.left} y1={M.top} x2={M.left} y2={H - M.bottom} stroke="var(--warm-border)" />
      {geom.yTicks.map((y, i) => (
        <g key={i}>
          <line x1={M.left - 3} y1={geom.sy(y)} x2={W - M.right} y2={geom.sy(y)} stroke="var(--warm-border)" strokeOpacity={0.4} />
          <text x={M.left - 6} y={geom.sy(y) + 3} textAnchor="end" fontSize={10} fill="var(--warm-fg4)" fontFamily="var(--font-mono)">
            {y.toFixed(1)}
          </text>
        </g>
      ))}
      {geom.times.map((t) => (
        <text key={t} x={geom.sx(t)} y={H - M.bottom + 16} textAnchor="middle" fontSize={10} fill="var(--warm-fg4)" fontFamily="var(--font-mono)">
          {t}m
        </text>
      ))}
      <text x={12} y={M.top + 4} fontSize={10} fill="var(--warm-fg4)" fontFamily="var(--font-mono)">{unit}</text>

      {/* individual traces */}
      {geom.traces.map((t, i) => (
        <polyline
          key={`trace-${i}`}
          fill="none"
          stroke={GROUP_META[t.group].color}
          strokeOpacity={0.18}
          strokeWidth={1}
          points={t.values.map((v) => `${geom.sx(v.timepoint_m)},${geom.sy(v.value)}`).join(" ")}
        />
      ))}

      {/* CI ribbons + mean lines */}
      {(Object.keys(geom.byGroup) as Group[]).map((g) => {
        const pts = geom.byGroup[g]!;
        const ribbon = [
          ...pts.map((p) => `${geom.sx(p.timepoint_m)},${geom.sy(p.ci_high)}`),
          ...[...pts].reverse().map((p) => `${geom.sx(p.timepoint_m)},${geom.sy(p.ci_low)}`),
        ].join(" ");
        return (
          <g key={g}>
            <polygon points={ribbon} fill={GROUP_META[g].color} fillOpacity={0.14} />
            <polyline
              fill="none"
              stroke={GROUP_META[g].color}
              strokeWidth={2.2}
              points={pts.map((p) => `${geom.sx(p.timepoint_m)},${geom.sy(p.mean)}`).join(" ")}
            />
            {pts.map((p, i) => (
              <circle key={i} cx={geom.sx(p.timepoint_m)} cy={geom.sy(p.mean)} r={3} fill={GROUP_META[g].color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function fmtP(p: number | null): { text: string; sig: boolean | null } {
  if (p === null || p === undefined) return { text: "Not available", sig: null };
  return { text: p < 0.001 ? "<0.001" : p.toFixed(3), sig: p < 0.05 };
}

function SignificanceTable({ result }: { result: LgcmOutcomeData }) {
  const rows: Array<{ label: string; p: number | null }> = [
    { label: "Intercept diff · ASIB vs TD", p: result.asib_vs_td_intercept_p },
    { label: "Slope diff · ASIB vs TD", p: result.asib_vs_td_slope_p },
    { label: "Intercept diff · PT vs TD", p: result.pt_vs_td_intercept_p },
    { label: "Slope diff · PT vs TD", p: result.pt_vs_td_slope_p },
  ];
  return (
    <div className={styles.tableWrap}>
    <table className={`${styles.modelTable} w-full mt-2 text-[13px]`}>
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-[color:var(--warm-fg4)]">
          <th className="py-1.5 font-semibold">Contrast</th>
          <th className="py-1.5 font-semibold text-right">p-value</th>
          <th className="py-1.5 font-semibold text-right">Significance</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const p = fmtP(r.p);
          return (
            <tr key={r.label} className="border-t border-[color:var(--warm-border)]">
              <td className="py-2 text-[color:var(--warm-fg2)]">{r.label}</td>
              <td className="py-2 text-right font-mono text-[color:var(--warm-fg1)]">{p.text}</td>
              <td className="py-2 text-right">
                <Badge kind={p.sig === true ? "ok" : "neutral"} size="sm">
                  {p.sig === null ? "Not available" : p.sig ? "p < 0.05" : "n.s."}
                </Badge>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}
