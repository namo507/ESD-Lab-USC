import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, Gloss, Icon, KPI, SectionLabel, Segmented } from "@/components/primitives";
import { PipelineDAG } from "@/components/pipeline/PipelineDAG";
import { PipelineSankey } from "@/components/pipeline/PipelineSankey";
import { PipelineKanban } from "@/components/pipeline/PipelineKanban";
import { StageDrawer } from "@/components/pipeline/StageDrawer";
import { StatusDot } from "@/components/pipeline/StatusDot";
import { useStages, useRuns, useParticipants, useStudySummary } from "@/api/hooks";
import { useUi, type PipelineView } from "@/store/ui";
import styles from "./Overview.module.css";

const VIEW_OPTIONS: Array<{ value: PipelineView; label: string }> = [
  { value: "dag", label: "DAG" },
  { value: "sankey", label: "Sankey" },
  { value: "kanban", label: "Kanban" },
];

function tputHistory(rate: number, len = 24): number[] {
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    const noise = ((i * 9301) % 233) / 233 - 0.5;
    out.push(Math.max(0, rate * (0.7 + 0.4 * Math.sin(i / 3) + noise * 0.3)));
  }
  return out;
}

export function Overview() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = useUi((s) => s.pipelineView);
  const setView = useUi((s) => s.setPipelineView);
  const selected = useUi((s) => s.selectedStageId);
  const setStage = useUi((s) => s.setStage);

  const { data: stages = [] } = useStages();
  const { data: runs = [] } = useRuns(5);
  const { data: participants = [] } = useParticipants();
  const { data: study } = useStudySummary();

  // ?view=dag|sankey|kanban — round-trips with prefs.
  useEffect(() => {
    const fromQS = params.get("view") as PipelineView | null;
    if (fromQS && fromQS !== view && VIEW_OPTIONS.some((o) => o.value === fromQS)) {
      setView(fromQS);
    }
  }, [params, view, setView]);

  function changeView(v: PipelineView) {
    setView(v);
    const next = new URLSearchParams(params);
    next.set("view", v);
    setParams(next, { replace: true });
  }

  const total = stages.reduce((s, x) => s + x.done, 0);
  const inflight = stages.reduce((s, x) => s + x.inflight, 0);
  const stage = stages.find((s) => s.id === selected) ?? stages[0];

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrowRow}>
            <span className={`${styles.eyebrow} t-mono`}>Pipeline · 2026-04-25</span>
            <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--blue)" }} aria-hidden />
            <span className={`${styles.runActive} t-mono`}>{runs.filter((r) => r.status === "running").length} run active</span>
          </div>
          <h1 className={styles.h1}>
            From <Gloss term="Actiheart5">Actiheart-5</Gloss> to manuscript
          </h1>
          <p className={styles.lede}>
            6 stages · {total.toLocaleString()} windows processed this study · {inflight} currently in flight. Click any stage to inspect.
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" icon="calendar">Last 24 h</Button>
          <Button icon="play" onClick={() => navigate("/runs")}>Run pipeline</Button>
        </div>
      </header>

      <section className={styles.kpis} aria-label="Study KPIs">
        <KPI
          label="Enrolled"
          value={study?.enrolled ?? "—"}
          unit={study ? `/ ${study.target}` : undefined}
          sub="VPT · ASIB · TD"
          delta="+4 / wk"
          deltaKind="up"
          spark={[18, 22, 28, 35, 41, 48, 56, 64, 71, 79, 88, 95, 108, 118, 128, 142, 156, 168, 184, 198, 212, 224, 231]}
        />
        <KPI label="Windows · 24 h" value="1,824" gloss="Window" sub="ECG 5-s epochs ingested" delta="+312" deltaKind="up" spark={tputHistory(312)} />
        <KPI label="QA pass rate" value="92" unit="%" sub="target ≥ 90 %" delta="+0.4 pp" deltaKind="up" gloss="SQI" spark={[88, 89, 91, 88, 90, 92, 91, 93, 92, 91, 92, 92, 91, 92, 93, 92]} />
        <KPI label="Median RMSSD" value="38.4" unit="ms" gloss="RMSSD" sub="cohort · all visits" delta="±0.6" deltaKind="flat" spark={[35, 36, 37, 36, 38, 37, 39, 38, 38, 39, 38, 38]} />
        <KPI label="PHI exports" value="0" sub="rolling 7 d · safe" delta="✓ clean" deltaKind="up" gloss="PHI" />
      </section>

      <div className={styles.viewBar}>
        <div className={styles.viewLeft}>
          <Icon name="git-branch" size={16} color="var(--usc-garnet)" />
          <h3 className={styles.viewTitle}>Live pipeline</h3>
          <Badge kind="neutral" size="sm" mono>{view}</Badge>
        </div>
        <div className={styles.viewRight}>
          <Segmented<PipelineView>
            ariaLabel="Pipeline view"
            options={VIEW_OPTIONS}
            value={view}
            onChange={changeView}
          />
          <span className={`${styles.tip} t-mono`}>tip · click a stage for detail · hover for help</span>
        </div>
      </div>

      {view === "dag" && stages.length > 0 && (
        <PipelineDAG stages={stages} selected={selected} onSelect={setStage} />
      )}
      {view === "sankey" && stages.length > 0 && (
        <PipelineSankey stages={stages} selected={selected} onSelect={setStage} />
      )}
      {view === "kanban" && stages.length > 0 && (
        <PipelineKanban stages={stages} selected={selected} onSelect={setStage} participants={participants} />
      )}

      <div className={styles.bottom}>
        <StageDrawer stage={stage} />
        <Card pad={0}>
          <div className={styles.runsHead}>
            <SectionLabel>Recent runs</SectionLabel>
            <Button variant="ghost" size="sm" iconRight="chevron-right" onClick={() => navigate("/runs")}>
              All runs
            </Button>
          </div>
          <ul className={styles.runsList}>
            {runs.map((r) => (
              <li key={r.id} className={styles.runRow}>
                <StatusDot kind={r.status} />
                <div>
                  <div className={`${styles.runId} t-mono`}>{r.id}</div>
                  <div className={styles.runScope}>{r.scope} · by {r.actor}</div>
                </div>
                <Badge
                  kind={r.status === "done" ? "ok" : r.status === "fail" ? "fail" : r.status === "running" ? "info" : "neutral"}
                  size="sm"
                >
                  {r.status}
                </Badge>
                <span className={`${styles.runDur} t-mono`}>{r.duration}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
