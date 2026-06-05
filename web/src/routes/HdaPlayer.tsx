import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, SectionLabel, Segmented } from "@/components/primitives";
import { HdaTimeline } from "@/components/charts/HdaTimeline";
import { useHdaSession, useParticipants } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import styles from "./FeatureRoutes.module.css";

const VISITS = [
  { value: "3", label: "3 mo" },
  { value: "6", label: "6 mo" },
  { value: "9", label: "9 mo" },
  { value: "12", label: "12 mo" },
  { value: "18", label: "18 mo" },
  { value: "24", label: "24 mo" },
];

export function HdaPlayer() {
  const enabled = useFeatureFlag("HDA_TIMELINE_PLAYER");
  if (!enabled) return null;

  const navigate = useNavigate();
  const showCoReg = useFeatureFlag("DYN_CO_REGULATION_BRAID");
  const showPhase = useFeatureFlag("DYN_AROUSAL_ATTENTION_PORTRAIT");
  const showBypass = useFeatureFlag("DYN_HDA_BYPASS_INDEX");
  const { data: participants = [] } = useParticipants();
  const [nanoId, setNanoId] = useState("");
  const [visitAge, setVisitAge] = useState("12");
  const [compareId, setCompareId] = useState("");
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState(1);

  const selectedId = nanoId || participants[0]?.id;
  const compareTarget = compareId || participants.find((p) => p.id !== selectedId)?.id || "";
  const numericVisitAge = Number(visitAge);
  const { data: session } = useHdaSession(selectedId, numericVisitAge);
  const { data: compare } = useHdaSession(compareId ? compareTarget : undefined, numericVisitAge);
  const rows = session?.data ?? [];
  const compareRows = compare?.data ?? [];
  const duration = useMemo(() => Math.max(...rows.map((row) => row.t1), 1), [rows]);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setCursor((value) => (value + 5 * speed >= duration ? 0 : value + 5 * speed));
    }, 350);
    return () => window.clearInterval(timer);
  }, [duration, playing, speed]);

  function step(delta: number) {
    setCursor((value) => Math.max(0, Math.min(duration, value + delta)));
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Analysis route · HDA</span>
          <h1 className={styles.h1}>HDA Timeline Player</h1>
          <p className={styles.lede}>
            Synchronized phase, RMSSD, and signal-quality tracks for de-identified NANO sessions.
          </p>
        </div>
        <div className={styles.actions}>
          <select className={styles.select} value={selectedId ?? ""} onChange={(e) => setNanoId(e.target.value)} aria-label="Participant">
            {participants.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.group}</option>)}
          </select>
          <select className={styles.select} value={compareId} onChange={(e) => setCompareId(e.target.value)} aria-label="Compare participant">
            <option value="">compare off</option>
            {participants.filter((p) => p.id !== selectedId).map((p) => <option key={p.id} value={p.id}>{p.id} · {p.group}</option>)}
          </select>
        </div>
      </header>

      <Card pad={20}>
        <div className={styles.cardHead}>
          <div>
            <SectionLabel>Session player</SectionLabel>
            <div className={styles.cardTitle}>{selectedId} · CGA {numericVisitAge} mo</div>
          </div>
          <Segmented<string> size="sm" options={VISITS} value={visitAge} onChange={(value) => { setVisitAge(value); setCursor(0); }} />
        </div>

        <HdaTimeline rows={rows} compareRows={compareRows} cursor={cursor} />

        <div className={styles.filterBar} style={{ borderBottom: 0, paddingInline: 0 }}>
          <Button icon={playing ? "pause" : "play"} onClick={() => setPlaying((value) => !value)}>
            {playing ? "Pause" : "Play"}
          </Button>
          <Button variant="secondary" icon="skip-back" onClick={() => step(-5)}>Step back</Button>
          <Button variant="secondary" icon="skip-forward" onClick={() => step(5)}>Step</Button>
          <label className={styles.filterGroup}>
            <span className={styles.filterLabel}>Speed</span>
            <input className={styles.range} type="range" min={0.5} max={3} step={0.5} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            <span className="t-mono">{speed.toFixed(1)}x</span>
          </label>
          <label className={styles.filterGroup} style={{ flex: 1 }}>
            <span className={styles.filterLabel}>Scrub</span>
            <input className={styles.range} style={{ flex: 1 }} type="range" min={0} max={duration} step={5} value={cursor} onChange={(e) => setCursor(Number(e.target.value))} />
            <span className="t-mono">{Math.round(cursor)}s</span>
          </label>
          {showCoReg && <Button variant="secondary" icon="git-merge" onClick={() => navigate("/dyad-coregulation")}>View co-regulation</Button>}
          {showPhase && <Button variant="secondary" icon="git-commit" onClick={() => navigate("/phase-portrait")}>View phase portrait</Button>}
          {showBypass && <Button variant="secondary" icon="shuffle" onClick={() => navigate("/hda-bypass")}>See bypass analysis</Button>}
        </div>
      </Card>
    </div>
  );
}
