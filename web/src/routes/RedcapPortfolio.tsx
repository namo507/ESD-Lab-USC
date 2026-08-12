import { useMemo, useState } from "react";
import { Badge, Button, Card, KPI, SectionLabel, Segmented } from "@/components/primitives";
import {
  decodeFields,
  healthyProjects,
  portfolioFreshness,
  portfolioTotals,
  useRedcapPortfolio,
  type RedcapPortfolio,
} from "@/api/redcapPortfolio";
import {
  HBar,
  ProgressCell,
  formatCount,
  formatRate,
  studyColor,
  type BarRow,
} from "@/components/redcap/PortfolioCharts";
import { PortfolioStudyDetail } from "@/components/redcap/PortfolioStudyDetail";
import { PortfolioComparison } from "@/components/redcap/PortfolioComparison";
import { PortfolioFieldExplorer } from "@/components/redcap/PortfolioFieldExplorer";
import { PortfolioDefinitions } from "@/components/redcap/PortfolioDefinitions";
import { useUi } from "@/store/ui";
import styles from "./RedcapPortfolio.module.css";

/**
 * REDCap metadata watcher.
 *
 * Five studies and eight REDCap projects, described by how they are *built*
 * rather than by who is enrolled: instrument inventory, event wiring, form
 * completion, cross-study harmonization, and a searchable field index.
 *
 * Everything on this page comes from one pre-built aggregate artifact. There
 * is no participant row behind any number here -- completion counts are
 * tallies of `<form>_complete` status cells, item wording is never published,
 * and identifier-flagged fields are withheld with only a count kept.
 */

type PortfolioTab = "portfolio" | "study" | "comparison" | "fields" | "definitions";

const TAB_OPTIONS = [
  { value: "portfolio" as const, label: "Portfolio" },
  { value: "study" as const, label: "Study Detail" },
  { value: "comparison" as const, label: "Comparison" },
  { value: "fields" as const, label: "Field Explorer" },
  { value: "definitions" as const, label: "Definitions" },
];

export function RedcapPortfolio() {
  const activeStudy = useUi((s) => s.activeStudy);
  const scope = activeStudy.toLowerCase();
  const [tab, setTab] = useState<PortfolioTab>("portfolio");
  const query = useRedcapPortfolio();
  const portfolio = query.data ?? null;

  const fields = useMemo(() => decodeFields(portfolio), [portfolio]);
  const freshness = useMemo(() => portfolioFreshness(portfolio), [portfolio]);

  if (query.isLoading) {
    return <p className={styles.state}>Loading REDCap portfolio metadata…</p>;
  }

  // The artifact is optional: a deployment that has not run the build should
  // say so plainly rather than render an empty dashboard.
  if (query.isError || !portfolio) {
    return (
      <div className={styles.page}>
        <PageHeader freshness={freshness} onRefresh={() => void query.refetch()} portfolio={null} />
        <p className={styles.state}>
          The REDCap portfolio metadata artifact has not been published for this deployment. Run{" "}
          <code>make redcap-portfolio</code> to generate it, or wait for the next scheduled sync.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        freshness={freshness}
        onRefresh={() => void query.refetch()}
        portfolio={portfolio}
      />

      <div className={styles.tabRow}>
        <Segmented
          options={TAB_OPTIONS}
          value={tab}
          onChange={setTab}
          ariaLabel="REDCap portfolio sections"
        />
      </div>

      {portfolio.failed.length > 0 && (
        <Card pad={16} className={styles.failCard}>
          <SectionLabel>Projects not reporting</SectionLabel>
          <ul className={styles.failList}>
            {portfolio.failed.map((item) => (
              <li key={item.key}>
                <strong>{item.title}</strong> · <code>{item.error}</code>
              </li>
            ))}
          </ul>
          <p className={styles.failNote}>
            Every panel below is computed from the {portfolio.projects_ok} project
            {portfolio.projects_ok === 1 ? "" : "s"} that did report.
          </p>
        </Card>
      )}

      {tab === "portfolio" && <PortfolioTab portfolio={portfolio} />}
      {tab === "study" && <PortfolioStudyDetail portfolio={portfolio} scope={scope} />}
      {tab === "comparison" && <PortfolioComparison portfolio={portfolio} fields={fields} />}
      {tab === "fields" && <PortfolioFieldExplorer portfolio={portfolio} fields={fields} />}
      {tab === "definitions" && <PortfolioDefinitions portfolio={portfolio} />}
    </div>
  );
}

function PageHeader({
  freshness,
  onRefresh,
  portfolio,
}: {
  freshness: ReturnType<typeof portfolioFreshness>;
  onRefresh: () => void;
  portfolio: RedcapPortfolio | null;
}) {
  return (
    <header className={styles.hero}>
      <div>
        <span className={`${styles.eyebrow} t-mono`}>REDCap metadata watcher</span>
        <h1 className={styles.h1}>Portfolio structure &amp; completion</h1>
        <p className={styles.lede}>
          How the eight REDCap projects behind five studies are built — instruments, events,
          field design, and how far each form has progressed. Read-only and aggregate-only:
          no participant record, item wording, or identifier field reaches this page.
        </p>
      </div>
      <div className={styles.actions}>
        <Badge kind={freshness.status === "live" ? "ok" : "warn"} size="sm">
          {freshness.status === "unavailable"
            ? "not published"
            : `synced ${freshness.label}`}
        </Badge>
        {portfolio && (
          <span className={styles.stamp} title={portfolio.generated_at}>
            {portfolio.projects_ok}/{portfolio.projects_total} projects
          </span>
        )}
        <Button icon="refresh-cw" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
    </header>
  );
}

/* ── Tab 1: Portfolio ───────────────────────────────────────────────────── */

function PortfolioTab({ portfolio }: { portfolio: RedcapPortfolio }) {
  const totals = useMemo(() => portfolioTotals(portfolio), [portfolio]);
  const projects = useMemo(() => healthyProjects(portfolio), [portfolio]);

  const studyRows = (pick: (study: RedcapPortfolio["studies"][number]) => number | null): BarRow[] =>
    portfolio.studies
      .map((study) => ({
        key: study.key,
        label: study.label,
        value: pick(study),
        color: studyColor(study.key),
      }))
      .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

  return (
    <>
      <section className={styles.kpis}>
        <KPI
          label="Participants"
          value={formatCount(totals.records)}
          sub={`across ${portfolio.studies.length} studies`}
          insightId="redcap-portfolio-records"
        />
        <KPI label="Instruments" value={formatCount(totals.instruments)} sub="survey forms defined" />
        <KPI label="Fields" value={formatCount(totals.fields)} sub="published field definitions" />
        <KPI label="Events" value={formatCount(totals.events)} sub="longitudinal timepoints" />
        <KPI
          label="Form completion"
          value={formatRate(totals.rate)}
          sub={
            totals.suppressed
              ? "withheld by the small-cell rule"
              : `${formatCount(totals.complete)} of ${formatCount(totals.started)} started`
          }
        />
      </section>

      <Card pad={20}>
        <SectionLabel>Studies</SectionLabel>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Study</th>
                <th scope="col">Projects</th>
                <th scope="col" className={styles.num}>Participants</th>
                <th scope="col" className={styles.num}>Target</th>
                <th scope="col" className={styles.num}>Instruments</th>
                <th scope="col" className={styles.num}>Fields</th>
                <th scope="col" className={styles.num}>Events</th>
                <th scope="col">Completion</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.studies.map((study) => (
                <tr key={study.key}>
                  <th scope="row">
                    <span
                      className={styles.chip}
                      style={{ background: studyColor(study.key) }}
                    >
                      {study.label}
                    </span>
                  </th>
                  <td>
                    {study.projects_ok}/{study.projects_total}
                    {study.status !== "ok" && (
                      <Badge kind="warn" size="sm">
                        degraded
                      </Badge>
                    )}
                  </td>
                  <td className={styles.num}>{formatCount(study.records)}</td>
                  <td className={styles.num}>{study.target ?? "—"}</td>
                  <td className={styles.num}>{formatCount(study.instruments)}</td>
                  <td className={styles.num}>{formatCount(study.fields)}</td>
                  <td className={styles.num}>{formatCount(study.events)}</td>
                  <td>
                    <ProgressCell rate={study.completion.rate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className={styles.grid2}>
        <Card pad={20}>
          <SectionLabel>Participants per study</SectionLabel>
          <HBar rows={studyRows((study) => study.records)} title="Participants per study" />
        </Card>
        <Card pad={20}>
          <SectionLabel>Form completion rate</SectionLabel>
          <HBar
            rows={studyRows((study) => study.completion.rate).map((row) => ({
              ...row,
              display: formatRate(row.value),
            }))}
            title="Form completion rate per study"
            max={100}
          />
        </Card>
        <Card pad={20}>
          <SectionLabel>Fields per study</SectionLabel>
          <HBar rows={studyRows((study) => study.fields)} title="Fields per study" />
        </Card>
        <Card pad={20}>
          <SectionLabel>Instruments per study</SectionLabel>
          <HBar rows={studyRows((study) => study.instruments)} title="Instruments per study" />
        </Card>
      </div>

      <Card pad={20}>
        <SectionLabel>Project structure</SectionLabel>
        <p className={styles.cardNote}>
          Every configured REDCap project, with the design features that shape how its data
          arrives. Identifier-flagged fields are counted but never listed.
        </p>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Study</th>
                <th scope="col" className={styles.num}>PID</th>
                <th scope="col" className={styles.num}>Instruments</th>
                <th scope="col" className={styles.num}>Fields</th>
                <th scope="col" className={styles.num}>Required</th>
                <th scope="col" className={styles.num}>Branching</th>
                <th scope="col" className={styles.num}>ID fields</th>
                <th scope="col">Design</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.key}>
                  <th scope="row" className={styles.projectCell}>
                    {project.title}
                  </th>
                  <td>
                    <span
                      className={styles.chipSmall}
                      style={{ background: studyColor(project.study) }}
                    >
                      {project.study.toUpperCase()}
                    </span>
                  </td>
                  <td className={styles.num}>{project.project_id ?? "—"}</td>
                  <td className={styles.num}>{formatCount(project.instruments)}</td>
                  <td className={styles.num}>{formatCount(project.fields)}</td>
                  <td className={styles.num}>{formatCount(project.required_fields)}</td>
                  <td className={styles.num}>{formatCount(project.branching_fields)}</td>
                  <td className={styles.num}>{formatCount(project.identifier_fields_withheld)}</td>
                  <td className={styles.flags}>
                    {project.longitudinal && <span className={styles.flag}>longitudinal</span>}
                    {project.repeating && <span className={styles.flag}>repeating</span>}
                    {project.surveys && <span className={styles.flag}>surveys</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
