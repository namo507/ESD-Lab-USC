import { useMemo, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";
import type { HdaCompositionPoint, HdaCompositionResponse, Stage } from "@/api/schemas";
import discoverySunburstUrl from "@/assets/brand-esd/icons/sunburst-discovery-blue.png";
import styles from "./SignalWorkbench.module.css";

type GroupChoice = "ALL" | "VPT" | "ASIB" | "TD";
type RangeChoice = "early" | "year" | "all";
type PhaseKey = Exclude<keyof HdaCompositionPoint, "month">;

const PHASES: Array<{ key: PhaseKey; label: string; color: string }> = [
  { key: "sustained", label: "Sustained", color: "#2f6df6" },
  { key: "orienting", label: "Orienting", color: "#91baf4" },
  { key: "inattention", label: "Inattention", color: "#f57f00" },
  { key: "termination", label: "Termination", color: "#f4c400" },
];

const RANGE_OPTIONS: Array<{ value: RangeChoice; label: string; maxMonth: number }> = [
  { value: "early", label: "0-3m", maxMonth: 3 },
  { value: "year", label: "0-12m", maxMonth: 12 },
  { value: "all", label: "All", maxMonth: Number.POSITIVE_INFINITY },
];

interface SignalWorkbenchProps {
  composition?: HdaCompositionResponse;
  stages: Stage[];
  rmssd: number;
  passRate: number;
  onOpenResults: () => void;
  onOpenPipeline: () => void;
  onAsk: (seed: string) => void;
}

function averageGroups(composition: HdaCompositionResponse): HdaCompositionPoint[] {
  const groups = [composition.byGroup.VPT ?? [], composition.byGroup.ASIB ?? [], composition.byGroup.TD ?? []];
  const months = [...new Set(groups.flatMap((rows) => rows.map((row) => row.month)))].sort((a, b) => a - b);

  return months.map((month) => {
    const rows = groups.flatMap((groupRows) => groupRows.filter((row) => row.month === month));
    const mean = (phase: PhaseKey) => rows.reduce((sum, row) => sum + row[phase], 0) / Math.max(rows.length, 1);
    return {
      month,
      sustained: mean("sustained"),
      orienting: mean("orienting"),
      inattention: mean("inattention"),
      termination: mean("termination"),
    };
  });
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function stageStatus(stage: Stage) {
  if (stage.fail > 0) return { label: "Review", tone: "review" } as const;
  if (stage.inflight > 0) return { label: "In flight", tone: "active" } as const;
  if (stage.queued > 0) return { label: "Queued", tone: "queued" } as const;
  return { label: "Complete", tone: "complete" } as const;
}

function groupLabel(group: GroupChoice) {
  return group === "ALL" ? "All cohorts" : group;
}

export function SignalWorkbench({
  composition,
  stages,
  rmssd,
  passRate,
  onOpenResults,
  onOpenPipeline,
  onAsk,
}: SignalWorkbenchProps) {
  const [group, setGroup] = useState<GroupChoice>("ALL");
  const [range, setRange] = useState<RangeChoice>("all");
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const visibleRows = useMemo(() => {
    if (!composition) return [];
    const source = group === "ALL" ? averageGroups(composition) : composition.byGroup[group] ?? [];
    const maxMonth = RANGE_OPTIONS.find((option) => option.value === range)?.maxMonth ?? Number.POSITIVE_INFINITY;
    return source.filter((row) => row.month <= maxMonth);
  }, [composition, group, range]);

  const activePoint = useMemo(
    () => visibleRows.find((row) => row.month === selectedMonth) ?? visibleRows.at(-1),
    [selectedMonth, visibleRows],
  );

  const dominantPhase = useMemo(() => {
    if (!activePoint) return null;
    return PHASES.reduce((best, phase) => (activePoint[phase.key] > activePoint[best.key] ? phase : best));
  }, [activePoint]);

  const insight = activePoint && dominantPhase
    ? `${groupLabel(group)} at ${activePoint.month} corrected-age months show ${percent(activePoint.sustained)} sustained attention; ${dominantPhase.label.toLowerCase()} is the largest phase. QA has cleared ${passRate.toFixed(1)}% of processed windows.`
    : `Aggregate attention composition is loading. Median RMSSD is currently ${rmssd.toFixed(1)} ms.`;

  const askSeed = activePoint
    ? `Explain the ${groupLabel(group)} attention phase mix at ${activePoint.month} corrected-age months, including ${percent(activePoint.sustained)} sustained attention, RMSSD at ${rmssd.toFixed(1)} ms, and the ${passRate.toFixed(1)}% QA pass rate. Use plain language.`
    : "Explain the NANO attention phase timeline and median RMSSD in plain language.";

  const chartWidth = 720;
  const chartHeight = 236;
  const plot = { left: 42, right: 708, top: 14, bottom: 198 };
  const plotHeight = plot.bottom - plot.top;
  const slotWidth = (plot.right - plot.left) / Math.max(visibleRows.length, 1);
  const barWidth = Math.min(42, slotWidth * 0.58);

  return (
    <section className={styles.workbench} aria-label="Live NANO analytics" data-discovery-part="signal-workbench">
      <article className={`${styles.panel} ${styles.timelinePanel}`}>
        <header className={styles.panelHeader}>
          <div>
            <h2>Attention phase timeline</h2>
            <p>Percent of accepted windows by corrected age.</p>
          </div>
          <div className={styles.timelineControls}>
            <label className={styles.selectWrap}>
              <span className={styles.srOnly}>Cohort</span>
              <select value={group} onChange={(event) => setGroup(event.target.value as GroupChoice)}>
                <option value="ALL">All cohorts</option>
                <option value="VPT">VPT</option>
                <option value="ASIB">ASIB</option>
                <option value="TD">TD</option>
              </select>
            </label>
            <div className={styles.segmented} aria-label="Corrected-age range">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={range === option.value}
                  onClick={() => {
                    setRange(option.value);
                    setSelectedMonth(null);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className={styles.chartWrap}>
          {visibleRows.length > 0 ? (
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-labelledby="attention-chart-title attention-chart-desc">
              <title id="attention-chart-title">Attention phase composition by corrected-age month</title>
              <desc id="attention-chart-desc">Select a stacked bar to update the plain-language assistant insight.</desc>
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                const y = plot.bottom - tick * plotHeight;
                return (
                  <g key={tick} className={styles.gridLine}>
                    <line x1={plot.left} x2={plot.right} y1={y} y2={y} />
                    <text x={plot.left - 8} y={y + 4} textAnchor="end">{Math.round(tick * 100)}%</text>
                  </g>
                );
              })}
              {visibleRows.map((point, pointIndex) => {
                const x = plot.left + pointIndex * slotWidth + (slotWidth - barWidth) / 2;
                let cursor = plot.bottom;
                const segments = PHASES.map((phase) => {
                  const height = point[phase.key] * plotHeight;
                  cursor -= height;
                  return { ...phase, y: cursor, height };
                });
                const isSelected = activePoint?.month === point.month;
                const ariaLabel = `Month ${point.month}: ${PHASES.map((phase) => `${phase.label} ${percent(point[phase.key])}`).join(", ")}`;
                const showTick = visibleRows.length <= 5 || pointIndex === 0 || pointIndex === visibleRows.length - 1 || pointIndex % 2 === 0;

                return (
                  <g
                    key={point.month}
                    className={`${styles.barGroup} ${isSelected ? styles.barGroupSelected : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-label={ariaLabel}
                    onClick={() => setSelectedMonth(point.month)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedMonth(point.month);
                      }
                    }}
                  >
                    <title>{ariaLabel}</title>
                    {isSelected && <rect className={styles.selectionRail} x={x - 7} y={plot.top - 4} width={barWidth + 14} height={plotHeight + 8} rx="4" />}
                    {segments.map((segment, segmentIndex) => (
                      <rect
                        key={segment.key}
                        className={styles.phaseSegment}
                        x={x}
                        y={segment.y}
                        width={barWidth}
                        height={Math.max(segment.height, 1)}
                        fill={segment.color}
                        style={{ animationDelay: `${pointIndex * 35 + segmentIndex * 20}ms` }}
                      />
                    ))}
                    {showTick && <text className={styles.monthLabel} x={x + barWidth / 2} y={plot.bottom + 19} textAnchor="middle">{point.month}m</text>}
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className={styles.emptyState}>Waiting for aggregate attention data.</div>
          )}
        </div>

        <div className={styles.chartFooter}>
          <div className={styles.legend} aria-label="Attention phases">
            {PHASES.map((phase) => (
              <span key={phase.key}><i style={{ background: phase.color }} />{phase.label}</span>
            ))}
          </div>
          <button type="button" className={styles.textAction} onClick={onOpenResults}>
            Full attention analytics <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      </article>

      <article className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>Pipeline watch</h2>
            <p>Current aggregate processing state.</p>
          </div>
          <span className={styles.liveBadge}><i /> Live</span>
        </header>

        <div className={styles.pipelineTableWrap}>
          <table className={styles.pipelineTable}>
            <thead>
              <tr><th>Stage</th><th>Done</th><th>Status</th></tr>
            </thead>
            <tbody>
              {stages.slice(0, 6).map((stage) => {
                const status = stageStatus(stage);
                return (
                  <tr key={stage.id}>
                    <td>{stage.short || stage.label}</td>
                    <td>{stage.done.toLocaleString()}</td>
                    <td><span className={styles.stageStatus} data-tone={status.tone}><i />{status.label}</span></td>
                  </tr>
                );
              })}
              {stages.length === 0 && (
                <tr><td colSpan={3}>Waiting for pipeline telemetry.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <button type="button" className={styles.textAction} onClick={onOpenPipeline}>
          See pipeline metrics <ArrowRight size={14} aria-hidden />
        </button>
      </article>

      <article className={`${styles.panel} ${styles.assistantPanel}`}>
        <header className={styles.panelHeader}>
          <div>
            <h2>Assistant insight</h2>
            <p>Changes with your timeline selection.</p>
          </div>
          <span className={styles.newBadge}>Live</span>
        </header>

        <div className={styles.insightBody} aria-live="polite">
          <img src={discoverySunburstUrl} alt="" aria-hidden="true" />
          <p>{insight}</p>
        </div>

        <div className={styles.assistantMetric}>
          <span>Median RMSSD</span>
          <strong>{rmssd.toFixed(1)} ms</strong>
        </div>

        <button type="button" className={styles.askAction} onClick={() => onAsk(askSeed)}>
          <MessageCircle size={15} aria-hidden />
          Ask a follow-up
        </button>
      </article>
    </section>
  );
}
