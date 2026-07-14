import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { DonutChart, type DonutSegment } from "@/components/charts/DonutChart";
import { Icon } from "@/components/primitives";
import { Counter } from "@/components/warm/Counter";
import {
  nanoQaPassedHeadline,
  useNanoDashboardData,
  type NanoAssessment,
  type NanoChecklistItem,
  type NanoDashboardData,
  type NanoPipelineStage,
} from "@/api/nanoDashboardData";
import { useUi } from "@/store/ui";
import babyIcon from "@/assets/nano-dashboard/icon-baby-blue.png";
import brainIcon from "@/assets/nano-dashboard/icon-brain-blue.png";
import checklistIcon from "@/assets/nano-dashboard/icon-checklist-blue.png";
import eyeIcon from "@/assets/nano-dashboard/icon-eye-blue.png";
import growthIcon from "@/assets/nano-dashboard/icon-growth-chart-blue.png";
import heartbeatIcon from "@/assets/nano-dashboard/icon-heartbeat-blue.png";
import waveformIcon from "@/assets/nano-dashboard/icon-waveform-blue.png";
import logo from "@/assets/nano-dashboard/logo-horizontal-discovery-blue.png";
import patternWhite from "@/assets/nano-dashboard/pattern-brain-duck-white.png";
import sunburstBlue from "@/assets/nano-dashboard/sunburst-discovery-blue.png";
import sunburstWhite from "@/assets/nano-dashboard/sunburst-cool-white.png";
import uofscLogo from "@/assets/nano-dashboard/uofsc-horizontal-garnet.png";
import styles from "./NanoStudyDashboard.module.css";

const SECTION_LINKS = [
  ["overview", "Overview"],
  ["cohort", "Cohort"],
  ["schedule", "Schedule"],
  ["pipeline", "Pipeline"],
  ["metrics", "Metrics"],
  ["assessments", "Assessments"],
  ["operations", "Operations"],
  ["library", "Library"],
  ["assistant", "Lab Buddy"],
] as const;

const PHASE_COLORS = ["#ffffff", "#bfd4ff", "#7fa8ff", "#4c77e6"];

const iconByKpi = {
  enrollment: babyIcon,
  rsa: heartbeatIcon,
  qa: waveformIcon,
  redcap: checklistIcon,
};

function numberText(value: number | null, decimals = 0): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function percentText(value: number | null, decimals = 0): string | null {
  const formatted = numberText(value, decimals);
  return formatted === null ? null : `${formatted}%`;
}

function dateText(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function titleText(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clampPct(value: number | null): number {
  return Math.max(0, Math.min(value ?? 0, 100));
}

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function maxKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? Math.max(...known) : null;
}

function ratioPct(complete: number | null, expected: number | null, provided: number | null): number | null {
  if (provided !== null) return provided;
  if (complete === null || expected === null || expected <= 0) return null;
  return (complete / expected) * 100;
}

function MetricValue({
  value,
  suffix,
  decimals = 0,
  animate = false,
  className = "",
}: {
  value: number | null;
  suffix?: string;
  decimals?: number;
  animate?: boolean;
  className?: string;
}) {
  const formatted = numberText(value, decimals);
  if (formatted === null) return <span className={`${styles.awaiting} ${className}`}>Awaiting data</span>;
  return (
    <span className={className}>
      {animate ? (
        <Counter
          to={value!}
          decimals={decimals}
          duration={1300}
          formatter={(current) => numberText(current, decimals) ?? "0"}
        />
      ) : formatted}
      {suffix && <span className={styles.metricSuffix}>{suffix}</span>}
    </span>
  );
}

function TextValue({ value, className = "" }: { value: string | null; className?: string }) {
  return value ? <span className={className}>{value}</span> : <span className={`${styles.awaiting} ${className}`}>Awaiting data</span>;
}

function EmptyState({ children = "Awaiting data" }: { children?: string }) {
  return (
    <div className={styles.emptyState} role="status">
      <Icon name="clock" size={17} />
      <span>{children}</span>
    </div>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  summary,
}: {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
}) {
  return (
    <header className={styles.sectionHeading} data-reveal="up">
      <span className={styles.eyebrow}>{eyebrow}</span>
      <h2 id={id}>{title}</h2>
      <p>{summary}</p>
    </header>
  );
}

function ProgressBar({
  value,
  label,
  tone = "blue",
}: {
  value: number | null;
  label: string;
  tone?: "blue" | "science" | "orange" | "yellow";
}) {
  return (
    <div
      className={styles.progressTrack}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : clampPct(value)}
      aria-valuetext={value === null ? "Awaiting data" : percentText(value) ?? undefined}
    >
      <span
        className={`${styles.progressFill} ${styles[`progress_${tone}`]}`}
        style={{ "--progress": `${clampPct(value)}%` } as CSSProperties}
      />
    </div>
  );
}

function safeLibraryHref(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/") || value.startsWith("https://") || value.startsWith("http://")) return value;
  return null;
}

function LoadingDashboard() {
  return (
    <div className={styles.loading} aria-busy="true" aria-live="polite">
      <img src={sunburstBlue} alt="" />
      <strong>Loading NANO dashboard</strong>
      <span>Connecting to the aggregate study data contract.</span>
    </div>
  );
}

export function NanoStudyDashboard() {
  const query = useNanoDashboardData();
  const setChatOpen = useUi((state) => state.setChatOpen);
  const setChatSeed = useUi((state) => state.setChatSeed);
  const [metricWindow, setMetricWindow] = useState("All");
  const pageRef = useRef<HTMLElement>(null);

  const availableWindows = useMemo(() => {
    const windows = query.data?.attention.byWindow.map((item) => item.window) ?? [];
    return ["All", ...Array.from(new Set(windows))];
  }, [query.data?.attention.byWindow]);

  useEffect(() => {
    if (!availableWindows.includes(metricWindow)) setMetricWindow("All");
  }, [availableWindows, metricWindow]);

  useEffect(() => {
    const root = pageRef.current;
    if (!root || !query.data) return;

    root.querySelectorAll<HTMLElement>("[data-reveal-stagger]").forEach((group) => {
      Array.from(group.children).forEach((child, index) => {
        if (child instanceof HTMLElement && child.hasAttribute("data-reveal")) {
          child.style.setProperty("--reveal-index", String(index));
        }
      });
    });

    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const reveal = (item: HTMLElement) => {
      item.dataset.revealed = "true";
    };
    const revealAll = () => items.forEach(reveal);
    const motionPreference = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    if (motionPreference?.matches || !("IntersectionObserver" in window)) {
      revealAll();
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal(entry.target as HTMLElement);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.01, rootMargin: "0px 0px -6% 0px" });

    items.forEach((item) => observer.observe(item));

    let frame = 0;
    const sweep = () => {
      frame = 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      items.forEach((item) => {
        if (item.dataset.revealed === "true") return;
        const bounds = item.getBoundingClientRect();
        if (bounds.top < viewportHeight * 1.12 && bounds.bottom > -120) {
          reveal(item);
          observer.unobserve(item);
        }
      });
    };
    const scheduleSweep = () => {
      if (!frame) frame = window.requestAnimationFrame(sweep);
    };
    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      revealAll();
      observer.disconnect();
    };

    window.addEventListener("scroll", scheduleSweep, { passive: true });
    window.addEventListener("resize", scheduleSweep, { passive: true });
    motionPreference?.addEventListener?.("change", onMotionPreferenceChange);
    scheduleSweep();

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleSweep);
      window.removeEventListener("resize", scheduleSweep);
      motionPreference?.removeEventListener?.("change", onMotionPreferenceChange);
    };
  }, [query.data]);

  if (query.isLoading) return <LoadingDashboard />;

  if (query.isError || !query.data) {
    return (
      <div className={styles.errorState} role="alert">
        <img src={sunburstBlue} alt="" />
        <h1>NANO dashboard data is temporarily unavailable</h1>
        <p>The existing dashboard remains available. This page will reconnect to the aggregate data feed without exposing participant records.</p>
        <button type="button" onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const data = query.data;
  const modelReady = data.pipeline.find((stage) => /model.?ready|models?/i.test(stage.stage)) ?? data.pipeline.at(-1);
  const qaPassed = nanoQaPassedHeadline(data);
  const dueTotal = sumKnown(data.schedule.map((visit) => visit.due));
  const overdueTotal = sumKnown(data.schedule.map((visit) => visit.overdue));
  const availableInventory = sumKnown(data.inventory.map((item) => item.available));
  const aggregateComplete = sumKnown(data.assessments.map((assessment) => assessment.complete));
  const aggregateExpected = sumKnown(data.assessments.map((assessment) => assessment.expected));
  const aggregateAssessmentPct = ratioPct(aggregateComplete, aggregateExpected, null);
  const libraryHref = safeLibraryHref(data.library.href);

  const phaseSegments: DonutSegment[] = data.attention.phases.map((phase, index) => ({
    label: phase.phase,
    value: phase.pct ?? 0,
    color: PHASE_COLORS[index % PHASE_COLORS.length]!,
  }));

  const groupedAssessments = Array.from(
    data.assessments.reduce((groups, assessment) => {
      const current = groups.get(assessment.instrument) ?? [];
      current.push(assessment);
      groups.set(assessment.instrument, current);
      return groups;
    }, new Map<string, NanoAssessment[]>()),
  );

  const attentionWindows = metricWindow === "All"
    ? data.attention.byWindow
    : data.attention.byWindow.filter((row) => row.window === metricWindow);

  function openAssistant(prompt: string | null = null) {
    setChatSeed(prompt);
    setChatOpen(true);
  }

  function updateGlow(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--cursor-x", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--cursor-y", `${event.clientY - bounds.top}px`);
  }

  return (
    <article ref={pageRef} className={styles.page} data-testid="nano-study-dashboard">
      <div className={styles.statusStrip} aria-label="NANO study status" data-reveal="up">
        <span className={styles.pulseDot} aria-hidden="true" />
        <strong>{data.meta.study ?? "NANO"} Study</strong>
        <span className={styles.separator} aria-hidden="true">•</span>
        <TextValue value={data.meta.state} />
        <span className={styles.separator} aria-hidden="true">•</span>
        <span className={styles.statusMetric}>
          <MetricValue value={data.enrollment.enrolled} />
          <span aria-hidden="true"> / </span>
          <MetricValue value={data.enrollment.target ?? data.meta.target} /> enrolled
        </span>
        <span className={styles.separator} aria-hidden="true">•</span>
        <span>As of <TextValue value={dateText(data.meta.asOf)} /></span>
        {data.meta.source && <span className={styles.sourceChip}>{titleText(data.meta.source)} data</span>}
      </div>

      <nav className={styles.anchorNav} aria-label="NANO dashboard sections" data-reveal="up">
        <span>Explore NANO</span>
        <div>
          {SECTION_LINKS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </div>
      </nav>

      <section id="overview" className={styles.hero} aria-labelledby="nano-hero-title">
        <img className={styles.floatMark} src={sunburstBlue} alt="" aria-hidden="true" />
        <div className={styles.heroCopy} data-reveal="left">
          <img className={styles.heroLogo} src={logo} alt="Early Social Development Lab at the University of South Carolina" />
          <span className={styles.eyebrow}>
            <img src={sunburstBlue} alt="" /> NANO Study
          </span>
          <h1 id="nano-hero-title">The heartbeat of every baby&apos;s first year.</h1>
          <Icon name="activity" size={390} style={{ width: "min(420px, 92%)", height: 34 }} />
          <p>
            Neurodevelopment of Autonomic and Neural Organization is a five-year NIH R01 study of how autonomic regulation and attention develop across infancy.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#cohort">
              Explore study operations <Icon name="arrow-right" size={16} />
            </a>
            <button type="button" className={styles.secondaryAction} onClick={() => openAssistant()}>
              <Icon name="sparkles" size={16} /> Ask the lab
            </button>
          </div>
        </div>

        <div
          className={styles.attentionCard}
          onPointerMove={updateGlow}
          style={{ "--pattern-image": `url(${patternWhite})` } as CSSProperties}
          data-reveal="scale"
        >
          <div className={styles.cursorGlow} aria-hidden="true" />
          <img className={styles.cardSunburst} src={sunburstWhite} alt="" aria-hidden="true" />
          <div className={styles.attentionHeader}>
            <div>
              <span className={styles.cardEyebrow}>Attention Pulse</span>
              <h2>Heart-defined attention</h2>
            </div>
            <span className={styles.aggregateChip}>Aggregate only</span>
          </div>
          <div className={styles.attentionMain}>
            <div>
              <div className={styles.attentionValue}>
                <MetricValue value={data.attention.hdaSustainedPct} suffix="%" decimals={1} animate />
              </div>
              <p>Sustained-attention share across labeled HDA windows</p>
              <div className={styles.rsaReadout}>
                <img src={heartbeatIcon} alt="" />
                <span>
                  Baseline RSA
                  <strong><MetricValue value={data.autonomic.rsaBaselineMs2} suffix=" ms²" decimals={1} /></strong>
                </span>
              </div>
            </div>
            <div className={styles.donutGroup}>
              {phaseSegments.length ? (
                <DonutChart
                  segments={phaseSegments}
                  size={142}
                  strokeWidth={18}
                  ariaLabel="Distribution of aggregate heart-defined attention phases"
                />
              ) : <div className={styles.donutEmpty}>Awaiting data</div>}
              <div className={styles.phaseLegend}>
                {data.attention.phases.length ? data.attention.phases.map((phase, index) => (
                  <div key={phase.phase}>
                    <span style={{ backgroundColor: PHASE_COLORS[index % PHASE_COLORS.length] }} />
                    <span>{phase.phase}</span>
                    <strong>{percentText(phase.pct, 1) ?? "Awaiting"}</strong>
                  </div>
                )) : <span className={styles.awaiting}>Awaiting phase distribution</span>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pulse" className={styles.kpiSection} aria-label="NANO study headline metrics" data-reveal-stagger>
        <KpiCard
          icon={iconByKpi.enrollment}
          value={data.enrollment.enrolled}
          suffix={data.enrollment.target !== null ? ` / ${numberText(data.enrollment.target)}` : undefined}
          label="Enrolled infants"
          detail="Across all study groups"
          href="#cohort"
        />
        <KpiCard
          icon={iconByKpi.rsa}
          value={data.autonomic.rsaBaselineMs2}
          suffix=" ms²"
          decimals={1}
          label="Baseline RSA"
          detail="Median autonomic tone"
          href="#metrics"
        />
        <KpiCard
          icon={iconByKpi.qa}
          value={qaPassed}
          label="Sessions QA-passed"
          detail="Aggregate pipeline count"
          href="#pipeline"
        />
        <KpiCard
          icon={iconByKpi.redcap}
          textValue={data.redcap.syncHealth ? titleText(data.redcap.syncHealth) : null}
          label="REDCap sync"
          detail={data.redcap.lastSync ? `Last sync ${dateText(data.redcap.lastSync)}` : "Last sync awaiting data"}
          href="#operations"
        />
      </section>

      <section className={styles.marquee} aria-label="Current aggregate NANO metrics" data-reveal="up">
        <div>
          <MarqueeItem icon={babyIcon} value={numberText(data.enrollment.enrolled)} label="infants enrolled" />
          <MarqueeItem icon={heartbeatIcon} value={numberText(data.autonomic.rsaBaselineMs2, 1)} label="baseline RSA" />
          <MarqueeItem icon={eyeIcon} value={percentText(data.attention.hdaSustainedPct, 1)} label="sustained attention" />
          <MarqueeItem icon={waveformIcon} value={numberText(qaPassed)} label="sessions QA-passed" />
          <MarqueeItem icon={growthIcon} value={numberText(modelReady?.count ?? null)} label="model-ready" />
        </div>
      </section>

      <div className={styles.content}>
        <section id="cohort" className={styles.section} aria-labelledby="cohort-title">
          <SectionHeading
            id="cohort-title"
            eyebrow="Enrollment and cohort"
            title="One cohort, three developmental pathways"
            summary="Enrollment, retention, and recruitment progress are shown as de-identified aggregate counts."
          />
          <div className={styles.cohortGrid}>
            <div className={`${styles.panel} ${styles.enrollmentPanel}`} data-reveal="left">
              <div className={styles.panelTitle}>
                <div>
                  <span className={styles.eyebrow}>Enrollment</span>
                  <h3><MetricValue value={data.enrollment.enrolled} /> of <MetricValue value={data.enrollment.target} /></h3>
                </div>
                <div className={styles.retentionPill}>
                  Retention <strong>{percentText(data.enrollment.retentionPct, 1) ?? "Awaiting data"}</strong>
                </div>
              </div>
              {data.enrollment.byGroup.length ? (
                <div className={styles.groupBars}>
                  {data.enrollment.byGroup.map((group) => {
                    const progress = group.enrolled !== null && group.target !== null && group.target > 0
                      ? (group.enrolled / group.target) * 100
                      : null;
                    return (
                      <div key={group.group}>
                        <div className={styles.barLabel}>
                          <strong>{group.group}</strong>
                          <span><MetricValue value={group.enrolled} /> / <MetricValue value={group.target} /></span>
                        </div>
                        <ProgressBar value={progress} label={`${group.group} enrollment progress`} />
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState />}
              <details className={styles.details}>
                <summary>View cohort details</summary>
                <div className={styles.detailColumns}>
                  <CountList title="Gestational age strata" rows={data.enrollment.byGaStratum} />
                  <CountList title="Sites" rows={data.enrollment.bySite} />
                </div>
              </details>
            </div>

            <div className={`${styles.panel} ${styles.funnelPanel}`} data-reveal="right">
              <div className={styles.panelTitle}>
                <div>
                  <span className={styles.eyebrow}>Recruitment funnel</span>
                  <h3>From referral to follow-up</h3>
                </div>
                <span className={styles.activeCount}><MetricValue value={data.enrollment.active} /> active</span>
              </div>
              {data.enrollment.funnel.length ? (
                <ol className={styles.funnel}>
                  {data.enrollment.funnel.map((stage, index) => {
                    const max = maxKnown(data.enrollment.funnel.map((row) => row.count));
                    const width = stage.count !== null && max !== null && max > 0 ? (stage.count / max) * 100 : 0;
                    return (
                      <li key={stage.stage}>
                        <span className={styles.funnelIndex}>{index + 1}</span>
                        <div>
                          <span>{stage.stage}</span>
                          <strong><MetricValue value={stage.count} /></strong>
                          <span className={styles.funnelBar} style={{ "--funnel-width": `${width}%` } as CSSProperties} />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : <EmptyState />}
            </div>
          </div>
        </section>

        <section id="schedule" className={styles.section} aria-labelledby="schedule-title">
          <SectionHeading
            id="schedule-title"
            eyebrow="Visit schedule tracker"
            title="What is due next?"
            summary="Public schedule reporting is restricted to counts by timepoint. Participant lists remain on approved secure systems."
          />
          <div className={styles.headlineBand} data-reveal="up">
            <div><span>Visits due</span><strong><MetricValue value={dueTotal} /></strong></div>
            <div><span>Overdue</span><strong><MetricValue value={overdueTotal} /></strong></div>
            <div><span>Next 14 days</span><strong><MetricValue value={sumKnown(data.schedule.map((visit) => visit.upcoming14d))} /></strong></div>
          </div>
          <div className={`${styles.panel} ${styles.tablePanel}`} data-reveal="up">
            {data.schedule.length ? (
              <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <caption className={styles.srOnly}>Aggregate visit schedule counts by NANO timepoint</caption>
                  <thead>
                    <tr><th>Timepoint</th><th>Due</th><th>Next 14 days</th><th>Overdue</th><th>Completed</th><th>Window adherence</th></tr>
                  </thead>
                  <tbody>
                    {data.schedule.map((visit) => (
                      <tr key={visit.id}>
                        <th scope="row">{titleText(visit.id)}</th>
                        <td><MetricValue value={visit.due} /></td>
                        <td><MetricValue value={visit.upcoming14d} /></td>
                        <td className={visit.overdue !== null && visit.overdue > 0 ? styles.warningText : undefined}><MetricValue value={visit.overdue} /></td>
                        <td><MetricValue value={visit.completed} /></td>
                        <td>
                          <span className={styles.inlineMetric}>{percentText(visit.windowAdherencePct, 1) ?? "Awaiting data"}</span>
                          <ProgressBar value={visit.windowAdherencePct} label={`${titleText(visit.id)} window adherence`} tone="science" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState />}
            <details className={styles.details}>
              <summary>View schedule guidance</summary>
              <p>Use the secure REDCap or approved scheduling system for participant-level follow-up. This public surface intentionally exposes counts only.</p>
            </details>
          </div>
        </section>

        <section id="pipeline" className={styles.section} aria-labelledby="pipeline-title">
          <SectionHeading
            id="pipeline-title"
            eyebrow="Data pipeline and QC"
            title="From signal ingest to model-ready features"
            summary="Each stage reports aggregate throughput, the seven-day change, and available quality-control pass rates."
          />
          <div className={styles.pipelineHeadline} data-reveal="up">
            <img src={waveformIcon} alt="" />
            <div><span>Model-ready</span><strong><MetricValue value={modelReady?.count ?? null} /></strong></div>
            <p>HeRO, Actiheart-5, temperature, and behavioral coding converge in the de-identified feature pipeline.</p>
          </div>
          {data.pipeline.length ? (
            <ol className={styles.pipelineSteps} data-reveal-stagger>
              {data.pipeline.map((stage, index) => <PipelineStep key={`${stage.stage}-${index}`} stage={stage} index={index + 1} />)}
            </ol>
          ) : <div className={styles.panel}><EmptyState /></div>}
          <details className={`${styles.details} ${styles.detailsStandalone}`} data-reveal="up">
            <summary>View pipeline method</summary>
            <p>ECG preprocessing uses neurokit2, temperature preprocessing derives CPTd, behavioral coding is managed in DataVyu, and analysis-ready datasets support MICE imputation and planned models.</p>
          </details>
        </section>

        <section id="metrics" className={styles.section} aria-labelledby="metrics-title">
          <SectionHeading
            id="metrics-title"
            eyebrow="Autonomic and attention metrics"
            title="How regulation changes across infancy"
            summary="Explore HDA quantity and quality, baseline RSA, and temperature summaries by developmental window."
          />
          <div className={styles.metricToolbar} role="group" aria-label="Filter metrics by visit window" data-reveal="up">
            {availableWindows.map((window) => (
              <button
                key={window}
                type="button"
                className={metricWindow === window ? styles.activeFilter : undefined}
                aria-pressed={metricWindow === window}
                onClick={() => setMetricWindow(window)}
              >
                {window}
              </button>
            ))}
          </div>
          <div className={styles.metricsGrid}>
            <div className={`${styles.panel} ${styles.timelinePanel}`} data-reveal="left">
              <div className={styles.panelTitle}>
                <div><span className={styles.eyebrow}>HDA by window</span><h3>Sustained-attention share</h3></div>
                <img src={eyeIcon} alt="" />
              </div>
              {attentionWindows.length ? (
                <div className={styles.windowBars}>
                  {attentionWindows.map((row) => (
                    <div key={row.window}>
                      <span>{row.window}</span>
                      <div><span style={{ "--window-width": `${clampPct(row.sustainedPct)}%` } as CSSProperties} /></div>
                      <strong>{percentText(row.sustainedPct, 1) ?? "Awaiting"}</strong>
                    </div>
                  ))}
                </div>
              ) : <EmptyState />}
              <div className={styles.phaseStack} aria-label="HDA phase distribution">
                {data.attention.phases.map((phase, index) => (
                  <span
                    key={phase.phase}
                    style={{
                      "--phase-width": `${clampPct(phase.pct)}%`,
                      "--phase-color": PHASE_COLORS[index % PHASE_COLORS.length],
                    } as CSSProperties}
                    title={`${phase.phase}: ${percentText(phase.pct, 1) ?? "Awaiting data"}`}
                  />
                ))}
              </div>
              <div className={styles.phaseLabels}>
                {data.attention.phases.map((phase, index) => (
                  <span key={phase.phase}><i style={{ backgroundColor: PHASE_COLORS[index % PHASE_COLORS.length] }} />{phase.phase}</span>
                ))}
              </div>
            </div>
            <div className={`${styles.panel} ${styles.vitalsPanel}`} data-reveal="right">
              <MetricTile label="HDA quality" value={data.attention.hdaQualityBpm} suffix=" bpm" decimals={1} icon={heartbeatIcon} />
              <MetricTile label="Baseline RSA" value={data.autonomic.rsaBaselineMs2} suffix=" ms²" decimals={1} icon={waveformIcon} />
              <MetricTile label="Mean CPTd" value={data.autonomic.cptdMeanC} suffix=" °C" decimals={2} icon={brainIcon} />
              <div className={styles.modelTile}>
                <span className={styles.eyebrow}>Aim 3 models</span>
                <strong><TextValue value={data.models.aim3Status ? titleText(data.models.aim3Status) : null} /></strong>
                <span>Best metric <MetricValue value={data.models.bestMetric} decimals={3} /></span>
                <span>SHAP {data.models.shapReady === null ? "awaiting data" : data.models.shapReady ? "ready" : "not ready"}</span>
              </div>
            </div>
          </div>
          <details className={styles.details} data-reveal="up">
            <summary>View group and age detail</summary>
            {data.attention.byGroupWindow.length || data.autonomic.byGroupWindow.length ? (
              <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <thead><tr><th>Group</th><th>Window</th><th>Sustained HDA</th><th>HDA quality</th><th>RSA</th><th>CPTd</th></tr></thead>
                  <tbody>
                    {mergeGroupWindows(data).map((row) => (
                      <tr key={`${row.group}-${row.window}`}>
                        <th scope="row">{row.group}</th><td>{row.window}</td>
                        <td>{percentText(row.sustainedPct, 1) ?? "Awaiting data"}</td>
                        <td>{numberText(row.hdaQualityBpm, 1) ?? "Awaiting data"}</td>
                        <td>{numberText(row.rsaBaselineMs2, 1) ?? "Awaiting data"}</td>
                        <td>{numberText(row.cptdMeanC, 2) ?? "Awaiting data"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState />}
          </details>
        </section>

        <section id="assessments" className={styles.section} aria-labelledby="assessments-title">
          <SectionHeading
            id="assessments-title"
            eyebrow="Assessments"
            title="Completion at every milestone"
            summary="Instrument completion is summarized across applicable visits, with the full timepoint matrix behind one disclosure."
          />
          <div className={styles.assessmentHeadline} data-reveal="up">
            <div><span>Completed</span><strong><MetricValue value={aggregateComplete} /></strong></div>
            <div><span>Expected</span><strong><MetricValue value={aggregateExpected} /></strong></div>
            <div><span>Overall</span><strong>{percentText(aggregateAssessmentPct, 1) ?? "Awaiting data"}</strong></div>
          </div>
          {groupedAssessments.length ? (
            <div className={styles.assessmentCards} data-reveal-stagger>
              {groupedAssessments.map(([instrument, rows]) => {
                const complete = sumKnown(rows.map((row) => row.complete));
                const expected = sumKnown(rows.map((row) => row.expected));
                const provided = rows.length === 1 ? rows[0]?.pctComplete ?? null : null;
                const progress = ratioPct(complete, expected, provided);
                return (
                  <div key={instrument} className={styles.assessmentCard} data-reveal="up">
                    <img src={checklistIcon} alt="" />
                    <div><strong>{instrument}</strong><span><MetricValue value={complete} /> of <MetricValue value={expected} /></span></div>
                    <b>{percentText(progress, 0) ?? "Awaiting"}</b>
                    <ProgressBar value={progress} label={`${instrument} completion`} />
                  </div>
                );
              })}
            </div>
          ) : <div className={styles.panel}><EmptyState /></div>}
          <details className={styles.details}>
            <summary>View assessment matrix</summary>
            {data.assessments.length ? (
              <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <thead><tr><th>Instrument</th><th>Timepoint</th><th>Complete</th><th>Expected</th><th>Completion</th></tr></thead>
                  <tbody>
                    {data.assessments.map((assessment, index) => (
                      <tr key={`${assessment.instrument}-${assessment.timepoint}-${index}`}>
                        <th scope="row">{assessment.instrument}</th><td>{titleText(assessment.timepoint)}</td>
                        <td><MetricValue value={assessment.complete} /></td><td><MetricValue value={assessment.expected} /></td>
                        <td>{percentText(ratioPct(assessment.complete, assessment.expected, assessment.pctComplete), 1) ?? "Awaiting data"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState />}
          </details>
        </section>

        <section id="operations" className={styles.section} aria-labelledby="operations-title">
          <SectionHeading
            id="operations-title"
            eyebrow="Operations hub"
            title="The lab at a glance"
            summary="Inventory, compliance, and REDCap health lead with one operational signal each. Detail stays tucked away until it is needed."
          />
          <div className={styles.operationsGrid} data-reveal-stagger>
            <OperationsCard icon={brainIcon} eyebrow="Equipment inventory" headline={<MetricValue value={availableInventory} />} headlineLabel="units or items available">
              {data.inventory.length ? (
                <ul className={styles.compactList}>
                  {data.inventory.map((item) => (
                    <li key={item.item}>
                      <span>{item.item}</span>
                      <strong><MetricValue value={item.available} /> available</strong>
                      <small className={item.lowStock ? styles.warningText : undefined}>
                        <span>In use <MetricValue value={item.inUse} /></span>
                        <span>Calibration due <MetricValue value={item.calibrationDue} /></span>
                        <span>{item.lowStock === null ? item.status ?? "Awaiting status" : item.lowStock ? "Low stock" : item.status ?? "Stocked"}</span>
                      </small>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState />}
            </OperationsCard>
            <OperationsCard icon={checklistIcon} eyebrow="Checklists and compliance" headline={<MetricValue value={data.checklists.openQcActions} />} headlineLabel="open QC actions">
              <ChecklistGroup title="Onboarding" rows={data.checklists.onboarding} />
              <ChecklistGroup title="Visit prep" rows={data.checklists.visitPrep} />
              <div className={styles.sopLine}>SOP acknowledgement <strong>{percentText(data.checklists.sopAckPct, 1) ?? "Awaiting data"}</strong></div>
            </OperationsCard>
            <OperationsCard
              icon={growthIcon}
              eyebrow="REDCap API health"
              headline={<TextValue value={data.redcap.syncHealth ? titleText(data.redcap.syncHealth) : null} />}
              headlineLabel="sync status"
            >
              <dl className={styles.definitionGrid}>
                <div><dt>Token</dt><dd>{data.redcap.apiTokenValid === null ? "Awaiting data" : data.redcap.apiTokenValid ? "Valid" : "Needs attention"}</dd></div>
                <div><dt>Last sync</dt><dd>{dateText(data.redcap.lastSync) ?? "Awaiting data"}</dd></div>
                <div><dt>Records locked</dt><dd><MetricValue value={data.redcap.recordsLocked} /></dd></div>
                <div><dt>Entry discrepancies</dt><dd><MetricValue value={data.redcap.doubleEntryDiscrepancies} /></dd></div>
                <div><dt>Instruments</dt><dd><MetricValue value={data.redcap.instrumentsDefined} /></dd></div>
                <div><dt>DAGs</dt><dd><MetricValue value={data.redcap.dags} /></dd></div>
              </dl>
            </OperationsCard>
          </div>
        </section>

        <section id="library" className={`${styles.section} ${styles.librarySection}`} aria-labelledby="library-title">
          <div className={styles.libraryVisual} data-reveal="left">
            <img src={brainIcon} alt="" />
            <span className={styles.libraryCount}><MetricValue value={data.library.indexedDocuments} /></span>
            <span>indexed documents</span>
          </div>
          <div data-reveal="right">
            <span className={styles.eyebrow}>Library</span>
            <h2 id="library-title">Study methods and SOPs, ready to cite</h2>
            <p>The assistant grounds protocol and onboarding answers in the approved document index and links citations back to the Library.</p>
            <dl className={styles.libraryMeta}>
              <div><dt>Index source</dt><dd><TextValue value={data.library.indexSource} /></dd></div>
              <div><dt>Last indexed</dt><dd><TextValue value={dateText(data.library.lastIndexed)} /></dd></div>
            </dl>
            {libraryHref ? (
              <a className={styles.primaryAction} href={libraryHref}>
                {data.library.label ?? "Open the Library"} <Icon name="arrow-right" size={16} />
              </a>
            ) : <span className={styles.awaiting}>Library link awaiting data</span>}
          </div>
        </section>

        <section id="assistant" className={`${styles.section} ${styles.assistantSection}`} aria-labelledby="assistant-title" data-reveal="scale">
          <div className={styles.assistantAvatar}><img src={sunburstBlue} alt="" /></div>
          <div>
            <span className={styles.eyebrow}>ESD Lab Buddy</span>
            <h2 id="assistant-title">Ask the lab, stay grounded</h2>
            <p>The same local assistant used across this repository can explain aggregate NANO metrics, find an SOP with citations, and redirect requests that belong on secure systems.</p>
            <div className={styles.promptButtons}>
              <button type="button" onClick={() => openAssistant("Using only aggregate NANO dashboard metrics, how many visits are due in the next 14 days?")}>How many visits are due?</button>
              <button type="button" onClick={() => openAssistant("Summarize HDA sustained-attention share by available NANO visit windows. Use aggregate metrics only.")}>HDA by window?</button>
              <button type="button" onClick={() => openAssistant("Is the aggregate NANO REDCap sync healthy, and are any double-entry discrepancies open?")}>REDCap sync status?</button>
            </div>
          </div>
          <button type="button" className={styles.askButton} onClick={() => openAssistant()}>
            <Icon name="sparkles" size={17} /> Ask the lab
          </button>
        </section>
      </div>

      <footer className={styles.pageFooter} data-reveal="up">
        <div>
          <img src={logo} alt="Early Social Development Lab" />
          <span aria-hidden="true" />
          <img src={uofscLogo} alt="University of South Carolina" />
        </div>
        <p>Aggregate, de-identified NANO metrics only. {data.meta.source ? `${titleText(data.meta.source)} data.` : "Data source awaiting confirmation."}</p>
      </footer>
    </article>
  );
}

function KpiCard({
  icon,
  value = null,
  textValue = null,
  suffix,
  decimals = 0,
  label,
  detail,
  href,
}: {
  icon: string;
  value?: number | null;
  textValue?: string | null;
  suffix?: string;
  decimals?: number;
  label: string;
  detail: string;
  href: string;
}) {
  return (
    <div className={styles.kpiCard} data-reveal="up">
      <img src={icon} alt="" />
      <strong>{textValue !== null ? textValue : <MetricValue value={value} suffix={suffix} decimals={decimals} animate />}</strong>
      <span>{label}</span>
      <small>{detail}</small>
      <a href={href}>View section <Icon name="arrow-right" size={14} /></a>
    </div>
  );
}

function MarqueeItem({ icon, value, label }: { icon: string; value: string | null; label: string }) {
  return (
    <span>
      <img src={icon} alt="" />
      <strong>{value ?? "Awaiting"}</strong> {label}
    </span>
  );
}

function CountList({ title, rows }: { title: string; rows: Array<{ label: string; count: number | null }> }) {
  return (
    <div>
      <h4>{title}</h4>
      {rows.length ? <ul>{rows.map((row) => <li key={row.label}><span>{titleText(row.label)}</span><strong><MetricValue value={row.count} /></strong></li>)}</ul> : <EmptyState />}
    </div>
  );
}

function PipelineStep({ stage, index }: { stage: NanoPipelineStage; index: number }) {
  return (
    <li className={styles.pipelineStep} data-reveal="up">
      <span className={styles.stepIndex}>{index}</span>
      <div>
        <h3>{stage.stage}</h3>
        <strong><MetricValue value={stage.count} /></strong>
        <span className={stage.delta7d !== null && stage.delta7d < 0 ? styles.warningText : styles.deltaText}>
          {stage.delta7d === null ? "7-day change awaiting data" : `${stage.delta7d >= 0 ? "+" : ""}${numberText(stage.delta7d)} in 7 days`}
        </span>
        <small>QC pass {percentText(stage.qcPassPct, 1) ?? "awaiting data"}</small>
        <ProgressBar value={stage.qcPassPct} label={`${stage.stage} QC pass rate`} tone="science" />
      </div>
    </li>
  );
}

function MetricTile({
  label,
  value,
  suffix,
  decimals,
  icon,
}: {
  label: string;
  value: number | null;
  suffix: string;
  decimals: number;
  icon: string;
}) {
  return (
    <div className={styles.metricTile}>
      <img src={icon} alt="" />
      <span>{label}</span>
      <strong><MetricValue value={value} suffix={suffix} decimals={decimals} /></strong>
    </div>
  );
}

function OperationsCard({
  icon,
  eyebrow,
  headline,
  headlineLabel,
  children,
}: {
  icon: string;
  eyebrow: string;
  headline: React.ReactNode;
  headlineLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${styles.panel} ${styles.operationsCard}`} data-reveal="up">
      <img className={styles.operationsIcon} src={icon} alt="" />
      <span className={styles.eyebrow}>{eyebrow}</span>
      <div className={styles.operationsHeadline}>{headline}</div>
      <span className={styles.operationsLabel}>{headlineLabel}</span>
      <details className={styles.details}>
        <summary>View details</summary>
        {children}
      </details>
    </div>
  );
}

function ChecklistGroup({ title, rows }: { title: string; rows: NanoChecklistItem[] }) {
  if (!rows.length) return <EmptyState />;
  return (
    <div className={styles.checklistGroup}>
      <h4>{title}</h4>
      {rows.map((row) => {
        const progress = row.done !== null && row.total !== null && row.total > 0 ? (row.done / row.total) * 100 : null;
        return (
          <div key={row.key}>
            <span>{titleText(row.key)}</span>
            <strong><MetricValue value={row.done} /> / <MetricValue value={row.total} /></strong>
            <ProgressBar value={progress} label={`${titleText(row.key)} completion`} tone="science" />
          </div>
        );
      })}
    </div>
  );
}

function mergeGroupWindows(data: NanoDashboardData) {
  const rows = new Map<string, {
    group: string;
    window: string;
    sustainedPct: number | null;
    hdaQualityBpm: number | null;
    rsaBaselineMs2: number | null;
    cptdMeanC: number | null;
  }>();

  data.attention.byGroupWindow.forEach((row) => {
    const key = `${row.group}:${row.window}`;
    rows.set(key, {
      group: row.group,
      window: row.window,
      sustainedPct: row.sustainedPct,
      hdaQualityBpm: row.hdaQualityBpm,
      rsaBaselineMs2: null,
      cptdMeanC: null,
    });
  });

  data.autonomic.byGroupWindow.forEach((row) => {
    const key = `${row.group}:${row.window}`;
    const current = rows.get(key);
    rows.set(key, {
      group: row.group ?? "",
      window: row.window,
      sustainedPct: current?.sustainedPct ?? null,
      hdaQualityBpm: current?.hdaQualityBpm ?? null,
      rsaBaselineMs2: row.rsaBaselineMs2,
      cptdMeanC: row.cptdMeanC,
    });
  });

  return Array.from(rows.values());
}
