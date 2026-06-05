import * as d3 from "d3";
import { useMemo, useState } from "react";
import { Button, Card, SectionLabel } from "@/components/primitives";
import { MetricChip } from "@/components/dyn/MetricChip";
import { RouteDataTable } from "@/components/dyn/RouteDataTable";
import { phaseBin2D } from "@/lib/signal";
import { useParticipants, usePhasePortrait } from "@/api/hooks";
import type { PhasePortraitResponse } from "@/api/schemas";
import { FeatureGate, firstParticipant, GROUP_COLORS, ParticipantVisitControls, round } from "./dynRouteUtils";
import styles from "@/components/dyn/DynamicRoutes.module.css";

export function PhasePortrait() {
  return (
    <FeatureGate flag="DYN_AROUSAL_ATTENTION_PORTRAIT">
      <PhasePortraitInner />
    </FeatureGate>
  );
}

function PhasePortraitInner() {
  const { data: participants = [] } = useParticipants();
  const [nanoId, setNanoId] = useState(firstParticipant(participants));
  const [visitAge, setVisitAge] = useState("12");
  const [cursor, setCursor] = useState(90);
  const [manualRegion, setManualRegion] = useState(false);
  const activeId = nanoId || firstParticipant(participants);
  const { data } = usePhasePortrait(activeId, visitAge);

  const metrics = useMemo(() => {
    if (!data) return null;
    const inRegion = data.arousal.map((a, i) => {
      const attention = data.attention[i] ?? 0;
      return a >= 0.38 && a <= 0.72 && attention >= 0.5 && attention <= 0.88;
    });
    const occupancy = inRegion.filter(Boolean).length / Math.max(1, inRegion.length);
    const recoveryRuns: number[] = [];
    let outsideAt: number | null = null;
    inRegion.forEach((inside, i) => {
      if (!inside && outsideAt === null) outsideAt = i;
      if (inside && outsideAt !== null) {
        recoveryRuns.push((i - outsideAt) / data.fs);
        outsideAt = null;
      }
    });
    const meanRecovery = recoveryRuns.length ? recoveryRuns.reduce((sum, v) => sum + v, 0) / recoveryRuns.length : 0;
    const grid = phaseBin2D(data.arousal, data.attention, 18);
    const total = grid.flat().reduce((sum, v) => sum + v, 0) || 1;
    const entropy = -grid.flat().reduce((sum, v) => {
      const p = v / total;
      return p > 0 ? sum + p * Math.log2(p) : sum;
    }, 0);
    const drift = Math.hypot((data.arousal.at(-1) ?? 0) - (data.arousal[0] ?? 0), (data.attention.at(-1) ?? 0) - (data.attention[0] ?? 0));
    return { occupancy, meanRecovery, entropy, drift, grid };
  }, [data]);

  const tableRows = (data?.t ?? []).map((t, i) => [
    t,
    data?.arousal[i]?.toFixed(3),
    data?.attention[i]?.toFixed(3),
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Dynamics &amp; Dyads · state space</span>
          <h1 className={styles.h1}>Arousal-Attention Phase Portrait</h1>
          <p className={styles.lede}>
            A continuous session orbit through arousal and attentional engagement, with adaptive-region occupancy,
            recovery time, entropy, and group prototype trajectories.
          </p>
        </div>
        <ParticipantVisitControls participants={participants} nanoId={activeId} setNanoId={setNanoId} visitAge={visitAge} setVisitAge={setVisitAge} />
      </header>

      <section className={styles.kpis} aria-label="Phase portrait metrics">
        <MetricChip label="Adaptive occupancy" value={metrics ? `${Math.round(metrics.occupancy * 100)}%` : "-"} insight="dyn-phase-occupancy" />
        <MetricChip label="Mean recovery" value={metrics ? round(metrics.meanRecovery, 1) : "-"} unit="s" insight="dyn-phase-recovery" />
        <MetricChip label="Trajectory entropy" value={metrics ? round(metrics.entropy, 2) : "-"} insight="dyn-phase-entropy" />
        <MetricChip label="Centroid drift" value={metrics ? round(metrics.drift, 2) : "-"} insight="dyn-phase-drift" />
      </section>

      <div className={styles.split}>
        <Card pad={20}>
          <div className={styles.cardHead}>
            <div>
              <SectionLabel>2D phase portrait</SectionLabel>
              <div className={styles.cardTitle}>{activeId} · arousal × attention trajectory</div>
            </div>
            <Button
              size="sm"
              variant={manualRegion ? "primary" : "secondary"}
              icon="box-select"
              onClick={() => setManualRegion((value) => !value)}
            >
              {manualRegion ? "Manual bounds" : "TD-derived bounds"}
            </Button>
          </div>
          {data && metrics ? (
            <PortraitSvg data={data} grid={metrics.grid} cursor={cursor} manualRegion={manualRegion} />
          ) : (
            <div className={styles.empty}>Loading portrait...</div>
          )}
          <div className={styles.controlBar}>
            <label className={styles.controlGroup} style={{ flex: 1 }}>
              <span className={styles.controlLabel}>Scrub</span>
              <input
                className={styles.range}
                style={{ flex: 1 }}
                type="range"
                min={0}
                max={Math.max(0, (data?.t.length ?? 1) - 1)}
                value={Math.min(cursor, Math.max(0, (data?.t.length ?? 1) - 1))}
                onChange={(e) => setCursor(Number(e.target.value))}
              />
              <span className="t-mono">{data?.t[cursor] ?? 0}s</span>
            </label>
          </div>
        </Card>

        <Card pad={20}>
          <SectionLabel>Group prototypes</SectionLabel>
          <div className={styles.cardTitle}>Faint average orbit shapes by cohort</div>
          <div className={styles.notice}>
            The adaptive-region overlay is a working analysis boundary from dashboard data. Literature comparisons
            should be verified against primary publications before being quoted externally.
          </div>
          <div className={styles.legend} style={{ marginTop: 14 }}>
            {(["ASIB", "TD", "VPT"] as const).map((group) => (
              <span key={group} className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: GROUP_COLORS[group] }} />
                {group}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card pad={20}>
        <SectionLabel>Underlying trajectory table</SectionLabel>
        <RouteDataTable
          caption="Arousal and attention values by session second."
          columns={["t", "Arousal", "Attention"]}
          rows={tableRows}
        />
      </Card>
    </div>
  );
}

function PortraitSvg({
  data,
  grid,
  cursor,
  manualRegion,
}: {
  data: PhasePortraitResponse;
  grid: number[][];
  cursor: number;
  manualRegion: boolean;
}) {
  const w = 760;
  const h = 430;
  const pad = { left: 58, right: 28, top: 28, bottom: 52 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const xExtent = d3.extent(data.arousal) as [number, number];
  const yExtent = d3.extent(data.attention) as [number, number];
  const x = d3.scaleLinear().domain([xExtent[0] - 0.08, xExtent[1] + 0.08]).range([pad.left, pad.left + plotW]);
  const y = d3.scaleLinear().domain([yExtent[0] - 0.08, yExtent[1] + 0.08]).range([pad.top + plotH, pad.top]);
  const line = d3.line<number>().x((_, i) => x(data.arousal[i] ?? 0)).y((_, i) => y(data.attention[i] ?? 0));
  const flat = grid.flat();
  const thresholds = [1, 3, 6, 10].filter((t) => t < Math.max(...flat));
  const contours = d3.contours().size([grid[0]?.length ?? 1, grid.length]).thresholds(thresholds)(flat);
  const contourPath = d3.geoPath(d3.geoIdentity().scale(plotW / Math.max(1, grid.length)).translate([pad.left, pad.top]));
  const current = Math.max(0, Math.min(data.t.length - 1, cursor));
  const region = manualRegion ? { x0: 0.42, x1: 0.76, y0: 0.46, y1: 0.84 } : { x0: 0.38, x1: 0.72, y0: 0.5, y1: 0.88 };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={styles.svg} role="img" aria-label="Arousal attention phase portrait with density contours and time ordered trajectory">
      <rect x={0} y={0} width={w} height={h} rx={8} fill="var(--bg-surface)" />
      <rect
        x={x(region.x0)}
        y={y(region.y1)}
        width={x(region.x1) - x(region.x0)}
        height={y(region.y0) - y(region.y1)}
        fill="color-mix(in srgb, var(--usc-gold) 18%, transparent)"
        stroke="var(--usc-gold)"
        strokeDasharray="5 4"
      />
      {contours.map((contour, index) => (
        <path key={index} d={contourPath(contour) ?? ""} fill="none" stroke="var(--usc-garnet)" strokeWidth={1 + index * 0.35} opacity={0.18 + index * 0.12} />
      ))}
      {data.prototypes?.map((prototype) => {
        const protoLine = d3.line<{ arousal: number; attention: number }>().x((p) => x(p.arousal)).y((p) => y(p.attention));
        return (
          <path
            key={prototype.group}
            d={protoLine(prototype.points) ?? ""}
            fill="none"
            stroke={GROUP_COLORS[prototype.group]}
            strokeWidth={2}
            strokeDasharray="4 5"
            opacity={0.36}
          />
        );
      })}
      <path d={line(data.t.map((_, i) => i)) ?? ""} fill="none" stroke="var(--blue)" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={x(data.arousal[current] ?? 0)} cy={y(data.attention[current] ?? 0)} r={6} fill="var(--usc-garnet)" stroke="var(--bg-surface)" strokeWidth={2} />
      <line x1={pad.left} x2={pad.left + plotW} y1={pad.top + plotH} y2={pad.top + plotH} stroke="var(--border-strong)" />
      <line x1={pad.left} x2={pad.left} y1={pad.top} y2={pad.top + plotH} stroke="var(--border-strong)" />
      <text x={pad.left + plotW / 2} y={h - 12} textAnchor="middle" className={styles.tinyLabel}>arousal proxy</text>
      <text x={14} y={pad.top + plotH / 2} transform={`rotate(-90 14 ${pad.top + plotH / 2})`} textAnchor="middle" className={styles.tinyLabel}>attention engagement</text>
    </svg>
  );
}
