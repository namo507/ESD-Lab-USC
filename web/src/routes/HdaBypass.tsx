import { useMemo, useState } from "react";
import { ResponsiveSankey } from "@nivo/sankey";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, SectionLabel, Segmented } from "@/components/primitives";
import { MetricChip } from "@/components/dyn/MetricChip";
import { RouteDataTable } from "@/components/dyn/RouteDataTable";
import { useHdaTransitions } from "@/api/hooks";
import type { GroupCode } from "@/api/schemas";
import { FeatureGate, GROUP_COLORS, round } from "./routeUtils";
import styles from "@/components/dyn/DynamicRoutes.module.css";

type AgeBin = "3mo" | "6mo" | "9mo" | "12mo";

export function HdaBypass() {
  return (
    <FeatureGate flag="DYN_HDA_BYPASS_INDEX">
      <HdaBypassInner />
    </FeatureGate>
  );
}

function HdaBypassInner() {
  const [group, setGroup] = useState<GroupCode>("ASIB");
  const [ageBin, setAgeBin] = useState<AgeBin>("6mo");
  const { data } = useHdaTransitions(group, ageBin);
  const transitions = (data?.transitions ?? []).filter((row) => row.group === group);
  const participants = data?.perParticipant ?? [];

  const bypass = transitions.find((row) => row.from === "orienting" && row.to === "termination")?.probability ?? 0;
  const sustained = transitions.find((row) => row.from === "orienting" && row.to === "sustained")?.probability ?? 0;
  const bypassIndex = sustained > 0 ? bypass / sustained : 0;
  const meanDwell = participants.filter((row) => row.group === group).reduce((sum, row, _, arr) => sum + row.sustainedDwellSec / Math.max(1, arr.length), 0);

  const sankeyData = useMemo(() => ({
    nodes: [
      { id: "orienting" },
      { id: "sustained" },
      { id: "termination" },
      { id: "inattention" },
    ],
    links: transitions.map((row) => ({ source: row.from, target: row.to, value: Math.max(0.01, row.probability) })),
  }), [transitions]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Dynamics &amp; Dyads · transition hypothesis</span>
          <h1 className={styles.h1}>HDA Bypass Index and Transition Dynamics</h1>
          <p className={styles.lede}>
            Quantifies the orienting-to-termination bypass pathway against orienting-to-sustained attention,
            with confidence intervals and participant-level age trends.
          </p>
        </div>
        <div className={styles.actions}>
          <Segmented<GroupCode>
            size="sm"
            ariaLabel="Group"
            options={[{ value: "ASIB", label: "ASIB" }, { value: "TD", label: "TD" }, { value: "VPT", label: "VPT" }]}
            value={group}
            onChange={setGroup}
          />
          <Segmented<AgeBin>
            size="sm"
            ariaLabel="Age bin"
            options={[{ value: "3mo", label: "3 mo" }, { value: "6mo", label: "6 mo" }, { value: "9mo", label: "9 mo" }, { value: "12mo", label: "12 mo" }]}
            value={ageBin}
            onChange={setAgeBin}
          />
        </div>
      </header>

      <section className={styles.kpis} aria-label="HDA bypass metrics">
        <MetricChip label="Bypass index" value={round(bypassIndex, 2)} insight="dyn-hda-bypass" />
        <MetricChip label="P orienting to termination" value={round(bypass, 2)} insight="dyn-hda-ot" />
        <MetricChip label="P orienting to sustained" value={round(sustained, 2)} insight="dyn-hda-os" />
        <MetricChip label="Sustained dwell" value={round(meanDwell, 1)} unit="s" insight="dyn-hda-dwell" />
      </section>

      <div className={styles.split}>
        <Card pad={20}>
          <div className={styles.cardHead}>
            <div>
              <SectionLabel>Nivo Sankey transition flow</SectionLabel>
              <div className={styles.cardTitle}>{group} · {ageBin}</div>
            </div>
            <Button size="sm" variant="secondary" icon="audio-lines" onClick={() => { window.location.href = "/hda-player"; }}>
              Open HDA player
            </Button>
          </div>
          <div className={styles.chartBox} style={{ height: 360 }} role="img" aria-label="HDA transition Sankey flow">
            <ResponsiveSankey
              data={sankeyData}
              margin={{ top: 24, right: 120, bottom: 24, left: 24 }}
              align="justify"
              colors={{ scheme: "category10" }}
              nodeOpacity={0.95}
              nodeThickness={16}
              nodeSpacing={22}
              nodeBorderWidth={0}
              linkOpacity={0.45}
              linkHoverOthersOpacity={0.1}
              enableLinkGradient
              labelPosition="outside"
              labelPadding={12}
            />
          </div>
        </Card>

        <Card pad={20}>
          <SectionLabel>Transition matrix</SectionLabel>
          <div className={styles.cardTitle}>Probabilities with 95% intervals</div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>{["From", "To", "Probability", "95% CI"].map((h) => <th key={h} className={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {transitions.map((row) => (
                  <tr key={`${row.from}-${row.to}`}>
                    <td className={styles.td}>{row.from}</td>
                    <td className={styles.td}>{row.to}</td>
                    <td className={`${styles.td} t-mono`}>{row.probability.toFixed(2)}</td>
                    <td className={`${styles.td} t-mono`}>{row.ci95[0].toFixed(2)}-{row.ci95[1].toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card pad={20}>
        <SectionLabel>Participant bypass trend</SectionLabel>
        <div className={styles.chartBox} role="img" aria-label="Bypass index by age and group">
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 12, right: 16, bottom: 18, left: 0 }}>
              <CartesianGrid stroke="var(--slate-100)" />
              <XAxis dataKey="age" type="number" name="age" unit="mo" tick={{ fontSize: 11 }} stroke="var(--slate-500)" />
              <YAxis dataKey="bypassIndex" type="number" tick={{ fontSize: 11 }} stroke="var(--slate-500)" />
              <Tooltip />
              {(["ASIB", "TD", "VPT"] as GroupCode[]).map((g) => (
                <Scatter
                  key={g}
                  name={g}
                  data={participants.filter((row) => row.group === g).map((row) => ({ ...row, age: Number(row.ageBin.replace("mo", "")) }))}
                  fill={GROUP_COLORS[g]}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <RouteDataTable
          caption="Participant HDA bypass index values."
          columns={["NANOID", "Group", "Age", "Bypass", "Dwell s"]}
          rows={participants.map((row) => [row.nanoid, row.group, row.ageBin, row.bypassIndex.toFixed(2), row.sustainedDwellSec.toFixed(1)])}
        />
      </Card>
    </div>
  );
}
