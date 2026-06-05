import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, SectionLabel, Segmented } from "@/components/primitives";
import { MetricChip } from "@/components/dyn/MetricChip";
import { RouteDataTable } from "@/components/dyn/RouteDataTable";
import { peristimulusAverage } from "@/lib/signal";
import { useHrDeceleration } from "@/api/hooks";
import type { GroupCode } from "@/api/schemas";
import { FeatureGate, round } from "./dynRouteUtils";
import styles from "@/components/dyn/DynamicRoutes.module.css";

type GroupChoice = "all" | GroupCode;
type AgeBin = "3mo" | "6mo" | "12mo";

export function HrDeceleration() {
  return (
    <FeatureGate flag="DYN_HR_DECELERATION_PROFILES">
      <HrDecelerationInner />
    </FeatureGate>
  );
}

function HrDecelerationInner() {
  const [group, setGroup] = useState<GroupChoice>("ASIB");
  const [ageBin, setAgeBin] = useState<AgeBin>("6mo");
  const [showEpisodes, setShowEpisodes] = useState(false);
  const { data } = useHrDeceleration(group, ageBin);

  const summary = useMemo(() => {
    if (!data || !data.episodes.length) return null;
    const episodeLength = data.episodes[0]?.hr.length ?? 0;
    const series = data.episodes.flatMap((episode) => episode.hr);
    const onsets = data.episodes.map((_, i) => i * episodeLength + data.preSec * data.fs);
    const avg = peristimulusAverage(series, onsets, data.preSec * data.fs, data.postSec * data.fs);
    const baseline = avg.mean.slice(0, data.preSec * data.fs).reduce((sum, v) => sum + v, 0) / Math.max(1, data.preSec * data.fs);
    let trough = Infinity;
    let troughIndex = 0;
    avg.mean.forEach((value, index) => {
      if (value < trough) {
        trough = value;
        troughIndex = index;
      }
    });
    const chart = avg.mean.map((mean, index) => ({
      t: (index - data.preSec * data.fs) / data.fs,
      mean,
      lo: avg.lo[index] ?? mean,
      hi: avg.hi[index] ?? mean,
    }));
    return {
      chart,
      baseline,
      depth: baseline - trough,
      timeToTrough: (troughIndex - data.preSec * data.fs) / data.fs,
      duration: chart.filter((point) => point.mean < baseline - 1).length / data.fs,
      compensatory: baseline - trough > 5.5,
      n: avg.n,
    };
  }, [data]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Dynamics &amp; Dyads · event locked</span>
          <h1 className={styles.h1}>Heart-Rate Deceleration Profiles</h1>
          <p className={styles.lede}>
            Event-locked heart-rate curves aligned to sustained-attention onset, exposing trough depth,
            duration, and recovery differences by cohort and age bin.
          </p>
        </div>
        <div className={styles.actions}>
          <Segmented<GroupChoice>
            size="sm"
            ariaLabel="Group"
            options={[{ value: "ASIB", label: "ASIB" }, { value: "TD", label: "TD" }, { value: "VPT", label: "VPT" }, { value: "all", label: "All" }]}
            value={group}
            onChange={setGroup}
          />
          <Segmented<AgeBin>
            size="sm"
            ariaLabel="Age bin"
            options={[{ value: "3mo", label: "3 mo" }, { value: "6mo", label: "6 mo" }, { value: "12mo", label: "12 mo" }]}
            value={ageBin}
            onChange={setAgeBin}
          />
        </div>
      </header>

      <section className={styles.kpis} aria-label="Heart-rate deceleration metrics">
        <MetricChip label="Mean depth" value={summary ? round(summary.depth, 1) : "-"} unit="bpm" insight="dyn-hr-depth" />
        <MetricChip label="Time-to-trough" value={summary ? round(summary.timeToTrough, 1) : "-"} unit="s" insight="dyn-hr-trough" />
        <MetricChip label="Decel duration" value={summary ? round(summary.duration, 1) : "-"} unit="s" insight="dyn-hr-duration" />
        <MetricChip label="Compensatory flag" value={summary?.compensatory ? "yes" : "no"} insight="dyn-hr-flag" />
      </section>

      <div className={styles.split}>
        <Card pad={20}>
          <div className={styles.cardHead}>
            <div>
              <SectionLabel>Peri-stimulus average</SectionLabel>
              <div className={styles.cardTitle}>{group} · {ageBin} · n={summary?.n ?? 0} episodes</div>
            </div>
            <button type="button" className={`${styles.toggle} ${showEpisodes ? styles.toggleOn : ""}`} onClick={() => setShowEpisodes((value) => !value)}>
              Episode traces
            </button>
          </div>
          <div className={styles.chartBox} role="img" aria-label="Heart-rate deceleration profile aligned to attention onset">
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={summary?.chart ?? []} margin={{ top: 12, right: 16, bottom: 18, left: 0 }}>
                <CartesianGrid stroke="var(--slate-100)" />
                <XAxis dataKey="t" tick={{ fontSize: 11 }} stroke="var(--slate-500)" unit="s" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--slate-500)" domain={["dataMin - 2", "dataMax + 2"]} />
                <Tooltip />
                <Line dataKey="hi" name="95% hi" stroke="var(--blue)" strokeDasharray="4 4" dot={false} strokeWidth={1.2} />
                <Line dataKey="lo" name="95% lo" stroke="var(--blue)" strokeDasharray="4 4" dot={false} strokeWidth={1.2} />
                <Line dataKey="mean" name="Mean HR" stroke="var(--usc-garnet)" dot={false} strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card pad={20}>
          <SectionLabel>Interpretation guardrail</SectionLabel>
          <div className={styles.cardTitle}>Computed from dashboard episodes</div>
          <p className={styles.muted}>
            The curve is recomputed from the endpoint episodes for the selected cohort and age bin.
            Any comparison to published values should be verified against the primary publication before use.
          </p>
          <div className={styles.notice}>
            Attention onset is marked as t=0; lower BPM after onset indicates the canonical cardiac
            deceleration signature of sustained attention.
          </div>
        </Card>
      </div>

      <Card pad={20}>
        <SectionLabel>Deceleration profile table</SectionLabel>
        <RouteDataTable
          caption="Mean and interval heart-rate values aligned to attention onset."
          columns={["t", "Mean HR", "95% low", "95% high"]}
          rows={(summary?.chart ?? []).map((point) => [point.t, point.mean.toFixed(2), point.lo.toFixed(2), point.hi.toFixed(2)])}
        />
      </Card>
    </div>
  );
}
