import { Link, useLocation } from "react-router-dom";
import { ArrowRight, BookOpen, HelpCircle, Sparkles } from "lucide-react";
import { Buddy } from "@/components/shell/Buddy";
import { ChatDrawer } from "@/components/shell/ChatDrawer";
import { SkinToggle } from "@/components/shell/SkinToggle";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { startNanoTour } from "@/components/help/tourEvents";
import {
  DATA_LAYERS,
  DOC_ROUTE,
  GLOSSARY_TERMS,
  HOW_TO_ROUTE,
  LANDING_REFERENCES,
  OPERATOR_REFERENCES,
  TODO_GLOSSARY_TERMS,
} from "@/data/helpContent";
import { useHdaDist, useParticipants, useRuns, useStages, useStudySummary, useTrajectory } from "@/api/hooks";
import { fromDiscoveryPath, isDiscoveryPath, toDiscoveryRoute } from "@/lib/discoveryRoutes";
import { useUi } from "@/store/ui";
import styles from "./Docs.module.css";

const DOC_TOC = [
  { id: "overview", label: "Overview" },
  { id: "surfaces", label: "The two surfaces" },
  { id: "glossary", label: "Glossary" },
  { id: "architecture", label: "Data architecture" },
  { id: "landing", label: "Public landing reference" },
  { id: "operator", label: "Operator console reference" },
  { id: "assistant", label: "Assistant" },
  { id: "compliance", label: "Compliance and privacy" },
  { id: "refresh", label: "Data sources and refresh" },
  { id: "automation", label: "Automation notes" },
] as const;

function stat(value: number | undefined, digits = 0): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "loads live";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function HelpNav() {
  const location = useLocation();
  const setChatOpen = useUi((state) => state.setChatOpen);
  const setChatSeed = useUi((state) => state.setChatSeed);
  const current = fromDiscoveryPath(location.pathname);
  const inDiscovery = isDiscoveryPath(location.pathname);
  const route = (to: string) => (inDiscovery ? toDiscoveryRoute(to) : to);

  function askDocs() {
    setChatSeed("Explain how to use the NANO dashboard documentation and how-to tour.");
    setChatOpen(true);
  }

  return (
    <nav className={styles.nav} aria-label="Documentation navigation">
      <Link to={route("/")} className={styles.brand}>
        <span className={styles.mark}>e</span>
        <span className={styles.brandText}>
          <strong>ESD Lab</strong>
          <small>NANO . UofSC</small>
        </span>
      </Link>
      <div className={styles.links}>
        <Link className={styles.link} to={route("/")}>Landing</Link>
        <Link className={`${styles.link} ${current === DOC_ROUTE ? styles.active : ""}`} to={route(DOC_ROUTE)}>
          <BookOpen size={14} strokeWidth={1.5} />
          Docs
        </Link>
        <Link className={`${styles.link} ${current === HOW_TO_ROUTE ? styles.active : ""}`} to={route(HOW_TO_ROUTE)}>
          <HelpCircle size={14} strokeWidth={1.5} />
          How-to
        </Link>
        <Link className={styles.link} to={route("/overview")}>Operator</Link>
      </div>
      <button type="button" className={styles.navButton} onClick={() => startNanoTour("public")} data-insight="tour-trigger">
        <Sparkles size={14} strokeWidth={1.5} />
        Take the tour
      </button>
      <button type="button" className={styles.primaryButton} onClick={askDocs}>
        Ask the lab
      </button>
      <SkinToggle variant="pill" />
      <ThemeToggle variant="pill" />
    </nav>
  );
}

function ReferenceList({ entries }: { entries: typeof LANDING_REFERENCES }) {
  return (
    <div className={styles.entryList}>
      {entries.map((entry) => (
        <article className={styles.entry} key={entry.title}>
          <div className={styles.entryTop}>
            <div>
              <span className={styles.entryMeta}>Live reference</span>
              <h3>{entry.title}</h3>
            </div>
            <a href={entry.href}>Open live <ArrowRight size={13} aria-hidden /></a>
          </div>
          <p>{entry.summary}</p>
          <div className={styles.pills}>
            {entry.interactions.map((item) => (
              <span className={styles.pill} key={item}>{item}</span>
            ))}
          </div>
          {entry.liveFields?.length ? (
            <div className={styles.pills} aria-label="Live fields">
              {entry.liveFields.map((item) => (
                <span className={styles.pill} key={item}>Live: {item}</span>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function OperatorReferenceList() {
  const groups = Array.from(new Set(OPERATOR_REFERENCES.map((entry) => entry.group)));
  return (
    <div className={styles.entryList}>
      {groups.map((group) => (
        <article className={styles.card} key={group}>
          <span className={styles.eyebrow}>{group}</span>
          <div className={styles.entryList}>
            {OPERATOR_REFERENCES.filter((entry) => entry.group === group).map((entry) => (
              <div className={styles.entry} key={`${group}-${entry.title}`}>
                <div className={styles.entryTop}>
                  <h3>{entry.title}</h3>
                  <a href={entry.href}>Open <ArrowRight size={13} aria-hidden /></a>
                </div>
                <p>{entry.summary}</p>
                <div className={styles.pills}>
                  {entry.interactions.map((item) => (
                    <span className={styles.pill} key={item}>{item}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

export function Docs() {
  const location = useLocation();
  const { data: study } = useStudySummary();
  const { data: stages = [] } = useStages();
  const { data: runs = [] } = useRuns(12);
  const { data: participants = [] } = useParticipants();
  const { data: rmssd } = useTrajectory("rmssd");
  const { data: hda } = useHdaDist();

  const done = stages.reduce((sum, stage) => sum + stage.done, 0);
  const fail = stages.reduce((sum, stage) => sum + stage.fail, 0);
  const inflight = stages.reduce((sum, stage) => sum + stage.inflight, 0);
  const rmssdLatest = rmssd?.series.VPT.at(-1)?.y;
  const hdaWindows = hda
    ? Object.values(hda).reduce((sum, group) => sum + group.orienting + group.sustained + group.inattention + group.termination, 0)
    : undefined;
  const inDiscovery = isDiscoveryPath(location.pathname);
  const route = (to: string) => (inDiscovery ? toDiscoveryRoute(to) : to);

  return (
    <div className={styles.page}>
      <HelpNav />
      <main className={styles.main} data-insight="docs-hub">
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Documentation</span>
            <h1>NANO dashboard reference.</h1>
            <p className={styles.lede}>
              A guide to the public narrative surface, the operator console, the study vocabulary,
              the data path, the assistant, and the privacy model behind every visible number.
            </p>
          </div>
          <aside className={styles.heroCard}>
            <span className={styles.eyebrow}>Live fields, not copied prose</span>
            <div className={styles.liveGrid}>
              <div className={styles.metric}>
                <span>Enrolled</span>
                <strong>{stat(study?.enrolled)} / {stat(study?.target)}</strong>
              </div>
              <div className={styles.metric}>
                <span>Epochs done</span>
                <strong>{stat(done)}</strong>
              </div>
              <div className={styles.metric}>
                <span>Stage fails</span>
                <strong>{stat(fail)}</strong>
              </div>
              <div className={styles.metric}>
                <span>Median RMSSD</span>
                <strong>{stat(rmssdLatest, 1)} ms</strong>
              </div>
            </div>
          </aside>
        </header>

        <div className={styles.layout}>
          <aside className={styles.toc}>
            <details open>
              <summary>Contents</summary>
              <div className={styles.tocList}>
                {DOC_TOC.map((item) => (
                  <a href={`#${item.id}`} key={item.id}>{item.label}</a>
                ))}
              </div>
            </details>
          </aside>

          <div className={styles.content}>
            <section className={styles.section} id="overview">
              <span className={styles.eyebrow}>Overview</span>
              <h2>What the dashboard is</h2>
              <p>
                The NANO Study Dashboard is a HIPAA-aware research and operations surface for a longitudinal infant
                neurodevelopment study. It links forms, ECG segments, HDA labels, derived features, and model outputs
                through de-identified NANO-style records. The current live summary shows {stat(study?.enrolled)} of{" "}
                {stat(study?.target)} target infants enrolled, {stat(done)} processed pipeline units, and {stat(hdaWindows)} HDA-labeled windows available for explanation.
              </p>
            </section>

            <section className={styles.section} id="surfaces">
              <span className={styles.eyebrow}>The two surfaces</span>
              <h2>Public story versus operator cockpit</h2>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Surface</th>
                    <th>Use it when</th>
                    <th>How to move</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Public narrative landing</td>
                    <td>You want the study story, cohort questions, live pipeline summary, Model Studio, assistant, and library without the operator shell.</td>
                    <td>Open <a href={route("/")}>Landing</a> or use the Landing button from the console.</td>
                  </tr>
                  <tr>
                    <td>Operator console</td>
                    <td>You need the lab cockpit: sidebar routes, compliance banner, Force Sync, run history, REDCap sync, QA, and infrastructure panels.</td>
                    <td>Use Operator view from the landing dock or open <a href={route("/overview")}>Overview</a>.</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className={styles.section} id="glossary">
              <span className={styles.eyebrow}>Glossary</span>
              <h2>Domain vocabulary</h2>
              <div className={styles.glossary}>
                {GLOSSARY_TERMS.map((term) => (
                  <article className={styles.term} key={term.term} id={`term-${term.term.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                    <h3>{term.term}</h3>
                    <p>{term.definition}</p>
                    {term.source === "todo" && <span className={styles.todo}>TODO: confirm with lab</span>}
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.section} id="architecture">
              <span className={styles.eyebrow}>Data architecture</span>
              <h2>From chest to claim</h2>
              <div className={styles.grid2}>
                {DATA_LAYERS.map((layer) => (
                  <article className={styles.card} key={layer.title}>
                    <small>{layer.title}</small>
                    <h3>{layer.subtitle}</h3>
                    <p>{layer.detail}</p>
                  </article>
                ))}
              </div>
              <article className={styles.card}>
                <small>Pipeline stages</small>
                <h3>Done and fail counts</h3>
                <p>
                  Done counts are completed units accepted by a stage. Fail counts are surfaced exceptions that need review,
                  retry, or upstream repair. The live pipeline currently reports {stat(inflight)} in flight, {stat(done)} done,
                  and {stat(fail)} failed.
                </p>
                <div className={styles.grid3}>
                  {stages.slice(0, 6).map((stage, index) => (
                    <div className={styles.metric} key={stage.id}>
                      <span>Stage {String(index + 1).padStart(2, "0")}</span>
                      <strong>{stage.label}</strong>
                      <p>{stage.short}. {stat(stage.done)} done, {stat(stage.fail)} fail.</p>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className={styles.section} id="landing">
              <span className={styles.eyebrow}>Public landing reference</span>
              <h2>Section by section</h2>
              <ReferenceList entries={LANDING_REFERENCES} />
            </section>

            <section className={styles.section} id="operator">
              <span className={styles.eyebrow}>Operator console reference</span>
              <h2>Panel by panel</h2>
              <OperatorReferenceList />
            </section>

            <section className={styles.section} id="assistant">
              <span className={styles.eyebrow}>Assistant</span>
              <h2>Ask the lab</h2>
              <div className={styles.grid2}>
                <article className={styles.card}>
                  <small>Good for</small>
                  <h3>Grounded explanations</h3>
                  <p>
                    Use ESD Buddy to explain the study, unpack HDA, summarize a result, decide which surface to use,
                    or turn a dense panel into plain language. Starter chips and the new help prompts share this docs configuration.
                  </p>
                </article>
                <article className={styles.card}>
                  <small>Privacy</small>
                  <h3>Prompt scrubbing</h3>
                  <p>
                    The assistant is operationally grounded, but prompts should remain de-identified. The dashboard states that
                    LM Studio prompts are PHI-scrubbed before leaving the browser.
                  </p>
                </article>
              </div>
            </section>

            <section className={styles.section} id="compliance">
              <span className={styles.eyebrow}>Compliance and privacy</span>
              <h2>What is visible</h2>
              <div className={styles.grid2}>
                <article className={styles.card}>
                  <small>Audit posture</small>
                  <h3>HIPAA processing zone</h3>
                  <p>
                    The operator banner confirms HIPAA-compliant audit logging, identifier stripping through the REDCap proxy,
                    assistant prompt scrubbing, and IRB Pro00115234. The landing session pill shows the run identifier pattern,
                    such as run_2026_115_a, without exposing PHI.
                  </p>
                </article>
                <article className={styles.card}>
                  <small>Browser data</small>
                  <h3>No clinical tour storage</h3>
                  <p>
                    The guided tour stores only whether a track was completed. It does not store participant IDs, prompts,
                    clinical values, filters, or assistant messages.
                  </p>
                </article>
              </div>
            </section>

            <section className={styles.section} id="refresh">
              <span className={styles.eyebrow}>Data sources and refresh</span>
              <h2>Where values come from</h2>
              <p>
                Metrics in this documentation read from the same hooks as the operator routes: study summary, stages, runs,
                participants, trajectories, and HDA distribution. The reading library is built from the local readings corpus,
                and the operator console exposes Force Sync plus a last-sync timestamp.
              </p>
              <div className={styles.grid3}>
                <div className={styles.metric}><span>Participants loaded</span><strong>{stat(participants.length)}</strong></div>
                <div className={styles.metric}><span>Runs visible</span><strong>{stat(runs.length)}</strong></div>
                <div className={styles.metric}><span>Stages visible</span><strong>{stat(stages.length)}</strong></div>
              </div>
            </section>

            <section className={styles.section} id="automation" data-insight="assistant-help-context">
              <span className={styles.eyebrow}>Automation notes</span>
              <h2>How future features stay documented</h2>
              <div className={styles.grid2}>
                <article className={styles.card}>
                  <small>Single source</small>
                  <h3>Update the help content module</h3>
                  <p>
                    New public sections, operator panels, glossary terms, how-to cards, tour targets, Buddy insights, and Ask AI
                    chips should be added in the shared help content module. The docs, how-to page, guided tour, Buddy, and assistant chips reuse it.
                  </p>
                </article>
                <article className={styles.card}>
                  <small>Required hooks</small>
                  <h3>Add data-tour and data-insight</h3>
                  <p>
                    Add a stable data-tour target for walkthroughs and a data-insight key for Buddy. If a feature is optional or
                    feature-flagged, the tour will skip missing targets without showing a broken step.
                  </p>
                </article>
              </div>
              {TODO_GLOSSARY_TERMS.length > 0 && (
                <article className={styles.card}>
                  <small>Lab follow-up</small>
                  <h3>Definitions to confirm</h3>
                  <div className={styles.pills}>
                    {TODO_GLOSSARY_TERMS.map((term) => (
                      <span className={styles.pill} key={term.term}>{term.term}</span>
                    ))}
                  </div>
                </article>
              )}
            </section>
          </div>
        </div>
      </main>
      <Buddy anchor="page" />
      <ChatDrawer />
    </div>
  );
}
