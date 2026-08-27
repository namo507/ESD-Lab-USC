import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, SectionLabel } from "@/components/primitives";
import { useClusterTsne } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { ClusterTsneRow, GroupCode } from "@/api/schemas";
import styles from "./FeatureRoutes.module.css";

const GROUP_KIND: Record<GroupCode, "vpt" | "asib" | "td"> = { VPT: "vpt", ASIB: "asib", TD: "td" };
const GROUP_COLORS: Record<GroupCode, string> = { VPT: "var(--usc-garnet)", ASIB: "var(--purple)", TD: "var(--green)" };

function ClusterTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ClusterTsneRow }> }) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  return (
    <div className={styles.detailPanel} style={{ padding: 10, borderRadius: 8 }}>
      <div className="t-mono">{point.nanoId}</div>
      <div className={styles.muted}>{point.cluster} · outcome {point.outcomeScore.toFixed(1)}</div>
    </div>
  );
}

export function ClusterViewer() {
  const enabled = useFeatureFlag("CLUSTER_VIEWER");
  const navigate = useNavigate();
  const showArchetypes = useFeatureFlag("DYN_TRAJECTORY_ARCHETYPES");
  const { data } = useClusterTsne();
  const rows = useMemo(() => data?.data ?? [], [data?.data]);
  const [timepoint, setTimepoint] = useState(12);
  const visible = useMemo(() => rows.filter((row) => row.timepoint === timepoint), [rows, timepoint]);
  const clusters = useMemo(() => {
    const grouped = new Map<string, ClusterTsneRow[]>();
    visible.forEach((row) => grouped.set(row.cluster, [...(grouped.get(row.cluster) ?? []), row]));
    return Array.from(grouped.entries()).map(([cluster, items]) => ({
      cluster,
      n: items.length,
      meanOutcome: items.reduce((sum, row) => sum + row.outcomeScore, 0) / Math.max(1, items.length),
    }));
  }, [visible]);

  if (!enabled) return null;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Analysis route</span>
          <h1 className={styles.h1}>Outcome Clusters</h1>
          <p className={styles.lede}>t-SNE projection of longitudinal outcome signatures with timepoint and cluster summaries.</p>
        </div>
        <label className={styles.filterGroup}>
          <span className={styles.filterLabel}>Timepoint</span>
          <input className={styles.range} type="range" min={6} max={24} step={6} value={timepoint} onChange={(e) => setTimepoint(Number(e.target.value))} />
          <span className="t-mono">{timepoint} mo</span>
        </label>
        {showArchetypes && (
          <Button icon="git-branch" onClick={() => navigate("/archetypes")}>
            View trajectory archetypes
          </Button>
        )}
      </header>

      <div className={styles.split}>
        <Card pad={20}>
          <SectionLabel>t-SNE projection</SectionLabel>
          <div className={styles.chartBox} role="img" aria-label="Outcome cluster scatter plot">
            <ResponsiveContainer width="100%" height={380}>
              <ScatterChart margin={{ top: 16, right: 16, bottom: 16, left: 0 }}>
                <CartesianGrid stroke="var(--slate-100)" />
                <XAxis dataKey="x" type="number" stroke="var(--slate-500)" tick={{ fontSize: 11 }} />
                <YAxis dataKey="y" type="number" stroke="var(--slate-500)" tick={{ fontSize: 11 }} />
                <Tooltip content={<ClusterTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                {(["VPT", "ASIB", "TD"] as GroupCode[]).map((group) => (
                  <Scatter key={group} name={group} data={visible.filter((row) => row.group === group)} fill={GROUP_COLORS[group]} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card pad={20}>
          <SectionLabel>Cluster summary</SectionLabel>
          <div className={styles.cardTitle}>{visible.length} participants · {timepoint} mo</div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>{["Cluster", "n", "Outcome"].map((h) => <th key={h} className={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {clusters.map((row) => (
                  <tr key={row.cluster}>
                    <td className={styles.td}>{row.cluster}</td>
                    <td className={`${styles.td} t-mono`}>{row.n}</td>
                    <td className={`${styles.td} t-mono`}>{row.meanOutcome.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.legend} style={{ marginTop: 12 }}>
            {(["VPT", "ASIB", "TD"] as GroupCode[]).map((group) => <Badge key={group} kind={GROUP_KIND[group]} size="sm">{group}</Badge>)}
          </div>
        </Card>
      </div>
    </div>
  );
}
