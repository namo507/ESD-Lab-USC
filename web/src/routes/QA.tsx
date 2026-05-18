import { useEffect, useMemo, useReducer, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, Gloss, KPI, SectionLabel, Segmented } from "@/components/primitives";
import { EpochTile } from "@/components/qa/EpochTile";
import { EpochInspector } from "@/components/qa/EpochInspector";
import { epochReducer, tallyEpochs } from "@/components/qa/epochReducer";
import { useEpochs, useEpochDecision, useParticipants } from "@/api/hooks";
import { logAudit } from "@/lib/audit";
import { useUi } from "@/store/ui";
import { AmbientOrbit, FastPaths, type FastPathPrompt } from "@/components/warm";
import type { EpochDecision } from "@/api/schemas";
import styles from "./QA.module.css";

type FilterKey = "all" | "flagged" | "rejected";

const FILTER_OPTS: Array<{ value: FilterKey; label: string }> = [
  { value: "all", label: "all" },
  { value: "flagged", label: "flagged" },
  { value: "rejected", label: "rejected" },
];

const GRID_COLS = 8;

export function QA() {
  const { id } = useParams();
  const { data: participants = [] } = useParticipants();
  const subject = participants.find((p) => p.id === (id ?? "NANO-0102")) ?? participants[0];
  const visitId = subject ? `${subject.id}__${subject.visit}` : "demo-visit";

  const { data: serverEpochs } = useEpochs(visitId);
  const decisionMutation = useEpochDecision(visitId);

  const [epochs, dispatch] = useReducer(epochReducer, []);
  const [filter, setFilter] = useState<FilterKey>("all");
  const selected = useUi((s) => s.qaSelectedEpoch);
  const setSelected = useUi((s) => s.setQaEpoch);
  const setChatOpen = useUi((s) => s.setChatOpen);
  const setChatSeed = useUi((s) => s.setChatSeed);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (serverEpochs) dispatch({ type: "load", epochs: serverEpochs });
  }, [serverEpochs]);

  const filtered = useMemo(() => {
    if (filter === "all") return epochs;
    if (filter === "flagged") return epochs.filter((e) => e.flag !== "clean");
    return epochs.filter(
      (e) => e.decision === "reject" || e.flag === "noise" || e.flag === "flatline",
    );
  }, [epochs, filter]);

  const counts = useMemo(() => tallyEpochs(epochs), [epochs]);
  const ep = epochs[selected];
  const total = epochs.length;

  function setDecision(idx: number, decision: EpochDecision) {
    dispatch({ type: "set", idx, decision });
    void logAudit({ action: "epoch.decision", scope: visitId, detail: { idx, decision } });
    decisionMutation.mutate({ idx, decision });
  }

  function bulkAccept() {
    dispatch({ type: "auto_accept_clean" });
    void logAudit({ action: "epoch.decision", scope: visitId, detail: { bulk: "accept_clean" } });
  }
  function bulkReject() {
    dispatch({ type: "auto_reject_bad" });
    void logAudit({ action: "epoch.decision", scope: visitId, detail: { bulk: "reject_bad" } });
  }
  function clearAll() {
    dispatch({ type: "clear" });
  }

  // Keyboard shortcuts: A/R + arrow keys (roving tabindex within grid)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!total) return;
      // ignore typing into form fields
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA")) return;

      if (e.key === "a" || e.key === "A") {
        setDecision(selected, "accept");
      } else if (e.key === "r" || e.key === "R") {
        setDecision(selected, "reject");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelected(Math.min(total - 1, selected + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelected(Math.max(0, selected - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected(Math.min(total - 1, selected + GRID_COLS));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected(Math.max(0, selected - GRID_COLS));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, total]);

  if (!subject || !ep) {
    return <div className={styles.empty}>Loading visit…</div>;
  }

  const scopedFastPaths: FastPathPrompt[] = [
    { lane: "qa",     label: `Explain ${subject.id} epoch ${ep.idx}`, prompt: `Walk me through why epoch ${ep.idx} on ${subject.id} ${subject.visit} has SQI ${ep.sqi.toFixed(2)} and flag ${ep.flag}. Recommend accept or reject.` },
    { lane: "qa",     label: "Why SQI < 0.4 auto-reject",              prompt: "Why does this dashboard auto-reject epochs below SQI 0.4 and what edge cases still need a human pass?" },
    { lane: "qa",     label: "Yield target rationale",                 prompt: "What yield target should I expect for a cga_6mo visit, and what visit-level fixes raise it the fastest?" },
    { lane: "model",  label: "Effect on RMSSD",                        prompt: `If I keep my current accept/reject for ${subject.id} ${subject.visit}, how will the RMSSD point estimate shift versus the cohort baseline?` },
    { lane: "model",  label: "Downstream HDA risk",                    prompt: `Project the HDA phase classifier confidence shift for ${subject.id} given my current QA decisions on this visit.` },
    { lane: "redcap", label: "Push QA verdict to REDCap",              prompt: `Draft the REDCap visit_completion payload for ${subject.id} ${subject.visit} once I save these QA decisions.` },
    { lane: "redcap", label: "Visit metadata cross-check",              prompt: `Cross-check the REDCap visit metadata against the Actiheart-5 capture for ${subject.id} ${subject.visit}. Flag mismatched timestamps.` },
  ];

  function fastPath(prompt: string) {
    setChatSeed(prompt);
    setChatOpen(true);
    void logAudit({ action: "run.trigger", scope: "/qa/fast-path", detail: { visit: visitId } });
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrowRow}>
            <span className={`${styles.eyebrow} t-mono`}>QA review</span>
            <span className={styles.dot}>·</span>
            <span className={`${styles.scope} t-mono`}>{subject.id} · {subject.visit}</span>
          </div>
          <h1 className={styles.h1}>
            <Gloss term="Epoch">Epoch</Gloss>-by-epoch signal review
          </h1>
          <p className={styles.lede}>
            64 epochs · 5 s each · 5 min 20 s of ECG. Press <kbd className={styles.kbd}>A</kbd> accept · <kbd className={styles.kbd}>R</kbd> reject · <kbd className={styles.kbd}>← →</kbd> navigate.
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" icon="check" onClick={bulkAccept}>Auto-accept clean</Button>
          <Button variant="secondary" icon="x" onClick={bulkReject}>Auto-reject bad</Button>
          <Button variant="ghost" icon="rotate-ccw" onClick={clearAll}>Clear</Button>
          <Button icon="check-check">Save QA decisions</Button>
        </div>
      </header>

      <section className={styles.fastRow} aria-label="QA fast-paths">
        <div className={styles.fastRowInner}>
          <FastPaths tone="light" density="wide" prompts={scopedFastPaths} onSelect={fastPath} />
        </div>
        <AmbientOrbit
          tone="sage"
          size={150}
          opacity={0.28}
          spin={48}
          waveform
          className={styles.fastOrbit}
        />
      </section>

      <section className={styles.kpis}>
        <KPI label="Accepted" value={counts.accepted} unit={`/ ${total}`} sub="will feed HRV pipeline" />
        <KPI label="Needs review" value={counts.review} sub="0.4 ≤ SQI ≤ 0.7" gloss="SQI" />
        <KPI label="Rejected" value={counts.rejected} sub="excluded from features" />
        <KPI
          label="Median SQI"
          value={total ? (epochs.reduce((s, e) => s + e.sqi, 0) / total).toFixed(2) : "—"}
          sub="signal quality"
          gloss="SQI"
        />
        <KPI
          label="Yield"
          value={total ? `${((counts.accepted / total) * 100).toFixed(0)}%` : "—"}
          sub="usable for analysis"
          delta={counts.accepted >= total * 0.85 ? "above target" : "below target"}
          deltaKind={counts.accepted >= total * 0.85 ? "up" : "down"}
        />
      </section>

      <div className={styles.gridWrap}>
        <Card pad={20}>
          <div className={styles.gridHead}>
            <SectionLabel>Epoch grid · 8 × 8</SectionLabel>
            <Segmented<FilterKey> size="sm" options={FILTER_OPTS} value={filter} onChange={setFilter} />
          </div>

          <div
            ref={gridRef}
            role="grid"
            aria-label={`Epoch QA grid for ${subject.id} ${subject.visit}`}
            className={styles.grid}
          >
            {filtered.map((e) => (
              <EpochTile
                key={e.idx}
                epoch={e}
                selected={selected === e.idx}
                onClick={() => setSelected(e.idx)}
                tabIndex={selected === e.idx ? 0 : -1}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    setSelected(e.idx);
                  }
                }}
              />
            ))}
          </div>

          <div className={styles.legend}>
            <span className={styles.legendItem}><span className={styles.swatch} style={{ background: "var(--green)" }} /> SQI ≥ 0.7</span>
            <span className={styles.legendItem}><span className={styles.swatch} style={{ background: "var(--usc-gold)" }} /> 0.5–0.7</span>
            <span className={styles.legendItem}><span className={styles.swatch} style={{ background: "var(--amber)" }} /> 0.3–0.5</span>
            <span className={styles.legendItem}><span className={styles.swatch} style={{ background: "var(--red)" }} /> &lt; 0.3</span>
            <span className={`${styles.legendNote} t-mono`}>auto-thresh: SQI &lt; 0.4</span>
            <AmbientOrbit
              tone="ocean"
              size={64}
              opacity={0.45}
              spin={32}
              className={styles.legendOrbit}
            />
          </div>
        </Card>

        <EpochInspector
          epoch={ep}
          total={total}
          onDecision={setDecision}
          onPrev={() => setSelected(Math.max(0, selected - 1))}
          onNext={() => setSelected(Math.min(total - 1, selected + 1))}
        />
      </div>
    </div>
  );
}
