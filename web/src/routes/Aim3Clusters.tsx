import { useMemo } from "react";
import { Card, SectionLabel } from "@/components/primitives";
import { useStudyData, type NicoData } from "@/api/studyData";

/**
 * NICO Aim 3 — Phenotypic clustering.
 *
 * DBSCAN over PCA-reduced SHAP space: parameters + silhouette, a t-SNE scatter
 * coloured by cluster (marker size ~ ADOS-2 CSS severity), and the Hotelling T²
 * between-cluster significance matrix. Reads
 * `dashboard_data.json → nico.aim3_clusters`. De-identified study IDs only.
 */
const CLUSTER_COLORS = ["#6366F1", "#F59E0B", "#14B8A6", "#EF4444", "#8B5CF6", "#06B6D4"];

function clusterColor(c: number): string {
  return CLUSTER_COLORS[c % CLUSTER_COLORS.length]!;
}

export function Aim3Clusters() {
  const { data, isLoading, isError } = useStudyData();
  const clusters = data?.nico.aim3_clusters;
  const hasData = Boolean(clusters && clusters.tsne_coords.length);

  return (
    <div className="flex flex-col gap-6 p-9 max-[768px]:px-4 max-[768px]:py-6">
      <header>
        <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[color:var(--warm-fg3)]">
          NICO · R01MH138028 · Aim 3
        </div>
        <h1 className="m-0 mt-1.5 font-serif text-[30px] font-semibold -tracking-[0.02em] text-[color:var(--warm-fg1)]">
          Phenotypic Clusters (DBSCAN + SHAP)
        </h1>
        <p className="mt-2 text-[13px] text-[color:var(--warm-fg3)] max-w-[680px]">
          XGBoost SHAP values on 36-month ADOS-2 CSS, PCA-pruned, then DBSCAN-clustered and projected
          with t-SNE. Marker size scales with ADOS-2 CSS severity. Study IDs are de-identified.
        </p>
      </header>

      {isLoading && <Card pad={20}><span className="text-[13px] text-[color:var(--warm-fg3)]">Loading cluster solution…</span></Card>}
      {(isError || (!isLoading && !hasData)) && (
        <Card pad={20}>
          <span className="text-[13px] text-[color:var(--warm-fg3)]">
            No cluster solution available yet. Run the NICO Aim 3 stage of the dashboard build to populate this view.
          </span>
        </Card>
      )}

      {clusters && hasData && (
        <>
          <ParamsBar clusters={clusters} />
          <div className="grid grid-cols-[1.4fr_1fr] gap-3.5 max-[1000px]:grid-cols-1">
            <Card pad={20}>
              <SectionLabel>t-SNE projection</SectionLabel>
              <TsneScatter clusters={clusters} />
            </Card>
            <Card pad={20}>
              <SectionLabel>Hotelling T² significance (p-value)</SectionLabel>
              <HotellingMatrix clusters={clusters} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[var(--r-card)] border border-[color:var(--warm-border)] bg-[color:var(--bg-subtle)] px-4 py-3">
      <div className="text-[11px] text-[color:var(--warm-fg4)] uppercase tracking-[0.06em]">{label}</div>
      <div className="font-mono text-[20px] font-semibold text-[color:var(--warm-fg1)] mt-0.5">{value}</div>
    </div>
  );
}

function ParamsBar({ clusters }: { clusters: NonNullable<NicoData["aim3_clusters"]> }) {
  return (
    <div className="grid grid-cols-4 max-[720px]:grid-cols-2 gap-3.5">
      <Metric label="Clusters" value={clusters.n_clusters} />
      <Metric label="Silhouette" value={clusters.silhouette_score?.toFixed(2) ?? "—"} />
      <Metric label="ε (epsilon)" value={clusters.epsilon ?? "—"} />
      <Metric label="min_samples" value={clusters.min_samples ?? "—"} />
    </div>
  );
}

function TsneScatter({ clusters }: { clusters: NonNullable<NicoData["aim3_clusters"]> }) {
  const W = 460;
  const H = 360;
  const P = 24;
  const pts = clusters.tsne_coords;
  const geom = useMemo(() => {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const sx = (x: number) => P + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * P);
    const sy = (y: number) => H - P - ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * P);
    return pts.map((p) => ({
      cx: sx(p.x),
      cy: sy(p.y),
      r: 4 + (p.ados_css / 10) * 6,
      color: clusterColor(p.cluster),
      p,
    }));
  }, [pts]);

  const clusterIds = [...new Set(pts.map((p) => p.cluster))].sort((a, b) => a - b);

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-2" role="img" aria-label="t-SNE cluster scatter">
        <rect x={0} y={0} width={W} height={H} fill="var(--bg-subtle)" rx={8} />
        {geom.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.color} fillOpacity={0.62} stroke={d.color} strokeWidth={1}>
            <title>{`${d.p.participant} · cluster ${d.p.cluster} · ADOS CSS ${d.p.ados_css} · GA ${d.p.ga_weeks}w · top SHAP ${d.p.top_shap_feature}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3">
        {clusterIds.map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--warm-fg3)]">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: clusterColor(c) }} aria-hidden />
            Cluster {c}
            {clusters.cluster_ados_css[String(c)] !== undefined && (
              <span className="font-mono text-[color:var(--warm-fg4)]">· CSS {clusters.cluster_ados_css[String(c)]}</span>
            )}
          </span>
        ))}
      </div>
    </>
  );
}

function HotellingMatrix({ clusters }: { clusters: NonNullable<NicoData["aim3_clusters"]> }) {
  const m = clusters.hotelling_t2_matrix;
  if (!m.length) return <div className="text-[13px] text-[color:var(--warm-fg3)] py-4">No significance matrix.</div>;

  function cellColor(p: number, diag: boolean): string {
    if (diag) return "var(--bg-subtle)";
    if (p < 0.01) return "rgba(239,68,68,0.75)";
    if (p < 0.05) return "rgba(245,158,11,0.7)";
    return "rgba(148,163,184,0.35)";
  }

  return (
    <table className="w-full mt-2 border-collapse text-[12px]">
      <thead>
        <tr>
          <th className="p-1.5" />
          {m.map((_, j) => (
            <th key={j} className="p-1.5 text-[11px] font-mono text-[color:var(--warm-fg4)]">C{j}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {m.map((row, i) => (
          <tr key={i}>
            <td className="p-1.5 text-[11px] font-mono text-[color:var(--warm-fg4)] text-right">C{i}</td>
            {row.map((p, j) => {
              const diag = i === j;
              return (
                <td key={j} className="p-1 text-center">
                  <div
                    className="rounded-md py-1.5 font-mono text-[11px]"
                    style={{ background: cellColor(p, diag), color: diag ? "var(--warm-fg4)" : "#fff" }}
                    title={diag ? "self" : `Cluster ${i} vs ${j}: p = ${p}`}
                  >
                    {diag ? "—" : p < 0.001 ? "<0.001" : p.toFixed(3)}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
