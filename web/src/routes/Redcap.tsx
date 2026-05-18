import { Badge, Button, Card, Gloss, KPI, SectionLabel } from "@/components/primitives";
import { useRedcapEvents } from "@/api/hooks";
import { AmbientOrbit, FastPaths, type FastPathPrompt } from "@/components/warm";
import { useUi } from "@/store/ui";
import { logAudit } from "@/lib/audit";
import styles from "./Redcap.module.css";

const REDCAP_FAST_PATHS: FastPathPrompt[] = [
  { lane: "redcap", label: "Last-hour fail triage",   prompt: "Triage every REDCap sync that failed in the last hour. Group by form, surface the auth or schema cause, and recommend a fix order." },
  { lane: "redcap", label: "PHI column audit",        prompt: "Re-audit the PHI gate on every form in the active project. Flag any field where the strip rule is unset or stale." },
  { lane: "redcap", label: "Missing DOB · open",      prompt: "List every open Intake record missing DOB or MRN. Group by site and surface the assigned coordinator." },
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
  const setChatOpen = useUi((s) => s.setChatOpen);
  const setChatSeed = useUi((s) => s.setChatSeed);

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
          <FastPaths tone="light" density="wide" prompts={REDCAP_FAST_PATHS} onSelect={fastPath} />
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
