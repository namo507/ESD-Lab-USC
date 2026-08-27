import {
  useClusterPipeline,
  useClusterTopology,
  useReadingsFreshness,
} from "@/api/hooks";
import type { ClusterComponent, PipelineEvent } from "@/api/schemas";
import styles from "./ClusterOpsPanel.module.css";

function toneFromState(state: string | undefined, degraded = false): "ok" | "warn" {
  if (degraded) return "warn";
  return ["ok", "ready", "running", "succeeded", "simulated", "idle"].includes(state ?? "")
    ? "ok"
    : "warn";
}

function formatStamp(value: unknown): string {
  if (typeof value !== "string" || !value) return "not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value > 10_000 ? 0 : 1)} s`;
}

function componentLabel(component: ClusterComponent): string {
  return component.name || component.id.replace(/^[^:]+:/, "");
}

function eventTitle(event: PipelineEvent): string {
  return event.event_id || `${event.trigger_source ?? "event"}-${event.status}`;
}

export function ClusterOpsPanel() {
  const topology = useClusterTopology();
  const pipeline = useClusterPipeline();
  const freshness = useReadingsFreshness();

  const topologyData = topology.data;
  const pipelineData = pipeline.data;
  const freshnessData = freshness.data ?? pipelineData?.freshness;
  const loading = topology.isLoading || pipeline.isLoading || freshness.isLoading;
  const offline = topology.isError || pipeline.isError || freshness.isError;
  const degraded = offline || topologyData?.degraded || pipelineData?.degraded || Boolean(freshnessData?.warnings.length);
  const components = topologyData?.components.slice(0, 9) ?? [];
  const events = pipelineData?.events.slice().reverse().slice(0, 6) ?? [];
  const lastSuccess = pipelineData?.last_success;

  return (
    <section
      className={styles.panel}
      aria-labelledby="cluster-ops-title"
      data-insight="cluster-ops"
    >
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Cluster observability · readings automation</p>
          <h3 id="cluster-ops-title" className={styles.title}>
            Kubernetes readings pipeline
          </h3>
          <p className={styles.subtitle}>
            The dashboard, watcher, and readings worker share a lightweight event ledger so file changes, index freshness, and assistant context stay visible from the operator surface.
          </p>
        </div>
        <div className={styles.badges} aria-label="Cluster pipeline health">
          <span className={styles.badge} data-tone={toneFromState(topologyData?.summary.health, topologyData?.degraded)}>
            <span className={styles.dot} aria-hidden />
            {topologyData?.mode ?? "local"} · {topologyData?.summary.health ?? (loading ? "loading" : "offline")}
          </span>
          <span className={styles.badge} data-tone={toneFromState(pipelineData?.state, pipelineData?.degraded)}>
            pipeline · {pipelineData?.state ?? (loading ? "loading" : "offline")}
          </span>
          <span className={styles.badge} data-tone={toneFromState(undefined, Boolean(freshnessData?.warnings.length))}>
            readings · {freshnessData?.total_indexed ?? 0}
          </span>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.topology}>
          <h4 className={styles.sectionTitle}>Topology map</h4>
          {offline ? (
            <div className={styles.degraded}>Cluster telemetry is offline; the dashboard is showing the last local fallback state.</div>
          ) : loading && !topologyData ? (
            <div className={styles.empty}>Loading cluster telemetry...</div>
          ) : components.length > 0 ? (
            <div className={styles.map}>
              {components.map((component) => (
                <article key={component.id} className={styles.node} data-status={component.status}>
                  <div className={styles.nodeKind}>{component.kind} · {component.role ?? "workload"}</div>
                  <div className={styles.nodeName}>{componentLabel(component)}</div>
                  <div className={styles.nodeMeta}>
                    {component.status}
                    {typeof component.ready === "number" || typeof component.desired === "number"
                      ? ` · ${component.ready ?? 0}/${component.desired ?? 0} ready`
                      : ""}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>No cluster components have been reported yet.</div>
          )}

          <div className={styles.metrics} aria-label="Cluster summary">
            <div className={styles.metric}>
              <div className={styles.metricValue}>{topologyData?.summary.nodes ?? 1}</div>
              <div className={styles.metricLabel}>nodes</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricValue}>{topologyData?.summary.pods ?? 0}</div>
              <div className={styles.metricLabel}>pods</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricValue}>{pipelineData?.queue_depth ?? 0}</div>
              <div className={styles.metricLabel}>queued</div>
            </div>
            <div className={styles.metric}>
              <div className={styles.metricValue}>{freshnessData?.files_changed_since_last_run ?? 0}</div>
              <div className={styles.metricLabel}>changed</div>
            </div>
          </div>
        </div>

        <div className={styles.timeline}>
          <h4 className={styles.sectionTitle}>Pipeline timeline</h4>
          {degraded && !offline ? (
            <div className={styles.degraded}>
              Degraded telemetry: {(topologyData?.errors ?? []).concat(freshnessData?.warnings.map(() => "ingest warning") ?? []).slice(0, 2).join(" · ") || "check the latest event"}
            </div>
          ) : null}
          <div className={styles.eventList}>
            <article className={styles.event} data-status={pipelineData?.state ?? "idle"}>
              <div className={styles.eventTop}>
                <span className={styles.eventId}>last successful index</span>
                <span>{formatStamp(lastSuccess?.finished_at ?? freshnessData?.last_indexed_at)}</span>
              </div>
              <div className={styles.eventDetail}>
                {freshnessData?.total_indexed ?? 0} readings · {formatDuration(pipelineData?.last_duration_ms)} · trigger {pipelineData?.last_trigger ?? "not recorded"}
              </div>
            </article>
            {events.length > 0 ? (
              events.map((event, index) => (
                <article key={`${eventTitle(event)}-${index}`} className={styles.event} data-status={event.status}>
                  <div className={styles.eventTop}>
                    <span className={styles.eventId}>{eventTitle(event)}</span>
                    <span>{event.status}</span>
                  </div>
                  <div className={styles.eventDetail}>
                    {event.trigger_source ?? "unknown trigger"} · {formatDuration(event.duration_ms)}
                    {event.paths?.length ? ` · ${event.paths.slice(0, 2).join(", ")}` : ""}
                    {event.error ? ` · ${event.error}` : ""}
                  </div>
                </article>
              ))
            ) : (
              <div className={styles.empty}>No readings-triggered events are in the ledger yet.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
