import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, SectionLabel } from "@/components/primitives";
import { MetricChip } from "@/components/dyn/MetricChip";
import { RouteDataTable } from "@/components/dyn/RouteDataTable";
import { useCascadePaths } from "@/api/hooks";
import { FeatureGate, round } from "./dynRouteUtils";
import styles from "@/components/dyn/DynamicRoutes.module.css";

export function CascadeSimulator() {
  return (
    <FeatureGate flag="DYN_CASCADE_SIMULATOR">
      <CascadeSimulatorInner />
    </FeatureGate>
  );
}

function CascadeSimulatorInner() {
  const { data } = useCascadePaths();
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const nodes = data?.nodes ?? [];
  const paths = data?.paths ?? [];
  const manipulable = nodes.filter((node) => node.manipulable);

  const projection = useMemo(() => {
    const effects: Record<string, number> = Object.fromEntries(nodes.map((node) => [node.id, deltas[node.id] ?? 0]));
    const uncertainty: Record<string, number> = Object.fromEntries(nodes.map((node) => [node.id, 0]));
    for (let pass = 0; pass < 4; pass += 1) {
      paths.forEach((path) => {
        const from = effects[path.from] ?? 0;
        effects[path.to] = (effects[path.to] ?? 0) + from * path.beta;
        uncertainty[path.to] = Math.sqrt(Math.pow(uncertainty[path.to] ?? 0, 2) + Math.pow(from * path.se, 2));
      });
    }
    const outcome = effects.outcome_36m ?? 0;
    const outcomeSe = uncertainty.outcome_36m ?? 0;
    const leverage = manipulable.map((node) => {
      const local = { ...deltas, [node.id]: 1 };
      const projected = projectOutcome(nodes.map((n) => n.id), paths, local);
      return { node: node.label, value: projected };
    }).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    return { effects, uncertainty, outcome, outcomeSe, leverage };
  }, [deltas, manipulable, nodes, paths]);

  function setNodeDelta(nodeId: string, value: number) {
    setDeltas((current) => ({ ...current, [nodeId]: value }));
  }

  function chooseHighestLeverage() {
    const top = projection.leverage[0];
    const node = manipulable.find((candidate) => candidate.label === top?.node);
    if (node) setDeltas({ [node.id]: 1 });
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Dynamics &amp; Dyads · decision support</span>
          <h1 className={styles.h1}>Cascade Intervention Simulator</h1>
          <p className={styles.lede}>
            Model-based counterfactual projections over fitted cascade paths. Outputs are uncertainty-bounded
            cohort-level projections, not clinical predictions about a named infant.
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" icon="network" onClick={() => { window.location.href = "/cascade-dag"; }}>
            Open cascade
          </Button>
          <Button variant="secondary" icon="presentation" onClick={() => { window.location.href = "/presentation-maker?seed=cascade-sim"; }}>
            Export seed
          </Button>
          <Button icon="wand-sparkles" onClick={chooseHighestLeverage}>Find highest leverage</Button>
        </div>
      </header>

      <div className={styles.notice}>
        Honesty guardrail: this page shows model projections with uncertainty bands and fit statistics. It must not
        be read as an individual diagnosis or clinical prediction.
      </div>

      <section className={styles.kpis} aria-label="Cascade simulation summary">
        <MetricChip label="Outcome shift" value={round(projection.outcome, 2)} unit="SD" verify insight="dyn-cascade-outcome" />
        <MetricChip label="Uncertainty" value={`±${round(1.96 * projection.outcomeSe, 2)}`} unit="95%" verify insight="dyn-cascade-uncertainty" />
        <MetricChip label="RMSEA" value={data?.fit ? round(data.fit.rmsea, 3) : "-"} verify insight="dyn-cascade-fit" />
        <MetricChip label="CFI" value={data?.fit ? round(data.fit.cfi, 2) : "-"} verify insight="dyn-cascade-fit" />
      </section>

      <div className={styles.split}>
        <Card pad={20}>
          <SectionLabel>Manipulable early nodes</SectionLabel>
          <div className={styles.cardTitle}>Drag sliders to propagate standardized effects</div>
          <div className={styles.page} style={{ gap: 14 }}>
            {manipulable.map((node) => (
              <label key={node.id} className={styles.detailPanel}>
                <div className={styles.cardHead} style={{ marginBottom: 8 }}>
                  <span className={styles.chipLabel}>{node.label}</span>
                  <span className={styles.chipValue}>{round(deltas[node.id] ?? 0, 2)} SD</span>
                </div>
                <input
                  className={styles.range}
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={deltas[node.id] ?? 0}
                  onChange={(e) => setNodeDelta(node.id, Number(e.target.value))}
                  aria-label={node.label}
                  style={{ width: "100%" }}
                />
              </label>
            ))}
          </div>
        </Card>

        <Card pad={20}>
          <SectionLabel>Projected outcome distribution</SectionLabel>
          <div className={styles.chartBox} role="img" aria-label="Before and after projected outcome shift">
            <OutcomeProjectionSvg shift={projection.outcome} uncertainty={projection.outcomeSe} />
          </div>
          <div className={styles.notice} style={{ marginTop: 12 }}>
            Negative shift indicates lower projected symptom burden in the fitted standardized outcome node.
          </div>
        </Card>
      </div>

      <Card pad={20}>
        <SectionLabel>Leverage tornado</SectionLabel>
        <div className={styles.chartBox} role="img" aria-label="Per-node leverage tornado chart">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={projection.leverage} layout="vertical" margin={{ top: 12, right: 18, bottom: 12, left: 150 }}>
              <CartesianGrid stroke="var(--slate-100)" />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--slate-500)" />
              <YAxis dataKey="node" type="category" tick={{ fontSize: 11 }} stroke="var(--slate-500)" />
              <Tooltip />
              <Bar dataKey="value" fill="var(--usc-garnet)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <RouteDataTable
          caption="Cascade path coefficients."
          columns={["From", "To", "Beta", "SE"]}
          rows={paths.map((path) => [path.from, path.to, path.beta.toFixed(2), path.se.toFixed(2)])}
        />
      </Card>
    </div>
  );
}

function projectOutcome(nodeIds: string[], paths: Array<{ from: string; to: string; beta: number }>, deltas: Record<string, number>) {
  const effects: Record<string, number> = Object.fromEntries(nodeIds.map((id) => [id, deltas[id] ?? 0]));
  for (let pass = 0; pass < 4; pass += 1) {
    paths.forEach((path) => {
      effects[path.to] = (effects[path.to] ?? 0) + (effects[path.from] ?? 0) * path.beta;
    });
  }
  return effects.outcome_36m ?? 0;
}

function OutcomeProjectionSvg({ shift, uncertainty }: { shift: number; uncertainty: number }) {
  const w = 620;
  const h = 220;
  const x = (value: number) => 310 + value * 110;
  const before = bellPath(0, 0.55, x, 160);
  const after = bellPath(shift, Math.max(0.35, uncertainty || 0.55), x, 160);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={styles.svg} role="img" aria-label="Projected before and after outcome density">
      <rect x={0} y={0} width={w} height={h} rx={8} fill="var(--bg-surface)" />
      <line x1={x(0)} x2={x(0)} y1={32} y2={176} stroke="var(--slate-300)" strokeDasharray="4 4" />
      <path d={before} fill="var(--blue-tint)" stroke="var(--blue)" strokeWidth={2} opacity={0.86} />
      <path d={after} fill="color-mix(in srgb, var(--usc-garnet) 18%, transparent)" stroke="var(--usc-garnet)" strokeWidth={2.5} opacity={0.9} />
      <line x1={x(shift - 1.96 * uncertainty)} x2={x(shift + 1.96 * uncertainty)} y1={34} y2={34} stroke="var(--usc-garnet)" strokeWidth={4} strokeLinecap="round" />
      <text x={24} y={28} className={styles.tinyLabel}>before</text>
      <text x={24} y={48} className={styles.tinyLabel}>after · shift {round(shift, 2)} SD</text>
      <text x={x(0)} y={194} textAnchor="middle" className={styles.tinyLabel}>baseline</text>
    </svg>
  );
}

function bellPath(mean: number, sd: number, x: (value: number) => number, baseline: number) {
  const points = Array.from({ length: 80 }, (_, i) => -2.2 + (i / 79) * 4.4);
  const coords = points.map((value) => {
    const density = Math.exp(-0.5 * Math.pow((value - mean) / sd, 2));
    return [x(value), baseline - density * 100] as const;
  });
  return `${coords.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ")} L ${x(2.2)} ${baseline} L ${x(-2.2)} ${baseline} Z`;
}
