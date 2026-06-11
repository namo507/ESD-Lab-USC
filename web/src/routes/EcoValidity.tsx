import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, SectionLabel, Segmented } from "@/components/primitives";
import { MetricChip } from "@/components/dyn/MetricChip";
import { RouteDataTable } from "@/components/dyn/RouteDataTable";
import { useEcoValidity } from "@/api/hooks";
import { FeatureGate, round } from "./routeUtils";
import styles from "@/components/dyn/DynamicRoutes.module.css";

type Group = "behavior" | "quality" | "representation" | "all";

export function EcoValidity() {
  return (
    <FeatureGate flag="DYN_ECOVALIDITY_EQUITY">
      <EcoValidityInner />
    </FeatureGate>
  );
}

function EcoValidityInner() {
  const [group, setGroup] = useState<Group>("all");
  const [dateRange, setDateRange] = useState("all");
  const { data } = useEcoValidity();

  const charts = useMemo(() => {
    if (!data) return [];
    const blocks = [
      { id: "behavior" as const, title: "Behavior", rows: data.behavior },
      { id: "quality" as const, title: "Data Quality", rows: data.quality },
      { id: "representation" as const, title: "Representation", rows: data.representation },
    ];
    return blocks.filter((block) => group === "all" || block.id === group);
  }, [data, group]);

  const allRows = [
    ...(data?.behavior.map((row) => ({ section: "Behavior", ...row })) ?? []),
    ...(data?.quality.map((row) => ({ section: "Quality", ...row })) ?? []),
    ...(data?.representation.map((row) => ({ section: "Representation", ...row })) ?? []),
  ];
  const deltas = allRows.map((row) => Math.abs(row.home - row.lab));
  const largestDelta = deltas.length ? Math.max(...deltas) : 0;
  const homeWins = allRows.filter((row) => row.home > row.lab).length;
  const tableRows: Array<Array<string | number>> = allRows.map((row) => [
    row.section,
    row.metric,
    row.lab,
    row.home,
    round(row.home - row.lab, 2),
    "test" in row && typeof row.test === "string" ? row.test : "",
    "p" in row && typeof row.p === "number" ? row.p : "",
    "localReference" in row && typeof row.localReference === "number" ? row.localReference : "",
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Dynamics &amp; Dyads · mission metric</span>
          <h1 className={styles.h1}>Ecological Validity and Equity Panel</h1>
          <p className={styles.lede}>
            Lab-versus-home comparisons for behavior, signal validity, and representation, computed from
            dashboard enrollment and data-quality fields.
          </p>
        </div>
        <div className={styles.actions}>
          <Segmented<Group>
            size="sm"
            ariaLabel="Metric group"
            options={[{ value: "all", label: "All" }, { value: "behavior", label: "Behavior" }, { value: "quality", label: "Quality" }, { value: "representation", label: "Equity" }]}
            value={group}
            onChange={setGroup}
          />
          <label className={styles.controlGroup}>
            <span className={styles.controlLabel}>Range</span>
            <select className={styles.select} value={dateRange} onChange={(e) => setDateRange(e.target.value)} aria-label="Date range">
              <option value="all">all dates</option>
              <option value="ytd">year to date</option>
              <option value="90d">last 90 days</option>
            </select>
          </label>
          <Button icon="presentation" onClick={() => { window.location.href = "/presentation-maker?seed=eco-validity"; }}>
            Export seed
          </Button>
        </div>
      </header>

      <section className={styles.kpis} aria-label="Eco-validity summary">
        <MetricChip label="Arms" value={data?.arms.join(" / ") ?? "-"} insight="dyn-eco-arms" />
        <MetricChip label="Largest delta" value={round(largestDelta, 1)} verify insight="dyn-eco-delta" />
        <MetricChip label="Home higher" value={`${homeWins}/${allRows.length}`} insight="dyn-eco-home" />
        <MetricChip label="Date filter" value={dateRange} insight="dyn-eco-date" />
      </section>

      <div className={styles.wideSplit}>
        {charts.map((block) => (
          <Card key={block.id} pad={20}>
            <SectionLabel>{block.title}</SectionLabel>
            <div className={styles.cardTitle}>Lab versus home</div>
            <div className={styles.chartBox} role="img" aria-label={`${block.title} lab versus home paired bar comparison`}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={block.rows} margin={{ top: 12, right: 12, bottom: 42, left: 0 }}>
                  <CartesianGrid stroke="var(--slate-100)" />
                  <XAxis dataKey="metric" tick={{ fontSize: 10 }} stroke="var(--slate-500)" interval={0} angle={-18} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--slate-500)" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="lab" fill="var(--usc-garnet)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="home" fill="var(--blue)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="localReference" name="local ref" fill="var(--green)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ))}
      </div>

      <Card pad={20}>
        <SectionLabel>Comparison data</SectionLabel>
        <RouteDataTable
          caption="Lab versus home ecological validity and equity values."
          columns={["Section", "Metric", "Lab", "Home", "Delta", "Test", "p", "Local ref"]}
          rows={tableRows}
        />
      </Card>
    </div>
  );
}
