import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Download, MessageCircle, Sparkles } from "lucide-react";
import { useParticipants, useRuns, useStages } from "@/api/hooks";
import {
  getDashboardSourceState,
  selectNanoMetrics,
  useDashboardMetrics,
} from "@/api/dashboardMetrics";
import { DataProvenance } from "@/components/data/DataProvenance";
import { Buddy } from "@/components/shell/Buddy";
import { ChatDrawer } from "@/components/shell/ChatDrawer";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { startNanoTour } from "@/components/help/tourEvents";
import { isDiscoveryPath, toDiscoveryRoute } from "@/lib/discoveryRoutes";
import { useUi } from "@/store/ui";
import brainIcon from "@/assets/nano-dashboard/icon-brain-blue.png";
import eyeIcon from "@/assets/nano-dashboard/icon-eye-blue.png";
import heartbeatIcon from "@/assets/nano-dashboard/icon-heartbeat-blue.png";
import labLogo from "@/assets/nano-dashboard/logo-horizontal-discovery-blue.png";
import schedulePattern from "@/assets/nano-dashboard/pattern-brain-duck-white.png";
import sunburst from "@/assets/nano-dashboard/sunburst-discovery-blue.png";
import universityLogo from "@/assets/nano-dashboard/uofsc-horizontal-garnet.png";
import styles from "./Landing.module.css";

type LandingSection = "overview" | "aims" | "pipeline" | "schedule" | "model";

const SECTION_IDS: LandingSection[] = ["overview", "aims", "pipeline", "schedule", "model"];

const AIM_CARDS = [
  {
    icon: heartbeatIcon,
    eyebrow: "Aim 1",
    title: "Does autonomic regulation in the NICU predict attention at twelve months?",
    body: "RSA, RMSSD, and central-peripheral temperature difference, recorded at every physiological visit.",
    prompt: "Explain how NICU autonomic regulation is tested against attention at twelve months.",
  },
  {
    icon: eyeIcon,
    eyebrow: "Aim 2",
    title: "Do heart-defined attention phases diverge by group?",
    body: "Sustained attention is compared across ASIB, very preterm, and term-born cohorts as infants develop.",
    prompt: "Explain heart-defined attention and how it is compared across NANO cohorts.",
  },
  {
    icon: brainIcon,
    eyebrow: "Aim 3",
    title: "Can early physiology forecast a 36-month ADOS-2 outcome?",
    body: "Six candidate models are evaluated on held-out data, with calibration and reviewability kept visible.",
    prompt: "Explain the age-three prediction aim and its validation safeguards.",
  },
] as const;

const PIPELINE_SNAPSHOT = [
  { label: "Ingested", count: 1400, note: "+42 · 7d" },
  { label: "ECG preproc", count: 1355, note: "+38 · 7d" },
  { label: "Temp preproc", count: 1355, note: "+35 · 7d" },
  { label: "Behavioral coding", count: 1355, note: "+31 · 7d" },
  { label: "Feature matrix", count: 1246, note: "+29 · 7d" },
  { label: "Imputation", count: 1246, note: "MICE m=20" },
  { label: "Model-ready", count: 140, note: "+8 · 7d" },
] as const;

const MODELS = [
  { name: "Logistic Regression", score: 0.747 },
  { name: "SVM (RBF)", score: 0.784 },
  { name: "Random Forest", score: 0.82 },
  { name: "XGBoost", score: 0.859 },
  { name: "Transformer", score: 0.865 },
  { name: "1D-CNN + LSTM", score: 0.899, featured: true },
] as const;

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}

function formatOptionalNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : formatNumber(value);
}

function formatEventLabel(value: string): string {
  return value
    .replace(/_arm_\d+$/i, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRunDate(value?: string): string {
  if (!value) return "Awaiting first pipeline sync";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function Landing() {
  const navigate = useNavigate();
  const location = useLocation();
  const setChatOpen = useUi((state) => state.setChatOpen);
  const setChatSeed = useUi((state) => state.setChatSeed);
  const inDiscovery = isDiscoveryPath(location.pathname);
  const route = (to: string) => (inDiscovery ? toDiscoveryRoute(to) : to);

  const dashboardMetrics = useDashboardMetrics();
  const { data: stages = [] } = useStages();
  const { data: runs = [] } = useRuns(6);
  const { data: participants = [] } = useParticipants();

  const progressRef = useRef<HTMLDivElement>(null);
  const burstRef = useRef<HTMLImageElement>(null);
  const [navVisible, setNavVisible] = useState(false);
  const [activeSection, setActiveSection] = useState<LandingSection>("overview");

  const nano = selectNanoMetrics(dashboardMetrics.data);
  const sourceState = getDashboardSourceState(dashboardMetrics.data);
  const enrollment = nano?.enrollment ?? null;
  const target = nano?.target ?? null;

  const pipeline = useMemo(
    () =>
      PIPELINE_SNAPSHOT.map((fallback, index) => {
        const stage = stages[index];
        return {
          id: stage?.id ?? `stage-${index + 1}`,
          label: stage?.label ?? fallback.label,
          count: stage?.done ?? fallback.count,
          note: stage
            ? stage.inflight > 0
              ? `${formatNumber(stage.inflight)} in flight`
              : stage.fail > 0
                ? `${formatNumber(stage.fail)} flagged`
                : stage.eta || fallback.note
            : fallback.note,
          inflight: stage?.inflight ?? 0,
          fail: stage?.fail ?? 0,
        };
      }),
    [stages],
  );

  const qa = useMemo(() => {
    const done = stages.reduce((total, stage) => total + stage.done, 0);
    const fail = stages.reduce((total, stage) => total + stage.fail, 0);
    const reviewed = done + fail;
    return {
      passRate: reviewed > 0 ? (done / reviewed) * 100 : 90.4,
      passed: done || 1265,
      open: fail || participants.filter((participant) => participant.qa !== "pass").length || 135,
    };
  }, [participants, stages]);

  const schedule = useMemo(() => {
    const observed = (nano?.events ?? []).filter(
      (event): event is typeof event & { records: number } => !event.suppressed && event.records !== null,
    );
    const maximum = Math.max(...observed.map((event) => event.records), 1);
    return observed.map((event) => ({
      label: formatEventLabel(event.event),
      count: event.records,
      share: event.records / maximum,
    }));
  }, [nano?.events]);

  useEffect(() => {
    const revealTargets = Array.from(document.querySelectorAll<HTMLElement>("[data-landing-reveal]"));
    if (!("IntersectionObserver" in window)) {
      revealTargets.forEach((targetElement) => targetElement.setAttribute("data-visible", "true"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).setAttribute("data-visible", "true");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10%", threshold: 0.08 },
    );
    revealTargets.forEach((targetElement) => observer.observe(targetElement));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const scrollTop = window.scrollY;
      const scrollMax = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const ratio = Math.min(1, scrollTop / scrollMax);
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${ratio})`;
      setNavVisible(scrollTop > window.innerHeight * 0.58);

      let current: LandingSection = "overview";
      for (const id of SECTION_IDS) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top < window.innerHeight * 0.44) current = id;
      }
      setActiveSection(current);

      if (burstRef.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        burstRef.current.style.transform = `translate3d(0, calc(-50% + ${Math.min(scrollTop * 0.055, 48)}px), 0) rotate(${Math.min(scrollTop * 0.004, 4)}deg)`;
      }
    };
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  function jumpTo(id: LandingSection) {
    document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  function openAssistant(seed?: string) {
    setChatSeed(seed?.trim() ? seed : null);
    setChatOpen(true);
  }

  function exportPipeline() {
    const rows = [
      ["Stage", "Completed", "In flight", "Flagged"],
      ...pipeline.map((stage) => [stage.label, stage.count, stage.inflight, stage.fail]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `nano-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.page} data-discovery-surface="landing" data-screen-label="Public landing">
      <div ref={progressRef} className={styles.progress} style={{ transform: "scaleX(0)" }} aria-hidden />

      <nav
        className={`${styles.scrollNav} ${navVisible ? styles.scrollNavVisible : ""}`}
        aria-label="Landing sections"
        aria-hidden={!navVisible}
        data-tour="public-nav"
        data-discovery-part="landing-nav"
      >
        <div className={styles.navInner}>
          <button type="button" className={styles.navBrand} onClick={() => jumpTo("overview")} tabIndex={navVisible ? 0 : -1}>
            <span className={styles.navBrandMark} aria-hidden />
            <strong>ESD Lab</strong>
            <span>NANO Study</span>
          </button>
          <div className={styles.navLinks} data-discovery-part="landing-links">
            {(["aims", "pipeline", "schedule"] as LandingSection[]).map((id) => (
              <button
                key={id}
                type="button"
                className={activeSection === id ? styles.navLinkActive : ""}
                onClick={() => jumpTo(id)}
                tabIndex={navVisible ? 0 : -1}
              >
                {id[0]?.toUpperCase()}{id.slice(1)}
              </button>
            ))}
            <button
              type="button"
              className={styles.dashboardNavButton}
              onClick={() => navigate(route("/esd-lab"))}
              tabIndex={navVisible ? 0 : -1}
              data-tour="operator-toggle"
            >
              Dashboard
            </button>
            <ThemeToggle variant="ghost" className={styles.navThemeControl} />
          </div>
        </div>
      </nav>

      <main>
        <section id="overview" className={styles.hero} data-insight="landing-overview">
          <img ref={burstRef} className={styles.heroBurst} src={sunburst} alt="" />
          <div className={styles.container}>
            <div className={styles.heroHeadline} data-landing-reveal data-insight="pipeline-svg">
              <div className={styles.eyebrowLine}>
                <span aria-hidden />
                <strong>NANO Study · NIH R01MH132925</strong>
              </div>
              <h1>The heartbeat of every baby&apos;s first year.</h1>
            </div>
            <div className={styles.heroIntro} data-landing-reveal>
              <p>
                The ESD Lab follows {target !== null ? `up to ${formatNumber(target)} ` : ""}very preterm and term-born
                infants from the NICU to age three, reading attention and autonomic regulation directly from the heart.
              </p>
              <div className={styles.heroActions}>
                <button type="button" className={styles.primaryButton} onClick={() => navigate(route("/esd-lab"))} data-tour="operator-toggle">
                  Open the dashboard
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => jumpTo("aims")}>
                  Read the study
                </button>
              </div>
              <div className={styles.heroActions}>
                <DataProvenance source={sourceState} />
              </div>
            </div>
            <div className={styles.heroMetrics} data-landing-reveal data-tour="attention-pulse" data-insight="landing-metrics">
              <article data-insight="kpi-enroll">
                <strong>{formatOptionalNumber(enrollment)}</strong>
                <span>{target !== null ? `enrolled of ${formatNumber(target)}` : "survey enrollment"}</span>
              </article>
              <article>
                <strong>{formatOptionalNumber(nano?.eventRecords)}</strong>
                <span>observed event records</span>
              </article>
              <article>
                <strong>
                  {nano?.forms.completionRate === null || nano?.forms.completionRate === undefined
                    ? "—"
                    : nano.forms.completionRate.toFixed(1)}
                  {nano?.forms.completionRate !== null && nano?.forms.completionRate !== undefined ? <span>%</span> : null}
                </strong>
                <span>verified form completion</span>
              </article>
              <article>
                <strong>{formatOptionalNumber(nano?.projectsOk)}</strong>
                <span>
                  reporting projects{nano?.projectsTotal !== null && nano?.projectsTotal !== undefined ? ` of ${nano.projectsTotal}` : ""}
                </span>
              </article>
            </div>
          </div>
        </section>

        <section id="aims" className={styles.section} data-insight="landing-aims">
          <div className={styles.container}>
            <header className={styles.sectionHeading} data-landing-reveal>
              <span>Aims</span>
              <h2>Three questions, one trajectory.</h2>
            </header>
            <div className={styles.aimGrid}>
              {AIM_CARDS.map((aim, index) => (
                <article
                  key={aim.eyebrow}
                  className={styles.aimCard}
                  data-landing-reveal
                  data-insight={`landing-aim-${index + 1}`}
                  data-tour={index === 0 ? "aim-card" : undefined}
                >
                  <img src={aim.icon} alt="" />
                  <span>{aim.eyebrow}</span>
                  <h3>{aim.title}</h3>
                  <p>{aim.body}</p>
                  <button type="button" onClick={() => openAssistant(aim.prompt)} aria-label={`Ask ESD Lab Buddy about ${aim.eyebrow}`}>
                    Ask Buddy <ArrowRight size={14} aria-hidden />
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pipeline" className={`${styles.section} ${styles.pipelineSection}`} data-insight="pipeline-svg">
          <div className={styles.container}>
            <header className={`${styles.sectionHeading} ${styles.pipelineHeading}`} data-landing-reveal>
              <div>
                <span>Pipeline snapshot</span>
                <h2>From chest to claim.</h2>
              </div>
              <p>Repository operations snapshot. These counts are not part of the live REDCap metrics contract.</p>
            </header>
            <div className={styles.pipelineGrid} data-landing-reveal>
              {pipeline.map((stage, index) => (
                <button
                  type="button"
                  key={stage.id}
                  className={`${styles.pipelineStage} ${index === pipeline.length - 1 ? styles.pipelineStageReady : ""}`}
                  onClick={() => navigate(route("/runs"))}
                  data-insight={`stage-${stage.id}`}
                  data-tour={index === 0 ? "pipeline-stage" : undefined}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{stage.label}</h3>
                  <strong>{formatNumber(stage.count)}</strong>
                  <small>{stage.note}</small>
                </button>
              ))}
            </div>
            <div className={styles.pipelineMeta} data-landing-reveal>
              <span>Pipeline snapshot</span>
              <span>{qa.passRate.toFixed(1)}% QA pass rate</span>
              <span>{formatNumber(qa.passed)} QA-passed sessions</span>
              <span>{formatNumber(qa.open)} open QC actions</span>
              <button type="button" onClick={exportPipeline}>
                <Download size={14} aria-hidden /> Export pipeline
              </button>
            </div>
          </div>
        </section>

        <section id="schedule" className={styles.scheduleSection} data-insight="landing-cohort">
          <img className={styles.schedulePattern} src={schedulePattern} alt="" />
          <div className={styles.container}>
            <header className={`${styles.sectionHeading} ${styles.scheduleHeading}`} data-landing-reveal>
              <span>Schedule</span>
              <h2>Every infant, every visit.</h2>
              <p>
                Observed aggregate record counts by NANO REDCap event. Privacy-suppressed and unavailable counts are omitted.
              </p>
            </header>
            {schedule.length ? (
              <div className={styles.scheduleChart} data-landing-reveal role="img" aria-label="Observed NANO REDCap records by event">
                {schedule.map((visit, index) => (
                  <div key={visit.label} className={styles.scheduleColumn}>
                    <strong>{formatNumber(visit.count)}</strong>
                    <span
                      className={styles.scheduleBar}
                      style={{
                        height: visit.share > 0 ? `${Math.max(visit.share * 100, 3)}%` : "2px",
                        opacity: Math.max(0.45, 0.95 - index * 0.055),
                      }}
                      aria-hidden
                    />
                    <small>{visit.label}</small>
                  </div>
                ))}
              </div>
            ) : (
              <DataProvenance
                label="Schedule unavailable"
                detail="No unsuppressed NANO event counts are available in the current aggregate contract."
              />
            )}
          </div>
        </section>

        <section id="model" className={`${styles.section} ${styles.modelSection}`} data-insight="landing-model-card">
          <div className={`${styles.container} ${styles.modelLayout}`}>
            <div className={styles.modelFeature} data-landing-reveal>
              <span>Pilot model</span>
              <strong>0.899</strong>
              <h2>1D-CNN + LSTM validation AUROC</h2>
              <p>Pilot result across six candidate models on held-out data. Not a clinical claim.</p>
              <button type="button" onClick={() => navigate(route("/model-leaderboard"))}>
                Open the model leaderboard <ArrowRight size={14} aria-hidden />
              </button>
            </div>
            <div className={styles.modelList} data-landing-reveal aria-label="Validation AUROC by candidate model">
              {MODELS.map((model) => (
                <div key={model.name} className={"featured" in model && model.featured ? styles.modelRowFeatured : ""}>
                  <div>
                    <span>{model.name}</span>
                    <strong>{model.score.toFixed(3)}</strong>
                  </div>
                  <div className={styles.modelTrack}>
                    <span style={{ width: `${Math.max(4, ((model.score - 0.7) / 0.22) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer} data-insight="landing-reading">
        <div className={styles.container}>
          <div className={styles.logoPlate}>
            <img src={labLogo} alt="The Early Social Development Lab at UofSC" />
            <span aria-hidden />
            <img src={universityLogo} alt="University of South Carolina" />
          </div>
          <div className={styles.footerGrid}>
            <div><strong>Institute for Mind &amp; Brain</strong><span>1800 Gervais St<br />Columbia, SC 29201</span></div>
            <div><strong>Principal Investigator</strong><span>Jessica Bradshaw, PhD</span></div>
            <div><strong>Award</strong><span>R01MH132925<br />2023 – 2028</span></div>
            <div><strong>Data</strong><span>Aggregate only. No PHI leaves<br />the secure mount.</span></div>
          </div>
          <div className={styles.footerActions} data-tour="assistant-surface" data-insight="landing-assistant">
            <span>Latest pipeline snapshot: {formatRunDate(runs[0]?.triggered)}</span>
            <button type="button" onClick={() => openAssistant("Walk me through the NANO Study.")}>
              <MessageCircle size={15} aria-hidden /> Ask ESD Lab Buddy
            </button>
            <button type="button" onClick={() => startNanoTour("public")} data-insight="tour-trigger">
              <Sparkles size={15} aria-hidden /> Take the guided tour
            </button>
          </div>
        </div>
      </footer>

      <Buddy anchor="page" />
      <ChatDrawer />
    </div>
  );
}
