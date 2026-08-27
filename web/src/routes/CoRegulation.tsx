import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, SectionLabel, Segmented } from "@/components/primitives";
import { LagSurface } from "@/components/dyn/LagSurface";
import { MetricChip } from "@/components/dyn/MetricChip";
import { RouteDataTable } from "@/components/dyn/RouteDataTable";
import { windowedCrossCorrelation } from "@/lib/signal";
import { useDyadCoregulation, useParticipants } from "@/api/hooks";
import { FeatureGate, firstParticipant, ParticipantVisitControls, round } from "./routeUtils";
import styles from "@/components/dyn/DynamicRoutes.module.css";

type Signal = "rsa" | "heartPeriod";

const MAX_LAG = 8;
const WINDOW = 32;
const STEP = 8;

export function CoRegulation() {
  return (
    <FeatureGate flag="DYN_CO_REGULATION_BRAID">
      <CoRegulationInner />
    </FeatureGate>
  );
}

function CoRegulationInner() {
  const { data: participants = [] } = useParticipants();
  const [nanoId, setNanoId] = useState(firstParticipant(participants));
  const [visitAge, setVisitAge] = useState("12");
  const [signal, setSignal] = useState<Signal>("rsa");
  const [cohort, setCohort] = useState<"session" | "context">("session");
  const [threshold, setThreshold] = useState(0.42);
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);

  const activeId = nanoId || firstParticipant(participants);
  const { data, isError } = useDyadCoregulation(activeId, visitAge);

  const analysis = useMemo(() => {
    if (!data) return null;
    const caregiver = data.caregiver[signal];
    const infant = data.infant[signal];
    const corr = windowedCrossCorrelation(caregiver, infant, MAX_LAG, WINDOW, STEP);
    const ridge = corr.map((row) => {
      let best = -Infinity;
      let bestLag = 0;
      row.forEach((value, index) => {
        if (value > best) {
          best = value;
          bestLag = index - MAX_LAG;
        }
      });
      return { best, lag: bestLag };
    });
    const synchrony = ridge.length ? ridge.reduce((sum, row) => sum + row.best, 0) / ridge.length : 0;
    const leadLag = ridge.length ? ridge.reduce((sum, row) => sum + row.lag, 0) / ridge.length / data.fs : 0;
    const stability = ridge.length
      ? ridge.reduce((sum, row) => sum + Math.pow(row.lag / data.fs - leadLag, 2), 0) / ridge.length
      : 0;
    const spike = data.events.find((event) => event.type === "arousal_spike");
    const recovery = spike
      ? Math.max(0, Math.min(1, 1 - Math.abs((infant[spike.onset + 22] ?? infant[spike.onset] ?? 0) - (caregiver[spike.onset + 22] ?? caregiver[spike.onset] ?? 0)) / 2))
      : 0;
    return { corr, synchrony, leadLag, stability, recovery, caregiver, infant };
  }, [data, signal]);

  const tableRows = useMemo(() => {
    if (!analysis) return [];
    return analysis.corr.flatMap((row, windowIndex) =>
      row.map((value, lagIndex) => [
        windowIndex + 1,
        (windowIndex * STEP) / (data?.fs ?? 1),
        (lagIndex - MAX_LAG) / (data?.fs ?? 1),
        value.toFixed(3),
      ]),
    );
  }, [analysis, data?.fs]);

  if (isError) {
    return (
      <div className={styles.page}>
        <EmptyDyad />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Dynamics &amp; Dyads · flagship</span>
          <h1 className={styles.h1}>Dyadic Autonomic Co-Regulation</h1>
          <p className={styles.lede}>
            Caregiver and infant Actiheart-derived streams aligned in time, with synchrony, signed lead-lag,
            event-linked recovery, and full lag-surface context.
          </p>
        </div>
        <ParticipantVisitControls participants={participants} nanoId={activeId} setNanoId={setNanoId} visitAge={visitAge} setVisitAge={setVisitAge} />
      </header>

      <section className={styles.kpis} aria-label="Co-regulation summary metrics">
        <MetricChip label="Synchrony index" value={analysis ? round(analysis.synchrony, 2) : "-"} insight="dyn-coreg-synchrony" />
        <MetricChip label="Lead-lag" value={analysis ? round(analysis.leadLag, 1) : "-"} unit="s" insight="dyn-coreg-lag" />
        <MetricChip label="Coupling stability" value={analysis ? round(analysis.stability, 2) : "-"} unit="var" insight="dyn-coreg-stability" />
        <MetricChip label="Recovery concordance" value={analysis ? `${Math.round(analysis.recovery * 100)}%` : "-"} insight="dyn-coreg-recovery" />
      </section>

      <div className={styles.split}>
        <Card pad={20}>
          <div className={styles.cardHead}>
            <div>
              <SectionLabel>2D braid · paired autonomic lanes</SectionLabel>
              <div className={styles.cardTitle}>{activeId} · CGA {visitAge} mo</div>
            </div>
            <Segmented<Signal>
              size="sm"
              ariaLabel="Central signal"
              options={[{ value: "rsa", label: "RSA" }, { value: "heartPeriod", label: "Heart period" }]}
              value={signal}
              onChange={setSignal}
            />
          </div>
          <div className={styles.controlBar}>
            <Segmented<"session" | "context">
              size="sm"
              ariaLabel="Cohort context"
              options={[{ value: "session", label: "Session" }, { value: "context", label: "Cohort" }]}
              value={cohort}
              onChange={setCohort}
            />
            <label className={styles.controlGroup}>
              <span className={styles.controlLabel}>Overlap threshold</span>
              <input
                className={styles.range}
                type="range"
                min={0.15}
                max={0.85}
                step={0.01}
                value={threshold}
                onChange={(event) => setThreshold(Number(event.target.value))}
              />
              <span className="t-mono">{threshold.toFixed(2)}</span>
            </label>
          </div>
          {analysis && data ? (
            <BraidChart caregiver={analysis.caregiver} infant={analysis.infant} events={data.events} fs={data.fs} selectedEvent={selectedEvent} threshold={threshold} />
          ) : (
            <div className={styles.empty}>Loading dyadic stream...</div>
          )}
          <div className={styles.controlBar}>
            {data?.events.map((event, index) => (
              <Button key={`${event.type}-${event.onset}`} size="sm" variant={selectedEvent === index ? "primary" : "secondary"} icon="milestone" onClick={() => setSelectedEvent(index)}>
                {event.type.replace("_", " ")} · {event.onset}s
              </Button>
            ))}
          </div>
        </Card>

        <Card pad={20}>
          <SectionLabel>Group context</SectionLabel>
          <div className={styles.cardTitle}>{cohort === "context" ? "Synchrony and lead-lag distributions" : "Current session against cohort context"}</div>
          <div className={styles.chartBox} role="img" aria-label="Group context bar chart for synchrony index and lead lag">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.groupContext ?? []} margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
                <CartesianGrid stroke="var(--slate-100)" />
                <XAxis dataKey="group" tick={{ fontSize: 11 }} stroke="var(--slate-500)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--slate-500)" />
                <Tooltip />
                <Bar dataKey="synchronyIndex" name="Synchrony" fill="var(--usc-garnet)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="leadLagSec" name="Lead-lag sec" fill="var(--blue)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card pad={20}>
        <div className={styles.cardHead}>
          <div>
            <SectionLabel>Lag surface · windowed cross-correlation</SectionLabel>
            <div className={styles.cardTitle}>Time × lag matrix with caregiver-led ridge highlighted by positive lag</div>
          </div>
        </div>
        {analysis && data ? (
          <LagSurface corr={analysis.corr} fs={data.fs} maxLagSamples={MAX_LAG} windowStepSec={STEP / data.fs} />
        ) : (
          <div className={styles.empty}>Lag surface unavailable.</div>
        )}
        <RouteDataTable
          caption="Windowed cross-correlation values by time window and lag."
          columns={["Window", "Start s", "Lag s", "Correlation"]}
          rows={tableRows}
        />
      </Card>
    </div>
  );
}

function BraidChart({
  caregiver,
  infant,
  events,
  fs,
  selectedEvent,
  threshold,
}: {
  caregiver: number[];
  infant: number[];
  events: Array<{ onset: number; type: string }>;
  fs: number;
  selectedEvent: number | null;
  threshold: number;
}) {
  const w = 760;
  const h = 300;
  const pad = { left: 36, right: 24, top: 26, bottom: 34 };
  const n = Math.min(caregiver.length, infant.length);
  const min = Math.min(...caregiver, ...infant);
  const max = Math.max(...caregiver, ...infant);
  const sx = (i: number) => pad.left + (i / Math.max(1, n - 1)) * (w - pad.left - pad.right);
  const sy = (v: number, lane: "top" | "bottom") => {
    const local = (v - min) / (max - min || 1);
    const base = lane === "top" ? 94 : 190;
    return base - (local - 0.5) * 56;
  };
  const path = (values: number[], lane: "top" | "bottom") =>
    values.slice(0, n).map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)} ${sy(v, lane).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={styles.svg} role="img" aria-label="Two ribbon braid comparing caregiver and infant autonomic signals over time">
      <rect x={0} y={0} width={w} height={h} rx={8} fill="var(--bg-surface)" />
      {Array.from({ length: Math.floor(n / 12) }, (_, i) => i * 12).map((idx) => {
        const caregiverValue = caregiver[idx] ?? 0;
        const infantValue = infant[idx] ?? 0;
        const gap = Math.abs(caregiverValue - infantValue);
        const alpha = Math.max(0.18, Math.min(0.75, 0.8 - gap / 2));
        return (
          <line
            key={idx}
            x1={sx(idx)}
            x2={sx(idx)}
            y1={sy(caregiverValue, "top")}
            y2={sy(infantValue, "bottom")}
            stroke="var(--slate-300)"
            strokeWidth={1}
            opacity={alpha}
          />
        );
      })}
      {Array.from({ length: Math.floor(n / 8) }, (_, i) => i * 8).map((idx) => {
        const caregiverValue = caregiver[idx] ?? 0;
        const infantValue = infant[idx] ?? 0;
        if (Math.abs(caregiverValue - infantValue) > threshold) return null;
        return (
          <rect
            key={`overlap-${idx}`}
            x={sx(idx) - 3}
            y={sy(caregiverValue, "top")}
            width={6}
            height={Math.max(10, sy(infantValue, "bottom") - sy(caregiverValue, "top"))}
            fill="var(--usc-gold)"
            opacity={0.42}
          />
        );
      })}
      <path d={path(caregiver, "top")} fill="none" stroke="var(--usc-garnet)" strokeWidth={3} strokeLinecap="round" />
      <path d={path(infant, "bottom")} fill="none" stroke="var(--blue)" strokeWidth={3} strokeLinecap="round" />
      {events.map((event, index) => {
        const x = sx(Math.min(n - 1, Math.round(event.onset * fs)));
        const active = selectedEvent === index;
        return (
          <g key={`${event.type}-${event.onset}`}>
            <line x1={x} x2={x} y1={24} y2={250} stroke={active ? "var(--usc-gold)" : "var(--slate-300)"} strokeWidth={active ? 2 : 1} strokeDasharray="4 5" />
            <text x={x + 4} y={active ? 22 : 268} className={styles.tinyLabel}>{event.type.replace("_", " ")}</text>
          </g>
        );
      })}
      <g aria-label="Event strips">
        <line x1={pad.left} x2={w - pad.right} y1={252} y2={252} stroke="var(--warm-border)" strokeWidth={8} strokeLinecap="round" />
        {events.map((event) => {
          const x = sx(Math.min(n - 1, Math.round(event.onset * fs)));
          const color = event.type === "still_face" ? "var(--red)" : event.type === "reunion" ? "var(--ocean)" : "var(--sand)";
          return <line key={`strip-${event.type}-${event.onset}`} x1={x} x2={x} y1={246} y2={258} stroke={color} strokeWidth={4} strokeLinecap="round" />;
        })}
      </g>
      <text x={pad.left} y={68} className={styles.tinyLabel}>Caregiver</text>
      <text x={pad.left} y={217} className={styles.tinyLabel}>Infant</text>
      <text x={w - pad.right} y={284} textAnchor="end" className={styles.tinyLabel}>{Math.round(n / fs)} s</text>
    </svg>
  );
}

function EmptyDyad() {
  return (
    <Card pad={20}>
      <SectionLabel>Co-regulation unavailable</SectionLabel>
      <p className={styles.muted}>The dyadic endpoint did not respond. The page will recover when `/api/v2/dyad/coregulation/:nanoid/:visitAge` is available.</p>
    </Card>
  );
}
