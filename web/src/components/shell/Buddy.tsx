import { useEffect, useRef, useState } from "react";
import styles from "./Buddy.module.css";

export interface InsightData {
  term: string;
  body: string;
}

export const INSIGHTS: Record<string, InsightData> = {
  "kpi-enroll": { term: "Enrollment", body: "231 of 260 infants are enrolled across VPT, ASIB, and TD cohorts. The dashboard highlights active recruitment progress and weekly movement toward target." },
  "kpi-evals": { term: "Evaluations", body: "This tile summarizes study visits that still need HDA labeling, adjudication, or downstream scoring before the analysis pipeline is fully caught up." },
  "kpi-epochs": { term: "Epochs", body: "Each epoch is a 5-second ECG window. The pipeline counts them after preprocessing and QA because they are the unit that drives both HRV features and HDA labels." },
  "kpi-redcap": { term: "REDCap Health", body: "REDCap sync health reflects how cleanly visit metadata is moving through the proxy into the dashboard without leaking PHI." },
  "landing-overview": { term: "NANO Study", body: "This landing route is now aligned to the operator shell: a warm clinical palette, the same data language, and the same hover-aware Buddy guidance across every major section." },
  "landing-study": { term: "Study design", body: "NANO follows very preterm, autism-sibling, and term-born infants longitudinally so physiology, attention, and later outcomes can be interpreted together rather than as isolated visits." },
  "landing-waveform": { term: "Live ECG", body: "The hero ribbon echoes the same operational story as the dashboard: Actiheart ECG is the physiological backbone that feeds HRV, HDA, and downstream modeling." },
  "landing-metrics": { term: "Lab pulse", body: "These headline tiles mirror the operator KPIs so public visitors see the same enrollment, throughput, and model-context story as the internal dashboard." },
  "landing-rmssd": { term: "RMSSD", body: "RMSSD is a vagal-tone summary derived from accepted ECG windows. On the landing page it anchors the clinical narrative before users drill into results." },
  "landing-runs": { term: "Queued runs", body: "Queued runs reflect pipeline work waiting on compute or review. It is the quickest signal that fresh study data is moving through the system right now." },
  "landing-assistant-context": { term: "Assistant context", body: "These HDA-labeled windows and study summaries are the same grounding context the in-page assistant uses when it explains cohorts, signals, and model behavior." },
  "landing-aims": { term: "Specific aims", body: "The three aims connect early autonomic regulation, observed behavior, and later ASD symptom prediction into one longitudinal infant-development story." },
  "landing-aim-01": { term: "Aim 01", body: "Aim 01 asks how heart-defined attention matures in the first months of life and whether ASIB or VPT infants diverge from typical early autonomic regulation." },
  "landing-aim-02": { term: "Aim 02", body: "Aim 02 links physiology to interactive behavior, testing whether attention-related autonomic patterns track what infants do during later study visits." },
  "landing-aim-03": { term: "Aim 03", body: "Aim 03 turns the early physiology and HDA signatures into prediction features for later ASD symptom likelihood at age 3." },
  "landing-groups": { term: "Cohorts", body: "ASIB, VPT, and TD are not just labels here; they are the core study arms that structure recruitment, comparison, and every longitudinal analysis surface." },
  "landing-architecture": { term: "Data architecture", body: "This section compresses the same study stack used in operations: device capture, REDCap forms, preprocessing, feature exports, and model-ready de-identified outputs." },
  "landing-arch-devices": { term: "Edge capture", body: "Actiheart ECG, eye tracking, and visit context start the pipeline. If capture quality is weak here, everything downstream gets noisier." },
  "landing-arch-capture": { term: "REDCap capture", body: "REDCap carries the visit metadata, forms, and versioned study structure that lets physiology be interpreted in the right participant and visit context." },
  "landing-arch-compute": { term: "SQI and HDA", body: "This layer is where ECG windows are cleaned, reviewed, and converted into quality-controlled attention labels suitable for science." },
  "landing-arch-features": { term: "Parquet outputs", body: "Long-form tables and parquet exports standardize the data so analysts, dashboards, and models all read from the same de-identified substrate." },
  "landing-arch-models": { term: "Models", body: "The modeling layer adds trajectories, attribution, and prediction, but only after upstream capture and QA have made the physiology defensible." },
  "landing-arch-panel": { term: "Active layer", body: "The detail panel explains the currently selected architecture layer so users can move from study narrative into the real operational substrate without leaving the page." },
  "landing-qa-watch": { term: "Agentic QA", body: "The watchlist summarizes what the pipeline currently needs human attention for, which is the same practical stance the operator surfaces take on data quality." },
  "landing-flow": { term: "Participant flow", body: "Recent participant flow keeps the public story grounded in real infant visits, showing which cohort, visit window, and site are active in the current feed." },
  "landing-cohort": { term: "Cohort table", body: "This table is the public-facing cohort snapshot: every visible infant row is a de-identified join of study arm, visit timing, site context, and QA status." },
  "landing-rmssd-chart": { term: "Trajectory plot", body: "The RMSSD trajectories summarize how vagal-tone trends differ by cohort across time, which is one of the core physiological narratives in the study." },
  "landing-hda-chart": { term: "HDA distribution", body: "This composition view breaks each cohort into orienting, sustained attention, inattention, and termination so group-level attentional signatures are visible at a glance." },
  "landing-model-card": { term: "Model card", body: "The model card keeps the landing honest: calibrated metrics, not just a headline score, and a clear bridge into the deeper results route." },
  "landing-studio-inputs": { term: "Model studio", body: "These sliders are an explanatory sandbox. They help visitors see how infant-level features can move the model before they enter the denser analytics views." },
  "landing-studio-gauge": { term: "Risk gauge", body: "The gauge is illustrative rather than diagnostic. It demonstrates feature sensitivity and calibration language without pretending to be a clinical decision tool." },
  "landing-assistant": { term: "ESD Buddy", body: "Buddy stays visible across the landing so users can hover for context, then open the assistant to turn any section into a natural-language explanation." },
  "landing-reading": { term: "Reading list", body: "These papers and directions frame where the lab's physiology, behavior, and developmental modeling work connects to the broader literature." },
  "redcap-forms": { term: "Forms tracked", body: "These are the versioned REDCap instruments the dashboard mirrors. Field-map changes here affect every downstream export and quality check." },
  "redcap-records": { term: "Records", body: "This count reflects records pulled from or pushed back to REDCap in the last 24 hours through the secure study integration." },
  "redcap-warnings": { term: "Warnings", body: "Warnings indicate records that need human review, usually because a field is missing or a value failed validation but the sync could still continue." },
  "redcap-failures": { term: "Failures", body: "Failures are sync jobs that could not complete, often because authentication expired or a required form payload was malformed." },
  "stage-ingest": { term: "Ingest", body: "Raw Actiheart ECG and REDCap metadata arrive here first. File naming, visit manifests, and source completeness are validated before processing continues." },
  "stage-preprocess": { term: "Preprocess", body: "This stage filters the ECG, detects R-peaks, extracts inter-beat intervals, and removes windows with too many ectopic beats or heavy noise." },
  "stage-qa": { term: "Window QA", body: "Signal quality is scored per epoch so borderline windows can be reviewed before HRV and HDA outputs are trusted downstream." },
  "stage-hrv": { term: "HRV", body: "Time- and frequency-domain features such as RMSSD, SDNN, pNN50, LF, and HF are computed once the ECG windows are accepted." },
  "stage-hda": { term: "HDA", body: "Heart-rate Defined Attention labels are assigned here, separating orienting, sustained attention, inattention, and termination phases." },
  "stage-merge": { term: "Merge", body: "The final merge joins processed physiology with visit metadata and writes de-identified outputs for downstream modeling and reporting." },
  "pipeline-svg": { term: "Pipeline", body: "This animated DAG shows the six-stage flow from ingest to de-identified export. Active edges pulse when work is moving between stages." },
};

export function lookupInsight(id: string | null | undefined): InsightData | null {
  if (!id) return null;
  return INSIGHTS[id] ?? { term: "Insight", body: id };
}

function insightTarget(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest("[data-insight]") : null;
}

function resolveInsightFromElement(target: Element): InsightData | null {
  const term = target.getAttribute("data-insight-term")?.trim() ?? "";
  const body = target.getAttribute("data-insight-body")?.trim() ?? "";
  const fallback = lookupInsight(target.getAttribute("data-insight"));

  if (term || body) {
    return {
      term: term || fallback?.term || "Insight",
      body: body || fallback?.body || "",
    };
  }

  return fallback;
}

interface BuddySvgProps {
  talking: boolean;
  lookX: number;
  lookY: number;
}

function BuddySvg({ talking, lookX, lookY }: BuddySvgProps) {
  const eyeL = { cx: 36, cy: 50 };
  const eyeR = { cx: 60, cy: 50 };

  const offset = (dx: number, dy: number) => {
    const length = Math.sqrt(dx * dx + dy * dy);
    const max = 2.4;
    if (length < 1) return { x: 0, y: 0 };
    const scale = Math.min(max, length * 0.04) / length;
    return { x: dx * scale, y: dy * scale };
  };

  const left = offset(lookX - eyeL.cx, lookY - eyeL.cy);
  const right = offset(lookX - eyeR.cx, lookY - eyeR.cy);

  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <g>
        <path className={styles.antenna} d="M48 22 Q 50 14 55 8" />
        <circle className={styles.antennaDot} cx="55" cy="8" r="3" />
      </g>

      <ellipse className={styles.body} cx="48" cy="56" rx="32" ry="28" />
      <circle className={styles.blush} cx="22" cy="62" r="5" />
      <circle className={styles.blush} cx="74" cy="62" r="5" />

      <g className={styles.eye} style={{ transform: `translate(${left.x.toFixed(2)}px, ${left.y.toFixed(2)}px)` }}>
        <circle cx={eyeL.cx} cy={eyeL.cy} r="3" />
      </g>
      <g className={styles.eye} style={{ transform: `translate(${right.x.toFixed(2)}px, ${right.y.toFixed(2)}px)` }}>
        <circle cx={eyeR.cx} cy={eyeR.cy} r="3" />
      </g>

      {talking ? (
        <ellipse cx="48" cy="66" rx="5" ry="3.5" fill="var(--ink)" />
      ) : (
        <path className={styles.mouth} d="M42 64 Q 48 68 54 64" />
      )}

      <g>
        <path
          className={styles.heartPulse}
          transform="translate(72 32) scale(0.42)"
          d="M12 21s-7-4.5-9.5-9.2C0.7 8.5 2.3 5 5.5 5c1.9 0 3.6 1 4.5 2.5C10.9 6 12.6 5 14.5 5c3.2 0 4.8 3.5 3 6.8C19 16.5 12 21 12 21z"
        />
      </g>
    </svg>
  );
}

export function Buddy() {
  const [insight, setInsight] = useState<InsightData | null>(null);
  const [look, setLook] = useState({ x: 48, y: 48 });

  const buddyRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const lookFrameRef = useRef<number | null>(null);
  const pendingLookRef = useRef({ x: 48, y: 48 });

  useEffect(() => {
    const clearHideTimer = () => {
      if (hideTimerRef.current != null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const showInsight = (target: Element | null) => {
      if (!(target instanceof Element)) return;
      clearHideTimer();
      setInsight(resolveInsightFromElement(target));
      target.classList.add("insight-active");
    };

    const hideInsight = (target: Element | null, relatedTarget: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      if (target === insightTarget(relatedTarget)) return;
      target.classList.remove("insight-active");
      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => setInsight(null), 500);
    };

    const onOver = (event: MouseEvent) => {
      showInsight(insightTarget(event.target));
    };

    const onOut = (event: MouseEvent) => {
      hideInsight(insightTarget(event.target), event.relatedTarget);
    };

    const onFocusIn = (event: FocusEvent) => {
      showInsight(insightTarget(event.target));
    };

    const onFocusOut = (event: FocusEvent) => {
      hideInsight(insightTarget(event.target), event.relatedTarget);
    };

    document.addEventListener("mouseover", onOver, { passive: true });
    document.addEventListener("mouseout", onOut, { passive: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      clearHideTimer();
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const buddy = buddyRef.current;
      if (!buddy) return;
      const rect = buddy.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = Math.max(-200, Math.min(200, event.clientX - cx));
      const dy = Math.max(-200, Math.min(200, event.clientY - cy));
      pendingLookRef.current = { x: 48 + dx, y: 48 + dy };
      if (lookFrameRef.current !== null) return;
      lookFrameRef.current = window.requestAnimationFrame(() => {
        lookFrameRef.current = null;
        setLook(pendingLookRef.current);
      });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      if (lookFrameRef.current !== null) {
        window.cancelAnimationFrame(lookFrameRef.current);
      }
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div className={styles.stage} aria-live="polite">
      <div className={`${styles.buddy} ${insight ? styles.talking : ""}`} ref={buddyRef}>
        <BuddySvg talking={Boolean(insight)} lookX={look.x} lookY={look.y} />
      </div>

      <div className={`${styles.bubble} ${insight ? styles.show : ""}`}>
        {insight && (
          <>
            <span className={styles.termTag}>{insight.term}</span>
            <div className={styles.bodyText}>{insight.body}</div>
          </>
        )}
      </div>
    </div>
  );
}