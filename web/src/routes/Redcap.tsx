import { useState } from "react";
import { Badge, Button, Card, Gloss, KPI, SectionLabel } from "@/components/primitives";
import { useRedcapCompleteness, useRedcapEvents } from "@/api/hooks";
import { AmbientOrbit, FastPaths, type FastPathPrompt } from "@/components/warm";
import { resolveTheme, useUi } from "@/store/ui";
import { logAudit } from "@/lib/audit";
import { exportCsvFile } from "@/lib/exportCsv";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { RedcapCompletenessRow } from "@/api/schemas";
import { formPolicyLabel, questionnaireKind, questionnaireLabel, riskKind } from "@/lib/participantOperations";
import styles from "./Redcap.module.css";

const REDCAP_FAST_PATHS: FastPathPrompt[] = [
  { lane: "redcap", label: "Last-hour fail triage",   prompt: "Triage every REDCap sync that failed in the last hour. Group by form, surface the auth or schema cause, and recommend a fix order." },
  { lane: "redcap", label: "PHI column audit",        prompt: "Re-audit the PHI gate on every form in the active project. Flag any field where the strip rule is unset or stale." },
  { lane: "redcap", label: "Missing DOB · open",      prompt: "List every open Intake record missing DOB or MRN. Group by site and surface the assigned coordinator." },
  { lane: "redcap", label: "Dual AIH/EH policy",      prompt: "Explain the dual-enrollment AIH and EH form policy. When do we use one shared master form, and when do duplicate study-specific forms need a linking ID?" },
  { lane: "redcap", label: "Packet cross-check",      prompt: "Before scheduling a dual-enrolled participant, what enrollment-type, packet, questionnaire, and REDCap checks should staff complete?" },
  { lane: "qa",     label: "Sync vs QA mismatch",     prompt: "Cross-check tonight's REDCap visit_completion flags against QA epoch decisions. Flag any visit where REDCap says complete but QA yield is below 75%." },
  { lane: "qa",     label: "Bayley-4 missingness",    prompt: "Build a missingness heatmap for Bayley-4 across active visits and rank the worst-offending fields." },
  { lane: "model",  label: "Feature freshness",       prompt: "Which classifier features depend on REDCap fields that have not synced in 48 h? Rank by SHAP importance." },
  { lane: "model",  label: "Cohort drift on sync gap", prompt: "Quantify how a 24 h REDCap sync gap shifts the VPT vs TD cohort feature distributions." },
];

interface FieldRow {
  k: string;
  v: string;
  phi: boolean;
}

const FIELD_MAP: FieldRow[] = [
  { k: "study_id",     v: "NANO-XXXX",    phi: false },
  { k: "dob",          v: "YYYY-MM-DD",   phi: true },
  { k: "sex",          v: "M | F | X",    phi: false },
  { k: "cga_wks",      v: "float",        phi: false },
  { k: "mrn",          v: "string",       phi: true },
  { k: "caregiver_id", v: "NANO-CG-XXXX", phi: false },
  { k: "site",         v: "enum",         phi: false },
];

export function Redcap() {
  const { data: events = [] } = useRedcapEvents();
  const okN = events.filter((e) => e.status === "ok").length;
  const warnN = events.filter((e) => e.status === "warn").length;
  const failN = events.filter((e) => e.status === "fail").length;
  const theme = useUi((s) => s.theme);
  const setChatOpen = useUi((s) => s.setChatOpen);
  const setChatSeed = useUi((s) => s.setChatSeed);
  const fastPathTone = resolveTheme(theme);

  function fastPath(prompt: string) {
    setChatSeed(prompt);
    setChatOpen(true);
    void logAudit({ action: "run.trigger", scope: "/redcap/fast-path" });
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>REDCap sync</span>
          <h1 className={styles.h1}>
            <Gloss term="RedCap">REDCap</Gloss> · forms &amp; metadata
          </h1>
          <p className={styles.lede}>
            Bidirectional sync with the NANO REDCap project. Pulls visit metadata, pushes processed flags. PHI columns are stripped before any export.
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" icon="key">Rotate token</Button>
          <Button icon="refresh-cw">Sync now</Button>
        </div>
      </header>

      <section className={styles.fastRow} aria-label="REDCap fast-paths">
        <div className={styles.fastRowInner}>
          <FastPaths tone={fastPathTone} density="wide" prompts={REDCAP_FAST_PATHS} onSelect={fastPath} />
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
        <KPI label="Forms tracked" value="14" sub="versioned · v1–v4" insightId="redcap-forms" />
        <KPI label="Records · 24 h" value="25" sub="pulled and pushed" delta={`+${okN}`} deltaKind="up" insightId="redcap-records" />
        <KPI label="Warnings" value={warnN} sub="missing fields · review" delta="needs eye" deltaKind="flat" insightId="redcap-warnings" />
        <KPI
          label="Failures"
          value={failN}
          sub="auto-retry queued"
          delta={failN ? "needs auth" : "clear"}
          deltaKind={failN ? "down" : "up"}
          insightId="redcap-failures"
        />
      </section>

      <RedcapCompletenessScorecard />

      <div className={styles.split}>
        <Card pad={0}>
          <div className={styles.listHead}>
            <SectionLabel>Sync events · last 1 h</SectionLabel>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">REDCap sync events.</caption>
              <thead>
                <tr>
                  {["Time", "Form", "n", "Status", "Note"].map((h) => (
                    <th key={h} scope="col" className={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i}>
                    <td className={`${styles.td} t-mono ${styles.muted}`}>{e.ts}</td>
                    <td className={`${styles.td} t-mono`}>{e.form}</td>
                    <td className={`${styles.td} t-num t-mono`}>{e.n}</td>
                    <td className={styles.td}>
                      <Badge kind={e.status === "ok" ? "ok" : e.status === "warn" ? "warn" : "fail"} size="sm">{e.status}</Badge>
                    </td>
                    <td className={`${styles.td} ${styles.note}`}>{e.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card pad={20}>
          <div className={styles.fieldMapWrap}>
            <AmbientOrbit
              tone="garnet"
              size={140}
              opacity={0.16}
              spin={48}
              className={styles.fieldOrbit}
            />
          <SectionLabel>Field map · medical_history_v1</SectionLabel>
          <div className={`${styles.fieldMap} t-mono`}>
            {FIELD_MAP.map((f) => (
              <div key={f.k} className={styles.fieldRow}>
                <span className={styles.fieldKey}>{f.k}</span>
                <span className={styles.fieldVal}>{f.v}</span>
                {f.phi
                  ? <Badge kind="phi" size="sm">PHI · stripped</Badge>
                  : <Badge kind="ok" size="sm">ok</Badge>}
              </div>
            ))}
          </div>
          <div className={styles.privacyNote}>
            PHI fields never leave the secure REDCap proxy — only hashed/derived columns are written to{" "}
            <code className="t-mono">processed/deidentified/</code>.
          </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function RedcapCompletenessScorecard() {
  const enabled = useFeatureFlag("REDCAP_COMPLETENESS");
  const { data } = useRedcapCompleteness();
  const [selected, setSelected] = useState<RedcapCompletenessRow | null>(null);
  if (!enabled) return null;

  const deadline = import.meta.env.VITE_NDA_DEADLINE ?? "2026-08-01";
  const rows = data?.data ?? [];
  const required = rows.filter((row) => row.ndaRequired);
  const missingCount = required.reduce((sum, row) => sum + row.requiredMissing, 0);
  const instruments = Array.from(new Set(required.map((row) => row.instrument))).slice(0, 6);
  const participants = Array.from(new Set(required.map((row) => row.nanoId))).slice(0, 9);
  const byInstrument = instruments.map((instrument) => {
    const instRows = required.filter((row) => row.instrument === instrument);
    const avg = instRows.reduce((sum, row) => sum + row.completenessPct, 0) / Math.max(1, instRows.length);
    return { instrument, avg };
  });
  const completeCells = required.filter((row) => row.status === "complete").length;
  const watchCells = required.filter((row) => row.status === "watch").length;
  const missingCells = required.filter((row) => row.status === "missing").length;
  const workflowCounts = {
    complete: required.filter((row) => (row.workflowState ?? row.status) === "complete").length,
    due: required.filter((row) => row.workflowState === "due").length,
    missing: required.filter((row) => (row.workflowState ?? row.status) === "missing").length,
    did_not_qualify: required.filter((row) => row.workflowState === "did_not_qualify").length,
    other: required.filter((row) => row.workflowState === "other").length,
  };
  const dualRows = required.filter((row) => row.enrollmentType === "dual").length;
  const avgCompleteness = required.reduce((sum, row) => sum + row.completenessPct, 0) / Math.max(1, required.length);

  return (
    <Card pad={0}>
      {missingCount > 0 && (
        <div className={styles.deadlineAlert}>
          {missingCount} NDA-required REDCap fields are still missing before {deadline}.
        </div>
      )}
      <div className={styles.listHead}>
        <SectionLabel>Completeness scorecard · NDA-required forms</SectionLabel>
        <Button
          size="sm"
          variant="secondary"
          icon="download"
          onClick={() => exportCsvFile(required as unknown as Array<Record<string, unknown>>, "redcap-completeness.csv")}
        >
          Export CSV
        </Button>
      </div>
      <div className={styles.matrixKpis}>
        <KPI label="Average complete" value={`${avgCompleteness.toFixed(1)}%`} sub="NDA forms" insightId="redcap-completeness-matrix" />
        <KPI label="Complete cells" value={completeCells} sub="ready" deltaKind="up" />
        <KPI label="Partial cells" value={watchCells} sub="review" deltaKind="flat" />
        <KPI label="Missing cells" value={missingCells} sub="before NDA" deltaKind="down" />
        <KPI label="Dual rows" value={dualRows} sub="cross-study forms" deltaKind={dualRows ? "flat" : "up"} />
      </div>
      <div className={styles.stateChecklist} data-insight="redcap-workflow-states">
        {(["complete", "due", "missing", "did_not_qualify", "other"] as const).map((state) => (
          <label key={state} className={styles.stateItem}>
            <input type="checkbox" checked readOnly />
            <span>{questionnaireLabel(state)}</span>
            <Badge kind={questionnaireKind(state)} size="sm">{workflowCounts[state]}</Badge>
          </label>
        ))}
      </div>
      <div className={styles.scoreBars}>
        {byInstrument.map((item) => (
          <div key={item.instrument} className={styles.scoreBar}>
            <div className={`${styles.scoreMeta} t-mono`}><span>{item.instrument}</span><span>{item.avg.toFixed(1)}%</span></div>
            <div className={styles.scoreTrack}><span style={{ width: `${item.avg}%` }} /></div>
          </div>
        ))}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="sr-only">Participant by instrument REDCap completeness matrix.</caption>
          <thead>
            <tr>
              <th className={styles.th}>Participant</th>
              {instruments.map((instrument) => <th key={instrument} className={styles.th}>{instrument}</th>)}
            </tr>
          </thead>
          <tbody>
            {participants.map((nanoId) => (
              <tr key={nanoId}>
                <td className={`${styles.td} t-mono`}>{nanoId}</td>
                {instruments.map((instrument) => {
                  const cell = required.find((row) => row.nanoId === nanoId && row.instrument === instrument);
                  return (
                    <td key={instrument} className={`${styles.td} t-mono`}>
                      <button
                        type="button"
                        className={cell?.status === "complete" ? styles.cellOk : cell?.status === "watch" ? styles.cellWarn : cell ? styles.cellFail : styles.cellUnscheduled}
                        onClick={() => cell && setSelected(cell)}
                        aria-label={cell ? `${cell.nanoId} ${cell.instrument} ${cell.workflowState ?? cell.status}` : `${nanoId} ${instrument} unscheduled`}
                      >
                        {cell ? `${cell.completenessPct.toFixed(0)}%` : "—"}
                      </button>
                      {cell?.workflowState && cell.workflowState !== cell.status && (
                        <div className={styles.workflowState}>{questionnaireLabel(cell.workflowState)}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.hipaaReminder}>
        IRB #Pro00115234 · Completeness review uses de-identified NANO IDs only. Open REDCap from the secure study network for source records.
      </div>
      {selected && (
        <aside className={styles.matrixDrawer} aria-label="REDCap cell detail">
          <div className={styles.drawerHead}>
            <SectionLabel>Cell detail</SectionLabel>
            <button type="button" className={styles.drawerClose} onClick={() => setSelected(null)} aria-label="Close detail">x</button>
          </div>
          <div className={styles.drawerBody}>
            <div><strong>{selected.nanoId}</strong></div>
            <div className="t-mono">{selected.instrument}</div>
            <div className={styles.drawerBadges}>
              <Badge kind={selected.status === "complete" ? "ok" : selected.status === "watch" ? "warn" : "fail"} size="sm">
                {selected.status === "watch" ? "partial" : selected.status}
              </Badge>
              <Badge kind={questionnaireKind(selected.workflowState ?? selected.status)} size="sm">
                {questionnaireLabel(selected.workflowState ?? selected.status)}
              </Badge>
              {selected.schedulingRisk && <Badge kind={riskKind(selected.schedulingRisk)} size="sm">{selected.schedulingRisk} risk</Badge>}
            </div>
            <p>
              {selected.requiredMissing} of {selected.requiredTotal} required fields missing.
              {selected.dueDate ? ` NDA due ${selected.dueDate}.` : " Not NDA-required."}
            </p>
            <div className={styles.drawerContext}>
              <div><span>Enrollment</span><strong>{selected.enrollmentType ?? "single"}</strong></div>
              <div><span>Studies</span><strong>{selected.studies?.join(" + ") ?? "NANO"}</strong></div>
              <div><span>Visit type</span><strong>{selected.visitType ?? "CGA longitudinal"}</strong></div>
              <div><span>Form policy</span><strong>{formPolicyLabel(selected.formPolicy)}</strong></div>
              <div><span>Linking ID</span><strong className="t-mono">{selected.linkingId ?? "not needed"}</strong></div>
            </div>
            <Button size="sm" icon="external-link" onClick={() => window.open("https://redcap.healthsciencessc.org", "_blank", "noopener,noreferrer")}>
              Open in REDCap
            </Button>
          </div>
        </aside>
      )}
    </Card>
  );
}
