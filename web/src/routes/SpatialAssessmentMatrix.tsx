import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@/components/primitives";
import { SPATIAL_ASSESSMENTS, type SpatialAssessment } from "@/data/spatialAssessments";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import styles from "./FeatureRoutes.module.css";

type Domain = "all" | SpatialAssessment["domain"];
type SortKey = keyof SpatialAssessment;

export function SpatialAssessmentMatrix() {
  const enabled = useFeatureFlag("SPATIAL_ASSESSMENT_MATRIX");
  const [domain, setDomain] = useState<Domain>("all");
  const [sort, setSort] = useState<SortKey>("measure");
  const rows = useMemo(() => {
    const next = SPATIAL_ASSESSMENTS.filter((row) => domain === "all" || row.domain === domain);
    next.sort((a, b) => String(a[sort]).localeCompare(String(b[sort])));
    return next;
  }, [domain, sort]);

  function exportCsv() {
    const csv = ["measure,domain,ageBand,modality,required,minutes,scoring", ...rows.map((r) =>
      [r.measure, r.domain, r.ageBand, r.modality, r.required, r.minutes, r.scoring].join(","),
    )].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "spatial-assessments.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!enabled) return null;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Measure library</span>
          <h1 className={styles.h1}>Spatial Assessment Matrix</h1>
          <p className={styles.lede}>Filterable matrix of spatial cognition measures aligned to NANO visit windows.</p>
        </div>
        <Button variant="secondary" icon="download" onClick={exportCsv}>CSV</Button>
      </header>

      <Card pad={0}>
        <div className={styles.filterBar}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Domain</span>
            <select className={styles.select} value={domain} onChange={(e) => setDomain(e.target.value as Domain)}>
              {["all", "visual-motor", "navigation", "mental-rotation", "construction"].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Sort</span>
            <select className={styles.select} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {["measure", "domain", "ageBand", "modality", "minutes"].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Spatial assessment matrix.</caption>
            <thead><tr>{["Measure", "Domain", "Age", "Mode", "Required", "Minutes", "Scoring"].map((h) => <th key={h} className={styles.th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.measure}>
                  <td className={styles.td}>{row.measure}</td>
                  <td className={styles.td}>{row.domain}</td>
                  <td className={`${styles.td} t-mono`}>{row.ageBand}</td>
                  <td className={styles.td}>{row.modality}</td>
                  <td className={styles.td}><Badge kind={row.required ? "ok" : "pending"} size="sm">{row.required ? "required" : "optional"}</Badge></td>
                  <td className={`${styles.td} t-mono`}>{row.minutes}</td>
                  <td className={styles.td}>{row.scoring}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
