/**
 * @route AttritionFunnel
 * @data-sensitivity: AGGREGATED - no PII
 * @auth-required: false (internal demo mode only)
 * @hipaa-note: All retention data is aggregate by cohort or stage. No PHI present.
 */
import { useMemo, useState } from "react";
import * as d3 from "d3";
import { Button, Card, SectionLabel, Segmented, Tooltip } from "@/components/primitives";
import { useAttritionFunnel } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { AttritionFunnelStage } from "@/api/schemas";
import shared from "./FeatureRoutes.module.css";
import styles from "./AttritionFunnel.module.css";

type TrendMode = "n" | "pct";

function copyText(stages: AttritionFunnelStage[]): string {
  if (!stages.length) return "No retention data available.";
  const first = stages[0]!;
  const last = stages[stages.length - 1]!;
  return `NANO retention summary: ${first.n} screened, ${stages.find((s) => s.id === "enrolled")?.n ?? "n/a"} enrolled, and ${last.n} reached ${last.label} (${last.retainedPct.toFixed(1)}% retained from screening).`;
}

export function AttritionFunnel() {
  const enabled = useFeatureFlag("ATTRITION_FUNNEL_V2");
  const query = useAttritionFunnel();
  const stages = query.data?.stages ?? [];
  const reasons = query.data?.reasonCodes ?? [];
  const trendSource = query.data?.trendByQuarter;
  const [group, setGroup] = useState("all");
  const [sex, setSex] = useState("all");
  const [ga, setGa] = useState("all");
  const [mode, setMode] = useState<TrendMode>("n");
  const [selectedStageId, setSelectedStageId] = useState("v2");
  const selectedStage = stages.find((stage) => stage.id === selectedStageId) ?? stages[0];
  const selectedReasons = reasons.filter((reason) => reason.stageId === selectedStage?.id);
  const maxN = Math.max(...stages.map((stage) => stage.n), 1);

  const trendSeries = useMemo(() => {
    const trend = trendSource ?? [];
    const quarters = Array.from(new Set(trend.map((point) => point.quarter)));
    return { quarters, rows: trend.filter((point) => ["enrolled", "v2", "v36mo"].includes(point.stageId)) };
  }, [trendSource]);

  const W = 760;
  const H = 260;
  const pad = { l: 58, r: 18, t: 24, b: 38 };
  const x = d3.scalePoint<string>().domain(trendSeries.quarters).range([pad.l, W - pad.r]).padding(0.2);
  const yMax = Math.max(...trendSeries.rows.map((row) => mode === "n" ? row.n : row.retainedPct ?? 0), 1);
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([H - pad.b, pad.t]);
  const line = d3.line<typeof trendSeries.rows[number]>()
    .x((point) => x(point.quarter) ?? pad.l)
    .y((point) => y(mode === "n" ? point.n : point.retainedPct ?? 0));

  if (!enabled) return null;

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <header className={shared.hero}>
        <div>
          <span className={`${shared.eyebrow} t-mono`}>Retention analytics</span>
          <h1 className={shared.h1}>Attrition Funnel</h1>
          <p className={shared.lede}>A research-retention funnel showing N, retained percentage, drop-off, reason codes, and quarter trend.</p>
        </div>
        <div className={styles.controls}>
          <select className={styles.select} value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Cohort filter">
            <option value="all">All cohorts</option>
            <option value="VPT">VPT</option>
            <option value="ASIB">ASIB</option>
            <option value="TD">TD</option>
          </select>
          <select className={styles.select} value={sex} onChange={(event) => setSex(event.target.value)} aria-label="Sex filter">
            <option value="all">All sex</option>
            <option value="F">F</option>
            <option value="M">M</option>
          </select>
          <select className={styles.select} value={ga} onChange={(event) => setGa(event.target.value)} aria-label="Gestational age band filter">
            <option value="all">All GA bands</option>
            <option value="lt32">&lt; 32 wks</option>
            <option value="32-37">32-37 wks</option>
            <option value="term">Full term</option>
          </select>
          <Button variant="secondary" icon="copy" onClick={() => void navigator.clipboard?.writeText(copyText(stages))}>
            Copy for NIH Report
          </Button>
        </div>
      </header>

      {query.isLoading && <div className={shared.alert}>Loading retention funnel...</div>}
      {query.isError && <div className={shared.alert}>Unable to load data - check pipeline status</div>}

      <Card pad={20}>
        <SectionLabel>Main funnel</SectionLabel>
        <div className={styles.funnel}>
          {stages.length ? stages.map((stage, index) => {
            const prev = stages[index - 1];
            const lost = prev ? Math.max(0, ((prev.n - stage.n) / Math.max(prev.n, 1)) * 100) : 0;
            const tint = 100 - index * 8;
            return (
              <Tooltip key={stage.id} persistent text={`${stage.label}: ${stage.n} participants, ${stage.retainedPct.toFixed(1)}% retained. Click for reason-code detail.`}>
                <button
                  type="button"
                  className={styles.stageButton}
                  aria-pressed={selectedStage?.id === stage.id}
                  onClick={() => setSelectedStageId(stage.id)}
                  data-insight="attrition-stage"
                >
                  <span>
                    <span className={styles.stageLabel}>{stage.label}</span>
                    <br />
                    <span className={`${styles.stageMeta} t-mono`}>N={stage.n.toLocaleString()} · {stage.retainedPct.toFixed(1)}% retained</span>
                  </span>
                  <span className={styles.barTrack}>
                    <span
                      className={styles.bar}
                      style={{
                        display: "block",
                        width: `${(stage.n / maxN) * 100}%`,
                        background: `color-mix(in srgb, var(--usc-garnet) ${Math.max(34, tint)}%, var(--bg-surface))`,
                      }}
                    />
                  </span>
                  <span className={`${styles.drop} t-mono`}>{index === 0 ? "baseline" : `↓ ${lost.toFixed(1)}% lost`}</span>
                </button>
              </Tooltip>
            );
          }) : <p className={shared.muted}>No data available for this filter combination</p>}
        </div>
      </Card>

      {selectedStage && (
        <div className={styles.reasonPanel}>
          <SectionLabel>Reason-code detail</SectionLabel>
          <h2 className={shared.cardTitle}>{selectedStage.label}</h2>
          <div className={styles.reasonGrid}>
            {selectedReasons.length ? selectedReasons.map((reason) => (
              <div key={`${reason.stageId}-${reason.reason}`} className={styles.reasonRow}>
                <span>{reason.reason.replace(/_/g, " ")}</span>
                <span style={{ height: 8, borderRadius: 999, background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <span className={styles.reasonBar} style={{ display: "block", width: `${Math.min(100, reason.pct)}%` }} />
                </span>
                <span className="t-mono">{reason.n} · {reason.pct.toFixed(0)}%</span>
              </div>
            )) : <p className={shared.muted}>No reason codes recorded for this stage.</p>}
          </div>
        </div>
      )}

      <Card pad={20}>
        <div className={shared.cardHead}>
          <div>
            <SectionLabel>Trend by quarter</SectionLabel>
            <h2 className={shared.cardTitle}>Retention trend across calendar time</h2>
          </div>
          <Segmented<TrendMode>
            ariaLabel="Trend display mode"
            value={mode}
            onChange={setMode}
            size="sm"
            options={[
              { value: "n", label: "N" },
              { value: "pct", label: "%" },
            ]}
          />
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.trend} role="img" aria-label="Retention trend by quarter">
          {y.ticks(4).map((tick) => (
            <g key={tick}>
              <line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} stroke="var(--slate-100)" />
              <text x={pad.l - 8} y={y(tick) + 3} textAnchor="end" className={shared.tinyLabel}>{tick.toFixed(0)}</text>
            </g>
          ))}
          {trendSeries.quarters.map((quarter) => (
            <text key={quarter} x={x(quarter)} y={H - 12} textAnchor="middle" className={shared.tinyLabel}>{quarter.replace("20", "'")}</text>
          ))}
          {["enrolled", "v2", "v36mo"].map((stageId, idx) => {
            const rows = trendSeries.rows.filter((row) => row.stageId === stageId);
            return <path key={stageId} d={line(rows) ?? ""} fill="none" stroke={["var(--usc-garnet)", "var(--blue)", "var(--green)"][idx]} strokeWidth={2.2} />;
          })}
        </svg>
        <p className={shared.muted} style={{ fontSize: 10 }}>Filters are UI-ready; subgroup-specific backend slicing is a TODO once live subgroup retention data lands.</p>
      </Card>
    </div>
  );
}
