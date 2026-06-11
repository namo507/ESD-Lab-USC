import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, SectionLabel } from "@/components/primitives";
import { MetricChip } from "@/components/dyn/MetricChip";
import { RouteDataTable } from "@/components/dyn/RouteDataTable";
import { useParticipants, useStillFace } from "@/api/hooks";
import { FeatureGate, firstParticipant, ParticipantVisitControls, round } from "./routeUtils";
import styles from "@/components/dyn/DynamicRoutes.module.css";

export function StillFace() {
  return (
    <FeatureGate flag="DYN_STILLFACE_SUPPRESSION">
      <StillFaceInner />
    </FeatureGate>
  );
}

function StillFaceInner() {
  const { data: participants = [] } = useParticipants();
  const [nanoId, setNanoId] = useState(firstParticipant(participants));
  const [visitAge, setVisitAge] = useState("12");
  const [showCaregiver, setShowCaregiver] = useState(true);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const activeId = nanoId || firstParticipant(participants);
  const { data } = useStillFace(activeId, visitAge);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.rsa.map((rsa, i) => ({
      t: i / data.fs,
      infant: rsa,
      caregiver: data.caregiverRsa?.[i],
    }));
  }, [data]);

  const metrics = useMemo(() => {
    if (!data) return null;
    const means = Object.fromEntries(data.phases.map((phase) => [phase.name, phaseMean(data.rsa, data.fs, phase.startSec, phase.endSec)]));
    const suppression = (means.play ?? 0) - (means.stillface ?? 0);
    const recovery = (means.reunion ?? 0) - (means.stillface ?? 0);
    return {
      means,
      suppression,
      recovery,
      ratio: recovery / Math.max(0.01, suppression),
      blunted: suppression < 0.2,
    };
  }, [data]);

  const activePhase = data?.phases[phaseIndex % Math.max(1, data.phases.length)];

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Dynamics &amp; Dyads · paradigm</span>
          <h1 className={styles.h1}>Still-Face and Suppression Explorer</h1>
          <p className={styles.lede}>
            Phase-banded RSA modulation across baseline, play, still-face stress, and reunion, with
            suppression, recovery, and optional caregiver overlay.
          </p>
        </div>
        <ParticipantVisitControls participants={participants} nanoId={activeId} setNanoId={setNanoId} visitAge={visitAge} setVisitAge={setVisitAge} />
      </header>

      <section className={styles.kpis} aria-label="Still-face suppression metrics">
        <MetricChip label="Suppression" value={metrics ? round(metrics.suppression, 2) : "-"} unit="RSA" insight="dyn-stillface-suppression" />
        <MetricChip label="Recovery" value={metrics ? round(metrics.recovery, 2) : "-"} unit="RSA" insight="dyn-stillface-recovery" />
        <MetricChip label="Recovery ratio" value={metrics ? round(metrics.ratio, 2) : "-"} insight="dyn-stillface-ratio" />
        <MetricChip label="Blunted flag" value={metrics?.blunted ? "watch" : "no"} insight="dyn-stillface-flag" />
      </section>

      <div className={styles.split}>
        <Card pad={20}>
          <div className={styles.cardHead}>
            <div>
              <SectionLabel>Phase-banded RSA</SectionLabel>
              <div className={styles.cardTitle}>{activeId} · {activePhase?.name ?? "baseline"}</div>
            </div>
            <div className={styles.actions}>
              <Button size="sm" variant="secondary" icon="skip-back" onClick={() => setPhaseIndex((i) => Math.max(0, i - 1))}>Phase back</Button>
              <Button size="sm" icon="skip-forward" onClick={() => setPhaseIndex((i) => Math.min((data?.phases.length ?? 1) - 1, i + 1))}>Step phase</Button>
              <button type="button" className={`${styles.toggle} ${showCaregiver ? styles.toggleOn : ""}`} onClick={() => setShowCaregiver((value) => !value)}>
                Caregiver
              </button>
            </div>
          </div>
          <div className={styles.chartBox} role="img" aria-label="Infant and caregiver RSA time series with phase backgrounds">
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 18, left: 0 }}>
                <CartesianGrid stroke="var(--slate-100)" />
                <XAxis dataKey="t" tick={{ fontSize: 11 }} stroke="var(--slate-500)" unit="s" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--slate-500)" domain={["dataMin - 0.2", "dataMax + 0.2"]} />
                <Tooltip />
                {data?.phases.map((phase, i) => (
                  <ReferenceArea
                    key={phase.name}
                    x1={phase.startSec}
                    x2={phase.endSec}
                    fill={i % 2 ? "var(--blue)" : "var(--usc-gold)"}
                    fillOpacity={phase.name === activePhase?.name ? 0.18 : 0.07}
                  />
                ))}
                <Line dataKey="infant" name="Infant RSA" stroke="var(--usc-garnet)" dot={false} strokeWidth={2.5} />
                {showCaregiver && <Line dataKey="caregiver" name="Caregiver RSA" stroke="var(--blue)" dot={false} strokeWidth={2} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card pad={20}>
          <SectionLabel>Paradigm summary</SectionLabel>
          <div className={styles.cardTitle}>Mean RSA by phase</div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>{["Phase", "Mean RSA"].map((h) => <th key={h} className={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {data?.phases.map((phase) => (
                  <tr key={phase.name}>
                    <td className={styles.td}>{phase.name}</td>
                    <td className={`${styles.td} t-mono`}>{metrics?.means[phase.name]?.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.notice} style={{ marginTop: 14 }}>
            Suppression is play minus still-face. Recovery is reunion minus still-face. Values are within-paradigm
            modulation, not longitudinal growth.
          </div>
        </Card>
      </div>

      <Card pad={20}>
        <SectionLabel>RSA samples</SectionLabel>
        <RouteDataTable
          caption="Still-face RSA sample values."
          columns={["t", "Infant RSA", "Caregiver RSA"]}
          rows={rows.map((row) => [row.t, row.infant.toFixed(3), row.caregiver?.toFixed(3)])}
        />
      </Card>
    </div>
  );
}

function phaseMean(series: number[], fs: number, start: number, end: number) {
  const lo = Math.max(0, Math.floor(start * fs));
  const hi = Math.min(series.length, Math.floor(end * fs));
  const values = series.slice(lo, hi);
  return values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
}
