import { useMemo } from "react";
import { Badge, Card, KPI } from "@/components/primitives";
import type { RedcapPortfolio } from "@/api/redcapPortfolio";
import {
  BoolMark,
  CompletionBar,
  CountCell,
  HBar,
  PanelHead,
  SortableHeader,
  StudyChip,
  formatCount,
  formatPercent,
  useSortedRows,
  type BarRow,
} from "./portfolioPrimitives";
import styles from "./RedcapPortfolio.module.css";

type ProjectColumn =
  | "label"
  | "title"
  | "projectId"
  | "records"
  | "instruments"
  | "fields"
  | "events"
  | "rate"
  | "identifiers";

function barRows(
  portfolio: RedcapPortfolio,
  pick: (project: RedcapPortfolio["projects"][number]) => number | null,
  suppressed: (project: RedcapPortfolio["projects"][number]) => boolean = () => false,
): BarRow[] {
  return portfolio.projects.map((project) => ({
    key: project.key,
    label: project.label,
    value: pick(project),
    color: project.color,
    suppressed: suppressed(project),
  }));
}

export function RedcapPortfolioTab({ portfolio }: { portfolio: RedcapPortfolio }) {
  const totals = portfolio.totals;

  const accessors = useMemo(
    () => ({
      label: (project: RedcapPortfolio["projects"][number]) => project.label,
      title: (project: RedcapPortfolio["projects"][number]) => project.title,
      projectId: (project: RedcapPortfolio["projects"][number]) => project.projectId,
      records: (project: RedcapPortfolio["projects"][number]) => project.records,
      instruments: (project: RedcapPortfolio["projects"][number]) => project.instruments,
      fields: (project: RedcapPortfolio["projects"][number]) => project.fields,
      events: (project: RedcapPortfolio["projects"][number]) => project.events,
      rate: (project: RedcapPortfolio["projects"][number]) => project.completion.completionRate,
      identifiers: (project: RedcapPortfolio["projects"][number]) => project.identifierFields,
    }),
    [],
  );

  const table = useSortedRows<RedcapPortfolio["projects"][number], ProjectColumn>(
    portfolio.projects,
    accessors,
    { key: "records", direction: "desc" },
  );
  const head = { sort: table.sort, toggle: table.toggle, ariaSort: table.ariaSort };

  return (
    <div className={styles.stack}>
      <section className={styles.kpis} aria-label="REDCap portfolio structure totals">
        <KPI
          label="Records"
          value={totals.recordsSuppressed ? "Suppressed" : formatCount(totals.records)}
          sub={`${totals.projectsOk}/${totals.projects} projects · ${totals.studiesReporting}/${totals.studies} studies`}
        />
        <KPI label="Instruments" value={formatCount(totals.instruments)} sub="across all projects" />
        <KPI label="Fields" value={formatCount(totals.fields)} sub={`${formatCount(totals.requiredFields)} required`} />
        <KPI label="Events" value={formatCount(totals.events)} sub={`${formatCount(totals.branchingFields)} branching fields`} />
        <KPI
          label="Form completion"
          value={
            totals.completion.countsSuppressed
              ? "Suppressed"
              : formatPercent(totals.completion.completionRate)
          }
          sub={
            totals.completion.countsSuppressed
              ? "small-cell suppressed"
              : `${formatCount(totals.completion.complete)} of ${formatCount(totals.completion.started)} started`
          }
        />
      </section>

      {portfolio.failed.length > 0 && (
        <Card pad={0}>
          <PanelHead
            title="Projects that did not report"
            hint="The structure read failed for these projects; every panel below excludes them."
            aside={<Badge kind="fail" size="sm">{portfolio.failed.length} unavailable</Badge>}
          />
          <ul className={styles.failedList}>
            {portfolio.failed.map((row) => (
              <li key={row.key}>
                <strong>{row.label}</strong>
                <span className="t-mono">
                  {row.key} · #{row.projectId}
                </span>
                <Badge kind="fail" size="sm">
                  {row.detail}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card pad={0}>
        <PanelHead
          title="Project structure"
          hint="One row per REDCap project. Completion is Complete ÷ Started; small cells stay suppressed."
          aside={<Badge kind="neutral" size="sm">{portfolio.projects.length} projects</Badge>}
        />
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">REDCap project structure and completion.</caption>
            <thead>
              <tr>
                <SortableHeader columnKey="label" label="Project" {...head} />
                <SortableHeader columnKey="title" label="REDCap title" {...head} />
                <SortableHeader columnKey="projectId" label="PID" numeric {...head} />
                <SortableHeader columnKey="records" label="Records" numeric {...head} />
                <SortableHeader columnKey="instruments" label="Instruments" numeric {...head} />
                <SortableHeader columnKey="fields" label="Fields" numeric {...head} />
                <SortableHeader columnKey="events" label="Events" numeric {...head} />
                <SortableHeader columnKey="rate" label="Completion" numeric {...head} />
                <SortableHeader columnKey="identifiers" label="Identifier fields" numeric {...head} />
                <th scope="col" className={styles.th}>
                  Design
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((project) => (
                <tr key={project.key}>
                  <td className={styles.td}>
                    <StudyChip label={project.label} color={project.color} />
                  </td>
                  <td className={styles.td}>{project.title}</td>
                  <td className={`${styles.td} ${styles.num} t-mono`}>{project.projectId}</td>
                  <td className={`${styles.td} ${styles.num} t-num`}>
                    <CountCell value={project.records} suppressed={project.recordsSuppressed} />
                  </td>
                  <td className={`${styles.td} ${styles.num} t-num`}>{formatCount(project.instruments)}</td>
                  <td className={`${styles.td} ${styles.num} t-num`}>{formatCount(project.fields)}</td>
                  <td className={`${styles.td} ${styles.num} t-num`}>{formatCount(project.events)}</td>
                  <td className={styles.td}>
                    <CompletionBar completion={project.completion} />
                  </td>
                  <td className={`${styles.td} ${styles.num} t-num`}>{formatCount(project.identifierFields)}</td>
                  <td className={styles.td}>
                    <span className={styles.markRow}>
                      <BoolMark value={project.longitudinal} label="Longitudinal" />
                      <BoolMark value={project.repeating} label="Repeating" />
                      <BoolMark value={project.surveys} label="Surveys" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className={styles.chartGrid}>
        <Card pad={0}>
          <PanelHead title="Records per project" hint="Distinct record identifiers in each project." />
          <div className={styles.chartBody}>
            <HBar
              ariaLabel="Records per project"
              rows={barRows(
                portfolio,
                (project) => project.records,
                (project) => project.recordsSuppressed,
              )}
            />
          </div>
        </Card>

        <Card pad={0}>
          <PanelHead title="Form completion rate" hint="Complete ÷ Started, per project." />
          <div className={styles.chartBody}>
            <HBar
              ariaLabel="Form completion rate per project"
              unit="%"
              rows={portfolio.projects.map((project) => ({
                key: project.key,
                label: project.label,
                value: project.completion.completionRate,
                color: project.color,
                suppressed: project.completion.countsSuppressed,
              }))}
            />
          </div>
        </Card>

        <Card pad={0}>
          <PanelHead title="Fields per project" hint="Every field defined in the data dictionary." />
          <div className={styles.chartBody}>
            <HBar ariaLabel="Fields per project" rows={barRows(portfolio, (project) => project.fields)} />
          </div>
        </Card>

        <Card pad={0}>
          <PanelHead title="Instruments per project" hint="Instruments defined, including unused ones." />
          <div className={styles.chartBody}>
            <HBar
              ariaLabel="Instruments per project"
              rows={barRows(portfolio, (project) => project.instruments)}
            />
          </div>
        </Card>
      </div>

      <Card pad={0}>
        <PanelHead
          title="Structural profile"
          hint="Design-level counts. These describe the data dictionary, not participants."
        />
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Required, branching, and identifier-flagged field counts.</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.th}>
                  Project
                </th>
                <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                  Required fields
                </th>
                <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                  Branching logic
                </th>
                <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                  Identifier-flagged
                </th>
                <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                  Record-events
                </th>
              </tr>
            </thead>
            <tbody>
              {portfolio.projects.map((project) => (
                <tr key={project.key}>
                  <td className={styles.td}>
                    <StudyChip label={project.label} color={project.color} />
                  </td>
                  <td className={`${styles.td} ${styles.num} t-num`}>{formatCount(project.requiredFields)}</td>
                  <td className={`${styles.td} ${styles.num} t-num`}>{formatCount(project.branchingFields)}</td>
                  <td className={`${styles.td} ${styles.num} t-num`}>{formatCount(project.identifierFields)}</td>
                  <td className={`${styles.td} ${styles.num} t-num`}>
                    <CountCell value={project.rows} suppressed={project.recordsSuppressed} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
