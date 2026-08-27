import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  ArrowUp,
  Download,
  Menu,
  MessageCircle,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { DonutChart, type DonutSegment } from "@/components/charts/DonutChart";
import { Counter } from "@/components/warm/Counter";
import {
  nanoQaPassedHeadline,
  nanoRedcapIndicator,
  useNanoDashboardData,
  type NanoAttentionPhase,
  type NanoDashboardData,
} from "@/api/nanoDashboardData";
import {
  getDashboardSourceState,
  selectNanoMetrics,
  useDashboardMetrics,
} from "@/api/dashboardMetrics";
import { DataProvenance } from "@/components/data/DataProvenance";
import { useUi } from "@/store/ui";
import { NanoDashboardDetails } from "@/routes/nano/NanoDashboardDetails";
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
import uofscLogo from "@/assets/nano-dashboard/uofsc-horizontal-garnet.png";
import styles from "./NanoStudyDashboard.module.css";

const NAV_ITEMS = [
  { label: "Overview", href: "#overview" },
  { label: "Metrics", href: "#metrics" },
  { label: "Aims", href: "#study-details" },
  { label: "Pipeline", href: "#pipeline" },
  { label: "Cohort", href: "#cohort" },
] as const;

const PHASE_COLORS: Record<string, string> = {
  sustained: "#3366ff",
  orienting: "#91baf4",
  inattention: "#f57f00",
  termination: "#f4da26",
};

const PULSE_PHASE_COLORS: Record<string, string> = {
  sustained: "#ffffff",
  orienting: "#bfd4ff",
  inattention: "#7fa8ff",
  termination: "#4c77e6",
};

function numberText(value: number | null, decimals = 0): string {
  if (value === null || !Number.isFinite(value)) return "Awaiting data";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function compactNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Awaiting data";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function strictSum(values: Array<number | null>): number | null {
  if (!values.length || values.some((value) => value === null || !Number.isFinite(value))) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

function percentText(value: number | null, decimals = 1): string {
  return value === null ? "Awaiting data" : `${numberText(value, decimals)}%`;
}

function dateText(value: string | null, includeTime = false): string {
  if (!value) return "Awaiting refresh";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime && !dateOnly ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" } : {}),
    timeZone: dateOnly ? "UTC" : "America/New_York",
  }).format(parsed);
}

function normalizedPhaseName(value: string): keyof typeof PHASE_COLORS {
  const key = value.trim().toLowerCase();
  if (key.includes("orient")) return "orienting";
  if (key.includes("inattent")) return "inattention";
  if (key.includes("termin")) return "termination";
  return "sustained";
}

function orderedPhases(phases: NanoAttentionPhase[]): NanoAttentionPhase[] {
  const byName = new Map(phases.map((phase) => [normalizedPhaseName(phase.phase), phase]));
  return (["sustained", "orienting", "inattention", "termination"] as const).map((name) => ({
    phase: name.charAt(0).toUpperCase() + name.slice(1),
    pct: byName.get(name)?.pct ?? null,
  }));
}

function MetricCounter({ value, decimals = 0 }: { value: number | null; decimals?: number }) {
  if (value === null) return <span className={styles.awaiting}>Awaiting data</span>;
  return (
    <Counter
      to={value}
      decimals={decimals}
      duration={1350}
      formatter={(current) => numberText(current, decimals)}
    />
  );
}

function ArrowLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a className={`${styles.arrowLink} ${className}`} href={href}>
      {children}
      <ArrowRight size={15} strokeWidth={2.4} aria-hidden />
    </a>
  );
}

function LoadingState() {
  return (
    <main className={styles.statePage} aria-busy="true" aria-live="polite">
      <img src={sunburstBlue} alt="" />
      <strong>Loading the NANO dashboard</strong>
      <span>Connecting to the live aggregate study metrics.</span>
    </main>
  );
}

function ErrorState({ retry }: { retry: () => void }) {
  return (
    <main className={styles.statePage} role="alert">
      <img src={sunburstBlue} alt="" />
      <strong>The live metrics are temporarily unavailable.</strong>
      <span>The dashboard did not substitute sample values.</span>
      <button type="button" className={styles.primaryButton} onClick={retry}>
        <RefreshCw size={15} aria-hidden /> Retry connection
      </button>
    </main>
  );
}

function DataSafetyState({ status }: { status: boolean | null }) {
  return (
    <main className={styles.statePage} role="alert">
      <img src={sunburstBlue} alt="" />
      <strong>Aggregate dashboard unavailable</strong>
      <span>
        {status === false
          ? "The NANO feed was not marked aggregate-only, so no metrics were rendered."
          : "The NANO feed did not confirm its aggregate-only status, so no metrics were rendered."}
      </span>
    </main>
  );
}

function DashboardHeader({ data }: { data: NanoDashboardData }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [search, setSearch] = useState("");
  const setChatOpen = useUi((state) => state.setChatOpen);
  const setChatSeed = useUi((state) => state.setChatSeed);
  const studyLabel = data.meta.study
    ? /study$/i.test(data.meta.study) ? data.meta.study : `${data.meta.study} Study`
    : "NANO Study";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openAssistant = (prompt?: string) => {
    if (prompt) setChatSeed(prompt);
    setChatOpen(true);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = search.trim().toLowerCase();
    if (!query) return;
    const destinations: Array<[RegExp, string]> = [
      [/pipeline|model|qa/, "#pipeline"],
      [/attention|hda|rsa|metric|autonomic/, "#metrics"],
      [/cohort|enroll|infant|participant/, "#cohort"],
      [/schedule|visit|due|overdue/, "#schedule"],
      [/assessment|instrument|bayley|ados|csbs/, "#assessments"],
      [/inventory|equipment|checklist|redcap|operation/, "#operations"],
      [/library|reading|sop|document/, "#library"],
      [/aim|study|detail/, "#study-details"],
    ];
    const destination = destinations.find(([pattern]) => pattern.test(query))?.[1];
    if (destination) {
      document.querySelector(destination)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setSearch("");
      return;
    }
    openAssistant(`Find aggregate NANO dashboard information about “${search.trim()}”.`);
  };

  return (
    <>
      <header className={`${styles.siteHeader} ${scrolled ? styles.scrolled : ""} ${menuOpen ? styles.navOpen : ""}`}>
        <div className={`${styles.wrap} ${styles.headerInner}`}>
          <a className={styles.brand} href="#overview" aria-label="ESD Lab NANO dashboard home">
            <img src={logo} alt="The Early Social Development Lab at UofSC" />
          </a>
          <nav className={styles.nav} aria-label="Primary navigation">
            {NAV_ITEMS.map((item, index) => (
              <a
                key={item.label}
                className={`${styles.navLink} ${index === 0 ? styles.active : ""}`}
                href={item.href}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <a className={styles.navLink} href="#library" onClick={() => setMenuOpen(false)}>Library</a>
          </nav>
          <div className={styles.headerTools}>
            <form className={styles.search} role="search" onSubmit={submitSearch}>
              <Search size={17} strokeWidth={2.2} aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search…"
                aria-label="Search the dashboard"
              />
            </form>
            <button type="button" className={`${styles.primaryButton} ${styles.sheen}`} onClick={() => openAssistant()}>
              <Sparkles size={15} fill="currentColor" aria-hidden /> Ask the lab
            </button>
            <button
              type="button"
              className={styles.navToggle}
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
            </button>
          </div>
        </div>
      </header>
      <div className={styles.statusStrip}>
        <div className={styles.wrap}>
          <span className={styles.pulseDot} aria-hidden />
          <strong>{studyLabel}</strong>
          <span className={styles.separator}>·</span>
          <span>{data.meta.state ?? "Status pending"}</span>
          <span className={styles.separator}>·</span>
          <span className={styles.muted}>
            <b>{numberText(data.enrollment.enrolled)} / {numberText(data.enrollment.target ?? data.meta.target)}</b> infants
          </span>
          <span className={styles.separator}>·</span>
          <span className={styles.muted}>As of {dateText(data.meta.asOf)}</span>
          <ArrowLink href="#study-details" className={styles.statusLink}>View study details</ArrowLink>
        </div>
      </div>
    </>
  );
}

function AttentionTimeline({ data }: { data: NanoDashboardData }) {
  const [range, setRange] = useState("All");
  const windows = data.attention.byWindow;
  const rangeOptions = [...windows.map((item) => item.window), "All"];
  const visible = range === "All" ? windows : windows.filter((item) => item.window === range);
  const bars = visible.length ? visible : [{ window: "Pending", sustainedPct: null }];

  return (
    <div className={`${styles.panel} ${styles.timelinePanel}`} id="metrics">
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}>
          <span className={styles.eyebrow}>Attention Phase Timeline</span>
          <span className={styles.panelSubtitle}>Sustained attention vs other labeled phases by developmental window</span>
        </div>
        <div className={styles.segmented} role="tablist" aria-label="Time range">
          {rangeOptions.map((label) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={range === label}
              className={range === label ? styles.selected : ""}
              onClick={() => setRange(label)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.timeline} aria-label="Aggregate sustained-attention share by study window">
        <div className={styles.axisY} aria-hidden>
          {[100, 75, 50, 25, 0].map((value) => (
            <div key={value} className={styles.gridLine} style={{ bottom: `${value}%` }}><span>{value}%</span></div>
          ))}
        </div>
        {bars.map((window, index) => {
          const values = window.sustainedPct === null
            ? [0, 0]
            : [Math.max(0, Math.min(window.sustainedPct, 100)), Math.max(0, 100 - window.sustainedPct)];
          return (
            <div className={styles.barColumn} key={window.window}>
              <div className={styles.barStack} style={{ "--bar-delay": `${index * 45}ms` } as CSSProperties}>
                {values.map((value, phaseIndex) => {
                  const phase = phaseIndex === 0 ? "sustained" : "other";
                  return (
                    <span
                      key={phase}
                      className={styles.barSegment}
                      style={{ height: `${Math.max(value, 0)}%`, background: phase === "sustained" ? PHASE_COLORS.sustained : "#e6eefc" }}
                      title={`${phase}: ${numberText(value, 1)}%`}
                    />
                  );
                })}
              </div>
              <span className={styles.barLabel}>{window.window}</span>
            </div>
          );
        })}
      </div>
      <div className={styles.legend}>
        <span><i style={{ background: PHASE_COLORS.sustained }} />Sustained</span>
        <span><i style={{ background: "#e6eefc" }} />Other labeled phases</span>
      </div>
      <ArrowLink href="#metrics" className={styles.panelLink}>See full attention analytics</ArrowLink>
    </div>
  );
}

function PipelineWatch({ data }: { data: NanoDashboardData }) {
  const stages = data.pipeline.slice(0, 6);
  return (
    <div className={styles.panel} id="pipeline">
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}><span className={styles.eyebrow}>Pipeline Watch</span></div>
        <ArrowLink href="#pipeline">View pipeline</ArrowLink>
      </div>
      {stages.length ? (
        <div className={styles.tableScroller}>
          <table className={styles.pipelineTable}>
            <thead><tr><th>Stage</th><th>Count</th><th>Δ vs 7D</th></tr></thead>
            <tbody>
              {stages.map((stage, index) => (
                <tr key={stage.stage}>
                  <td><span className={styles.stageIndex}>{index + 1}</span><strong>{stage.stage}</strong></td>
                  <td>{compactNumber(stage.count)}</td>
                  <td className={stage.delta7d !== null && stage.delta7d < 0 ? styles.negativeDelta : styles.delta}>
                    {stage.delta7d === null ? "Awaiting data" : <><span>{stage.delta7d > 0 ? "+" : ""}{numberText(stage.delta7d)}</span><ArrowUp size={13} aria-hidden /></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className={styles.empty}>Awaiting pipeline data</p>}
      <ArrowLink href="#pipeline" className={styles.panelLink}>See pipeline metrics</ArrowLink>
    </div>
  );
}

function AssistantInsight({ data }: { data: NanoDashboardData }) {
  const setChatOpen = useUi((state) => state.setChatOpen);
  const setChatSeed = useUi((state) => state.setChatSeed);
  const windowValues = data.attention.byWindow.map((item) => item.sustainedPct).filter((value): value is number => value !== null);
  const change = windowValues.length > 1 ? windowValues.at(-1)! - windowValues.at(-2)! : null;
  const openFollowUp = () => {
    setChatSeed("Summarize the NANO dashboard, clearly distinguishing live REDCap enrollment from snapshot attention, autonomic, and pipeline metrics. Cite the metrics used.");
    setChatOpen(true);
  };
  return (
    <div className={styles.panel} id="assistant">
      <div className={styles.panelHead}>
        <div className={styles.panelTitle}><span className={styles.eyebrow}>Assistant Insight</span></div>
        <span className={styles.newTag}>Snapshot</span>
      </div>
      <div className={styles.insightBody}>
        <img src={sunburstBlue} alt="" />
        <div>
          <p>
            Sustained attention is <b>{percentText(data.attention.hdaSustainedPct)}</b>
            {change === null ? "." : `, ${change >= 0 ? "up" : "down"} ${numberText(Math.abs(change), 1)} pts across the latest cohort window.`}
          </p>
          <p>Baseline RSA is <b>{numberText(data.autonomic.rsaBaselineMs2, 3)} ms²</b>.</p>
        </div>
      </div>
      <div className={styles.insightFoot}>
        <button type="button" className={styles.outlineButton} onClick={openFollowUp}>
          <MessageCircle size={15} aria-hidden /> Ask a follow-up
        </button>
      </div>
      <p className={styles.insightTimestamp}>Scientific insights use the aggregate snapshot through {dateText(data.meta.asOf)}.</p>
    </div>
  );
}

export function NanoStudyDashboard() {
  const query = useNanoDashboardData();
  const dashboardMetrics = useDashboardMetrics();
  const pageRef = useRef<HTMLDivElement>(null);

  const sourceState = getDashboardSourceState(dashboardMetrics.data);
  const liveNano = selectNanoMetrics(dashboardMetrics.data);
  const resolvedData = useMemo<NanoDashboardData | null>(() => {
    if (!query.data) return null;
    if (liveNano?.enrollment === null || liveNano?.enrollment === undefined) return query.data;
    return {
      ...query.data,
      enrollment: {
        ...query.data.enrollment,
        enrolled: liveNano.enrollment,
        target: liveNano.target ?? query.data.enrollment.target,
        // Cohort splits in the packaged research snapshot do not share the
        // portfolio contract's authority, so hide them instead of mixing totals.
        active: null,
        retentionPct: null,
        byGroup: [],
        funnel: [],
        byGaStratum: [],
        bySite: [],
      },
      redcap: {
        ...query.data.redcap,
        apiTokenValid: null,
        lastSync: dashboardMetrics.data?.generatedAt ?? null,
        syncHealth: sourceState.isLive ? "ok" : sourceState.status,
      },
    };
  }, [dashboardMetrics.data?.generatedAt, liveNano?.enrollment, liveNano?.target, query.data, sourceState.isLive, sourceState.status]);

  useEffect(() => {
    document.title = "Overview · NANO Study · ESD Lab at UofSC";
  }, []);

  useEffect(() => {
    const root = pageRef.current;
    if (!root || !query.data) return;
    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || !("IntersectionObserver" in window)) {
      elements.forEach((element) => { element.dataset.revealed = "true"; });
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        (entry.target as HTMLElement).dataset.revealed = "true";
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.02, rootMargin: "0px 0px 2% 0px" });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [query.data]);

  const phases = useMemo(() => orderedPhases(resolvedData?.attention.phases ?? []), [resolvedData?.attention.phases]);
  const phaseDistributionComplete = phases.every((phase) => phase.pct !== null && Number.isFinite(phase.pct));
  const donutSegments = useMemo<DonutSegment[]>(() => phases.map((phase) => ({
    label: phase.phase,
    value: phaseDistributionComplete ? (phase.pct ?? 0) : 0,
    color: PULSE_PHASE_COLORS[normalizedPhaseName(phase.phase)] ?? "#ffffff",
  })), [phaseDistributionComplete, phases]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data || !resolvedData) return <ErrorState retry={() => void query.refetch()} />;
  if (query.data.meta.aggregateOnly !== true) return <DataSafetyState status={query.data.meta.aggregateOnly} />;

  const data = resolvedData;
  const target = data.enrollment.target ?? data.meta.target;
  const qaPassed = nanoQaPassedHeadline(data);
  const due = strictSum(data.schedule.map((item) => item.due));
  const upcoming = strictSum(data.schedule.map((item) => item.upcoming14d));
  const overdue = strictSum(data.schedule.map((item) => item.overdue));
  const modelReady = data.pipeline.find((stage) => /^model[-\s]?ready$/i.test(stage.stage.trim()))?.count ?? null;
  const redcap = sourceState.isLive
    ? { label: `Live · ${sourceState.projectsOk}/${sourceState.projectsTotal}`, state: "healthy" as const }
    : sourceState.status === "partial" || sourceState.status === "stale"
      ? { label: sourceState.label, state: "warning" as const }
      : nanoRedcapIndicator(data);
  const marqueeItems = [
    { icon: babyIcon, value: compactNumber(data.enrollment.enrolled), label: "infants enrolled" },
    { icon: babyIcon, value: compactNumber(data.enrollment.active), label: "active infants" },
    { icon: growthIcon, value: percentText(data.enrollment.retentionPct), label: "retention" },
    { icon: heartbeatIcon, value: data.autonomic.rsaBaselineMs2 === null ? "Awaiting data" : `${numberText(data.autonomic.rsaBaselineMs2, 3)} ms²`, label: "baseline RSA" },
    { icon: heartbeatIcon, value: data.autonomic.cptdMeanC === null ? "Awaiting data" : `${numberText(data.autonomic.cptdMeanC, 2)} °C`, label: "mean CPTd" },
    { icon: waveformIcon, value: compactNumber(qaPassed), label: "QA-passed sessions" },
    { icon: eyeIcon, value: percentText(data.attention.hdaSustainedPct), label: "sustained attention" },
    { icon: eyeIcon, value: data.attention.hdaQualityBpm === null ? "Awaiting data" : `${numberText(data.attention.hdaQualityBpm, 2)} bpm`, label: "HDA quality" },
    { icon: checklistIcon, value: compactNumber(due), label: "visits due" },
    { icon: checklistIcon, value: compactNumber(upcoming), label: "visits upcoming" },
    { icon: checklistIcon, value: compactNumber(overdue), label: "visits overdue" },
    { icon: growthIcon, value: "2 wks – 12 mo", label: "core follow-up window" },
    { icon: brainIcon, value: compactNumber(modelReady), label: "model-ready sessions" },
    { icon: brainIcon, value: compactNumber(data.library.indexedDocuments), label: "indexed readings & SOPs" },
    { icon: checklistIcon, value: compactNumber(data.checklists.openQcActions), label: "open QC actions" },
  ];

  const onPulsePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--my", `${event.clientY - bounds.top}px`);
  };

  return (
    <div className={styles.page} ref={pageRef}>
      <DashboardHeader data={data} />
      <main id="overview">
        <div className={styles.wrap}>
          <DataProvenance source={sourceState} detail="Enrollment and REDCap health only; scientific panels remain labeled snapshots." />
        </div>
        <section className={styles.hero} id="study-details">
          <img className={styles.floatMark} src={sunburstBlue} alt="" aria-hidden />
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <span className={styles.eyebrow} data-reveal><img src={sunburstBlue} alt="" /> NANO Study</span>
              <h1 data-reveal>
                The heartbeat<span className={styles.desktopBreak}><br /></span>{" "}
                of every baby&apos;s<span className={styles.desktopBreak}><br /></span>{" "}
                first year.
              </h1>
              <svg className={styles.ecg} viewBox="0 0 440 48" preserveAspectRatio="none" aria-hidden>
                <path className={styles.ecgLead} d="M0 24 L120 24" />
                <path className={styles.ecgTrace} d="M0 24 L86 24 L96 24 L104 10 L112 38 L120 24 L150 24 L176 24 L186 24 L196 6 L206 42 L216 24 L250 24 L300 24 L312 24 L322 12 L330 36 L340 24 L372 24 L440 24" />
                <circle className={styles.ecgBlip} cx="330" cy="24" r="4" />
              </svg>
              <p className={styles.heroLead} data-reveal>
                The NANO Study is a longitudinal investigation of early social and neurodevelopment in {numberText(target)} infants, from 2 weeks to 12 months.
              </p>
              <ArrowLink href="#metrics" className={styles.heroCta}>Learn more about the NANO Study</ArrowLink>
            </div>

            <div className={styles.pulseCard} data-reveal onPointerMove={onPulsePointerMove}>
              <div className={styles.cursorGlow} aria-hidden />
              <div className={styles.pulsePattern} style={{ backgroundImage: `url(${patternWhite})` }} aria-hidden />
              <span className={styles.pulseEyebrow}>Attention Pulse</span>
              <div className={styles.pulseMain}>
                <div className={styles.pulseFigure}>
                  <div className={styles.pulseBig}>
                    {data.attention.hdaSustainedPct === null
                      ? <span className={styles.awaiting}>Awaiting data</span>
                      : <><MetricCounter value={data.attention.hdaSustainedPct} decimals={1} /><span>%</span></>}
                  </div>
                  <div className={styles.pulseSub}>Labeled windows in sustained attention</div>
                  <p className={styles.pulseNote}>A quick operational read on whether the visible HDA stream is spending more time in sustained attention than orienting, inattention, or termination.</p>
                </div>
                <div className={styles.pulseRight}>
                  <DonutChart
                    segments={donutSegments}
                    size={150}
                    strokeWidth={23}
                    className={styles.donut}
                    ariaLabel={phaseDistributionComplete ? undefined : "Attention phase distribution awaiting data"}
                  />
                  <div className={styles.donutLegend}>
                    {phases.map((phase) => (
                      <div key={phase.phase}>
                        <i style={{ background: PULSE_PHASE_COLORS[normalizedPhaseName(phase.phase)] }} />
                        <span>{phase.phase}</span>
                        <b>{phase.pct === null ? "—" : `${numberText(phase.pct, 1)}%`}</b>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className={styles.pulseBar}>
                <div><span>Overall HDA</span><span>{percentText(data.attention.hdaSustainedPct, 0)}</span></div>
                <div
                  className={styles.pulseTrack}
                  aria-label={data.attention.hdaSustainedPct === null
                    ? "Overall HDA awaiting data"
                    : `Overall HDA ${numberText(data.attention.hdaSustainedPct, 0)} percent`}
                >
                  {data.attention.hdaSustainedPct !== null && (
                    <span style={{ width: `${Math.max(0, Math.min(data.attention.hdaSustainedPct, 100))}%` }} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.wrap} ${styles.kpiSection}`} id="headline-metrics" aria-label="NANO study headline metrics">
          <div className={styles.kpiRow}>
            <article className={styles.kpi} data-reveal>
              <div className={styles.kpiIcon}><img src={babyIcon} alt="" /></div>
              <div className={styles.kpiFigure}><MetricCounter value={data.enrollment.enrolled} /><span>/ {numberText(target)}</span></div>
              <p>Enrolled infants</p>
              <ArrowLink href="#cohort">View cohort</ArrowLink>
            </article>
            <article className={styles.kpi} data-reveal>
              <div className={styles.kpiIcon}><img src={heartbeatIcon} alt="" /></div>
              <div className={styles.kpiFigure}><MetricCounter value={data.autonomic.rsaBaselineMs2} decimals={3} /><span>ms²</span></div>
              <p>Baseline RSA</p>
              <ArrowLink href="#research">View HRV metrics</ArrowLink>
            </article>
            <article className={styles.kpi} data-reveal>
              <div className={styles.kpiIcon}><img src={waveformIcon} alt="" /></div>
              <div className={styles.kpiFigure}><MetricCounter value={qaPassed} /></div>
              <p>QA-passed sessions</p>
              <ArrowLink href="#pipeline-details">View QA dashboard</ArrowLink>
            </article>
            <article className={styles.kpi} data-reveal>
              <div className={styles.kpiIcon}><img src={checklistIcon} alt="" /></div>
              <div className={`${styles.kpiFigure} ${styles.kpiStatus}`}>{redcap.label}</div>
              <p>REDCap sync status</p>
              <ArrowLink href="#operations">View REDCap health</ArrowLink>
            </article>
          </div>
        </section>

        <section className={`${styles.wrap} ${styles.marqueeSection}`} aria-label="Aggregate metrics with mixed provenance">
          <div className={styles.marquee}>
            <div className={styles.marqueeTrack}>
              {[...marqueeItems, ...marqueeItems].map((item, index) => (
                <span className={styles.marqueeItem} key={`${item.label}-${index}`} aria-hidden={index >= marqueeItems.length}>
                  <img src={item.icon} alt="" />
                  <b>{item.value}</b> <span>{item.label}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className={`${styles.wrap} ${styles.dashboardBand}`}>
          <div className={styles.dashboardGrid}>
            <AttentionTimeline data={data} />
            <PipelineWatch data={data} />
            <AssistantInsight data={data} />
          </div>
        </section>

        <NanoDashboardDetails data={data} />
      </main>

      <footer className={styles.siteFooter}>
        <div className={styles.wrap}>
          <div className={styles.footerMain}>
            <div className={styles.footerBrand}>
              <img src={logo} alt="The Early Social Development Lab at UofSC" />
              <p>The Early Social Development Lab, directed by Dr. Jessica Bradshaw, studies infant attention, motor, and social skills at the Institute for Mind and Brain, University of South Carolina.</p>
            </div>
            <div className={styles.footerColumn}>
              <h2>Dashboard</h2>
              <a href="#overview">Overview</a><a href="#metrics">Metrics</a><a href="#study-details">Aims</a>
            </div>
            <div className={styles.footerColumn}>
              <h2>Data</h2>
              <a href="#pipeline-details">Pipeline</a><a href="#cohort">Cohort</a><a href="#library">Library</a>
            </div>
          </div>
          <p className={styles.aggregateNote}>
            Enrollment and REDCap health use the live aggregate portfolio. Attention, autonomic, pipeline, and model panels retain their aggregate research snapshot. No participant identifiers are exposed.
            {data.meta.source?.toLowerCase().includes("synthetic") && <span className={styles.sourceChip}>Mixed provenance</span>}
          </p>
          <div className={styles.footerBar}>
            <div className={styles.footerLogos}>
              <img src={logo} alt="ESD Lab" /><span /><img src={uofscLogo} alt="University of South Carolina" />
            </div>
            <div className={styles.footerMeta}>
              <span><RefreshCw size={15} aria-hidden /> Data refreshed {dateText(data.redcap.lastSync ?? data.meta.asOf, true)}</span>
              <button type="button" onClick={() => window.print()}><Download size={15} aria-hidden /> Export dashboard</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
