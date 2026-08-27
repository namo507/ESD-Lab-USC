import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, SectionLabel } from "@/components/primitives";
import { StatusPill } from "@/components/warm/StatusPill";
import { useRedcapData, useRedcapOps } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import shared from "./FeatureRoutes.module.css";
import styles from "./PipelineHealth.module.css";

const PIPELINE_STAGES = [
  "pull",
  "scrub",
  "build",
  "context",
  "assistant",
  "deploy",
] as const;

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(value: number | undefined): string {
  return `${((value ?? 0) * 100).toFixed(0)}%`;
}

export function PipelineHealth() {
  const enabled = useFeatureFlag("REDCAP_PIPELINE_HEALTH");
  const queryClient = useQueryClient();
  const redcap = useRedcapData(enabled);
  const opsQuery = useRedcapOps(enabled);
  const payload = redcap.data;
  const ops = opsQuery.data ?? payload?.redcap_ops;
  const controls = ops?.controls_snapshot ?? payload?.redcap_ops.controls_snapshot;
  const freshness = ops?.freshness ?? payload?.redcap_ops.freshness;
  const runtimeParity = ops?.runtime_parity ?? payload?.redcap_ops.runtime_parity ?? {};
  const ledger = ops?.run_ledger ?? payload?.redcap_ops.run_ledger ?? [];
  const parityEntries = Object.entries(runtimeParity).filter(([, value]) => Boolean(value));
  const uniqueHashes = new Set(parityEntries.map(([, value]) => value));
  const inSync = parityEntries.length > 0 && uniqueHashes.size <= 1;
  const stale = (freshness?.age_hours ?? 0) > (freshness?.sla_hours ?? 48);
  const latestRun = ledger[0];
  const queue = payload?.redcap_trackers.queue_funnel ?? [];

  const stageRows = useMemo(() => PIPELINE_STAGES.map((stage, index) => ({
    stage,
    state: latestRun?.status === "ok" ? "ok" : index < 2 ? "pending" : "idle",
  })), [latestRun?.status]);

  if (!enabled) return null;

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <header className={shared.hero}>
        <div>
          <span className={`${shared.eyebrow} t-mono`}>Pipeline health</span>
          <h1 className={shared.h1}>REDCap Runtime Sync</h1>
          <p className={shared.lede}>Pages, Docker, Kubernetes, assistant context, and REDCap visualizations from one shared payload.</p>
        </div>
        <div className={shared.actions}>
          <Button
            variant="secondary"
            icon="refresh-cw"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["redcap", "ops"] });
              void queryClient.invalidateQueries({ queryKey: ["redcap", "dashboard-data"] });
            }}
          >
            Refresh
          </Button>
        </div>
      </header>

      <section className={styles.kpis} aria-label="Pipeline health summary">
        <div className={styles.kpi} data-insight="redcap-runtime-parity">
          <span>Runtime parity</span>
          <strong>{inSync ? "Synced" : "Drift"}</strong>
          <Badge kind={inSync ? "ok" : "fail"} size="sm">{parityEntries.length || 0} runtimes</Badge>
        </div>
        <div className={styles.kpi} data-insight="redcap-ops-freshness">
          <span>Data age</span>
          <strong>{(freshness?.age_hours ?? 0).toFixed(1)}h</strong>
          <Badge kind={stale ? "warn" : "ok"} size="sm">{freshness?.source ?? "unknown"}</Badge>
        </div>
        <div className={styles.kpi}>
          <span>Records</span>
          <strong>{payload?.redcap_meta.record_count ?? 0}</strong>
          <Badge kind={(payload?.redcap_meta.anomaly_count ?? 0) ? "warn" : "ok"} size="sm">
            {payload?.redcap_meta.anomaly_count ?? 0} flags
          </Badge>
        </div>
        <div className={styles.kpi} data-insight="redcap-controls">
          <span>Warn threshold</span>
          <strong>{pct(controls?.anomaly_thresholds?.completeness_warn_pct)}</strong>
          <Badge kind={controls?.feature_flags?.["redcap.writeback"] ? "warn" : "neutral"} size="sm">
            writeback {controls?.feature_flags?.["redcap.writeback"] ? "on" : "off"}
          </Badge>
        </div>
      </section>

      <section className={styles.grid}>
        <Card pad={0}>
          <div className={styles.cardHead}>
            <SectionLabel>Tri-runtime parity</SectionLabel>
            <Badge kind={inSync ? "ok" : "fail"} size="sm">{inSync ? "hashes match" : "drift detected"}</Badge>
          </div>
          <div className={styles.parityGrid}>
            {["pages", "docker", "k8s"].map((runtime) => {
              const value = runtimeParity[runtime] ?? "missing";
              const kind = value === "missing" ? "pending" : inSync ? "pass" : "reject";
              return (
                <div key={runtime} className={styles.parityCard} data-insight="redcap-runtime-parity">
                  <div>
                    <span>{runtime}</span>
                    <strong className="t-mono">{value}</strong>
                  </div>
                  <StatusPill status={kind} />
                </div>
              );
            })}
          </div>
        </Card>

        <Card pad={0}>
          <div className={styles.cardHead}>
            <SectionLabel>Live sync DAG</SectionLabel>
            <Badge kind={latestRun?.status === "ok" ? "ok" : "neutral"} size="sm">{latestRun?.status ?? "idle"}</Badge>
          </div>
          <div className={styles.dag} data-insight="redcap-pipeline-dag">
            {stageRows.map((row, index) => (
              <div key={row.stage} className={styles.stage}>
                <div className={`${styles.stageDot} ${row.state === "ok" ? styles.stageOk : ""}`}>{index + 1}</div>
                <span>{row.stage}</span>
              </div>
            ))}
          </div>
          <div className={styles.queueStrip}>
            {queue.map((item) => (
              <div key={item.stage}>
                <span>{item.stage}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className={styles.grid}>
        <Card pad={0}>
          <div className={styles.cardHead}>
            <SectionLabel>Run ledger</SectionLabel>
            <span className="t-mono">{formatDateTime(freshness?.generated_at)}</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">REDCap sync run ledger.</caption>
              <thead>
                <tr>
                  {["Run", "Started", "Status", "Records", "Flags"].map((column) => (
                    <th key={column} scope="col">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.length ? ledger.slice(0, 8).map((run) => (
                  <tr key={run.run_id}>
                    <td className="t-mono">{run.run_id}</td>
                    <td>{formatDateTime(run.started_at)}</td>
                    <td><Badge kind={run.status === "ok" ? "ok" : "warn"} size="sm">{run.status}</Badge></td>
                    <td className="t-mono">{run.records}</td>
                    <td className="t-mono">{run.anomalies}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className={styles.empty}>No REDCap sync runs are recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card pad={0}>
          <div className={styles.cardHead}>
            <SectionLabel>Tier-1 controls</SectionLabel>
            <Badge kind="neutral" size="sm">GitOps</Badge>
          </div>
          <div className={styles.controlsGrid}>
            <div><span>Stale visit</span><strong>{controls?.anomaly_thresholds?.stale_visit_days ?? 30} days</strong></div>
            <div><span>Completeness warn</span><strong>{pct(controls?.anomaly_thresholds?.completeness_warn_pct)}</strong></div>
            <div><span>Freshness SLA</span><strong>{controls?.anomaly_thresholds?.freshness_sla_hours ?? 48}h</strong></div>
            <div><span>Chunk size</span><strong>{controls?.sync?.chunk_size ?? 500}</strong></div>
            <div><span>Assistant tier</span><strong>{controls?.assistant?.model_tier ?? "clinical"}</strong></div>
            <div><span>Fragments</span><strong>{controls?.assistant?.max_fragments ?? 25}</strong></div>
          </div>
        </Card>
      </section>
    </div>
  );
}
