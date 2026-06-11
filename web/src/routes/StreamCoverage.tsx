import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, SectionLabel } from "@/components/primitives";
import { MetricChip } from "@/components/dyn/MetricChip";
import { RouteDataTable } from "@/components/dyn/RouteDataTable";
import { useParticipants, useStreamCoverage } from "@/api/hooks";
import { FeatureGate, firstParticipant, ParticipantVisitControls, round } from "./routeUtils";
import styles from "@/components/dyn/DynamicRoutes.module.css";

const STREAM_COLOR: Record<string, string> = {
  ecg_infant: "var(--usc-garnet)",
  ecg_caregiver: "var(--blue)",
  audio: "var(--green)",
  video: "var(--purple)",
  markers: "var(--usc-gold)",
};

export function StreamCoverage() {
  return (
    <FeatureGate flag="DYN_STREAM_COVERAGE">
      <StreamCoverageInner />
    </FeatureGate>
  );
}

function StreamCoverageInner() {
  const navigate = useNavigate();
  const { data: participants = [] } = useParticipants();
  const [nanoId, setNanoId] = useState(firstParticipant(participants));
  const [visitAge, setVisitAge] = useState("12");
  const activeId = nanoId || firstParticipant(participants);
  const { data } = useStreamCoverage(activeId, visitAge);

  const metrics = useMemo(() => {
    if (!data) return [];
    return data.streams.map((stream) => {
      const valid = stream.valid.reduce((sum, span) => sum + span.end - span.start, 0);
      const gaps = gapsFor(stream.valid, data.durationSec);
      return { name: stream.name, coverage: (valid / data.durationSec) * 100, gaps: gaps.length };
    });
  }, [data]);

  const minCoverage = metrics.length ? Math.min(...metrics.map((metric) => metric.coverage)) : 0;
  const totalGaps = metrics.reduce((sum, metric) => sum + metric.gaps, 0);
  const maxOffset = Math.max(0, ...(data?.syncOffsetsMs ?? []).map((offset) => Math.abs(offset.offsetMs)));

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Dynamics &amp; Dyads · signal QA</span>
          <h1 className={styles.h1}>Multimodal Stream Coverage Timeline</h1>
          <p className={styles.lede}>
            Session-level coverage for infant ECG, caregiver ECG, audio, video, and event markers, with
            dropout locations and cross-stream synchronization offsets.
          </p>
        </div>
        <ParticipantVisitControls participants={participants} nanoId={activeId} setNanoId={setNanoId} visitAge={visitAge} setVisitAge={setVisitAge} />
      </header>

      <section className={styles.kpis} aria-label="Stream coverage metrics">
        <MetricChip label="Minimum coverage" value={round(minCoverage, 1)} unit="%" insight="dyn-stream-min" />
        <MetricChip label="Total dropouts" value={totalGaps} insight="dyn-stream-gaps" />
        <MetricChip label="Max sync offset" value={round(maxOffset, 0)} unit="ms" insight="dyn-stream-offset" />
        <MetricChip label="Duration" value={data?.durationSec ?? "-"} unit="s" insight="dyn-stream-duration" />
      </section>

      <div className={styles.split}>
        <Card pad={20}>
          <div className={styles.cardHead}>
            <div>
              <SectionLabel>Coverage Gantt</SectionLabel>
              <div className={styles.cardTitle}>{activeId} · CGA {visitAge} mo</div>
            </div>
            <Button size="sm" variant="secondary" icon="shield-check" onClick={() => navigate(`/qa/${activeId}`)}>
              Open Window QA
            </Button>
          </div>
          {data ? <CoverageSvg duration={data.durationSec} streams={data.streams} /> : <div className={styles.empty}>Loading stream coverage...</div>}
        </Card>

        <Card pad={20}>
          <SectionLabel>Synchronization offsets</SectionLabel>
          <div className={styles.cardTitle}>Pairwise offset estimates</div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>{["Pair", "Offset ms"].map((h) => <th key={h} className={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {(data?.syncOffsetsMs ?? []).map((offset) => (
                  <tr key={offset.pair}>
                    <td className={styles.td}>{offset.pair}</td>
                    <td className={`${styles.td} t-mono`}>{offset.offsetMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.notice} style={{ marginTop: 14 }}>
            Click infant or caregiver ECG gaps from the QA link to inspect the corresponding epoch windows.
          </div>
        </Card>
      </div>

      <Card pad={20}>
        <SectionLabel>Coverage table</SectionLabel>
        <RouteDataTable
          caption="Stream coverage spans and gaps."
          columns={["Stream", "Coverage %", "Dropouts"]}
          rows={metrics.map((metric) => [metric.name, metric.coverage.toFixed(1), metric.gaps])}
        />
      </Card>
    </div>
  );
}

function CoverageSvg({
  duration,
  streams,
}: {
  duration: number;
  streams: Array<{ name: string; valid: Array<{ start: number; end: number }> }>;
}) {
  const w = 760;
  const rowH = 44;
  const h = 60 + streams.length * rowH;
  const x0 = 140;
  const laneW = 570;
  const sx = (t: number) => x0 + (t / duration) * laneW;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={styles.svg} role="img" aria-label="Multimodal valid coverage timeline">
      <rect x={0} y={0} width={w} height={h} rx={8} fill="var(--bg-surface)" />
      {streams.map((stream, i) => {
        const y = 36 + i * rowH;
        const gaps = gapsFor(stream.valid, duration);
        return (
          <g key={stream.name}>
            <text x={18} y={y + 18} className={styles.tinyLabel}>{stream.name.replace("_", " ")}</text>
            <rect x={x0} y={y} width={laneW} height={24} rx={3} fill="var(--bg-subtle)" stroke="var(--border)" />
            {stream.valid.map((span, si) => (
              <rect key={si} x={sx(span.start)} y={y} width={Math.max(1, sx(span.end) - sx(span.start))} height={24} rx={3} fill={STREAM_COLOR[stream.name] ?? "var(--green)"} opacity={0.84} />
            ))}
            {gaps.map((gap, gi) => (
              <rect key={`gap-${gi}`} x={sx(gap.start)} y={y} width={Math.max(1, sx(gap.end) - sx(gap.start))} height={24} fill="var(--slate-300)" opacity={0.5}>
                <title>{`gap ${gap.start}-${gap.end}s`}</title>
              </rect>
            ))}
          </g>
        );
      })}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <g key={pct}>
          <line x1={x0 + pct * laneW} x2={x0 + pct * laneW} y1={24} y2={h - 22} stroke="var(--slate-100)" />
          <text x={x0 + pct * laneW} y={h - 6} textAnchor="middle" className={styles.tinyLabel}>{Math.round(duration * pct)}s</text>
        </g>
      ))}
    </svg>
  );
}

function gapsFor(valid: Array<{ start: number; end: number }>, duration: number) {
  const sorted = valid.slice().sort((a, b) => a.start - b.start);
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  sorted.forEach((span) => {
    if (span.start > cursor) gaps.push({ start: cursor, end: span.start });
    cursor = Math.max(cursor, span.end);
  });
  if (cursor < duration) gaps.push({ start: cursor, end: duration });
  return gaps.filter((gap) => gap.end - gap.start > 0.5);
}
