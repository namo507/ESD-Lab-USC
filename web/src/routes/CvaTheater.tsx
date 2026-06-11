import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, SectionLabel } from "@/components/primitives";
import { DualTrack, type TrackSegment } from "@/components/dyn/DualTrack";
import { MetricChip } from "@/components/dyn/MetricChip";
import { RouteDataTable } from "@/components/dyn/RouteDataTable";
import { useCvaTheater, useParticipants } from "@/api/hooks";
import type { CvaSegment } from "@/api/schemas";
import { FeatureGate, firstParticipant, ParticipantVisitControls, round } from "./routeUtils";
import styles from "@/components/dyn/DynamicRoutes.module.css";

const TARGET_COLOR: Record<string, string> = {
  face: "var(--usc-garnet)",
  infant_face: "var(--usc-garnet)",
  toy: "var(--blue)",
  other: "var(--purple)",
  away: "var(--slate-400)",
};

export function CvaTheater() {
  return (
    <FeatureGate flag="DYN_CVA_GAZE_THEATER">
      <CvaTheaterInner />
    </FeatureGate>
  );
}

function CvaTheaterInner() {
  const { data: participants = [] } = useParticipants();
  const [nanoId, setNanoId] = useState(firstParticipant(participants));
  const [visitAge, setVisitAge] = useState("12");
  const [cvaOnly, setCvaOnly] = useState(false);
  const [showScaffold, setShowScaffold] = useState(true);
  const activeId = nanoId || firstParticipant(participants);
  const { data } = useCvaTheater(activeId, visitAge);

  const metrics = useMemo(() => {
    if (!data) return null;
    const faceAvailable = duration(data.faceAvailability);
    const faceGaze = duration(data.infantGaze.filter((segment) => segment.target === "face"));
    const cva = cvaOverlaps(data.infantGaze, data.caregiverGaze);
    const lookDurations = data.infantGaze.map((segment) => segment.end - segment.start).sort((a, b) => a - b);
    const sticky = lookDurations[Math.floor(lookDurations.length * 0.9)] ?? 0;
    const latencies = (data.scaffoldEvents ?? []).map((event) => {
      const next = data.infantGaze.find((segment) => segment.start >= event.t);
      return next ? next.start - event.t : 0;
    });
    return {
      faceAvailabilityPct: (faceAvailable / data.durationSec) * 100,
      faceGazePct: (faceGaze / data.durationSec) * 100,
      gapPct: ((faceAvailable - faceGaze) / data.durationSec) * 100,
      cvaCount: cva.length,
      meanCvaDuration: cva.length ? duration(cva) / cva.length : 0,
      sticky,
      scaffoldLatency: latencies.length ? latencies.reduce((sum, v) => sum + v, 0) / latencies.length : 0,
      cva,
    };
  }, [data]);

  const infantSegments: TrackSegment[] = (data?.infantGaze ?? [])
    .filter((segment) => !cvaOnly || metrics?.cva.some((cva) => overlaps(segment, cva)))
    .map((segment) => ({ start: segment.start, end: segment.end, label: segmentLabel(segment), color: TARGET_COLOR[segment.target] ?? "var(--slate-400)" }));
  const caregiverSegments: TrackSegment[] = (data?.caregiverGaze ?? [])
    .filter((segment) => !cvaOnly || metrics?.cva.some((cva) => overlaps(segment, cva)))
    .map((segment) => ({ start: segment.start, end: segment.end, label: segmentLabel(segment), color: TARGET_COLOR[segment.target] ?? "var(--slate-400)" }));
  const overlays: TrackSegment[] = [
    ...(metrics?.cva.map((segment) => ({ start: segment.start, end: segment.end, label: `CVA ${segment.target}`, color: "var(--usc-gold)" })) ?? []),
    ...(data?.faceAvailability.map((segment) => ({ start: segment.start, end: segment.end, label: "Face available", color: "var(--green)" })) ?? []),
  ];

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Dynamics &amp; Dyads · gaze</span>
          <h1 className={styles.h1}>Coordinated Visual Attention Theater</h1>
          <p className={styles.lede}>
            Infant and caregiver gaze lanes, face availability, CVA overlap bands, scaffold markers, and
            window-sensitive joint-attention metrics.
          </p>
        </div>
        <ParticipantVisitControls participants={participants} nanoId={activeId} setNanoId={setNanoId} visitAge={visitAge} setVisitAge={setVisitAge} />
      </header>

      <section className={styles.kpis} aria-label="CVA metrics">
        <MetricChip label="Face-availability gap" value={metrics ? round(metrics.gapPct, 1) : "-"} unit="pp" verify insight="dyn-cva-gap" />
        <MetricChip label="CVA bouts" value={metrics?.cvaCount ?? "-"} insight="dyn-cva-bouts" />
        <MetricChip label="Mean CVA duration" value={metrics ? round(metrics.meanCvaDuration, 1) : "-"} unit="s" insight="dyn-cva-duration" />
        <MetricChip label="Sticky-look index" value={metrics ? round(metrics.sticky, 1) : "-"} unit="s" insight="dyn-cva-sticky" />
      </section>

      <div className={styles.split}>
        <Card pad={20}>
          <div className={styles.cardHead}>
            <div>
              <SectionLabel>Dual gaze ribbon</SectionLabel>
              <div className={styles.cardTitle}>{activeId} · infant and caregiver gaze choreography</div>
            </div>
            <div className={styles.actions}>
              <button type="button" className={`${styles.toggle} ${cvaOnly ? styles.toggleOn : ""}`} onClick={() => setCvaOnly((value) => !value)}>
                CVA only
              </button>
              <button type="button" className={`${styles.toggle} ${showScaffold ? styles.toggleOn : ""}`} onClick={() => setShowScaffold((value) => !value)}>
                Scaffolds
              </button>
            </div>
          </div>
          {data ? (
            <>
              <DualTrack
                durationSec={data.durationSec}
                topLabel="Infant"
                bottomLabel="Caregiver"
                top={infantSegments}
                bottom={caregiverSegments}
                overlays={overlays}
              />
              {showScaffold && (
                <div className={styles.pillList}>
                  {(data.scaffoldEvents ?? []).map((event) => (
                    <span key={`${event.type}-${event.t}`} className={styles.chip}>
                      <span className={styles.chipLabel}>{event.type}</span>
                      <span className={styles.chipValue}>{event.t}s</span>
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className={styles.empty}>Loading gaze segments...</div>
          )}
        </Card>

        <Card pad={20}>
          <SectionLabel>Availability gap</SectionLabel>
          <div className={styles.cardTitle}>Face available versus infant face gaze</div>
          <div className={styles.chartBox} role="img" aria-label="Face availability and infant face gaze bar comparison">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={[
                  { metric: "Face available", value: metrics?.faceAvailabilityPct ?? 0 },
                  { metric: "Infant face gaze", value: metrics?.faceGazePct ?? 0 },
                ]}
                margin={{ top: 12, right: 12, bottom: 28, left: 0 }}
              >
                <CartesianGrid stroke="var(--slate-100)" />
                <XAxis dataKey="metric" tick={{ fontSize: 11 }} stroke="var(--slate-500)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--slate-500)" />
                <Tooltip />
                <Bar dataKey="value" fill="var(--usc-garnet)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <MetricChip label="Scaffold-to-shift latency" value={metrics ? round(metrics.scaffoldLatency, 1) : "-"} unit="s" insight="dyn-cva-scaffold" />
        </Card>
      </div>

      <Card pad={20}>
        <SectionLabel>Gaze segment table</SectionLabel>
        <RouteDataTable
          caption="Infant and caregiver gaze segments."
          columns={["Lane", "Start", "End", "Target"]}
          rows={[
            ...(data?.infantGaze.map((segment) => ["infant", segment.start, segment.end, segmentLabel(segment)]) ?? []),
            ...(data?.caregiverGaze.map((segment) => ["caregiver", segment.start, segment.end, segmentLabel(segment)]) ?? []),
          ]}
        />
      </Card>
    </div>
  );
}

function duration(segments: Array<{ start: number; end: number }>) {
  return segments.reduce((sum, segment) => sum + Math.max(0, segment.end - segment.start), 0);
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  return Math.max(a.start, b.start) < Math.min(a.end, b.end);
}

function segmentLabel(segment: CvaSegment) {
  return segment.toyId ? `${segment.target} · ${segment.toyId}` : segment.target;
}

function cvaOverlaps(infant: CvaSegment[], caregiver: CvaSegment[]): CvaSegment[] {
  const out: CvaSegment[] = [];
  infant.forEach((i) => {
    caregiver.forEach((c) => {
      const start = Math.max(i.start, c.start);
      const end = Math.min(i.end, c.end);
      if (start >= end) return;
      const sharedToy = i.target === "toy" && c.target === "toy" && i.toyId === c.toyId;
      const sharedFace = i.target === "face" && c.target === "infant_face";
      if (sharedToy || sharedFace) out.push({ start, end, target: i.target, toyId: i.toyId });
    });
  });
  return out;
}
