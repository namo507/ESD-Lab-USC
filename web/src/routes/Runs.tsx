import { useEffect, useState } from "react";
import { Badge, Button, Card, Icon, SectionLabel } from "@/components/primitives";
import { useRuns, useTriggerRun } from "@/api/hooks";
import { logAudit } from "@/lib/audit";
import styles from "./Runs.module.css";

interface LogLine {
  t: string;
  lvl: "info" | "ok" | "warn" | "fail";
  msg: string;
}

const SAMPLE_LOG: LogLine[] = [
  { t: "09:12:04", lvl: "info", msg: "▶ run_2026_115_a started by jbradshaw · scope=auto · n=18 visits" },
  { t: "09:12:05", lvl: "info", msg: "  config: pipeline.yaml · branch=main · commit=8a3f1c" },
  { t: "09:12:08", lvl: "info", msg: "[ingest] 18/18 .ecg files located in /raw/2026-04-25/" },
  { t: "09:12:12", lvl: "ok",   msg: "[ingest] 18 files validated · 1024 Hz · ch I" },
  { t: "09:14:38", lvl: "info", msg: "[preprocess] 0.5–40 Hz bandpass · Pan-Tompkins R-peak detection" },
  { t: "09:21:14", lvl: "warn", msg: "[preprocess] NANO-0134 cga_6mo · 60 % epochs flagged motion · proceeding" },
  { t: "09:24:41", lvl: "ok",   msg: "[preprocess] 18 visits · 1,786 windows · 38 rejected (2.1 %)" },
  { t: "09:26:02", lvl: "info", msg: "[qa] auto-thresholding @ SQI=0.4 · 1,641 accepted · 145 surfaced for review" },
  { t: "09:41:20", lvl: "info", msg: "[hrv] computing RMSSD, SDNN, pNN50, LF/HF · 8 workers" },
  { t: "09:48:55", lvl: "info", msg: "[hrv] 524 / 1,786 windows ..." },
  { t: "09:54:11", lvl: "info", msg: "[hrv] 847 / 1,786 windows ..." },
  { t: "09:58:02", lvl: "info", msg: "[hda] queued · awaiting hrv completion" },
];

const LVL_COLOR: Record<LogLine["lvl"], string> = {
  info: "var(--slate-500)",
  ok: "var(--green)",
  warn: "var(--usc-gold)",
  fail: "var(--red)",
};

/**
 * Real implementation subscribes to /api/runs/:id/logs (text/event-stream).
 * Mock backend has no SSE stream, so we replay SAMPLE_LOG with a timer when
 * the active run has status "running". When real backend is reachable, swap
 * the timer for `new EventSource("/api/runs/" + id + "/logs")`.
 */
function useRunLogs(runId: string | undefined, isRunning: boolean): LogLine[] {
  const [logs, setLogs] = useState<LogLine[]>(SAMPLE_LOG.slice(0, 8));
  useEffect(() => {
    if (!runId) return;
    if (!isRunning || logs.length >= SAMPLE_LOG.length) return;
    const id = window.setTimeout(() => setLogs(SAMPLE_LOG.slice(0, logs.length + 1)), 1400);
    return () => window.clearTimeout(id);
  }, [runId, isRunning, logs.length]);
  return logs;
}

export function Runs() {
  const { data: runs = [] } = useRuns(20);
  const [activeId, setActive] = useState<string | undefined>(runs[0]?.id);
  const [showLaunch, setShowLaunch] = useState(false);
  const [scope, setScope] = useState("auto · all visits ready");
  const trigger = useTriggerRun();

  useEffect(() => {
    if (!activeId && runs[0]) setActive(runs[0].id);
  }, [activeId, runs]);

  const run = runs.find((r) => r.id === activeId) ?? runs[0];
  const logs = useRunLogs(run?.id, run?.status === "running");

  function launch() {
    void logAudit({ action: "run.trigger", scope });
    trigger.mutate({ scope, stages: "all", workers: 8 });
    setShowLaunch(false);
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Pipeline runs</span>
          <h1 className={styles.h1}>Run history &amp; live logs</h1>
          <p className={styles.lede}>Trigger a run, watch it stream, or replay any past job.</p>
        </div>
        <Button icon="play" onClick={() => setShowLaunch(true)}>Run pipeline</Button>
      </header>

      {showLaunch && (
        <Card pad={20} className={styles.launch}>
          <div className={styles.launchHead}>
            <SectionLabel>New run</SectionLabel>
            <button onClick={() => setShowLaunch(false)} className={styles.close} type="button" aria-label="Close launch panel">
              <Icon name="x" size={14} color="var(--slate-500)" />
            </button>
          </div>
          <div className={styles.launchGrid}>
            <div>
              <div className={styles.launchLabel}>Scope</div>
              <input
                className={styles.input}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                aria-label="Run scope"
              />
            </div>
            <div>
              <div className={styles.launchLabel}>Stages</div>
              <select className={styles.select} aria-label="Stages">
                <option>all stages</option>
                <option>preprocess → hda</option>
                <option>qa only</option>
              </select>
            </div>
            <div>
              <div className={styles.launchLabel}>Workers</div>
              <select className={styles.select} aria-label="Workers">
                <option>8 (default)</option>
                <option>4</option>
                <option>16</option>
              </select>
            </div>
            <Button icon="play" onClick={launch}>Launch</Button>
          </div>
          <div className={styles.hipaaNote}>
            HIPAA: only de-identified outputs will be written to{" "}
            <code className="t-mono">data/processed/deidentified/</code>.
          </div>
        </Card>
      )}

      <div className={styles.body}>
        <Card pad={0}>
          <div className={styles.listHead}>
            <SectionLabel>Recent runs</SectionLabel>
          </div>
          <ul className={styles.list}>
            {runs.map((r) => {
              const sel = r.id === activeId;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setActive(r.id)}
                    className={`${styles.listItem} ${sel ? styles.listItemSel : ""}`}
                    aria-pressed={sel}
                  >
                    <div className={styles.listRow}>
                      <span className={`${styles.runId} t-mono`}>{r.id}</span>
                      <Badge size="sm" kind={r.status === "done" ? "ok" : r.status === "fail" ? "fail" : r.status === "running" ? "info" : "neutral"}>
                        {r.status}
                      </Badge>
                    </div>
                    <div className={styles.runScope}>{r.scope}</div>
                    <div className={`${styles.runMeta} t-mono`}>
                      <span>{r.triggered}</span><span>{r.duration}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card pad={0}>
          {run && (
            <>
              <div className={styles.detailHead}>
                <div>
                  <SectionLabel>{run.id} · {run.scope}</SectionLabel>
                  <div className={`${styles.detailMeta} t-mono`}>
                    by {run.actor} · stage {run.stage} · {run.duration}
                  </div>
                </div>
                <div className={styles.detailActions}>
                  <Button variant="secondary" size="sm" icon="rotate-ccw">Replay</Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon="square"
                    onClick={() => void logAudit({ action: "run.stop", scope: run.id })}
                  >
                    Stop
                  </Button>
                </div>
              </div>
              <div className={styles.terminal} role="log" aria-live="polite" aria-label="Run log stream">
                {logs.map((l, i) => (
                  <div key={i} className={styles.logRow}>
                    <span className={styles.logTs}>{l.t}</span>
                    <span className={styles.logLvl} style={{ color: LVL_COLOR[l.lvl] }}>{l.lvl.toUpperCase()}</span>
                    <span>{l.msg}</span>
                  </div>
                ))}
                {logs.length < SAMPLE_LOG.length && run.status === "running" && (
                  <div className={styles.streaming}>
                    <span className="pulse-dot" style={{ display: "inline-block", width: 6, height: 6, background: "var(--blue)", borderRadius: "50%", marginRight: 6 }} />
                    streaming...
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
