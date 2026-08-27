/**
 * @route GuidedExplorer
 * @data-sensitivity: AGGREGATED - no PII
 * @auth-required: false (internal demo mode only)
 * @hipaa-note: Tour cards use aggregate examples and synthetic QA tiles only.
 */
import { useReducer, useState, type Dispatch } from "react";
import { Link } from "react-router-dom";
import { Button, Card, SectionLabel, Tooltip } from "@/components/primitives";
import { AreaSparkline, Counter, GroupTag } from "@/components/warm";
import { EpochTile } from "@/components/qa/EpochTile";
import { epochReducer, type EpochAction } from "@/components/qa/epochReducer";
import type { Epoch, GroupCode, HdaPhase } from "@/api/schemas";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import shared from "./FeatureRoutes.module.css";
import styles from "./GuidedExplorer.module.css";

const PHASES: Array<{ phase: HdaPhase; label: string; body: string; color: string }> = [
  { phase: "orienting", label: "Orienting", body: "Heart rate drops as attention is captured.", color: "var(--blue)" },
  { phase: "sustained", label: "Sustained", body: "A stable attention window with stronger regulation.", color: "var(--green)" },
  { phase: "inattention", label: "Inattention", body: "Attention drifts or physiology becomes less task-linked.", color: "var(--purple)" },
  { phase: "termination", label: "Termination", body: "The attention episode closes and the infant transitions.", color: "var(--red)" },
];

const QA_EPOCHS: Epoch[] = [
  { idx: 0, t0: 0, t1: 5, flag: "clean", sqi: 0.86, ibi_n: 8, decision: "auto" },
  { idx: 1, t0: 5, t1: 10, flag: "motion", sqi: 0.48, ibi_n: 5, decision: "auto" },
  { idx: 2, t0: 10, t1: 15, flag: "noise", sqi: 0.22, ibi_n: 3, decision: "auto" },
  { idx: 3, t0: 15, t1: 20, flag: "clean", sqi: 0.79, ibi_n: 9, decision: "auto" },
];

const LINKS = [
  { title: "Open Lab Pulse", body: "Start with the operator overview.", to: "/overview" },
  { title: "Review Results", body: "See HRV and HDA trajectories.", to: "/results" },
  { title: "Ask ESD Buddy", body: "Use Cmd/Ctrl+K anywhere in the shell.", to: "/public-insights" },
];

export function GuidedExplorer() {
  const enabled = useFeatureFlag("GUIDED_EXPLORER");
  const [step, setStep] = useState(0);
  const [epochs, dispatch] = useReducer(epochReducer, QA_EPOCHS);

  if (!enabled) return null;

  const total = 7;
  const progress = ((step + 1) / total) * 100;

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <header className={shared.hero}>
        <div>
          <span className={`${shared.eyebrow} t-mono`}>Guided demo</span>
          <h1 className={shared.h1} data-insight="guided-explorer-step">Guided Explorer</h1>
          <p className={shared.lede}>
            A seven-step tour through the NANO study, HDA phases, RSA paradox, pipeline, participants, and QA review.
          </p>
        </div>
        <button type="button" className={styles.startOver} onClick={() => setStep(total - 1)}>
          Skip tour
        </button>
      </header>

      <div className={styles.progressWrap} aria-label={`Step ${step + 1} of ${total}`}>
        <div className={styles.progressMeta}>
          <span className="t-mono">Step {step + 1} / {total}</span>
          <span>{STEP_TITLES[step]}</span>
        </div>
        <div className={styles.progressTrack}><span style={{ width: `${progress}%` }} /></div>
      </div>

      <Card pad={32} className={styles.stepCard}>
        {step === 0 && <WelcomeStep />}
        {step === 1 && <HdaStep />}
        {step === 2 && <RsaStep />}
        {step === 3 && <PipelineStep />}
        {step === 4 && <ParticipantsStep />}
        {step === 5 && <QaStep epochs={epochs} dispatch={dispatch} />}
        {step === 6 && <ReadyStep />}
      </Card>

      <div className={styles.navRow}>
        <Button variant="secondary" icon="arrow-left" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
          Back
        </Button>
        <Button iconRight={step === total - 1 ? "check" : "arrow-right"} onClick={() => setStep((value) => Math.min(total - 1, value + 1))}>
          {step === total - 1 ? "Done" : "Next"}
        </Button>
      </div>
    </div>
  );
}

const STEP_TITLES = [
  "Welcome to the NANO Dashboard",
  "Understanding HDA Phases",
  "The RSA Paradox in ASD",
  "How the Pipeline Works",
  "Your Participants",
  "QA Review",
  "You're ready.",
];

function WelcomeStep() {
  return (
    <div className={styles.stepGrid}>
      <div>
        <SectionLabel>Welcome</SectionLabel>
        <h2 className={styles.stepTitle}>NANO follows infant regulation across the first three years.</h2>
        <p className={styles.bodyText}>
          The dashboard connects physiology, observed attention, REDCap forms, and model-ready features without
          exposing PHI.
        </p>
        <div className={styles.cohorts}>
          {(["ASIB", "VPT", "TD"] as GroupCode[]).map((group) => <GroupTag key={group} group={group} />)}
        </div>
      </div>
      <div className={styles.numberGrid}>
        <NumberTile label="Target infants" value={260} />
        <NumberTile label="Study years" value={5} />
        <NumberTile label="Scientific aims" value={3} />
      </div>
    </div>
  );
}

function NumberTile({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.numberTile}>
      <div className={styles.number}><Counter to={value} /></div>
      <div className={styles.numberLabel}>{label}</div>
    </div>
  );
}

function HdaStep() {
  return (
    <div>
      <SectionLabel>HDA phases</SectionLabel>
      <h2 className={styles.stepTitle}>Heart-defined attention turns ECG into interpretable attention states.</h2>
      <div className={styles.phaseTrace}>
        <AreaSparkline values={[42, 40, 36, 34, 35, 39, 43, 41, 37, 36, 38, 44]} accent="ocean" w={520} h={84} />
      </div>
      <div className={styles.phaseBands}>
        {PHASES.map((item) => (
          <Tooltip key={item.phase} text={item.body}>
            <button type="button" className={styles.phaseBand} style={{ background: item.color }}>
              {item.label}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function RsaStep() {
  return (
    <div className={styles.stepGrid}>
      <div>
        <SectionLabel>RSA paradox</SectionLabel>
        <h2 className={styles.stepTitle}>Higher RSA in ASD-linked windows can mean reduced social monitoring.</h2>
        <p className={styles.bodyText}>
          The dashboard keeps this counter-intuitive narrative visible so users do not collapse physiology into a
          simple high-arousal story.
        </p>
      </div>
      <svg viewBox="0 0 520 240" className={styles.chart} role="img" aria-label="RSA paradox sketch at nine months">
        {[60, 80, 100, 120].map((tick) => (
          <g key={tick}>
            <line x1={46} x2={492} y1={200 - tick} y2={200 - tick} stroke="var(--warm-border)" />
            <text x={38} y={204 - tick} textAnchor="end" className={styles.tick}>{tick}</text>
          </g>
        ))}
        <path d="M52 142 C 140 132, 230 112, 310 92 S 440 76, 492 62" fill="none" stroke="var(--purple)" strokeWidth={3} />
        <path d="M52 150 C 140 145, 230 132, 310 126 S 440 108, 492 94" fill="none" stroke="var(--green)" strokeWidth={3} />
        <line x1={230} x2={230} y1={36} y2={196} stroke="var(--usc-garnet)" strokeDasharray="5 4" />
        <text x={240} y={48} className={styles.tick}>9 mo annotation</text>
      </svg>
    </div>
  );
}

function PipelineStep() {
  const stages = ["Ingest", "QA", "Features", "Impute", "Train"];
  return (
    <div>
      <SectionLabel>Pipeline</SectionLabel>
      <h2 className={styles.stepTitle}>Every route reads from the same de-identified pipeline contract.</h2>
      <div className={styles.pipeline}>
        {stages.map((stage, index) => (
          <div key={stage} className={styles.pipelineNode}>
            <span>{stage}</span>
            {index < stages.length - 1 && <span className={styles.pipelineEdge} aria-hidden />}
          </div>
        ))}
      </div>
      <p className={styles.bodyText}>Traveling dots in the full overview mean active epoch batches moving through the pipeline.</p>
    </div>
  );
}

function ParticipantsStep() {
  return (
    <div>
      <SectionLabel>Participants</SectionLabel>
      <h2 className={styles.stepTitle}>Participant surfaces use NANO IDs, cohorts, visit timing, and QA status.</h2>
      <div className={styles.participantRows}>
        {[
          ["NANO-0102", "VPT", "cga_12mo", "pass"],
          ["NANO-0114", "ASIB", "cga_9mo", "pass"],
          ["NANO-0153", "TD", "cga_9mo", "pass"],
        ].map(([id, group, visit, qa]) => (
          <div key={id} className={styles.participantRow}>
            <span className="t-mono">{id}</span>
            <GroupTag group={group as GroupCode} />
            <span>{visit}</span>
            <span>{qa}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QaStep({
  epochs,
  dispatch,
}: {
  epochs: Epoch[];
  dispatch: Dispatch<EpochAction>;
}) {
  return (
    <div>
      <SectionLabel>QA review</SectionLabel>
      <h2 className={styles.stepTitle}>Epoch QA protects every HRV and HDA result downstream.</h2>
      <div className={styles.epochGrid} role="grid" aria-label="Example QA epoch tiles">
        {epochs.map((epoch) => (
          <EpochTile
            key={epoch.idx}
            epoch={epoch}
            selected={epoch.decision !== "auto"}
            onClick={() => dispatch({ type: "set", idx: epoch.idx, decision: epoch.sqi >= 0.5 ? "accept" : "reject" })}
          />
        ))}
      </div>
      <div className={styles.navRow}>
        <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "set", idx: 1, decision: "reject" })}>Reject motion example</Button>
        <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "set", idx: 0, decision: "accept" })}>Accept clean example</Button>
      </div>
    </div>
  );
}

function ReadyStep() {
  return (
    <div>
      <SectionLabel>Ready</SectionLabel>
      <h2 className={styles.stepTitle}>You are ready to explore the operator surfaces.</h2>
      <div className={styles.linkGrid}>
        {LINKS.map((link) => (
          <Link key={link.to} to={link.to} className={styles.linkCard}>
            <strong>{link.title}</strong>
            <span>{link.body}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
