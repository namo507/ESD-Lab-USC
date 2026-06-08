/**
 * @route CgaMilestoneRiver
 * @data-sensitivity: AGGREGATED - no PII
 * @auth-required: false (internal demo mode only)
 * @hipaa-note: All data rendered here is group-level aggregates. No PHI present.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as d3 from "d3";
import { Card, Gloss, SectionLabel, Segmented, Tooltip } from "@/components/primitives";
import { useHdaComposition } from "@/api/hooks";
import type { GroupCode, HdaCompositionPoint, HdaPhase } from "@/api/schemas";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { CGA_MONTHS } from "@/components/timeline/TimelineAxis";
import shared from "./FeatureRoutes.module.css";
import styles from "./CgaMilestoneRiver.module.css";

type GroupChoice = "All" | GroupCode;
type PhaseChoice = "all" | "sustained" | "orienting";

const PHASES: HdaPhase[] = ["orienting", "sustained", "inattention", "termination"];
const PHASE_COLOR: Record<HdaPhase, string> = {
  orienting: "var(--blue)",
  sustained: "var(--green)",
  inattention: "var(--purple)",
  termination: "var(--red)",
};

function averageRows(groups: HdaCompositionPoint[][]): HdaCompositionPoint[] {
  return CGA_MONTHS.map((month, idx) => {
    const rows = groups
      .map((group) => group[idx])
      .filter((row): row is HdaCompositionPoint => Boolean(row));
    const avg = (phase: HdaPhase) => d3.mean(rows, (row) => row[phase]) ?? 0;
    return { month, orienting: avg("orienting"), sustained: avg("sustained"), inattention: avg("inattention"), termination: avg("termination") };
  });
}

function dominantSummary(rows: HdaCompositionPoint[]): string {
  const last = rows[rows.length - 1];
  if (!last) return "No HDA composition data available.";
  const [phase, value] = PHASES.map((p) => [p, last[p]] as const).sort((a, b) => b[1] - a[1])[0]!;
  return `At 36 months, ${phase} is the dominant HDA phase at ${(value * 100).toFixed(1)} percent of accepted windows.`;
}

export function CgaMilestoneRiver() {
  const enabled = useFeatureFlag("CGA_RIVER");
  const [searchParams] = useSearchParams();
  const query = useHdaComposition();
  const [group, setGroup] = useState<GroupChoice>(() => {
    const value = searchParams.get("group");
    return value === "VPT" || value === "ASIB" || value === "TD" ? value : "All";
  });
  const [phaseFilter, setPhaseFilter] = useState<PhaseChoice>(() => {
    const value = searchParams.get("phase");
    return value === "sustained" || value === "orienting" ? value : "all";
  });
  const [animate, setAnimate] = useState(true);
  const [helperOpen, setHelperOpen] = useState(true);

  const rows = useMemo(() => {
    const byGroup = query.data?.byGroup;
    if (!byGroup) return [];
    if (group !== "All") return byGroup[group] ?? [];
    return averageRows([byGroup.VPT ?? [], byGroup.ASIB ?? [], byGroup.TD ?? []]);
  }, [group, query.data?.byGroup]);

  const visiblePhases = phaseFilter === "all" ? PHASES : [phaseFilter];
  const W = 860;
  const H = 390;
  const pad = { l: 54, r: 20, t: 24, b: 44 };
  const x = d3.scaleLinear().domain([0, 36]).range([pad.l, W - pad.r]);
  const y = d3.scaleLinear().domain([0, phaseFilter === "all" ? 1 : Math.max(0.2, d3.max(rows, (row) => row[phaseFilter]) ?? 0.2)]).range([H - pad.b, pad.t]);
  const layers = visiblePhases.map((phase, phaseIndex) => {
    const previous = visiblePhases.slice(0, phaseIndex);
    return {
      phase,
      points: rows.map((row) => {
        const baseline = previous.reduce((sum, prior) => sum + row[prior], 0);
        const value = row[phase];
        return phaseFilter === "all"
          ? { month: row.month, y0: baseline, y1: baseline + value }
          : { month: row.month, y0: 0, y1: value };
      }),
    };
  });
  const area = d3.area<{ month: number; y0: number; y1: number }>()
    .x((point) => x(point.month))
    .y0((point) => y(point.y0))
    .y1((point) => y(point.y1))
    .curve(d3.curveCatmullRom.alpha(0.35));

  if (!enabled) return null;

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <header className={shared.hero}>
        <div>
          <span className={`${shared.eyebrow} t-mono`}>Longitudinal composition</span>
          <h1 className={shared.h1}>CGA Milestone River</h1>
          <p className={shared.lede}>A ribbon view of how HDA phase composition changes across canonical corrected-age milestones.</p>
        </div>
        <button type="button" className={styles.helperToggle} onClick={() => setHelperOpen((value) => !value)} aria-expanded={helperOpen}>
          {helperOpen ? "Hide helper" : "Show helper"}
        </button>
      </header>

      <div className={styles.layout}>
        <Card pad={0}>
          <div className={styles.controls}>
            <Segmented<GroupChoice>
              ariaLabel="Select cohort group"
              options={[
                { value: "All", label: "All" },
                { value: "VPT", label: "VPT" },
                { value: "ASIB", label: "ASIB" },
                { value: "TD", label: "TD" },
              ]}
              value={group}
              onChange={setGroup}
              size="sm"
            />
            <Segmented<PhaseChoice>
              ariaLabel="Select HDA phase filter"
              options={[
                { value: "all", label: "All Phases" },
                { value: "sustained", label: "Sustained Only" },
                { value: "orienting", label: "Orienting Only" },
              ]}
              value={phaseFilter}
              onChange={setPhaseFilter}
              size="sm"
            />
            <label className={styles.toggle}>
              <input type="checkbox" checked={animate} onChange={(event) => setAnimate(event.target.checked)} />
              Animate on load
            </label>
          </div>

          <div className={styles.chartWrap}>
            <SectionLabel>Stacked-area stream</SectionLabel>
            {query.isError && <div className={shared.alert}>Unable to load data - check pipeline status</div>}
            <figure aria-label={dominantSummary(rows)} style={{ margin: 0 }}>
              <figcaption className="sr-only">{dominantSummary(rows)}</figcaption>
              <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label={dominantSummary(rows)}>
                {y.ticks(4).map((tick) => (
                  <g key={tick}>
                    <line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} stroke="var(--slate-100)" />
                    <text x={pad.l - 8} y={y(tick) + 3} textAnchor="end" className={shared.tinyLabel}>{(tick * 100).toFixed(0)}%</text>
                  </g>
                ))}
                {CGA_MONTHS.map((month) => (
                  <g key={month}>
                    <line x1={x(month)} x2={x(month)} y1={H - pad.b} y2={H - pad.b + 4} stroke="var(--slate-400)" />
                    <text x={x(month)} y={H - pad.b + 18} textAnchor="middle" className={shared.tinyLabel}>{month}</text>
                  </g>
                ))}
                <text x={pad.l} y={H - 6} className={shared.tinyLabel}>CGA months</text>
                {(query.isLoading ? PHASES.map((phase, index) => ({
                  phase,
                  points: CGA_MONTHS.map((month) => ({ month, y0: index * 0.16, y1: index * 0.16 + 0.12 })),
                })) : layers).map((layer) => (
                  <g key={layer.phase}>
                    <title>{`${layer.phase}: share of accepted HDA windows at each CGA milestone.`}</title>
                    <path
                      d={area(layer.points) ?? ""}
                      fill={PHASE_COLOR[layer.phase]}
                      opacity={query.isLoading ? 0.4 : 0.72}
                      className={`${animate ? styles.areaAnimated : ""} ${query.isLoading ? styles.skeleton : ""}`}
                    />
                  </g>
                ))}
              </svg>
            </figure>
          </div>
          <div className={styles.legend}>
            {visiblePhases.map((phase) => (
              <Tooltip key={phase} text={`${phase}: share of accepted HDA windows at each CGA milestone.`} persistent>
                <span className={styles.legendItem}>
                  <span className={styles.swatch} style={{ background: PHASE_COLOR[phase] }} />
                  {phase}
                </span>
              </Tooltip>
            ))}
          </div>
        </Card>

        {helperOpen && (
          <aside className={styles.helperPanel} data-insight="cga-river-helper">
            <h2>What am I looking at?</h2>
            <p>
              Each ribbon is the proportion of accepted ECG windows labeled as an <Gloss term="HDA">HDA</Gloss> phase at a corrected-age milestone.
            </p>
            <p>
              Sustained attention growing over time usually means more stable orienting and regulation during the visit.
            </p>
            <Tooltip gloss="HDA" persistent>
              <span style={{ color: "var(--usc-garnet)", fontWeight: 700, cursor: "help" }}>Gloss: HDA</span>
            </Tooltip>
          </aside>
        )}
      </div>
    </div>
  );
}
