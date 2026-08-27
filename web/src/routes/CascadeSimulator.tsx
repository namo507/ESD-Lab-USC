import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, SectionLabel, Segmented } from "@/components/primitives";
import { MetricChip } from "@/components/dyn/MetricChip";
import { RouteDataTable } from "@/components/dyn/RouteDataTable";
import { useCascadePaths } from "@/api/hooks";
import { exportCsvFile } from "@/lib/exportCsv";
import { FeatureGate, round } from "./routeUtils";
import styles from "@/components/dyn/DynamicRoutes.module.css";

type GroupOverlay = "td" | "asib";

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
  const [groupOverlay, setGroupOverlay] = useState<GroupOverlay>("td");
  const nodes = useMemo(() => data?.nodes ?? [], [data?.nodes]);
  const paths = useMemo(() => (data?.paths ?? []).map((path) => (
    groupOverlay === "asib"
      ? { ...path, beta: Number((path.beta + (path.delta_beta ?? 0)).toFixed(3)) }
      : path
  )), [data?.paths, groupOverlay]);
  const manipulable = useMemo(() => nodes.filter((node) => node.manipulable), [nodes]);

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

  function exportCoefficients() {
    exportCsvFile(
      paths.map((path) => ({
        from: path.from,
        to: path.to,
        beta: path.beta,
        se: path.se,
        delta_beta: path.delta_beta ?? 0,
        overlay: groupOverlay === "asib" ? "ASIB overlay" : "TD baseline",
      })),
      "cascade-path-coefficients.csv",
    );
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
          <Button variant="secondary" icon="download" onClick={exportCoefficients}>
            CSV
          </Button>
          <Button variant="secondary" icon="rotate-ccw" onClick={() => setDeltas({})}>
            Reset all
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
          <div className={styles.cardHead}>
            <div className={styles.cardTitle}>Drag sliders to propagate standardized effects</div>
            <Segmented<GroupOverlay>
              size="sm"
              ariaLabel="Group overlay"
              options={[{ value: "td", label: "TD baseline" }, { value: "asib", label: "ASIB overlay" }]}
              value={groupOverlay}
              onChange={setGroupOverlay}
            />
          </div>
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
        <SectionLabel>Group overlay path map</SectionLabel>
        <div className={styles.cardTitle}>ASIB-highlighted edges glow when |delta beta| exceeds 0.15</div>
        <CascadePathMap paths={data?.paths ?? []} active={groupOverlay === "asib"} />
        <div className={styles.notice} style={{ marginTop: 12 }}>
          Interpretation: the ASIB overlay emphasizes paths where the fitted coefficient differs materially from
          the TD baseline. Slider projections remain standardized planning scenarios, not infant-level predictions.
        </div>
      </Card>

      <Card pad={20}>
        <SectionLabel>Leverage tornado</SectionLabel>
        <div className={styles.chartBox} role="img" aria-label="Per-node leverage tornado chart">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={projection.leverage} layout="vertical" margin={{ top: 12, right: 18, bottom: 12, left: 150 }}>
              <CartesianGrid stroke="var(--warm-border)" strokeOpacity={0.6} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--warm-fg3)" }} stroke="var(--warm-border)" />
              <YAxis dataKey="node" type="category" tick={{ fontSize: 11, fill: "var(--warm-fg3)" }} stroke="var(--warm-border)" />
              <Tooltip />
              <Bar dataKey="value" fill="var(--usc-garnet)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <RouteDataTable
          caption="Cascade path coefficients."
          columns={["From", "To", "Beta", "SE", "Delta beta"]}
          rows={paths.map((path) => [path.from, path.to, path.beta.toFixed(2), path.se.toFixed(2), (path.delta_beta ?? 0).toFixed(2)])}
        />
      </Card>
    </div>
  );
}

function CascadePathMap({
  paths,
  active,
}: {
  paths: Array<{ from: string; to: string; beta: number; delta_beta?: number }>;
  active: boolean;
}) {
  const w = 760;
  const rowH = 34;
  const h = Math.max(120, 36 + paths.length * rowH);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={styles.svg} role="img" aria-label="Cascade path overlay map">
      <rect x={0} y={0} width={w} height={h} rx={8} fill="var(--bg-surface)" stroke="var(--warm-border)" />
      {paths.map((path, index) => {
        const y = 32 + index * rowH;
        const changed = Math.abs(path.delta_beta ?? 0) > 0.15;
        const stroke = active && changed ? "var(--red)" : "var(--warm-border)";
        return (
          <g key={`${path.from}-${path.to}`}>
            <text x={24} y={y + 4} className={styles.tinyLabel}>{path.from}</text>
            <line
              x1={238}
              x2={522}
              y1={y}
              y2={y}
              stroke={stroke}
              strokeWidth={active && changed ? 4 : 2}
              opacity={active && changed ? 0.95 : 0.72}
              strokeLinecap="round"
            />
            <polygon points={`522,${y} 512,${y - 5} 512,${y + 5}`} fill={stroke} opacity={active && changed ? 0.95 : 0.72} />
            <text x={540} y={y + 4} className={styles.tinyLabel}>{path.to}</text>
            <text x={704} y={y + 4} textAnchor="end" className={styles.tinyLabel}>
              beta {path.beta.toFixed(2)} · delta {(path.delta_beta ?? 0).toFixed(2)}
            </text>
          </g>
        );
      })}
    </svg>
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
