import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button, Card, SectionLabel } from "@/components/primitives";
import { useMultimodalSession, useParticipants } from "@/api/hooks";
import type { HdaPhase, MultimodalSessionResponse } from "@/api/schemas";
import { FeatureGate, firstParticipant, round } from "./routeUtils";
import styles from "./MultimodalSynchrony.module.css";

const PHASE_COLOR: Record<HdaPhase, string> = {
  orienting: "var(--blue)",
  sustained: "var(--green)",
  inattention: "var(--purple)",
  termination: "var(--red)",
};

const GAZE_COLOR: Record<string, string> = {
  "caregiver-face": "var(--sand)",
  object: "var(--ocean)",
};

interface SynchronyWindow {
  start: number;
  end: number;
  peakRsa: number;
}

export function MultimodalSynchrony() {
  return (
    <FeatureGate flag="MULTIMODAL_SYNCHRONY">
      <MultimodalSynchronyInner />
    </FeatureGate>
  );
}

function MultimodalSynchronyInner() {
  const { data: participants = [] } = useParticipants();
  const [nanoId, setNanoId] = useState(firstParticipant(participants));
  const [visitAge, setVisitAge] = useState("12");
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeId = nanoId || firstParticipant(participants) || "NANO-0102";
  const { data, isLoading } = useMultimodalSession(activeId, visitAge);

  const duration = useMemo(() => sessionDuration(data), [data]);
  const windows = useMemo(() => detectSynchrony(data), [data]);
  const maxRsa = Math.max(...windows.map((win) => win.peakRsa), 0);
  const gazeFaceSec = useMemo(
    () => (data?.gaze.events ?? []).filter((event) => event.target === "caregiver-face").reduce((sum, event) => sum + event.duration, 0),
    [data?.gaze.events],
  );

  useEffect(() => {
    if (!duration) return;
    setCursor((value) => Math.min(value, duration));
  }, [duration]);

  useEffect(() => {
    if (!playing || !duration) return undefined;
    const timer = window.setInterval(() => {
      setCursor((value) => {
        const next = value + 1;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
    }, 650);
    return () => window.clearInterval(timer);
  }, [duration, playing]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !duration) return;
    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    scroller.scrollLeft = Math.max(0, Math.min(maxScroll, (cursor / duration) * scroller.scrollWidth - scroller.clientWidth * 0.35));
  }, [cursor, duration]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setCursor((value) => Math.max(0, value - 1));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setCursor((value) => Math.min(duration, value + 1));
    } else if (event.key === " ") {
      event.preventDefault();
      setPlaying((value) => !value);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Dynamics &amp; Dyads · synchronized streams</span>
          <h1 className={styles.h1}>Multimodal Synchrony Visualizer</h1>
          <p className={styles.lede}>
            ECG, rolling RSA, HDA phase labels, and gaze fixation events share one time axis so researchers can spot
            caregiver-facing sustained attention windows without hand-aligning separate tools.
          </p>
        </div>
        <div className={styles.toolbar}>
          <label className={styles.controlGroup}>
            <span className={styles.controlLabel}>NANOID</span>
            <select className={styles.select} value={activeId} onChange={(event) => setNanoId(event.target.value)} aria-label="Participant">
              {participants.map((participant) => (
                <option key={participant.id} value={participant.id}>{participant.id} · {participant.group}</option>
              ))}
            </select>
          </label>
          <label className={styles.controlGroup}>
            <span className={styles.controlLabel}>Visit</span>
            <select className={styles.select} value={visitAge} onChange={(event) => setVisitAge(event.target.value)} aria-label="Visit age">
              {["3", "6", "9", "12", "18", "24"].map((age) => <option key={age} value={age}>{age} mo</option>)}
            </select>
          </label>
        </div>
      </header>

      <section className={styles.summary} aria-label="Multimodal session summary">
        <Metric label="Synchrony windows" value={isLoading ? "-" : windows.length.toString()} />
        <Metric label="Peak RSA in window" value={maxRsa ? `${round(maxRsa, 1)} ms²` : "-"} />
        <Metric label="Caregiver-face gaze" value={duration ? `${Math.round((gazeFaceSec / duration) * 100)}%` : "-"} />
        <Metric label="Session length" value={duration ? `${Math.round(duration)} s` : "-"} />
      </section>

      <div className={styles.tracksCard}>
        <div className={styles.tracksHead}>
          <div>
            <h2 className={styles.tracksTitle}>{activeId} · CGA {visitAge} mo</h2>
            <div className={styles.tracksHint}>Arrow keys step ±1s. Space toggles playback.</div>
          </div>
          <Button size="sm" variant="secondary" icon={playing ? "pause" : "play"} onClick={() => setPlaying((value) => !value)}>
            {playing ? "Pause" : "Play"}
          </Button>
        </div>
        <div
          className={styles.scroller}
          ref={scrollerRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          aria-label="Synchronized multimodal track viewer"
        >
          {data ? (
            <TrackSvg data={data} duration={duration} cursor={cursor} windows={windows} />
          ) : (
            <div style={{ padding: "var(--s-32)", color: "var(--warm-fg3)" }}>Loading multimodal tracks...</div>
          )}
        </div>
        <div className={styles.scrubber}>
          <span className={styles.timeCode}>{Math.round(cursor)}s</span>
          <input
            className={styles.range}
            type="range"
            min={0}
            max={Math.max(1, Math.round(duration))}
            step={1}
            value={Math.round(cursor)}
            onChange={(event) => setCursor(Number(event.target.value))}
            aria-label="Session scrubber"
          />
          <span className={styles.timeCode}>{Math.round(duration)}s</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 0.55fr)", gap: 14 }}>
        <Card pad={20}>
          <SectionLabel>Detector rule</SectionLabel>
          <div className={styles.notice} data-insight="multimodal-sync">
            Gold windows mark overlap where RSA is above 80 ms², gaze is on caregiver face, and HDA is sustained.
            These are candidate social synchrony intervals for follow-up review, not diagnostic labels.
          </div>
        </Card>
        <Card pad={20}>
          <SectionLabel>Detected windows</SectionLabel>
          <div className={styles.windowList}>
            {windows.length ? windows.slice(0, 8).map((win) => (
              <div key={`${win.start}-${win.end}`} className={styles.windowItem}>
                <span className="t-mono">{Math.round(win.start)}-{Math.round(win.end)}s</span>
                <span>peak {round(win.peakRsa, 1)} ms²</span>
              </div>
            )) : (
              <div className={styles.windowItem}>No gold windows in this mock session.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metric}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue}>{value}</div>
    </div>
  );
}

function TrackSvg({
  data,
  duration,
  cursor,
  windows,
}: {
  data: MultimodalSessionResponse;
  duration: number;
  cursor: number;
  windows: SynchronyWindow[];
}) {
  const w = Math.max(1240, Math.round(duration * 8));
  const h = 520;
  const pad = { left: 92, right: 32 };
  const innerW = w - pad.left - pad.right;
  const sx = (t: number) => pad.left + (Math.max(0, Math.min(duration, t)) / Math.max(1, duration)) * innerW;
  const cursorX = sx(cursor);
  const ticks = Array.from({ length: Math.floor(duration / 30) + 1 }, (_, i) => i * 30);

  const ecgPath = data.ecg.t.map((t, i) => {
    const y = 88 - ((data.ecg.mv[i] ?? 0) / 1.5) * 36;
    return `${i ? "L" : "M"}${sx(t).toFixed(1)} ${Math.max(42, Math.min(128, y)).toFixed(1)}`;
  }).join(" ");
  const rsaPath = data.rsa.t.map((t, i) => {
    const y = 205 - ((data.rsa.hfPower[i] ?? 0) / 200) * 70;
    return `${i ? "L" : "M"}${sx(t).toFixed(1)} ${Math.max(136, Math.min(218, y)).toFixed(1)}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={styles.trackSvg} style={{ width: `${w}px` }} role="img" aria-label="Four synchronized multimodal tracks">
      <rect x={0} y={0} width={w} height={h} fill="var(--bg-surface)" />
      {[64, 166, 286, 394].map((y, index) => (
        <rect key={y} x={16} y={y - 36} width={w - 32} height={index < 2 ? 84 : 70} rx={8} fill="var(--warm-card)" stroke="var(--warm-border)" />
      ))}
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={sx(tick)} x2={sx(tick)} y1={28} y2={454} stroke="var(--warm-border)" strokeDasharray="3 5" />
          <text x={sx(tick)} y={484} textAnchor="middle" className={styles.tickLabel}>{tick}s</text>
        </g>
      ))}

      <text x={28} y={54} className={styles.trackLabel}>Raw ECG</text>
      <text x={28} y={72} className={styles.axisLabel}>mV</text>
      <path d={ecgPath} fill="none" stroke="var(--warm-fg2)" strokeWidth={1.6} />
      {data.ecg.rPeaks.map((peak) => (
        <line key={peak} x1={sx(peak)} x2={sx(peak)} y1={38} y2={124} stroke="var(--usc-garnet)" strokeWidth={1.2} opacity={0.8} />
      ))}
      {data.ecg.rPeaks.slice(0, -1).map((peak, i) => (
        <rect key={`${peak}-${i}`} x={sx(peak)} y={116} width={Math.max(1, sx(data.ecg.rPeaks[i + 1] ?? peak) - sx(peak))} height={8} fill="var(--usc-garnet)" opacity={0.08} />
      ))}

      <text x={28} y={156} className={styles.trackLabel}>Rolling RSA</text>
      <text x={28} y={174} className={styles.axisLabel}>HF ms²</text>
      <line x1={pad.left} x2={w - pad.right} y1={205 - (50 / 200) * 70} y2={205 - (50 / 200) * 70} stroke="var(--red)" strokeDasharray="5 5" />
      <path d={rsaPath} fill="none" stroke="var(--ocean)" strokeWidth={2.4} />

      <text x={28} y={276} className={styles.trackLabel}>HDA phase</text>
      {data.hda.epochs.map((epoch) => {
        const x = sx(epoch.start);
        const width = Math.max(2, sx(epoch.end) - x);
        return (
          <g key={`${epoch.start}-${epoch.phase}`}>
            <rect x={x} y={258} width={width} height={46} rx={4} fill={PHASE_COLOR[epoch.phase]} opacity={0.82} />
            {epoch.end - epoch.start > 2 && <text x={x + 6} y={286} className={styles.phaseText}>{epoch.phase}</text>}
          </g>
        );
      })}

      <text x={28} y={384} className={styles.trackLabel}>Gaze events</text>
      <line x1={pad.left} x2={w - pad.right} y1={398} y2={398} stroke="var(--warm-border)" strokeWidth={12} strokeLinecap="round" />
      {data.gaze.events.map((event) => (
        <rect
          key={`${event.t}-${event.target}`}
          x={sx(event.t)}
          y={378}
          width={Math.max(3, sx(event.t + event.duration) - sx(event.t))}
          height={40}
          rx={4}
          fill={GAZE_COLOR[event.target] ?? "var(--warm-border)"}
          opacity={event.target === "caregiver-face" ? 0.82 : 0.68}
        />
      ))}

      {windows.map((win) => (
        <rect
          key={`${win.start}-${win.end}`}
          x={sx(win.start)}
          y={26}
          width={Math.max(4, sx(win.end) - sx(win.start))}
          height={396}
          rx={6}
          fill="transparent"
          stroke="var(--usc-gold)"
          strokeWidth={2.5}
          strokeDasharray="7 5"
        />
      ))}
      <line x1={cursorX} x2={cursorX} y1={22} y2={456} stroke="var(--usc-garnet)" strokeWidth={2.2} />
      <text x={cursorX + 6} y={24} className={styles.axisLabel}>{Math.round(cursor)}s</text>
      <text x={w - pad.right} y={508} textAnchor="end" className={styles.axisLabel}>Shared x-axis · seconds</text>
    </svg>
  );
}

function sessionDuration(data: MultimodalSessionResponse | undefined): number {
  if (!data) return 0;
  return Math.max(
    data.ecg.t.at(-1) ?? 0,
    data.rsa.t.at(-1) ?? 0,
    ...data.hda.epochs.map((epoch) => epoch.end),
    ...data.gaze.events.map((event) => event.t + event.duration),
  );
}

function phaseAt(data: MultimodalSessionResponse, t: number): HdaPhase | null {
  return data.hda.epochs.find((epoch) => t >= epoch.start && t <= epoch.end)?.phase ?? null;
}

function gazeAt(data: MultimodalSessionResponse, t: number): string | null {
  return data.gaze.events.find((event) => t >= event.t && t <= event.t + event.duration)?.target ?? null;
}

function detectSynchrony(data: MultimodalSessionResponse | undefined): SynchronyWindow[] {
  if (!data) return [];
  const wins: SynchronyWindow[] = [];
  let active: SynchronyWindow | null = null;
  for (let index = 0; index < data.rsa.t.length; index += 1) {
    const t = data.rsa.t[index] ?? 0;
    const rsa = data.rsa.hfPower[index] ?? 0;
    const hit = rsa > 80 && phaseAt(data, t) === "sustained" && gazeAt(data, t) === "caregiver-face";
    if (hit && !active) {
      active = { start: t, end: t + 1, peakRsa: rsa };
    } else if (hit && active) {
      active.end = t + 1;
      active.peakRsa = Math.max(active.peakRsa, rsa);
    } else if (!hit && active) {
      if (active.end - active.start >= 2) wins.push(active);
      active = null;
    }
  }
  if (active && active.end - active.start >= 2) wins.push(active);
  return wins;
}
