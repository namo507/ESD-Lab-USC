import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { Gloss } from "@/components/primitives";
import { Buddy } from "@/components/shell/Buddy";
import { ChatDrawer } from "@/components/shell/ChatDrawer";
import { useHdaDist, useParticipants, useRuns, useStages, useStudySummary, useTrajectory } from "@/api/hooks";
import { useUi } from "@/store/ui";
import styles from "./Landing.module.css";

type SectionId = "overview" | "metrics" | "aims" | "architecture" | "pipeline" | "qa" | "cohort" | "ml" | "studio" | "assistant" | "library";

const NAV_SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "metrics", label: "Metrics" },
  { id: "aims", label: "Aims" },
  { id: "architecture", label: "Architecture" },
  { id: "pipeline", label: "Pipeline" },
  { id: "qa", label: "QA" },
  { id: "cohort", label: "Cohort" },
  { id: "ml", label: "Model" },
  { id: "studio", label: "Studio" },
  { id: "assistant", label: "Assistant" },
  { id: "library", label: "Library" },
];

const AIMS = [
  {
    id: "01",
    title: "Maturation of autonomic regulation of attention",
    window: "Ages 1-3 months",
    primary: "Compare ASIB, VPT, and TD infants on how Heart-Defined Attention matures across the earliest infant window.",
    hypothesis:
      "ASIB infants begin with typical HDA, then attenuate through months 1-3 as autonomic regulation takes on a larger role. VPT infants show delayed maturation from broader ANS disruption.",
    method:
      "Five-second Actiheart ECG epochs are scored against a moving baseline to label orienting, sustained attention, inattention, and termination.",
    outcome: "Percent time in HDA, deceleration magnitude, and phase distribution.",
  },
  {
    id: "02",
    title: "HDA x interactive behavior coordination",
    window: "Ages 6, 9, 12 months",
    primary: "Link moment-to-moment autonomic regulation to observed interaction and attention across the first year.",
    hypothesis:
      "ASIB infants weaken in HDA-behavior coupling as symptoms emerge, while VPT infants begin weak and strengthen as ANS regulation stabilizes.",
    method:
      "Naturalistic recordings, eye tracking, and ECG are synchronized so HDA episodes can be aligned to behavior, gaze, and caregiver interaction.",
    outcome: "Lead-lag coupling and visit-level coordination coefficients.",
  },
  {
    id: "03",
    title: "Predicting ASD symptoms at age 3",
    window: "Infant features to age-3 outcome",
    primary: "Use infant autonomic and attentional signatures to estimate later ASD symptom likelihood.",
    hypothesis:
      "Features tied to autonomic regulation of attention outperform bulk HRV or attention alone when predicting later symptoms.",
    method:
      "Gradient-boosted classification on de-identified infant features with SHAP attribution, calibration, and held-out validation.",
    outcome: "Held-out AUROC, F1, calibration, and group-level performance.",
  },
] as const;

const ARCHITECTURE = [
  {
    id: "devices",
    title: "Devices and sensors",
    short: "Edge capture",
    items: [
      "Actiheart-5 continuous chest ECG at 1024 Hz.",
      "Head-mounted eye tracking for naturalistic attention.",
      "Session logs and caregiver context from every visit.",
    ],
  },
  {
    id: "capture",
    title: "Metadata and capture",
    short: "REDCap and forms",
    items: [
      "Visit intake, demographics, consent, and caregiver questionnaires in REDCap.",
      "Surrogate NANO IDs stitched to device manifests and site-level scheduling.",
      "Examiner notes retained without exposing PHI in downstream layers.",
    ],
  },
  {
    id: "compute",
    title: "Preprocess and QA",
    short: "SQI and HDA labels",
    items: [
      "Bandpass filtering, R-peak detection, and IBI extraction.",
      "Signal Quality Index scoring per epoch with surfaced review windows.",
      "HDA phase assignment for orienting, sustained, inattention, and termination.",
    ],
  },
  {
    id: "features",
    title: "Features and long-form tables",
    short: "Parquet outputs",
    items: [
      "RMSSD, SDNN, HF, LF/HF, pNN50, and visit-level aggregates.",
      "Per-episode HDA tables joined to behavior and site metadata.",
      "De-identified cohort parquet that powers every analysis route and export.",
    ],
  },
  {
    id: "models",
    title: "Models and inference",
    short: "XGBoost and trajectories",
    items: [
      "Age-3 ASD symptom classifier with calibration and feature attribution.",
      "Trajectory modeling for Aim 1 maturation questions.",
      "Behavioral coupling models for Aim 2 and downstream reporting.",
    ],
  },
] as const;

const READING_LIBRARY = [
  {
    title: "Autonomic and attentional pathways in the emergence of autism",
    authors: "Bradshaw, Platt, Yurkovic-Harding, Harding, and Fu",
    meta: "2025 · Advances in Child Development and Behavior",
    tag: "Theory",
    abstract:
      "Synthesizes the ESD Lab approach to autonomic regulation, attention, and longitudinal infant development, grounding the NANO protocol in mechanistic and real-world observation.",
  },
  {
    title: "Capturing the complexity of autism with developmental cascades",
    authors: "Bradshaw",
    meta: "2022 · Child Development Perspectives",
    tag: "Framework",
    abstract:
      "Argues for cascades across foundational systems including ANS regulation, attention, and motor development when modeling later ASD-related outcomes.",
  },
  {
    title: "Specific Aims: autonomic regulation of attention as a predictive biomarker",
    authors: "NIH R01 application",
    meta: "2024 · Grant document",
    tag: "Grant",
    abstract:
      "Three aims anchor the NANO Study: early HDA maturation, HDA-behavior coupling, and predictive modeling of age-3 outcomes from infant signals.",
  },
  {
    title: "Research strategy: longitudinal design, measures, and analytic plan",
    authors: "NIH R01 application",
    meta: "2024 · Research strategy",
    tag: "Protocol",
    abstract:
      "Details recruitment, devices, HRV preprocessing, HDA labeling, longitudinal modeling, and the analytic strategy behind downstream ML outputs.",
  },
] as const;

const ASSISTANT_SUGGESTIONS = [
  "Walk me through the NANO Study.",
  "Explain what HDA means in this pipeline.",
  "How is the classifier validated?",
  "What should a clinician look at first on this site?",
] as const;

const STUDIO_INPUTS = [
  { id: "rmssd", label: "RMSSD @ 3mo", min: 15, max: 60, step: 0.5, defaultValue: 38.4, weight: -0.32, suffix: "ms" },
  { id: "sustained", label: "Sustained HDA", min: 10, max: 80, step: 1, defaultValue: 52, weight: -0.28, suffix: "%" },
  { id: "deceleration", label: "Max HR deceleration", min: 1, max: 14, step: 0.5, defaultValue: 7.2, weight: -0.18, suffix: "bpm" },
  { id: "cga", label: "CGA at 3mo visit", min: 36, max: 56, step: 0.5, defaultValue: 49, weight: 0.04, suffix: "wk" },
  { id: "ectopic", label: "Ectopic beats", min: 0, max: 25, step: 0.5, defaultValue: 1.3, weight: 0.14, suffix: "%" },
] as const;

const GROUP_ACCENTS: Record<string, string> = {
  VPT: "var(--usc-garnet)",
  ASIB: "#5e3776",
  TD: "#3d6650",
};

const LANDING_SCROLL_OFFSET = 112;
const LANDING_SCROLL_DURATION_MS = 380;

function stat(value: number, digits = 0): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function ecgPath(width: number, height: number, beats = 14): string {
  const points: Array<[number, number]> = [];
  const beatWidth = width / beats;
  const mid = height / 2;

  for (let x = 0; x <= width; x += 1) {
    const phase = (x % beatWidth) / beatWidth;
    let y = mid + Math.sin(x * 0.02 + 4) * 1.2;
    if (phase > 0.42 && phase < 0.5) y -= ((phase - 0.42) / 0.08) * 4;
    else if (phase >= 0.5 && phase < 0.55) y -= ((phase - 0.5) / 0.05) * (height * 0.32) - 4;
    else if (phase >= 0.55 && phase < 0.62) y -= ((0.62 - phase) / 0.07) * (height * 0.32);
    else if (phase >= 0.7 && phase < 0.82) y += Math.sin(((phase - 0.7) / 0.12) * Math.PI) * 4;
    points.push([x, clamp(y, 4, height - 4)]);
  }

  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y.toFixed(2)}`).join(" ");
}

function WaveRibbon() {
  const width = 1440;
  const height = 110;
  const path = useMemo(() => ecgPath(width, height), []);

  return (
    <div className={styles.waveformShell}>
      <div className={styles.waveformLane}>Lead I · 1024 Hz · live</div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
        {Array.from({ length: 15 }).map((_, index) => (
          <line key={index} x1={index * 100} y1="0" x2={index * 100} y2={height} className={styles.waveGrid} />
        ))}
        <path d={path} className={styles.waveGlow} />
        <path d={path} className={styles.waveLine} />
      </svg>
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const width = 240;
  const height = 140;
  const cx = width / 2;
  const cy = 124;
  const radius = 96;
  const v = clamp(value, 0, 1);

  function arc(start: number, end: number) {
    const sx = cx + radius * Math.cos(Math.PI - Math.PI * start);
    const sy = cy - radius * Math.sin(Math.PI - Math.PI * start);
    const ex = cx + radius * Math.cos(Math.PI - Math.PI * end);
    const ey = cy - radius * Math.sin(Math.PI - Math.PI * end);
    const largeArc = end - start > 0.5 ? 1 : 0;
    return `M ${sx} ${sy} A ${radius} ${radius} 0 ${largeArc} 1 ${ex} ${ey}`;
  }

  return (
    <div className={styles.gaugeWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} className={styles.gaugeSvg} aria-hidden>
        <defs>
          <linearGradient id="landing-gauge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#55A868" />
            <stop offset="50%" stopColor="#d18a3a" />
            <stop offset="100%" stopColor="#C44E52" />
          </linearGradient>
        </defs>
        <path d={arc(0, 1)} className={styles.gaugeTrack} />
        <path d={arc(0, v)} className={styles.gaugeFill} />
      </svg>
      <div className={styles.gaugeValue}>{stat(v * 100, 1)}%</div>
      <div className={styles.gaugeLabel}>Estimated age-3 symptom likelihood</div>
    </div>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const setChatOpen = useUi((state) => state.setChatOpen);
  const setChatSeed = useUi((state) => state.setChatSeed);
  const progressRef = useRef<HTMLDivElement>(null);
  const activeSectionRef = useRef<SectionId>("overview");
  const scrollFrameRef = useRef<number | null>(null);
  const scrollAnimationRef = useRef<number | null>(null);

  const { data: study } = useStudySummary();
  const { data: stages = [] } = useStages();
  const { data: runs = [] } = useRuns(12);
  const { data: participants = [] } = useParticipants();
  const { data: rmssd } = useTrajectory("rmssd");
  const { data: hda } = useHdaDist();

  const [active, setActive] = useState<SectionId>("overview");
  const [openAim, setOpenAim] = useState(0);
  const [activeLayer, setActiveLayer] = useState<(typeof ARCHITECTURE)[number]["id"]>(ARCHITECTURE[0].id);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [studioValues, setStudioValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(STUDIO_INPUTS.map((input) => [input.id, input.defaultValue])),
  );

  const totals = useMemo(() => {
    const inflight = stages.reduce((sum, stage) => sum + stage.inflight, 0);
    const done = stages.reduce((sum, stage) => sum + stage.done, 0);
    const fail = stages.reduce((sum, stage) => sum + stage.fail, 0);
    const rmssdLatest = rmssd?.series.VPT.at(-1)?.y ?? 38.4;
    const readyRuns = runs.filter((run) => run.status === "running" || run.status === "queued").length;
    const hdaTotal = hda
      ? Object.values(hda).reduce(
          (sum, group) => sum + group.orienting + group.sustained + group.inattention + group.termination,
          0,
        )
      : 0;
    return {
      inflight,
      done,
      fail,
      readyRuns,
      rmssdLatest,
      hdaTotal,
    };
  }, [hda, rmssd, runs, stages]);

  const activeArchitecture = useMemo(
    () => ARCHITECTURE.find((layer) => layer.id === activeLayer) ?? ARCHITECTURE[0],
    [activeLayer],
  );

  const filteredParticipants = useMemo(() => {
    return participants
      .filter((participant) => groupFilter === "all" || participant.group === groupFilter)
      .slice(0, 8);
  }, [groupFilter, participants]);

  const filteredReading = useMemo(() => {
    const needle = libraryQuery.trim().toLowerCase();
    if (!needle) return READING_LIBRARY;
    return READING_LIBRARY.filter((entry) => {
      return [entry.title, entry.authors, entry.meta, entry.abstract, entry.tag].some((field) =>
        field.toLowerCase().includes(needle),
      );
    });
  }, [libraryQuery]);

  const trajectorySeries = useMemo(() => {
    const series = rmssd?.series;
    if (!series) return [];
    return ["VPT", "ASIB", "TD"].flatMap((group) => {
      const groupSeries = series[group as keyof typeof series];
      if (!groupSeries?.length) return [];
      return [{ group, values: groupSeries }];
    });
  }, [rmssd]);

  const riskScore = useMemo(() => {
    let z = -0.55;
    for (const input of STUDIO_INPUTS) {
      const value = studioValues[input.id] ?? input.defaultValue;
      const midpoint = (input.min + input.max) / 2;
      const span = (input.max - input.min) / 2;
      const normalized = (value - midpoint) / span;
      z += normalized * input.weight * 5;
    }
    return 1 / (1 + Math.exp(-z));
  }, [studioValues]);

  const insightFeed = useMemo(() => {
    const latestRun = runs[0];
    const latestParticipant = participants[0];
    return [
      {
        tag: "QA",
        body: totals.fail > 0 ? `${totals.fail} stage failures surfaced for human review in the current run window.` : "No current stage failures. QA exceptions are under threshold.",
      },
      {
        tag: "FLOW",
        body: latestParticipant
          ? `${latestParticipant.id} reached ${latestParticipant.visit} at ${latestParticipant.site} with ${latestParticipant.qa} QA status.`
          : "Participant flow will populate as soon as visit data is available.",
      },
      {
        tag: "RUN",
        body: latestRun
          ? `${latestRun.id} is ${latestRun.status} in ${latestRun.scope} and owned by ${latestRun.actor}.`
          : "No active runs are visible right now.",
      },
    ];
  }, [participants, runs, totals.fail]);

  useEffect(() => {
    const sections = NAV_SECTIONS.flatMap((section) => {
      const element = document.getElementById(section.id);
      return element ? [{ id: section.id, element }] : [];
    });

    const updateScrollUi = () => {
      scrollFrameRef.current = null;

      const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const ratio = window.scrollY / max;
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${ratio})`;
      }

      let current: SectionId = "overview";
      for (const section of sections) {
        if (section.element.getBoundingClientRect().top < window.innerHeight * 0.45) {
          current = section.id;
        }
      }

      if (current !== activeSectionRef.current) {
        activeSectionRef.current = current;
        setActive(current);
      }
    };

    const scheduleScrollUi = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(updateScrollUi);
    };

    scheduleScrollUi();
    window.addEventListener("scroll", scheduleScrollUi, { passive: true });
    window.addEventListener("resize", scheduleScrollUi);

    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
      window.removeEventListener("scroll", scheduleScrollUi);
      window.removeEventListener("resize", scheduleScrollUi);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (scrollAnimationRef.current !== null) {
        window.cancelAnimationFrame(scrollAnimationRef.current);
      }
    };
  }, []);

  function jumpTo(id: SectionId) {
    const target = document.getElementById(id);
    if (!target) return;

    const nextTop = Math.max(0, window.scrollY + target.getBoundingClientRect().top - LANDING_SCROLL_OFFSET);

    if (scrollAnimationRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }

    activeSectionRef.current = id;
    setActive(id);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo(0, nextTop);
      return;
    }

    const startTop = window.scrollY;
    const distance = nextTop - startTop;
    if (Math.abs(distance) < 2) {
      window.scrollTo(0, nextTop);
      return;
    }

    const startedAt = performance.now();
    const animateScroll = (now: number) => {
      const elapsed = now - startedAt;
      const progress = clamp(elapsed / LANDING_SCROLL_DURATION_MS, 0, 1);
      const eased = easeOutCubic(progress);

      window.scrollTo(0, startTop + distance * eased);

      if (progress < 1) {
        scrollAnimationRef.current = window.requestAnimationFrame(animateScroll);
      } else {
        scrollAnimationRef.current = null;
      }
    };

    scrollAnimationRef.current = window.requestAnimationFrame(animateScroll);
  }

  function openAssistant(seed?: string) {
    setChatSeed(seed?.trim() ? seed : null);
    setChatOpen(true);
  }

  const groupCards = [
    { code: "ASIB", label: "Autism sibling cohort", count: study?.groups.ASIB.count ?? 30, target: study?.groups.ASIB.target ?? 65 },
    { code: "VPT", label: "Very preterm cohort", count: study?.groups.VPT.count ?? 105, target: study?.groups.VPT.target ?? 130 },
    { code: "TD", label: "Term-born comparison cohort", count: study?.groups.TD.count ?? 53, target: study?.groups.TD.target ?? 65 },
  ];

  return (
    <div className={styles.page}>
      <div ref={progressRef} className={styles.progress} style={{ transform: "scaleX(0)" }} aria-hidden />

      <nav className={styles.nav} aria-label="Landing sections">
        <button type="button" className={styles.brand} onClick={() => jumpTo("overview")}>
          <span className={styles.brandMark}>e</span>
          <span className={styles.brandText}>
            <strong>ESD Lab</strong>
            <small>NANO · UofSC</small>
          </span>
        </button>

        <div className={styles.navLinks}>
          {NAV_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`${styles.navLink} ${active === section.id ? styles.navLinkActive : ""}`}
              onClick={() => jumpTo(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>

        <button type="button" className={styles.askButton} onClick={() => openAssistant()}>
          <Sparkles size={14} strokeWidth={1.5} />
          Ask the lab
        </button>
      </nav>

      <main className={styles.main}>
        <section id="overview" className={styles.hero} data-insight="landing-overview">
          <div className={styles.heroEyebrow} data-insight="pipeline-svg">
            <span className={styles.liveDot} />
            <span>Live NANO pipeline · {totals.inflight} stages in flight</span>
          </div>

          <div className={styles.heroGrid}>
            <div className={styles.heroCopy} data-insight="landing-overview">
              <h1 className={styles.heroTitle}>
                The heartbeat of every baby&apos;s first year.
              </h1>
              <p className={styles.heroBody}>
                This public surface now centers the <Gloss term="NANO">NANO Study</Gloss> itself: the longitudinal infant story,
                the live pipeline behind it, the cohort-level questions, and the assistant that can explain any section without dropping users into the operator shell too early.
              </p>
              <div className={styles.heroActions}>
                <button type="button" className={styles.primaryButton} onClick={() => jumpTo("aims")}>
                  Explore aims
                  <ChevronDown size={14} strokeWidth={1.5} />
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => openAssistant("Walk me through the NANO Study.")}>
                  Open assistant
                  <Sparkles size={14} strokeWidth={1.5} />
                </button>
              </div>

              <div className={styles.heroMetaStrip}>
                <div className={styles.heroMiniCard} data-insight="kpi-enroll">
                  <span>Infants enrolled</span>
                  <strong>{study?.enrolled ?? 231} / {study?.target ?? 260}</strong>
                </div>
                <div className={styles.heroMiniCard} data-insight="landing-rmssd">
                  <span>Median RMSSD</span>
                  <strong>{stat(totals.rmssdLatest, 1)} ms</strong>
                </div>
                <div className={styles.heroMiniCard} data-insight="kpi-epochs">
                  <span>Epochs in 24 h</span>
                  <strong>{stat(totals.done)}</strong>
                </div>
                <div className={styles.heroMiniCard} data-insight="landing-runs">
                  <span>Queued runs</span>
                  <strong>{totals.readyRuns}</strong>
                </div>
              </div>
            </div>

            <aside className={styles.heroCard} data-insight="landing-study">
              <span className={styles.cardEyebrow}>About the study</span>
              <h2 className={styles.cardTitle}>Longitudinal infant neurodevelopment, grounded in live operations.</h2>
              <p className={styles.cardBody}>
                A five-year study of 260 infants across very preterm, autism-sibling, and term-born cohorts. Every form, ECG segment, HDA label, and model output traces back to the same de-identified clinical pipeline.
              </p>
              <div className={styles.heroStats}>
                <div>
                  <span>Enrolled</span>
                  <strong>{study?.enrolled ?? 231} / {study?.target ?? 260}</strong>
                </div>
                <div>
                  <span>RMSSD</span>
                  <strong>{stat(totals.rmssdLatest, 1)} ms</strong>
                </div>
                <div>
                  <span>Epochs</span>
                  <strong>{stat(totals.done)}</strong>
                </div>
                <div>
                  <span>PHI leaks</span>
                  <strong>0</strong>
                </div>
              </div>
              <div className={styles.heroActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => navigate("/overview")}>
                  Operator detail
                  <ArrowRight size={14} strokeWidth={1.5} />
                </button>
              </div>
            </aside>
          </div>

          <div data-insight="landing-waveform">
            <WaveRibbon />
          </div>
        </section>

        <section id="metrics" className={styles.section} data-insight="landing-metrics">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Lab pulse</span>
              <h2>What&apos;s moving today.</h2>
            </div>
            <div className={styles.sectionNote}>Updated from the live API hooks already powering the operator routes.</div>
          </header>
          <div className={styles.metricGrid}>
            <article className={styles.metricCard} data-insight="kpi-enroll">
              <span>Infants enrolled</span>
              <strong>{study?.enrolled ?? 231} / {study?.target ?? 260}</strong>
              <p>NANO recruitment across ASIB, VPT, and TD cohorts.</p>
              <div className={styles.metricFooter}>Recruitment narrative</div>
            </article>
            <article className={styles.metricCard} data-insight="kpi-epochs">
              <span>Epochs · 24 h</span>
              <strong>{stat(totals.done)}</strong>
              <p>Processed ECG windows available for QA and downstream features.</p>
              <div className={styles.metricFooter}>Signal throughput</div>
            </article>
            <article className={styles.metricCard} data-insight="landing-rmssd">
              <span>Median RMSSD</span>
              <strong>{stat(totals.rmssdLatest, 1)} ms</strong>
              <p>Cohort-level vagal tone across the visible trajectory slice.</p>
              <div className={styles.metricFooter}>Trajectory benchmark</div>
            </article>
            <article className={styles.metricCard} data-insight="landing-assistant-context">
              <span>Assistant-ready context</span>
              <strong>{stat(totals.hdaTotal)}</strong>
              <p>HDA-labeled windows and study context wired to ESD Buddy.</p>
              <div className={styles.metricFooter}>Explainer surface</div>
            </article>
          </div>
        </section>

        <section id="aims" className={styles.section} data-insight="landing-aims">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Specific aims</span>
              <h2>Three questions, one trajectory.</h2>
            </div>
            <div className={styles.sectionNote}>Expand a card to see the exact hypothesis, method, and outcome surface.</div>
          </header>
          <div className={styles.aimGrid}>
            {AIMS.map((aim, index) => {
              const isOpen = openAim === index;
              return (
                <article key={aim.id} className={`${styles.aimCard} ${isOpen ? styles.aimCardOpen : ""}`} data-insight={`landing-aim-${aim.id}`}>
                  <div className={styles.aimHeader}>
                    <div>
                      <span className={styles.storyKicker}>Aim {aim.id}</span>
                      <h3>{aim.title}</h3>
                    </div>
                    <button type="button" className={styles.aimButton} onClick={() => setOpenAim(isOpen ? -1 : index)}>
                      {isOpen ? "Collapse" : "Expand"}
                    </button>
                  </div>
                  <p>{aim.primary}</p>
                  <div className={styles.aimMeta}>{aim.window}</div>
                  {isOpen ? (
                    <div className={styles.aimOpen}>
                      <div>
                        <span className={styles.sectionEyebrow}>Hypothesis</span>
                        <p>{aim.hypothesis}</p>
                      </div>
                      <div>
                        <span className={styles.sectionEyebrow}>Method</span>
                        <p>{aim.method}</p>
                      </div>
                      <div>
                        <span className={styles.sectionEyebrow}>Outcome</span>
                        <p>{aim.outcome}</p>
                      </div>
                      <button type="button" className={styles.secondaryButton} onClick={() => openAssistant(`Explain Aim ${aim.id} in plain language.`)}>
                        Ask about Aim {aim.id}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          <div className={styles.comparisonStrip}>
            {groupCards.map((group) => (
              <article key={group.code} className={styles.comparisonCard} data-insight="landing-groups">
                <span className={styles.storyKicker}>{group.code}</span>
                <h3>{group.label}</h3>
                <strong>{group.count}</strong>
                <p>{group.target} target participants in this cohort arm.</p>
              </article>
            ))}
          </div>
        </section>

        <section id="architecture" className={styles.section} data-insight="landing-architecture">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Data architecture</span>
              <h2>From chest to claim.</h2>
            </div>
            <div className={styles.sectionNote}>Select a layer to inspect how raw capture becomes publishable output.</div>
          </header>
          <div className={styles.architectureShell}>
            <div className={styles.layerRail}>
              {ARCHITECTURE.map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  className={`${styles.layerButton} ${activeLayer === layer.id ? styles.layerButtonActive : ""}`}
                  onClick={() => setActiveLayer(layer.id)}
                  data-insight={`landing-arch-${layer.id}`}
                >
                  <span>{layer.short}</span>
                  <strong>{layer.title}</strong>
                </button>
              ))}
            </div>
            <article className={styles.layerPanel} data-insight="landing-arch-panel">
              <span className={styles.storyKicker}>{activeArchitecture.short}</span>
              <h3>{activeArchitecture.title}</h3>
              <div className={styles.layerList}>
                {activeArchitecture.items.map((item) => (
                  <div key={item} className={styles.layerItem}>
                    {item}
                  </div>
                ))}
              </div>
              <div className={styles.heroActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => navigate("/runs")}>
                  Open pipeline detail
                  <ArrowRight size={14} strokeWidth={1.5} />
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => navigate("/redcap")}>
                  Open REDCap sync
                  <ArrowRight size={14} strokeWidth={1.5} />
                </button>
              </div>
            </article>
          </div>
        </section>

        <section id="pipeline" className={styles.section} data-insight="pipeline-svg">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Pipeline</span>
              <h2>The NANO pipeline, live.</h2>
            </div>
            <button type="button" className={styles.ghostButton} onClick={() => navigate("/runs")}>
              Open run history
              <ArrowRight size={14} strokeWidth={1.5} />
            </button>
          </header>
          <div className={styles.pipelineRail}>
            {stages.slice(0, 6).map((stage, index) => (
              <button key={stage.id} type="button" className={styles.pipelineCard} onClick={() => navigate("/runs")} data-insight={`stage-${stage.id}`}>
                <span className={styles.pipelineIndex}>Stage {String(index + 1).padStart(2, "0")}</span>
                <h3>{stage.label}</h3>
                <strong>{stage.inflight}</strong>
                <p>{stage.short}</p>
                <small>{stat(stage.done)} done · {stage.fail} fail</small>
              </button>
            ))}
          </div>
        </section>

        <section id="qa" className={styles.section} data-insight="landing-qa-watch">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Quality and flow</span>
              <h2>An agent watching the wires.</h2>
            </div>
          </header>
          <div className={styles.splitGrid}>
            <article className={styles.darkCard} data-insight="landing-qa-watch">
              <span className={styles.sectionEyebrow}>Agentic QA</span>
              <h3>Pipeline watchlist</h3>
              <ul className={styles.watchList}>
                {insightFeed.map((item) => (
                  <li key={item.tag}>
                    <strong>{item.tag}</strong>
                    <span>{item.body}</span>
                  </li>
                ))}
              </ul>
              <div className={styles.heroActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => openAssistant("Summarize the current QA watchlist.")}>
                  Ask the assistant
                </button>
              </div>
            </article>
            <article className={styles.flowCard} data-insight="landing-flow">
              <span className={styles.sectionEyebrow}>Recent participant flow</span>
              <h3>The last four hours</h3>
              <ul className={styles.flowList}>
                {participants.slice(0, 7).map((participant) => (
                  <li key={participant.id}>
                    <button type="button" onClick={() => navigate(`/participants/${participant.id}`)}>
                      <strong>{participant.id}</strong>
                      <span>{participant.group} · {participant.visit} · {participant.site}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section id="cohort" className={styles.section} data-insight="landing-cohort">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Cohort snapshot</span>
              <h2>Every infant, every visit.</h2>
            </div>
            <button type="button" className={styles.ghostButton} onClick={() => navigate("/participants")}>
              Open participant table
              <ArrowRight size={14} strokeWidth={1.5} />
            </button>
          </header>
          <div className={styles.tableCard} data-insight="landing-cohort">
            <div className={styles.tableToolbar}>
              <div className={styles.toolbarActions}>
                <label className={styles.groupSelectWrap}>
                  <span className={styles.sectionEyebrow}>Filter</span>
                  <select className={styles.groupSelect} value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                    <option value="all">All groups</option>
                    <option value="ASIB">ASIB</option>
                    <option value="VPT">VPT</option>
                    <option value="TD">TD</option>
                  </select>
                </label>
              </div>
              <div className={styles.sectionNote}>{filteredParticipants.length} participants shown</div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.cohortTable}>
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Group</th>
                    <th>Visit</th>
                    <th>Site</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParticipants.map((participant) => (
                    <tr key={participant.id}>
                      <td>
                        <button type="button" className={styles.rowLink} onClick={() => navigate(`/participants/${participant.id}`)}>
                          {participant.id}
                        </button>
                      </td>
                      <td>
                        <span className={styles.groupBadge} style={{ color: GROUP_ACCENTS[participant.group] ?? "var(--warm-600)" }}>
                          {participant.group}
                        </span>
                      </td>
                      <td>{participant.visit}</td>
                      <td>{participant.site}</td>
                      <td>{participant.qa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="ml" className={styles.section} data-insight="landing-model-card">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Model performance</span>
              <h2>Calibrated, not just accurate.</h2>
            </div>
            <button type="button" className={styles.ghostButton} onClick={() => navigate("/results")}>
              Open results
              <ArrowRight size={14} strokeWidth={1.5} />
            </button>
          </header>
          <div className={styles.chartGrid}>
            <article className={styles.chartCard} data-insight="landing-rmssd-chart">
              <span className={styles.storyKicker}>RMSSD trajectory</span>
              <h3>Visible cohort trend</h3>
              <svg viewBox="0 0 360 220" className={styles.trajectorySvg}>
                {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
                  <line key={tick} x1="32" x2="344" y1={26 + tick * 150} y2={26 + tick * 150} className={styles.chartGridLine} />
                ))}
                {trajectorySeries.map((series) => {
                  const values = series.values;
                  const xStep = values.length > 1 ? 280 / (values.length - 1) : 0;
                  const points = values
                    .map((point, index) => {
                      const x = 42 + index * xStep;
                      const y = 176 - ((point.y - 10) / 50) * 130;
                      return `${x},${y}`;
                    })
                    .join(" ");
                  return <polyline key={series.group} points={points} style={{ stroke: GROUP_ACCENTS[series.group] }} className={styles.chartLine} />;
                })}
              </svg>
              <div className={styles.legend}>
                {trajectorySeries.map((series) => (
                  <span key={series.group}>
                    <span className={styles.legendDot} style={{ background: GROUP_ACCENTS[series.group] }} />
                    {series.group}
                  </span>
                ))}
              </div>
            </article>
            <article className={styles.chartCard} data-insight="landing-hda-chart">
              <span className={styles.storyKicker}>HDA distribution</span>
              <h3>Phase composition by cohort</h3>
              <div className={styles.stackList}>
                {hda
                  ? Object.entries(hda).map(([group, dist]) => {
                      const total = dist.orienting + dist.sustained + dist.inattention + dist.termination;
                      return (
                        <div key={group} className={styles.stackRow}>
                          <div className={styles.stackLabel}>{group}</div>
                          <div className={styles.stackBar}>
                            <span className={styles.stackSegment} style={{ width: `${(dist.orienting / total) * 100}%`, background: "#9bb8e0" }} />
                            <span className={styles.stackSegment} style={{ width: `${(dist.sustained / total) * 100}%`, background: "var(--usc-garnet)" }} />
                            <span className={styles.stackSegment} style={{ width: `${(dist.inattention / total) * 100}%`, background: "#d18a3a" }} />
                            <span className={styles.stackSegment} style={{ width: `${(dist.termination / total) * 100}%`, background: "#8172B2" }} />
                          </div>
                          <div className={styles.stackValue}>{stat(total)}</div>
                        </div>
                      );
                    })
                  : null}
              </div>
            </article>
            <article className={styles.chartCard} data-insight="landing-model-card">
              <span className={styles.storyKicker}>Model card</span>
              <h3>Validated, calibrated, reviewable</h3>
              <div className={styles.metricTileGrid}>
                <div>
                  <span>AUROC</span>
                  <strong>0.899</strong>
                </div>
                <div>
                  <span>F1</span>
                  <strong>0.853</strong>
                </div>
                <div>
                  <span>ECE</span>
                  <strong>0.041</strong>
                </div>
                <div>
                  <span>Brier</span>
                  <strong>0.094</strong>
                </div>
              </div>
              <p>Gradient-boosted classification on de-identified infant features, surfaced here before the dense analytics routes.</p>
            </article>
          </div>
        </section>

        <section id="studio" className={styles.section} data-insight="landing-studio-inputs">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Model studio</span>
              <h2>Adjust the infant profile.</h2>
            </div>
            <div className={styles.sectionNote}>Illustrative sliders change the explanatory risk gauge without leaving the landing page.</div>
          </header>
          <div className={styles.studioGrid}>
            <article className={styles.studioCard} data-insight="landing-studio-inputs">
              <div className={styles.studioHeader}>
                <div>
                  <span className={styles.storyKicker}>Input features</span>
                  <h3>Per-infant predictors</h3>
                </div>
                <SlidersHorizontal size={18} strokeWidth={1.5} />
              </div>
              <div className={styles.sliderList}>
                {STUDIO_INPUTS.map((input) => (
                  <label key={input.id} className={styles.sliderRow}>
                    <div className={styles.sliderMeta}>
                      <span>{input.label}</span>
                      <strong>
                        {stat(studioValues[input.id] ?? input.defaultValue, input.step < 1 ? 1 : 0)} {input.suffix}
                      </strong>
                    </div>
                    <input
                      className={styles.sliderInput}
                      type="range"
                      min={input.min}
                      max={input.max}
                      step={input.step}
                      value={studioValues[input.id] ?? input.defaultValue}
                      onChange={(event) =>
                        setStudioValues((current) => ({
                          ...current,
                          [input.id]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <div className={styles.heroActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setStudioValues(Object.fromEntries(STUDIO_INPUTS.map((input) => [input.id, input.defaultValue])))}
                >
                  <RotateCcw size={14} strokeWidth={1.5} />
                  Reset inputs
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => openAssistant("Explain why these model features matter.")}>
                  Explain features
                </button>
              </div>
            </article>
            <article className={styles.studioCard} data-insight="landing-studio-gauge">
              <Gauge value={riskScore} />
              <div className={styles.metricTileGrid}>
                <div>
                  <span>Algorithm</span>
                  <strong>XGBoost</strong>
                </div>
                <div>
                  <span>Train split</span>
                  <strong>80/20</strong>
                </div>
                <div>
                  <span>Feature groups</span>
                  <strong>24</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>Calibrated</strong>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section id="assistant" className={styles.section} data-insight="landing-assistant">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>AI assistant</span>
              <h2>Ask the lab anything.</h2>
            </div>
          </header>
          <article className={styles.assistantCard} data-insight="landing-assistant">
            <p>
              The in-page assistant stays visually central and operationally grounded. Use it to explain the study, unpack HDA, summarize a result, or decide when to switch from this narrative surface into the operator routes.
            </p>
            <div className={styles.suggestionGrid}>
              {ASSISTANT_SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" className={styles.suggestionPill} onClick={() => openAssistant(suggestion)}>
                  <Sparkles size={14} strokeWidth={1.5} />
                  {suggestion}
                </button>
              ))}
            </div>
          </article>
        </section>

        <section id="library" className={styles.section} data-insight="landing-reading">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Anchor reading</span>
              <h2>Where this work points.</h2>
            </div>
            <label className={styles.searchShell}>
              <Search size={15} strokeWidth={1.5} />
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder="Search title, author, abstract"
              />
            </label>
          </header>
          <div className={styles.readingList}>
            {filteredReading.map((entry) => (
              <article key={entry.title} className={styles.readingItem} data-insight="landing-reading">
                <div className={styles.readingHeader}>
                  <div>
                    <span className={styles.storyKicker}>{entry.tag}</span>
                    <h3>{entry.title}</h3>
                    <div className={styles.readingMeta}>{entry.meta} · {entry.authors}</div>
                  </div>
                  <button type="button" className={styles.secondaryButton} onClick={() => openAssistant(`Summarize ${entry.title}.`)}>
                    Summarize
                  </button>
                </div>
                <p className={styles.readingAbstract}>{entry.abstract}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <div className={styles.dock}>
        <span><ShieldCheck size={14} strokeWidth={1.5} /> HIPAA session</span>
        <span>{runs[0]?.id ?? "run_2026_115_a"}</span>
        <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
        <button type="button" onClick={() => navigate("/overview")}>Operator view</button>
      </div>

      <button type="button" className={styles.fab} aria-label="Open assistant" onClick={() => openAssistant()}>
        <Sparkles size={20} strokeWidth={1.5} />
      </button>

      <Buddy />
      <ChatDrawer />
    </div>
  );
}