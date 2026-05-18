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

  useEffect(() => {
    const clearHideTimer = () => {
      if (hideTimerRef.current != null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const onOver = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("[data-insight]") : null;
      if (!(target instanceof Element)) return;
      const next = lookupInsight(target.getAttribute("data-insight"));
      clearHideTimer();
      setInsight(next);
      target.classList.add("insight-active");
    };

    const onOut = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("[data-insight]") : null;
      if (!(target instanceof Element)) return;
      target.classList.remove("insight-active");
      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => setInsight(null), 500);
    };

    document.addEventListener("mouseover", onOver, { passive: true });
    document.addEventListener("mouseout", onOut, { passive: true });

    return () => {
      clearHideTimer();
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
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
      setLook({ x: 48 + dx, y: 48 + dy });
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
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