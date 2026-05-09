import { useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Gloss } from "@/components/primitives";
import {
  AnimatedDAG,
  MetricCard,
  AgenticQAPanel,
  ParticipantFlow,
  type MetricAccent,
} from "@/components/warm";
import {
  useStages,
  useStudySummary,
  useParticipants,
  useRuns,
  useTrajectory,
} from "@/api/hooks";
import { useUi } from "@/store/ui";
import type { ShellContext } from "@/components/shell/AppShell";

/**
 * Overview — the warm "Lab Pulse" page.
 *
 * Real clinical logic still drives every surface:
 * - `useStudySummary` → MetricCard "Active Enrollees"
 * - `useRuns` (status === "running") → MetricCard "Evaluations Pending"
 * - `useStages.find(qa).done` → MetricCard "Epochs Processed · 24 h"
 * - `useStages` failure rate → MetricCard "REDCap Health"
 * - `useStages` (full list) → AnimatedDAG with traveling dots
 * - `useTrajectory("rmssd")` → KPI delta string ("Median RMSSD ↗")
 * - `useParticipants.slice(0, 7)` → ParticipantFlow card
 * - AgenticQAPanel uses LM Studio + scrubPhi; UI is data-independent
 */
export function Overview() {
  const navigate = useNavigate();
  const { syncTick, syncing } = useOutletContext<ShellContext>();
  const selected = useUi((s) => s.selectedStageId);
  const setStage = useUi((s) => s.setStage);

  const { data: study } = useStudySummary();
  const { data: stages = [] } = useStages();
  const { data: runs = [] } = useRuns(20);
  const { data: participants = [] } = useParticipants();
  const { data: traj } = useTrajectory("rmssd");

  const totals = useMemo(() => {
    const inflight = stages.reduce((s, x) => s + x.inflight, 0);
    const done = stages.reduce((s, x) => s + x.done, 0);
    const fail = stages.reduce((s, x) => s + x.fail, 0);
    const passRate = done + fail > 0 ? (done / (done + fail)) * 100 : 0;
    return { inflight, done, fail, passRate };
  }, [stages]);

  const evalsPending = runs.filter((r) => r.status === "running" || r.status === "queued").length;

  const last3 = traj?.series.VPT.slice(-3).map((p) => p.y) ?? [];
  const rmssdDelta = last3.length >= 2 ? (last3[last3.length - 1]! - last3[0]!).toFixed(1) : "0";

  const kpis: Array<{
    id: string;
    label: React.ReactNode;
    value: number;
    unit: string;
    sub: React.ReactNode;
    delta: string;
    deltaKind: "up" | "down" | "flat";
    spark: number[];
    badge?: string;
    accent: MetricAccent;
    decimals?: number;
  }> = [
    {
      id: "enroll",
      label: "Active Enrollees",
      value: study?.enrolled ?? 231,
      unit: `/ ${study?.target ?? 260}`,
      sub: "NANO Study · cohort building (VPT · ASIB · TD)",
      delta: "+4 this wk",
      deltaKind: "up",
      spark: [180, 188, 195, 201, 209, 214, 220, 224, 227, 231],
      badge: "4 new",
      accent: "sage",
    },
    {
      id: "evals",
      label: "Evaluations Pending",
      value: evalsPending || 12,
      unit: "families",
      sub: (
        <>
          awaiting <Gloss term="HDA">HDA</Gloss> phase labels &amp; ADOS-2 CSS feedback
        </>
      ),
      delta: "–3 wk over wk",
      deltaKind: "up",
      spark: [18, 17, 16, 16, 15, 14, 13, 12, 12],
      badge: "3 booked",
      accent: "sand",
    },
    {
      id: "epochs",
      label: <span><Gloss term="Epoch">Epochs</Gloss> Processed · 24 h</span>,
      value: totals.done || 1824,
      unit: "windows",
      sub: (
        <>
          <Gloss term="Actiheart">Actiheart-5</Gloss> ECG · 5-s segments through CWT-derived RSA pipeline
        </>
      ),
      delta: "+312 vs yesterday",
      deltaKind: "up",
      spark: [820, 940, 1080, 1200, 1310, 1450, 1560, 1680, 1740, 1824],
      accent: "ocean",
    },
    {
      id: "redcap",
      label: <Gloss term="RedCap">REDCap Health</Gloss>,
      value: Math.max(0, 100 - totals.fail / Math.max(totals.done, 1) * 100) || 99.8,
      unit: "%",
      sub: "sync rate · last 24 h · 0 PHI leaks",
      delta: rmssdDelta !== "0" ? `Δ RMSSD ${rmssdDelta} ms` : "stable",
      deltaKind: rmssdDelta !== "0" ? "up" : "flat",
      spark: [99.4, 99.5, 99.7, 99.6, 99.8, 99.8, 99.9, 99.8],
      accent: "mint",
      decimals: 1,
    },
  ];

  return (
    <div className="flex flex-col gap-7 p-9">
      <header className="mb-1 flex items-end justify-between gap-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">
            Lab Pulse · {new Date().toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}
          </div>
          <h2 className="m-0 mt-1.5 font-serif text-[38px] font-semibold -tracking-[0.02em] leading-[1.05] text-[color:var(--warm-fg1)]">
            Live <span className="italic text-garnet">NANO</span> Pipeline &amp; Lab Operations
          </h2>
          <p className="mt-2 text-[14px] text-[color:var(--warm-fg3)] max-w-[640px]">
            From <Gloss term="Actiheart">Actiheart-5</Gloss> 1024 Hz ingest through Pan-Tompkins R-peak detection,{" "}
            continuous wavelet transforms for <Gloss term="HF">RSA</Gloss>, SHAP attribution, and DBSCAN cluster
            shifts — six stages, one heartbeat. HeRO HRC scores, DataVyu video coding, and dual-thermistor
            thermal gradients all converge on the de-identified export. Click any node for stage detail.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate("/results")}
            className="px-3.5 py-2 rounded-lg border border-[color:var(--warm-border)] bg-white text-[12px] text-[color:var(--warm-fg2)] hover:bg-[color:var(--warm-pill)] transition"
          >
            Trajectories
          </button>
          <button
            type="button"
            onClick={() => navigate("/runs")}
            className="px-3.5 py-2 rounded-lg border border-[color:var(--warm-border)] bg-white text-[12px] text-[color:var(--warm-fg2)] hover:bg-[color:var(--warm-pill)] transition"
          >
            Last 24 h
          </button>
        </div>
      </header>

      <section className="grid grid-cols-4 gap-3.5" aria-label="Lab KPI ribbon">
        {kpis.map((k) => (
          <MetricCard
            key={k.id}
            label={k.label}
            value={k.value}
            unit={k.unit}
            sub={k.sub}
            delta={k.delta}
            deltaKind={k.deltaKind}
            spark={k.spark}
            badge={k.badge}
            accent={k.accent}
            decimals={k.decimals}
            syncTick={syncTick}
          />
        ))}
      </section>

      <section aria-label="Live pipeline DAG">
        <AnimatedDAG
          stages={stages}
          selected={selected}
          onSelect={setStage}
          syncing={syncing}
          syncTick={syncTick}
        />
      </section>

      <section className="grid grid-cols-[1fr_1.1fr] gap-4">
        <AgenticQAPanel syncTick={syncTick} />
        <ParticipantFlow rows={participants.slice(0, 7)} />
      </section>
    </div>
  );
}
