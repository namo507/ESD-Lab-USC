import { useMemo } from "react";
import { ResponsiveSankey } from "@nivo/sankey";
import { Badge, Card, SectionLabel } from "@/components/primitives";
import { useAttritionFunnel, useRedcapCompleteness } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import styles from "./FeatureRoutes.module.css";

export function Attrition() {
  const enabled = useFeatureFlag("ATTRITION_FUNNEL");
  const { data: funnel } = useAttritionFunnel();
  const { data: completeness } = useRedcapCompleteness();
  const matrix = completeness?.data.filter((row) => row.ndaRequired).slice(0, 36) ?? [];
  const sankey = useMemo(() => {
    const rows = funnel?.data ?? [];
    const nodeIds = Array.from(new Set(rows.flatMap((row) => [`${row.group}:${row.from}`, `${row.group}:${row.to}`])));
    return {
      nodes: nodeIds.map((id) => ({ id })),
      links: rows.map((row) => ({
        source: `${row.group}:${row.from}`,
        target: `${row.group}:${row.to}`,
        value: row.value,
      })),
    };
  }, [funnel?.data]);

  if (!enabled) return null;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Cohort monitoring</span>
          <h1 className={styles.h1}>Attrition and Missing Data</h1>
          <p className={styles.lede}>Cohort retention flow alongside NDA-required REDCap missingness.</p>
        </div>
      </header>

      <div className={styles.wideSplit}>
        <Card pad={20}>
          <SectionLabel>Visit flow</SectionLabel>
          <div style={{ height: 420 }} role="img" aria-label="Attrition Sankey from enrollment through visits">
            <ResponsiveSankey
              data={sankey}
              margin={{ top: 20, right: 24, bottom: 20, left: 24 }}
              align="justify"
              colors={{ scheme: "set2" }}
              nodeOpacity={0.92}
              nodeThickness={12}
              nodeSpacing={12}
              linkOpacity={0.28}
              labelPosition="outside"
              labelOrientation="horizontal"
              labelPadding={8}
              labelTextColor="var(--slate-700)"
              theme={{ text: { fontSize: 11, fill: "var(--slate-700)", fontFamily: "var(--font-mono)" } }}
            />
          </div>
        </Card>

        <Card pad={0}>
          <div className={styles.filterBar}>
            <div>
              <SectionLabel>NDA missingness matrix</SectionLabel>
              <div className={styles.muted} style={{ fontSize: 12 }}>Required forms only</div>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">NDA REDCap missing required fields by participant and instrument.</caption>
              <thead><tr>{["NANO ID", "Instrument", "Complete", "Missing", "Status"].map((h) => <th key={h} className={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {matrix.map((row) => (
                  <tr key={`${row.nanoId}-${row.instrument}`}>
                    <td className={`${styles.td} t-mono`}>{row.nanoId}</td>
                    <td className={`${styles.td} t-mono`}>{row.instrument}</td>
                    <td className={`${styles.td} t-mono`}>{row.completenessPct.toFixed(1)}%</td>
                    <td className={`${styles.td} t-mono`}>{row.requiredMissing}/{row.requiredTotal}</td>
                    <td className={styles.td}>
                      <Badge kind={row.status === "complete" ? "ok" : row.status === "watch" ? "warn" : "fail"} size="sm">{row.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
