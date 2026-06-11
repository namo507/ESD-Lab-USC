import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, SectionLabel, Segmented } from "@/components/primitives";
import { MetricChip } from "@/components/dyn/MetricChip";
import { RouteDataTable } from "@/components/dyn/RouteDataTable";
import { useArchetypes } from "@/api/hooks";
import type { GroupCode } from "@/api/schemas";
import { FeatureGate, GROUP_COLORS, round } from "./routeUtils";
import styles from "@/components/dyn/DynamicRoutes.module.css";

type Measure = "rsa" | "attention" | "social";
const GROUP_KIND: Record<GroupCode, "vpt" | "asib" | "td"> = { VPT: "vpt", ASIB: "asib", TD: "td" };

export function Archetypes() {
  return (
    <FeatureGate flag="DYN_TRAJECTORY_ARCHETYPES">
      <ArchetypesInner />
    </FeatureGate>
  );
}

function ArchetypesInner() {
  const navigate = useNavigate();
  const [measure, setMeasure] = useState<Measure>("rsa");
  const [selected, setSelected] = useState(1);
  const { data } = useArchetypes(measure);

  const prevalence = useMemo(() => {
    const out: Array<Record<string, number | string>> = [];
    (["ASIB", "TD", "VPT"] as GroupCode[]).forEach((group) => {
      const row: Record<string, number | string> = { group };
      (data?.archetypes ?? []).forEach((arch) => {
        row[arch.label] = data?.members.filter((member) => member.group === group && member.archetypeId === arch.id).length ?? 0;
      });
      out.push(row);
    });
    return out;
  }, [data]);

  const selectedMembers = data?.members.filter((member) => member.archetypeId === selected) ?? [];
  const ambiguous = data?.members.filter((member) => member.posterior < 0.7).length ?? 0;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Dynamics &amp; Dyads · heterogeneity</span>
          <h1 className={styles.h1}>Trajectory Archetypes Atlas</h1>
          <p className={styles.lede}>
            Longitudinal subtype shapes for physiology, attention, and social-communication trajectories,
            with membership probabilities and cohort prevalence.
          </p>
        </div>
        <Segmented<Measure>
          size="sm"
          ariaLabel="Measure"
          options={[{ value: "rsa", label: "RSA" }, { value: "attention", label: "Attention" }, { value: "social", label: "Social" }]}
          value={measure}
          onChange={setMeasure}
        />
      </header>

      <section className={styles.kpis} aria-label="Archetype summary">
        <MetricChip label="Archetypes" value={data?.archetypes.length ?? "-"} insight="dyn-arch-count" />
        <MetricChip label="Members" value={data?.members.length ?? "-"} insight="dyn-arch-members" />
        <MetricChip label="Ambiguous fits" value={ambiguous} insight="dyn-arch-ambiguous" />
        <MetricChip label="Selected" value={selected} insight="dyn-arch-selected" />
      </section>

      <div className={styles.wideSplit}>
        {(data?.archetypes ?? []).map((arch) => (
          <Card key={arch.id} pad={18} hoverable onClick={() => setSelected(arch.id)} dataInsight="dyn-archetype-card">
            <div className={styles.cardHead}>
              <div>
                <SectionLabel>Archetype {arch.id}</SectionLabel>
                <div className={styles.cardTitle}>{arch.label}</div>
              </div>
              {selected === arch.id && <Badge kind="ok" size="sm">selected</Badge>}
            </div>
            <div className={styles.chartBox} role="img" aria-label={`${arch.label} mean trajectory`}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={arch.meanCurve.map((point, i) => ({ ...point, lo: arch.band[i]?.lo, hi: arch.band[i]?.hi }))}>
                  <CartesianGrid stroke="var(--slate-100)" />
                  <XAxis dataKey="ageMonths" tick={{ fontSize: 11 }} stroke="var(--slate-500)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--slate-500)" />
                  <Tooltip />
                  <Line dataKey="hi" stroke="var(--blue)" dot={false} strokeDasharray="4 4" />
                  <Line dataKey="lo" stroke="var(--blue)" dot={false} strokeDasharray="4 4" />
                  <Line dataKey="value" stroke="var(--usc-garnet)" strokeWidth={2.5} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ))}
      </div>

      <div className={styles.split}>
        <Card pad={20}>
          <SectionLabel>Prevalence by cohort</SectionLabel>
          <div className={styles.chartBox} role="img" aria-label="Archetype prevalence by group">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={prevalence} margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
                <CartesianGrid stroke="var(--slate-100)" />
                <XAxis dataKey="group" tick={{ fontSize: 11 }} stroke="var(--slate-500)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--slate-500)" />
                <Tooltip />
                {(data?.archetypes ?? []).map((arch, i) => (
                  <Bar key={arch.id} dataKey={arch.label} stackId="a" fill={["var(--usc-garnet)", "var(--blue)", "var(--green)"][i] ?? "var(--purple)"} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card pad={20}>
          <SectionLabel>Selected members</SectionLabel>
          <div className={styles.cardTitle}>{selectedMembers.length} participants in archetype {selected}</div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>{["NANOID", "Group", "Posterior", "Action"].map((h) => <th key={h} className={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {selectedMembers.map((member) => (
                  <tr key={member.nanoid}>
                    <td className={`${styles.td} t-mono`}>{member.nanoid}</td>
                    <td className={styles.td}><Badge kind={GROUP_KIND[member.group]} size="sm">{member.group}</Badge></td>
                    <td className={`${styles.td} t-mono`}>{round(member.posterior, 2)}</td>
                    <td className={styles.td}>
                      <Button size="sm" variant="secondary" icon="id-card" onClick={() => navigate(`/passport?nanoid=${encodeURIComponent(member.nanoid)}`)}>
                        Passport
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.legend} style={{ marginTop: 12 }}>
            {(["ASIB", "TD", "VPT"] as GroupCode[]).map((group) => (
              <span key={group} className={styles.legendItem}>
                <span className={styles.swatch} style={{ background: GROUP_COLORS[group] }} />
                {group}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card pad={20}>
        <SectionLabel>Membership table</SectionLabel>
        <RouteDataTable
          caption="Archetype membership probabilities."
          columns={["NANOID", "Group", "Archetype", "Posterior"]}
          rows={(data?.members ?? []).map((member) => [member.nanoid, member.group, member.archetypeId, member.posterior.toFixed(2)])}
        />
      </Card>
    </div>
  );
}
