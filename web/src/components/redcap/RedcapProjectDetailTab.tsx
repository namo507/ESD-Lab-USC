import { useMemo, useState } from "react";
import { Badge, Card, KPI } from "@/components/primitives";
import { STATUS_COLORS, type PortfolioProject, type RedcapPortfolio } from "@/api/redcapPortfolio";
import {
  CompletionBar,
  CountCell,
  HBar,
  HStack,
  PanelHead,
  SortableHeader,
  SuppressedValue,
  formatCount,
  formatPercent,
  useSortedRows,
  type StackPart,
} from "./portfolioPrimitives";
import styles from "./RedcapPortfolio.module.css";

const STACK_LEGEND: StackPart[] = [
  { key: "complete", label: "Complete", value: 0, color: STATUS_COLORS.complete },
  { key: "unverified", label: "Unverified", value: 0, color: STATUS_COLORS.unverified },
  { key: "incomplete", label: "Incomplete", value: 0, color: STATUS_COLORS.incomplete },
];

const TOP_INSTRUMENTS = 14;
const TOP_FIELD_TYPES = 10;
const TOP_EVENTS = 16;

type InstrumentColumn = "name" | "label" | "fields" | "events" | "started" | "complete" | "rate";

export function RedcapProjectDetailTab({
  portfolio,
  selectedKey,
  onSelect,
}: {
  portfolio: RedcapPortfolio;
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const project =
    portfolio.projects.find((row) => row.key === selectedKey) ?? portfolio.projects[0];
  const [instrumentFilter, setInstrumentFilter] = useState("");

  if (!project) {
    return <p className={styles.empty}>No REDCap project reported a structure snapshot.</p>;
  }

  return (
    <div className={styles.stack}>
      <div className={styles.projectPicker} role="group" aria-label="Choose a REDCap project">
        {portfolio.projects.map((row) => {
          const active = row.key === project.key;
          return (
            <button
              key={row.key}
              type="button"
              className={`${styles.projectButton} ${active ? styles.projectButtonActive : ""}`}
              style={active ? { borderColor: row.color, background: row.color } : { borderColor: row.color }}
              aria-pressed={active}
              onClick={() => onSelect(row.key)}
            >
              {row.label}
            </button>
          );
        })}
      </div>

      <ProjectDetailBody
        project={project}
        instrumentFilter={instrumentFilter}
        onInstrumentFilter={setInstrumentFilter}
      />
    </div>
  );
}

function ProjectDetailBody({
  project,
  instrumentFilter,
  onInstrumentFilter,
}: {
  project: PortfolioProject;
  instrumentFilter: string;
  onInstrumentFilter: (value: string) => void;
}) {
  const completion = project.completion;
  const topInstruments = useMemo(
    () => project.instrumentRows.slice(0, TOP_INSTRUMENTS),
    [project.instrumentRows],
  );

  const needle = instrumentFilter.trim().toLowerCase();
  const filteredInstruments = useMemo(
    () =>
      needle
        ? project.instrumentRows.filter(
            (row) =>
              row.name.toLowerCase().includes(needle) || row.label.toLowerCase().includes(needle),
          )
        : project.instrumentRows,
    [needle, project.instrumentRows],
  );

  const accessors = useMemo(
    () => ({
      name: (row: PortfolioProject["instrumentRows"][number]) => row.name,
      label: (row: PortfolioProject["instrumentRows"][number]) => row.label,
      fields: (row: PortfolioProject["instrumentRows"][number]) => row.fields,
      events: (row: PortfolioProject["instrumentRows"][number]) => row.events,
      started: (row: PortfolioProject["instrumentRows"][number]) => row.started,
      complete: (row: PortfolioProject["instrumentRows"][number]) => row.complete,
      rate: (row: PortfolioProject["instrumentRows"][number]) => row.completionRate,
    }),
    [],
  );
  const table = useSortedRows<PortfolioProject["instrumentRows"][number], InstrumentColumn>(
    filteredInstruments,
    accessors,
    { key: "started", direction: "desc" },
  );
  const head = { sort: table.sort, toggle: table.toggle, ariaSort: table.ariaSort };

  return (
    <>
      <section className={styles.kpis} aria-label={`${project.label} totals`}>
        <KPI
          label="Records"
          value={project.recordsSuppressed ? "Suppressed" : formatCount(project.records)}
          sub={
            project.recordsSuppressed
              ? "small-cell suppressed"
              : `${formatCount(project.rows)} record-events`
          }
          style={{ borderLeft: `3px solid ${project.color}` }}
        />
        <KPI label="Instruments" value={formatCount(project.instruments)} sub={`PID ${project.projectId}`} />
        <KPI label="Fields" value={formatCount(project.fields)} sub={`${formatCount(project.requiredFields)} required`} />
        <KPI
          label="Events"
          value={formatCount(project.events)}
          sub={project.longitudinal ? "longitudinal design" : "classic design"}
        />
        <KPI
          label="Completion rate"
          value={completion.countsSuppressed ? "Suppressed" : formatPercent(completion.completionRate)}
          sub={
            completion.countsSuppressed
              ? "small-cell suppressed"
              : `${formatCount(completion.complete)} of ${formatCount(completion.started)} started`
          }
        />
      </section>

      <div className={styles.chartGrid}>
        <Card pad={0}>
          <PanelHead
            title="Completion by instrument"
            hint={`Top ${TOP_INSTRUMENTS} instruments by started forms.`}
          />
          <div className={styles.chartBody}>
            <HStack
              ariaLabel={`${project.label} completion by instrument`}
              legend={STACK_LEGEND}
              rows={topInstruments.map((row) => ({
                key: row.name,
                label: row.label,
                suppressed: row.countsSuppressed,
                total: row.started ?? 0,
                parts: [
                  { key: "complete", label: "Complete", value: row.complete ?? 0, color: STATUS_COLORS.complete },
                  { key: "unverified", label: "Unverified", value: row.unverified ?? 0, color: STATUS_COLORS.unverified },
                  { key: "incomplete", label: "Incomplete", value: row.incomplete ?? 0, color: STATUS_COLORS.incomplete },
                ],
              }))}
            />
          </div>
        </Card>

        <Card pad={0}>
          <PanelHead title="Completion rate by instrument" hint="Complete ÷ Started for the same instruments." />
          <div className={styles.chartBody}>
            <HBar
              ariaLabel={`${project.label} completion rate by instrument`}
              unit="%"
              rows={topInstruments.map((row) => ({
                key: row.name,
                label: row.label,
                value: row.completionRate,
                color: project.color,
                suppressed: row.countsSuppressed,
              }))}
            />
          </div>
        </Card>

        <Card pad={0}>
          <PanelHead title="Field types" hint={`The ${TOP_FIELD_TYPES} most used field types.`} />
          <div className={styles.chartBody}>
            <HBar
              ariaLabel={`${project.label} field types`}
              rows={project.fieldTypes.slice(0, TOP_FIELD_TYPES).map((row) => ({
                key: row.type,
                label: row.type,
                value: row.count,
                color: project.color,
              }))}
            />
          </div>
        </Card>

        <Card pad={0}>
          <PanelHead
            title="Records per event"
            hint="Records with at least one saved instrument at that event."
          />
          <div className={styles.chartBody}>
            <HBar
              ariaLabel={`${project.label} records per event`}
              emptyLabel="This project has no events."
              rows={project.eventRows.slice(0, TOP_EVENTS).map((row) => ({
                key: row.name,
                label: row.label,
                value: row.records,
                color: project.color,
                suppressed: row.recordsSuppressed,
              }))}
            />
          </div>
        </Card>
      </div>

      <Card pad={0}>
        <PanelHead
          title="Instruments"
          hint="Sort any column; search matches the instrument name and its label."
          aside={
            <input
              type="search"
              className={styles.search}
              value={instrumentFilter}
              placeholder="Filter instruments…"
              aria-label="Filter instruments"
              onChange={(event) => onInstrumentFilter(event.target.value)}
            />
          }
        />
        <div className={`${styles.tableWrap} ${styles.tall}`}>
          <table className={styles.table}>
            <caption className="sr-only">{project.label} instruments and completion.</caption>
            <thead>
              <tr>
                <SortableHeader columnKey="name" label="Instrument" {...head} />
                <SortableHeader columnKey="label" label="Label" {...head} />
                <SortableHeader columnKey="fields" label="Fields" numeric {...head} />
                <SortableHeader columnKey="events" label="Events" numeric {...head} />
                <SortableHeader columnKey="started" label="Started" numeric {...head} />
                <SortableHeader columnKey="complete" label="Complete" numeric {...head} />
                <SortableHeader columnKey="rate" label="Completion" numeric {...head} />
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.name}>
                  <td className={`${styles.td} t-mono`}>{row.name}</td>
                  <td className={styles.td}>{row.label}</td>
                  <td className={`${styles.td} ${styles.num} t-num`}>{formatCount(row.fields)}</td>
                  <td className={`${styles.td} ${styles.num} t-num`}>{formatCount(row.events)}</td>
                  <td className={`${styles.td} ${styles.num} t-num`}>
                    <CountCell value={row.started} suppressed={row.countsSuppressed} />
                  </td>
                  <td className={`${styles.td} ${styles.num} t-num`}>
                    <CountCell value={row.complete} suppressed={row.countsSuppressed} />
                  </td>
                  <td className={styles.td}>
                    <CompletionBar completion={row} />
                  </td>
                </tr>
              ))}
              {table.rows.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={7}>
                    No instrument matches this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {project.eventRows.length > 0 && (
        <Card pad={0}>
          <PanelHead
            title="Events"
            hint="Record-events are rows in the completion export; a record can appear at several events."
            aside={<Badge kind="neutral" size="sm">{project.eventRows.length} events</Badge>}
          />
          <div className={`${styles.tableWrap} ${styles.tall}`}>
            <table className={styles.table}>
              <caption className="sr-only">{project.label} events and completion.</caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.th}>
                    Event
                  </th>
                  <th scope="col" className={styles.th}>
                    Unique name
                  </th>
                  <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                    Records
                  </th>
                  <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                    Record-events
                  </th>
                  <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                    Started
                  </th>
                  <th scope="col" className={styles.th}>
                    Completion
                  </th>
                </tr>
              </thead>
              <tbody>
                {project.eventRows.map((row) => (
                  <tr key={row.name}>
                    <td className={styles.td}>{row.label}</td>
                    <td className={`${styles.td} t-mono`}>{row.name}</td>
                    <td className={`${styles.td} ${styles.num} t-num`}>
                      <CountCell value={row.records} suppressed={row.recordsSuppressed} />
                    </td>
                    <td className={`${styles.td} ${styles.num} t-num`}>
                      <CountCell value={row.rows} suppressed={row.recordsSuppressed} />
                    </td>
                    <td className={`${styles.td} ${styles.num} t-num`}>
                      <CountCell value={row.started} suppressed={row.countsSuppressed} />
                    </td>
                    <td className={styles.td}>
                      <CompletionBar completion={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card pad={0}>
        <PanelHead
          title="Structural signals"
          hint="Rule-based findings over the data dictionary. They count fields, never participants."
        />
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">{project.label} structural signals.</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.th}>
                  Signal
                </th>
                <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                  Fields
                </th>
                <th scope="col" className={styles.th}>
                  What it means
                </th>
              </tr>
            </thead>
            <tbody>
              {project.quality.map((row) => (
                <tr key={row.check}>
                  <td className={styles.td}>{row.check}</td>
                  <td className={`${styles.td} ${styles.num} t-num`}>{formatCount(row.count)}</td>
                  <td className={`${styles.td} ${styles.note}`}>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {project.warnings.length > 0 && (
          <p className={styles.warnings}>
            Read warnings: {project.warnings.join(", ")}
          </p>
        )}
      </Card>

      {completion.countsSuppressed && (
        <p className={styles.note}>
          <SuppressedValue /> marks a cell withheld because at least one underlying
          count is below the small-cell threshold.
        </p>
      )}
    </>
  );
}
