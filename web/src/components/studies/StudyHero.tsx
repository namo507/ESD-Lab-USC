import { useMemo } from "react";
import { Card, SectionLabel } from "@/components/primitives";
import { useStudyData, type NanoData, type NicoData, type ScatterPointData } from "@/api/studyData";
import { useUi } from "@/store/ui";

/**
 * Dual-study hero for the Overview page.
 *
 * Renders the NANO and/or NICO hero panels driven entirely by the additive
 * `nano` / `nico` blocks of `dashboard_data.json` — every count and statistic
 * is data-driven (no hardcoded study literals). Which panels show is governed
 * by the global `activeStudy` scope from the sidebar StudySelector.
 */
export function StudyHero() {
  const activeStudy = useUi((s) => s.activeStudy);
  const { data, isLoading, isError } = useStudyData();

  if (isLoading) {
    return (
      <section aria-label="Study overview" aria-busy="true">
        <Card pad={20}>
          <div className="text-[13px] text-[color:var(--warm-fg3)]">Loading study overview…</div>
        </Card>
      </section>
    );
  }
  if (isError || !data) {
    return (
      <section aria-label="Study overview">
        <Card pad={20}>
          <div className="text-[13px] text-[color:var(--warm-fg3)]">
            Study overview data unavailable. Re-run the dashboard build to populate NANO/NICO blocks.
          </div>
        </Card>
      </section>
    );
  }

  const showNano = activeStudy === "NANO" || activeStudy === "BOTH";
  const showNico = activeStudy === "NICO" || activeStudy === "BOTH";
  const both = showNano && showNico;

  return (
    <section aria-label="Dual-study overview" data-tour="study-hero">
      <div className="mb-3">
        <SectionLabel>Studies</SectionLabel>
        <div className="font-serif text-[18px] font-semibold text-[color:var(--warm-fg1)] mt-1">
          NANO &amp; NICO — enrollment, data quality &amp; preliminary findings
        </div>
      </div>
      <div className={`grid gap-3.5 ${both ? "grid-cols-2 max-[1000px]:grid-cols-1" : "grid-cols-1"}`}>
        {showNano && <NanoPanel nano={data.nano} />}
        {showNico && <NicoPanel nico={data.nico} />}
      </div>
    </section>
  );
}

function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function ProgressBar({ value, target, color }: { value: number; target: number; color: string }) {
  const frac = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <div
      className="h-2 rounded-full bg-[color:var(--slate-100)] overflow-hidden"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={target}
    >
      <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: color }} />
    </div>
  );
}

function StatRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-[color:var(--warm-border)] last:border-0">
      <span className="text-[12px] text-[color:var(--warm-fg3)]">{label}</span>
      <span className="text-[13px] font-mono font-semibold text-[color:var(--warm-fg1)]">{value}</span>
    </div>
  );
}

function PrelimCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--r-card)] border border-amber-400 bg-amber-50 text-amber-900 p-3.5 mt-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700 flex items-center gap-1.5">
        <span aria-hidden>★</span> Preliminary Finding — Pilot Data
      </div>
      {children}
    </div>
  );
}

function NanoPanel({ nano }: { nano: NanoData }) {
  const { study_meta: m, enrollment: e, active_followup: f } = nano;
  const ecgValid = mean(Object.values(nano.ecg_quality.pct_valid_ecg_by_visit));
  const hdaSynced = mean(Object.values(nano.ecg_quality.pct_hda_synced_by_visit));
  const startYear = m.start_date.slice(0, 4);
  const endYear = m.end_date.slice(0, 4);

  return (
    <Card pad={18} dataInsight="nano-hero">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-[13px] font-bold tracking-[0.02em] px-2 py-0.5 rounded-md text-white"
            style={{ background: "var(--color-indigo-500, #6366F1)" }}
          >
            NANO
          </span>
          <span className="text-[11px] font-mono text-[color:var(--warm-fg3)]">
            {m.award} · {startYear}–{endYear}
          </span>
        </div>
      </div>

      <div className="mb-2">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[12px] text-[color:var(--warm-fg3)]">Enrollment</span>
          <span className="text-[13px] font-mono font-semibold text-[color:var(--warm-fg1)]">
            {e.total} / {m.n_target}
          </span>
        </div>
        <ProgressBar value={e.total} target={m.n_target} color="var(--color-indigo-500, #6366F1)" />
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono text-[color:var(--warm-fg3)]">
          <span><span style={{ color: "#F59E0B" }}>■</span> ASIB {e.asib}/{m.n_target_asib}</span>
          <span><span style={{ color: "#14B8A6" }}>■</span> PT {e.pt}/{m.n_target_pt}</span>
          <span><span style={{ color: "#6366F1" }}>■</span> TD {e.td}/{m.n_target_td}</span>
        </div>
      </div>

      <div className="mt-2">
        <StatRow label="Active follow-up · 1–3m / 6–12m / 24–36m" value={`${f["1_3m"] ?? 0} / ${f["6_12m"] ?? 0} / ${f["24_36m"] ?? 0}`} />
        <StatRow label="ECG valid (mean across visits)" value={pct(ecgValid)} />
        <StatRow label="HDA synced (mean across visits)" value={pct(hdaSynced)} />
      </div>

      <PrelimCard>
        <div className="mt-1 text-[15px] font-serif font-semibold">
          {Math.round(nano.preliminary_finding.value * 100)}% MLP classification accuracy
        </div>
        <div className="text-[11px]">ASIB vs TD · neonatal ECG features · N = {nano.preliminary_finding.n} pilot</div>
      </PrelimCard>
    </Card>
  );
}

function NicoPanel({ nico }: { nico: NicoData }) {
  const { study_meta: m, enrollment: e } = nico;
  const startYear = m.start_date.slice(0, 4);
  const endYear = m.end_date.slice(0, 4);
  const thermalValid = nico.thermal_data.summary_stats.pct_days_ge_80_valid;

  return (
    <Card pad={18} dataInsight="nico-hero">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span
            className="text-[13px] font-bold tracking-[0.02em] px-2 py-0.5 rounded-md text-white"
            style={{ background: "var(--color-teal-500, #14B8A6)" }}
          >
            NICO
          </span>
          <span className="text-[11px] font-mono text-[color:var(--warm-fg3)]">
            {m.award} · {startYear}–{endYear}
          </span>
        </div>
      </div>

      <div className="mb-2">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[12px] text-[color:var(--warm-fg3)]">Enrollment</span>
          <span className="text-[13px] font-mono font-semibold text-[color:var(--warm-fg1)]">
            {e.total_enrolled} / {m.n_target_enrolled}
          </span>
        </div>
        <ProgressBar value={e.total_enrolled} target={m.n_target_enrolled} color="var(--color-teal-500, #14B8A6)" />
      </div>

      <div className="mt-2">
        <StatRow label="Currently in-NICU / discharged" value={`${e.in_nicu} / ${e.discharged}`} />
        <StatRow label="Thermal QA · days ≥80% valid" value={pct(thermalValid)} />
        <StatRow label="Completers target" value={m.n_target_completers} />
      </div>

      <PrelimCard>
        <div className="mt-1 flex items-center gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-serif font-semibold">
              r = {nico.preliminary_finding.r}, p &lt; {nico.preliminary_finding.p}
            </div>
            <div className="text-[11px]">HRC Score × SORF ASD symptoms at 12m · N = {nico.preliminary_finding.n} pilot VPT</div>
          </div>
          <MiniScatter points={nico.preliminary_finding.scatter_points} />
        </div>
      </PrelimCard>
    </Card>
  );
}

/** De-identified aggregate scatter — no PHI, pilot data only. */
function MiniScatter({ points }: { points: ScatterPointData[] }) {
  const W = 120;
  const H = 72;
  const P = 6;
  const geom = useMemo(() => {
    if (!points.length) return null;
    const xs = points.map((p) => p.hrc_score);
    const ys = points.map((p) => p.sorf_asd_symptoms);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const sx = (x: number) => P + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * P);
    const sy = (y: number) => H - P - ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * P);
    // least-squares trend line endpoints
    const n = points.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const denom = xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1;
    const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0) / denom;
    const intercept = my - slope * mx;
    return {
      dots: points.map((p) => ({ cx: sx(p.hrc_score), cy: sy(p.sorf_asd_symptoms) })),
      line: { x1: sx(xMin), y1: sy(intercept + slope * xMin), x2: sx(xMax), y2: sy(intercept + slope * xMax) },
    };
  }, [points]);

  if (!geom) return null;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-none rounded bg-white/60" role="img" aria-label="Pilot HRC by SORF scatter">
      <line x1={geom.line.x1} y1={geom.line.y1} x2={geom.line.x2} y2={geom.line.y2} stroke="#B45309" strokeWidth={1.5} strokeDasharray="3 2" />
      {geom.dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={2.6} fill="#D97706" fillOpacity={0.8} />
      ))}
    </svg>
  );
}
