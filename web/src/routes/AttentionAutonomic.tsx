import {
  nanoQaPassedHeadline,
  useNanoDashboardData,
  type NanoAssessment,
  type NanoDashboardData,
  type NullableNumber,
} from "@/api/nanoDashboardData";
import styles from "./AttentionAutonomic.module.css";

type SeriesTone = "blue" | "science" | "muted" | "orange";

interface TrendSeries {
  label: string;
  tone: SeriesTone;
  values: NullableNumber[];
}

const GROUP_ORDER = ["TD", "PT", "ASIB"];
const GROUP_TONES: Record<string, SeriesTone> = {
  TD: "blue",
  PT: "science",
  ASIB: "muted",
};

const ASSESSMENT_SELECTION = [
  { instrument: "NNNS-II", timepoint: "nicu_admission" },
  { instrument: "Bayley-4", timepoint: "month_6" },
  { instrument: "M-CHAT", timepoint: "month_24" },
  { instrument: "ADOS-2", timepoint: "month_36" },
  { instrument: "CSBS", timepoint: "month_9" },
  { instrument: "ASQ-3", timepoint: "month_9" },
] as const;

const INTEGER_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function isKnown(value: NullableNumber): value is number {
  return value !== null && Number.isFinite(value);
}

function numberText(value: NullableNumber, decimals = 1): string {
  if (!isKnown(value)) return "Awaiting data";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function percentText(value: NullableNumber): string {
  return isKnown(value) ? `${numberText(value, 1)}%` : "Awaiting data";
}

function windowText(value: string): string {
  if (/^nicu_admission$/i.test(value)) return "NICU admission";
  const month = value.match(/^month_(\d+)$/i);
  if (month?.[1]) return `Month ${month[1]}`;
  return value
    .replace(/_/g, " ")
    .replace(/-/g, "–")
    .replace(/^(\d+)$/, "$1m");
}

function dateText(value: string | null): string {
  if (!value) return "Date pending";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : "America/New_York",
  }).format(parsed);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function phaseTone(phase: string): string {
  const key = phase.toLowerCase();
  if (key.includes("sustain")) return styles.phaseSustained!;
  if (key.includes("orient")) return styles.phaseOrienting!;
  if (key.includes("termin")) return styles.phaseTermination!;
  if (key.includes("inattention")) return styles.phaseInattention!;
  return styles.phaseOther!;
}

function toneClass(tone: SeriesTone): string {
  return {
    blue: styles.toneBlue!,
    science: styles.toneScience!,
    muted: styles.toneMuted!,
    orange: styles.toneOrange!,
  }[tone];
}

function assessmentPercent(row: NanoAssessment): NullableNumber {
  if (isKnown(row.pctComplete)) return row.pctComplete;
  if (isKnown(row.complete) && isKnown(row.expected) && row.expected > 0) {
    return (row.complete / row.expected) * 100;
  }
  return null;
}

function selectedAssessments(rows: NanoAssessment[]): NanoAssessment[] {
  const byInstrument = new Map<string, NanoAssessment[]>();
  for (const row of rows) {
    const current = byInstrument.get(row.instrument) ?? [];
    current.push(row);
    byInstrument.set(row.instrument, current);
  }

  const selected: NanoAssessment[] = [];
  const used = new Set<string>();
  for (const choice of ASSESSMENT_SELECTION) {
    const candidates = byInstrument.get(choice.instrument) ?? [];
    const row = candidates.find((candidate) => candidate.timepoint === choice.timepoint)
      ?? candidates.find((candidate) => isKnown(assessmentPercent(candidate)))
      ?? candidates[0];
    if (row) {
      selected.push(row);
      used.add(choice.instrument);
    }
  }

  const extras = Array.from(byInstrument.entries())
    .filter(([instrument]) => !used.has(instrument))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, candidates]) => candidates.find((candidate) => isKnown(assessmentPercent(candidate))) ?? candidates[0])
    .filter((row): row is NanoAssessment => Boolean(row));

  return [...selected, ...extras];
}

function RouteHeader({ data }: { data?: NanoDashboardData }) {
  const qaPassed = data ? nanoQaPassedHeadline(data) : null;
  const sessionCopy = isKnown(qaPassed)
    ? `aggregated across ${INTEGER_FORMATTER.format(qaPassed)} QA-passed sessions.`
    : "aggregated across the QA-passed sessions available in the live feed.";

  return (
    <header className={styles.routeHeader}>
      <div>
        <span className={styles.eyebrow}>NANO Study</span>
        <h1>Attention &amp; Autonomic</h1>
        <p>Heart-defined attention phases and vagal tone, {sessionCopy}</p>
      </div>
      {data ? (
        <div className={styles.headerMeta} aria-label="Data safety and freshness">
          <span className={styles.aggregateChip}>Aggregate only</span>
          <span className={styles.dateChip}>As of {dateText(data.meta.asOf)}</span>
        </div>
      ) : null}
    </header>
  );
}

function StatusPanel({
  tone,
  title,
  children,
  action,
}: {
  tone: "loading" | "error" | "safety";
  title: string;
  children: string;
  action?: () => void;
}) {
  const role = tone === "loading" ? "status" : "alert";
  return (
    <section className={`${styles.statusPanel} ${styles[`status${tone}`]}`} role={role} aria-live="polite">
      <span className={styles.statusMark} aria-hidden />
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
        {action ? <button type="button" onClick={action}>Try again</button> : null}
      </div>
    </section>
  );
}

function TrendChart({
  windows,
  series,
  ariaLabel,
  percent = false,
  showLegend = true,
}: {
  windows: string[];
  series: TrendSeries[];
  ariaLabel: string;
  percent?: boolean;
  showLegend?: boolean;
}) {
  const availableSeries = series.filter((entry) => entry.values.some(isKnown));
  const values = availableSeries.flatMap((entry) => entry.values.filter(isKnown));
  if (!windows.length || !values.length) {
    return <div className={styles.emptyState}>Awaiting aggregate trend data.</div>;
  }

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawSpan = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.08, 1);
  const domainMin = rawMin - rawSpan * 0.16;
  const domainMax = rawMax + rawSpan * 0.16;
  const xFor = (index: number) => windows.length === 1 ? 200 : 30 + (index / (windows.length - 1)) * 340;
  const yFor = (value: number) => 150 - ((value - domainMin) / (domainMax - domainMin)) * 130;

  return (
    <>
      <svg className={styles.chart} viewBox="0 0 400 180" role="img" aria-label={ariaLabel}>
        {[20, 85, 150].map((y) => (
          <line key={y} className={styles.chartGridLine} x1="30" y1={y} x2="370" y2={y} />
        ))}
        {availableSeries.map((entry) => {
          const points = entry.values
            .map((value, index) => isKnown(value) ? `${xFor(index).toFixed(1)},${yFor(value).toFixed(1)}` : null)
            .filter((value): value is string => Boolean(value))
            .join(" ");
          return (
            <g key={entry.label} className={toneClass(entry.tone)}>
              <polyline points={points} fill="none" stroke="currentColor" strokeWidth={entry.tone === "blue" ? 3 : 2.5} strokeLinecap="round" strokeLinejoin="round" />
              {entry.values.map((value, index) => isKnown(value) ? (
                <circle key={`${entry.label}-${windows[index]}`} cx={xFor(index)} cy={yFor(value)} r={index === windows.length - 1 ? 4.5 : 3.5} fill="currentColor" />
              ) : null)}
            </g>
          );
        })}
        {windows.map((window, index) => (
          <text key={window} className={styles.chartAxisText} x={xFor(index)} y="175" textAnchor={index === 0 ? "start" : index === windows.length - 1 ? "end" : "middle"}>
            {windowText(window)}
          </text>
        ))}
      </svg>
      {showLegend ? (
        <div className={styles.seriesLegend}>
          {availableSeries.map((entry) => {
            const known = entry.values.filter(isKnown);
            const first = known[0] ?? null;
            const last = known[known.length - 1] ?? null;
            return (
              <div key={entry.label}>
                <span className={`${styles.seriesSwatch} ${toneClass(entry.tone)}`} aria-hidden />
                <span>{entry.label} {percent ? percentText(first) : numberText(first, 3)} → {percent ? percentText(last) : numberText(last, 3)}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

function AttentionContent({ data }: { data: NanoDashboardData }) {
  const phases = data.attention.phases.filter((phase) => isKnown(phase.pct));
  const phaseTotal = phases.reduce((sum, phase) => sum + (phase.pct ?? 0), 0);
  const attentionWindows = unique([
    ...data.attention.byWindow.map((row) => row.window),
    ...data.attention.byGroupWindow.map((row) => row.window),
  ]);
  const groupNames = unique(data.attention.byGroupWindow.map((row) => row.group)).sort((left, right) => {
    const leftIndex = GROUP_ORDER.indexOf(left);
    const rightIndex = GROUP_ORDER.indexOf(right);
    return (leftIndex < 0 ? GROUP_ORDER.length : leftIndex) - (rightIndex < 0 ? GROUP_ORDER.length : rightIndex)
      || left.localeCompare(right);
  });
  const attentionSeries: TrendSeries[] = groupNames.map((group, index) => ({
    label: group,
    tone: GROUP_TONES[group] ?? (["orange", "muted", "science"] as const)[index % 3] ?? "orange",
    values: attentionWindows.map((window) => data.attention.byGroupWindow.find((row) => row.group === group && row.window === window)?.sustainedPct ?? null),
  }));

  const autonomicWindows = unique(data.autonomic.byWindow.map((row) => row.window));
  const rsaValues = autonomicWindows.map((window) => data.autonomic.byWindow.find((row) => row.window === window)?.rsaBaselineMs2 ?? null);
  const knownRsa = rsaValues.filter(isKnown);
  const latestAutonomicWindow = autonomicWindows[autonomicWindows.length - 1] ?? null;
  const assessments = selectedAssessments(data.assessments);

  return (
    <div className={styles.content}>
      <section
        className={`${styles.card} surface-card`}
        aria-labelledby="attention-phase-title"
        data-insight="attention-phase-distribution"
        data-insight-term="Attention phases"
        data-insight-body="This aggregate strip reports the share of coded looking time in each heart-defined attention phase. It contains no participant identifiers."
      >
        <div className={styles.cardHeader}>
          <div>
            <h2 id="attention-phase-title">Attention phase distribution</h2>
            <p>Share of coded looking time, all groups · mean HDA quality {isKnown(data.attention.hdaQualityBpm) ? `${numberText(data.attention.hdaQualityBpm, 2)} bpm` : "awaiting data"}</p>
          </div>
          <span className={styles.metricChip}>{percentText(data.attention.hdaSustainedPct)} sustained</span>
        </div>
        {phases.length && phaseTotal > 0 ? (
          <>
            <div
              className={styles.phaseBar}
              role="img"
              aria-label={phases.map((phase) => `${phase.phase}: ${percentText(phase.pct)}`).join(", ")}
            >
              {phases.map((phase) => {
                const width = ((phase.pct ?? 0) / phaseTotal) * 100;
                return (
                  <div key={phase.phase} className={`${styles.phaseSegment} ${phaseTone(phase.phase)}`} style={{ width: `${width}%` }}>
                    {width >= 8 ? percentText(phase.pct) : null}
                  </div>
                );
              })}
            </div>
            <div className={styles.phaseLegend}>
              {phases.map((phase) => (
                <div key={phase.phase}>
                  <span className={phaseTone(phase.phase)} aria-hidden />
                  <span>{phase.phase}</span>
                </div>
              ))}
            </div>
          </>
        ) : <div className={styles.emptyState}>Awaiting aggregate phase distribution.</div>}
      </section>

      <div className={styles.chartGrid}>
        <section
          className={`${styles.card} surface-card`}
          aria-labelledby="sustained-group-title"
          data-insight="attention-group-trend"
          data-insight-term="Sustained attention"
          data-insight-body="Group lines summarize aggregate looking-time percentages across visit windows. They are descriptive research measures, not individual clinical predictions."
        >
          <div className={styles.cardHeader}>
            <div>
              <h2 id="sustained-group-title">Sustained attention by group</h2>
              <p>Percent of looking time · available visit windows</p>
            </div>
          </div>
          <TrendChart
            windows={attentionWindows}
            series={attentionSeries}
            percent
            ariaLabel={attentionSeries.length
              ? `Sustained attention by group across ${attentionWindows.map(windowText).join(", ")}. ${attentionSeries.map((series) => `${series.label}: ${series.values.map(percentText).join(", ")}`).join(". ")}`
              : "Sustained attention group trend awaiting aggregate data"}
          />
        </section>

        <section
          className={`${styles.card} surface-card`}
          aria-labelledby="rsa-title"
          data-insight="autonomic-rsa-trend"
          data-insight-term="Baseline RSA"
          data-insight-body="Baseline RSA is shown as a cohort-level autonomic trend across visit windows. Hover insights never expose participant-level records."
        >
          <div className={styles.cardHeader}>
            <div>
              <h2 id="rsa-title">Baseline RSA</h2>
              <p>ms² · cohort mean by visit window</p>
            </div>
          </div>
          <TrendChart
            windows={autonomicWindows}
            series={[{ label: "Baseline RSA", tone: "blue", values: rsaValues }]}
            showLegend={false}
            ariaLabel={knownRsa.length
              ? `Baseline RSA across ${autonomicWindows.map(windowText).join(", ")}: ${rsaValues.map((value) => numberText(value, 3)).join(", ")}`
              : "Baseline RSA trend awaiting aggregate data"}
          />
          <div className={styles.autonomicStats}>
            <div>
              <strong>{numberText(knownRsa[0] ?? null, 3)}</strong>
              <span>{autonomicWindows[0] ? `at ${windowText(autonomicWindows[0])}` : "first window"}</span>
            </div>
            <div className={styles.highlightStat}>
              <strong>{numberText(knownRsa[knownRsa.length - 1] ?? null, 3)}</strong>
              <span>{latestAutonomicWindow ? `at ${windowText(latestAutonomicWindow)}` : "latest window"}</span>
            </div>
            <div>
              <strong>{numberText(data.autonomic.cptdMeanC, 2)}{isKnown(data.autonomic.cptdMeanC) ? <small>°C</small> : null}</strong>
              <span>mean CPTd</span>
            </div>
          </div>
        </section>
      </div>

      <section className={`${styles.card} surface-card`} aria-labelledby="assessment-title">
        <div className={styles.cardHeader}>
          <div>
            <h2 id="assessment-title">Assessment completion</h2>
            <p>Complete of expected, at the timepoints where each instrument applies</p>
          </div>
        </div>
        {assessments.length ? (
          <div className={styles.assessmentGrid}>
            {assessments.map((assessment) => {
              const pct = assessmentPercent(assessment);
              const progress = isKnown(pct) ? Math.max(0, Math.min(100, pct)) : 0;
              const detail = isKnown(assessment.complete) && isKnown(assessment.expected)
                ? `${INTEGER_FORMATTER.format(assessment.complete)} of ${INTEGER_FORMATTER.format(assessment.expected)} complete`
                : "Counts awaiting data";
              return (
                <div className={styles.assessment} key={`${assessment.instrument}-${assessment.timepoint}`} title={`${windowText(assessment.timepoint)} · ${detail}`}>
                  <div className={styles.assessmentLabel}>
                    <span>{assessment.instrument}</span>
                    <span>{percentText(pct)}</span>
                  </div>
                  <div
                    className={styles.progressTrack}
                    role="progressbar"
                    aria-label={`${assessment.instrument} at ${windowText(assessment.timepoint)}: ${percentText(pct)}, ${detail}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={isKnown(pct) ? progress : undefined}
                  >
                    <span className={progress < 75 ? styles.progressScience : styles.progressBlue} style={{ width: `${progress}%` }} />
                  </div>
                  <span className={styles.assessmentMeta}>{windowText(assessment.timepoint)} · {detail}</span>
                </div>
              );
            })}
          </div>
        ) : <div className={styles.emptyState}>Awaiting aggregate assessment completion.</div>}
      </section>
    </div>
  );
}

export function AttentionAutonomic() {
  const query = useNanoDashboardData();

  if (query.isLoading || (!query.data && !query.isError)) {
    return (
      <div className={styles.page} data-screen-label="Attention and autonomic">
        <RouteHeader />
        <div className={styles.content}>
          <StatusPanel tone="loading" title="Loading aggregate attention data">
            Checking the NANO dashboard feed and its aggregate-only safety marker.
          </StatusPanel>
          <div className={styles.loadingGrid} aria-hidden>
            <span /><span /><span />
          </div>
        </div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className={styles.page} data-screen-label="Attention and autonomic">
        <RouteHeader />
        <div className={styles.content}>
          <StatusPanel tone="error" title="Aggregate feed unavailable" action={() => void query.refetch()}>
            The attention and autonomic view could not load. No cached participant-level values are displayed.
          </StatusPanel>
        </div>
      </div>
    );
  }

  if (query.data.meta.aggregateOnly !== true) {
    return (
      <div className={styles.page} data-screen-label="Attention and autonomic">
        <RouteHeader data={query.data} />
        <div className={styles.content}>
          <StatusPanel tone="safety" title="Aggregate safety check required">
            This route only renders feeds explicitly marked aggregate-only. The current payload remains withheld.
          </StatusPanel>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page} data-screen-label="Attention and autonomic">
      <RouteHeader data={query.data} />
      <AttentionContent data={query.data} />
    </div>
  );
}
