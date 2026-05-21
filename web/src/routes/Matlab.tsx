import { useMemo } from "react";
import { Badge, Button, Card, Gloss, KPI, SectionLabel } from "@/components/primitives";
import { AmbientOrbit, FastPaths, type FastPathPrompt } from "@/components/warm";
import { useMatlabIntegration } from "@/api/hooks";
import { useUi } from "@/store/ui";
import { logAudit } from "@/lib/audit";
import styles from "./Matlab.module.css";

/**
 * MATLAB Bridge.
 *
 * Mirrors the REDCap Sync surface so jump atlas, sidebar, and AI Buddy
 * continuity stay intact. Visual language, ambient orbit, and KPI grid all
 * reuse the existing primitives so symmetry with /overview and /redcap is
 * preserved. The page is data-driven by `useMatlabIntegration`, which reads
 * the `matlab_integration` block emitted by both the synthetic generator
 * and the production builder (manifest.json under data/interim/matlab/).
 */

const MATLAB_FAST_PATHS: FastPathPrompt[] = [
  { lane: "matlab", label: "Manifest schema",         prompt: "Walk me through every field in data/interim/matlab/manifest.json and how the Python merge consumes it." },
  { lane: "matlab", label: "Run HRV export",          prompt: "Show me the exact MATLAB sequence to refresh hrv_dense.parquet, including the secure mount checks." },
  { lane: "matlab", label: "Engine vs file handoff",  prompt: "When should we move from Parquet handoff to the MATLAB Engine for Python path? What is the latency win?" },
  { lane: "matlab", label: "Stale parquet triage",    prompt: "If hrv_dense.parquet is older than 24 h, what should I check first? Walk me through the runbook." },
  { lane: "qa",     label: "QA flag mapping",         prompt: "How do MATLAB qa_flag values (excellent / good / marginal / reject) line up with the Window QA tiles?" },
  { lane: "model",  label: "Feature freshness map",   prompt: "Which model features depend on the MATLAB exports, and what is the impact if hda_phases.parquet is missing?" },
  { lane: "redcap", label: "Cross-stream merge key",  prompt: "Confirm the merge key (study_id, event) the Python pipeline uses to join MATLAB Parquet with the REDCap mirror." },
];

const FEATURE_BADGE: Record<string, string> = {
  hrv: "HRV",
  temp: "Temp",
  hda: "HDA",
  orchestrator: "Orchestrator",
};

function fmtRows(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function relMinutes(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export function Matlab() {
  const { data: integration } = useMatlabIntegration();
  const setChatOpen = useUi((s) => s.setChatOpen);
  const setChatSeed = useUi((s) => s.setChatSeed);

  function fastPath(prompt: string) {
    setChatSeed(prompt);
    setChatOpen(true);
    void logAudit({ action: "run.trigger", scope: "/matlab/fast-path" });
  }

  const files = integration?.files ?? [];
  const scripts = integration?.scripts ?? [];
  const throughput = integration?.throughput_24h ?? { hours: [], rows: [] };
  const options = integration?.options ?? [];
  const manifest = integration?.manifest;

  const totalRows = useMemo(() => files.reduce((s, f) => s + f.rows, 0), [files]);
  const avgQa = useMemo(() => {
    if (!files.length) return 0;
    return files.reduce((s, f) => s + f.qa_pass_pct, 0) / files.length;
  }, [files]);
  const okScripts = scripts.filter((s) => s.status === "ok").length;

  const sparkPath = useMemo(() => {
    const rows = throughput.rows;
    if (!rows.length) return "";
    const w = 240, h = 56, pad = 4;
    const max = Math.max(...rows, 1);
    return rows
      .map((v, i) => {
        const x = pad + (i / (rows.length - 1)) * (w - pad * 2);
        const y = h - pad - (v / max) * (h - pad * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [throughput]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>MATLAB bridge</span>
          <h1 className={styles.h1}>
            <Gloss term="MATLAB">MATLAB</Gloss> · dense signals &amp; derived features
          </h1>
          <p className={styles.lede}>
            Bridges the densely sampled physiological signals computed in MATLAB into the same dashboard JSON that REDCap and the feature matrix feed. Parquet handoff is the default. Engine and REST paths are documented for click-time inference.
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" icon="terminal">Open run_all.m</Button>
          <Button icon="refresh-cw">Refresh manifest</Button>
        </div>
      </header>

      <section className={styles.fastRow} aria-label="MATLAB fast-paths">
        <div className={styles.fastRowInner}>
          <FastPaths tone="light" density="wide" prompts={MATLAB_FAST_PATHS} onSelect={fastPath} />
        </div>
        <AmbientOrbit
          tone="garnet"
          size={170}
          opacity={0.22}
          spin={42}
          waveform
          className={styles.fastOrbit}
        />
      </section>

      <section className={styles.kpis}>
        <KPI
          label="Parquet files"
          value={String(files.length)}
          sub="hrv · temp · hda streams"
          delta={files.length ? "live" : "idle"}
          deltaKind={files.length ? "up" : "flat"}
          insightId="matlab-files"
        />
        <KPI
          label="Rows · merged"
          value={fmtRows(totalRows)}
          sub="rolled into nano_analysis_dataset"
          delta="+1.2k / hr"
          deltaKind="up"
          insightId="matlab-rows"
        />
        <KPI
          label="QA pass · avg"
          value={`${(avgQa * 100).toFixed(1)}%`}
          sub="weighted across feature families"
          delta={avgQa > 0.9 ? "healthy" : "review"}
          deltaKind={avgQa > 0.9 ? "up" : "flat"}
          insightId="matlab-qa"
        />
        <KPI
          label="Scripts · ok"
          value={`${okScripts} / ${scripts.length}`}
          sub="last run within the hour"
          delta={okScripts === scripts.length ? "clear" : "needs eye"}
          deltaKind={okScripts === scripts.length ? "up" : "flat"}
          insightId="matlab-scripts"
        />
      </section>

      <div className={styles.split}>
        <Card pad={0}>
          <div className={styles.listHead}>
            <SectionLabel>Parquet inventory · data/interim/matlab/</SectionLabel>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">MATLAB Parquet files.</caption>
              <thead>
                <tr>
                  {["File", "Feature", "Rows", "QA pass", "Status"].map((h) => (
                    <th key={h} scope="col" className={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.name}>
                    <td className={`${styles.td} t-mono`}>{f.name}</td>
                    <td className={styles.td}>
                      <Badge kind="ok" size="sm">{FEATURE_BADGE[f.feature] ?? f.feature}</Badge>
                    </td>
                    <td className={`${styles.td} t-num t-mono`}>{f.rows.toLocaleString()}</td>
                    <td className={`${styles.td} t-num t-mono`}>{(f.qa_pass_pct * 100).toFixed(1)}%</td>
                    <td className={styles.td}>
                      <Badge kind={f.qa_pass_pct >= 0.9 ? "ok" : "warn"} size="sm">
                        {f.qa_pass_pct >= 0.9 ? "healthy" : "review"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.listFoot}>
            <span className="t-mono">
              manifest · {manifest?.matlab_version ?? "—"} · host {manifest?.host ?? "—"} · epoch {manifest?.epoch_sec ?? 60}s
            </span>
            <Badge kind={manifest?.source === "synthetic_demo" ? "warn" : "ok"} size="sm">
              {manifest?.source ?? "unknown"}
            </Badge>
          </div>
        </Card>

        <Card pad={20}>
          <div className={styles.scriptsWrap}>
            <AmbientOrbit
              tone="garnet"
              size={140}
              opacity={0.16}
              spin={48}
              className={styles.scriptsOrbit}
            />
            <SectionLabel>MATLAB scripts · last hour</SectionLabel>
            <div className={`${styles.scriptList} t-mono`}>
              {scripts.map((s) => (
                <div key={s.name} className={styles.scriptRow}>
                  <span className={styles.scriptName}>{s.name}</span>
                  <span className={styles.scriptMeta}>
                    {FEATURE_BADGE[s.feature] ?? s.feature} · {s.lines} lines
                  </span>
                  <span className={styles.scriptDur}>{s.duration_s.toFixed(1)}s</span>
                  <Badge kind={s.status === "ok" ? "ok" : s.status === "warn" ? "warn" : "fail"} size="sm">
                    {s.status}
                  </Badge>
                  <span className={styles.scriptAge}>{relMinutes(s.last_run)}</span>
                </div>
              ))}
            </div>
            <div className={styles.privacyNote}>
              Raw signals never leave the secure mount. MATLAB only writes derived,{" "}
              <code className="t-mono">study_id</code>-keyed feature tables that the Python merge picks up on the next <code className="t-mono">make dashboard-refresh</code>.
            </div>
          </div>
        </Card>
      </div>

      <section className={styles.throughputBlock} aria-label="MATLAB throughput · last 24 h">
        <div className={styles.throughputCopy}>
          <SectionLabel>Throughput · last 24 h</SectionLabel>
          <h2 className={styles.throughputH}>Rows per hour landed in <code className="t-mono">data/interim/matlab/</code></h2>
          <p className={styles.throughputLede}>
            Tracks every Parquet write across the three feature families. Spikes coincide with batched HRV reprocessing after a clinic afternoon. Flat windows usually mean the secure mount was offline.
          </p>
        </div>
        <div className={styles.sparkWrap} role="img" aria-label="24-hour throughput sparkline">
          {sparkPath ? (
            <svg viewBox="0 0 240 56" preserveAspectRatio="none" className={styles.sparkSvg}>
              <defs>
                <linearGradient id="matlabFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--usc-garnet)" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="var(--usc-garnet)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${sparkPath} L240,56 L0,56 Z`} fill="url(#matlabFill)" />
              <path d={sparkPath} fill="none" stroke="var(--usc-garnet)" strokeWidth="1.6" />
              <circle r="2.5" fill="var(--usc-garnet)" className={styles.sparkPulse}>
                <animateMotion dur="6s" repeatCount="indefinite" path={sparkPath} />
              </circle>
            </svg>
          ) : (
            <div className={styles.sparkSvg} aria-hidden />
          )}
          <div className={styles.sparkAxis}>
            <span>{throughput.hours[0] ?? "—"}</span>
            <span>now</span>
          </div>
        </div>
      </section>

      <section className={styles.options} aria-label="MATLAB integration options">
        {options.map((opt) => (
          <article key={opt.id} className={`${styles.opt} ${opt.id === "file" ? styles.optRec : ""}`}>
            <header className={styles.optHead}>
              <h3 className={styles.optTitle}>{opt.title}</h3>
              <Badge kind={opt.id === "file" ? "ok" : opt.id === "engine" ? "warn" : "phi"} size="sm">
                {opt.tag}
              </Badge>
            </header>
            <p className={styles.optBody}>{opt.summary}</p>
            <dl className={styles.optMeta}>
              <div><dt>Coupling</dt><dd>{opt.coupling}</dd></div>
              <div><dt>Cost</dt><dd>{opt.cost}</dd></div>
            </dl>
          </article>
        ))}
      </section>

      <footer className={styles.bottomBar}>
        <span className="t-mono">
          Bridge contract · same JSON schema in synthetic and live runs · PHI gated at the secure mount
        </span>
        <Button
          variant="secondary"
          icon="message-square"
          onClick={() => fastPath(MATLAB_FAST_PATHS[0]?.prompt ?? "Explain the MATLAB bridge.")}
        >
          Ask ESD Buddy
        </Button>
      </footer>
    </div>
  );
}
