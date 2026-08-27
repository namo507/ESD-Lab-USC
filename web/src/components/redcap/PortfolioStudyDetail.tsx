import { useEffect, useMemo, useState } from "react";
import { Badge, Card, KPI, SectionLabel } from "@/components/primitives";
import {
  healthyProjects,
  type RedcapPortfolio,
  type RedcapPortfolioProject,
} from "@/api/redcapPortfolio";
import {
  HBar,
  HStack,
  ProgressCell,
  StatusLegend,
  formatCount,
  formatRate,
  studyColor,
  type StackRow,
} from "./PortfolioCharts";
import styles from "@/routes/RedcapPortfolio.module.css";

/**
 * One REDCap project in full: its headline counts, how completion is
 * distributed across instruments and events, and the structural signals a
 * coordinator can act on.
 *
 * Completion is a count of `<form>_complete` status cells, not of people. A
 * project with 260 participants and 48 instruments has up to 12,480 such
 * cells, which is why the totals here are much larger than the enrollment.
 */
export interface PortfolioStudyDetailProps {
  portfolio: RedcapPortfolio;
  /** Sidebar study scope; picks the initial project when it matches one. */
  scope: string;
}

const TOP_INSTRUMENTS = 14;
const TOP_EVENTS = 16;
const TOP_TYPES = 10;

export function PortfolioStudyDetail({ portfolio, scope }: PortfolioStudyDetailProps) {
  const projects = useMemo(() => healthyProjects(portfolio), [portfolio]);
  const preferred =
    projects.find((project) => project.study === scope)?.key ?? projects[0]?.key ?? "";
  const [selected, setSelected] = useState(preferred);
  const [search, setSearch] = useState("");

  // A scope change from the sidebar should move the selection with it, and a
  // project that drops out of the payload must not leave a dead selection.
  useEffect(() => {
    if (!projects.some((project) => project.key === selected)) setSelected(preferred);
  }, [preferred, projects, selected]);

  const project = projects.find((item) => item.key === selected) ?? projects[0];
  if (!project) {
    return <p className={styles.state}>No REDCap project reported successfully.</p>;
  }

  return (
    <>
      <div className={styles.projectPicker} role="tablist" aria-label="REDCap projects">
        {projects.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={item.key === project.key}
            className={item.key === project.key ? styles.pickerOn : styles.picker}
            style={{ "--accent": studyColor(item.study) } as React.CSSProperties}
            onClick={() => setSelected(item.key)}
          >
            <span className={styles.pickerDot} aria-hidden />
            {item.title}
          </button>
        ))}
      </div>

      <StudyKpis project={project} />
      <CompletionPanels project={project} />
      <StructurePanels project={project} />
      <InstrumentTable project={project} search={search} onSearch={setSearch} />
      {(project.event_rows?.length ?? 0) > 0 && <EventTable project={project} />}
      <QualityTable project={project} threshold={portfolio.small_cell_threshold} />
    </>
  );
}

function StudyKpis({ project }: { project: RedcapPortfolioProject }) {
  const completion = project.completion;
  return (
    <section className={styles.kpis}>
      <KPI
        label="Participants"
        value={formatCount(project.records)}
        sub={
          project.record_events === null || project.record_events === undefined
            ? "record-events withheld"
            : `${formatCount(project.record_events)} record-events`
        }
      />
      <KPI label="Instruments" value={formatCount(project.instruments)} sub="survey forms" />
      <KPI
        label="Fields"
        value={formatCount(project.fields)}
        sub={`${formatCount(project.identifier_fields_withheld)} identifier fields withheld`}
      />
      <KPI
        label="Events"
        value={formatCount(project.events)}
        sub={project.longitudinal ? "longitudinal design" : "classic design"}
      />
      <KPI
        label="Form completion"
        value={formatRate(completion?.rate ?? null)}
        sub={
          completion?.suppressed
            ? "withheld by the small-cell rule"
            : `${formatCount(completion?.complete)} of ${formatCount(completion?.started)} started`
        }
      />
    </section>
  );
}

function CompletionPanels({ project }: { project: RedcapPortfolioProject }) {
  const rows = useMemo(() => project.instrument_rows ?? [], [project.instrument_rows]);

  const stacked: StackRow[] = useMemo(
    () =>
      [...rows]
        .sort((a, b) => (b.started ?? 0) - (a.started ?? 0))
        .slice(0, TOP_INSTRUMENTS)
        .map((row) => ({
          key: row.name,
          label: row.label,
          suppressed: row.suppressed,
          total: row.started ?? 0,
          parts: [
            { key: "complete" as const, value: row.complete ?? 0 },
            { key: "unverified" as const, value: row.unverified ?? 0 },
            { key: "incomplete" as const, value: row.incomplete ?? 0 },
          ],
        })),
    [rows],
  );

  const rates = useMemo(
    () =>
      [...rows]
        .filter((row) => row.rate !== null)
        .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
        .slice(0, TOP_INSTRUMENTS)
        .map((row) => ({
          key: row.name,
          label: row.label,
          value: row.rate,
          display: formatRate(row.rate),
          color: "var(--status-green)",
        })),
    [rows],
  );

  return (
    <div className={styles.grid2}>
      <Card pad={20}>
        <SectionLabel>Completion by instrument</SectionLabel>
        <p className={styles.cardNote}>
          The {TOP_INSTRUMENTS} instruments with the most started forms. Bars count status
          cells, not participants.
        </p>
        <HStack rows={stacked} title="Completion by instrument" labelWidth={150} />
        <StatusLegend keys={["complete", "unverified", "incomplete"]} />
      </Card>
      <Card pad={20}>
        <SectionLabel>Completion rate by instrument</SectionLabel>
        <p className={styles.cardNote}>
          Complete divided by started, so a form nobody has opened does not drag the rate down.
        </p>
        <HBar rows={rates} title="Completion rate by instrument" max={100} labelWidth={150} />
      </Card>
    </div>
  );
}

function StructurePanels({ project }: { project: RedcapPortfolioProject }) {
  const types = (project.field_types ?? []).slice(0, TOP_TYPES).map(([name, count]) => ({
    key: name,
    label: name,
    value: count,
    color: "var(--study-other)",
  }));

  const events = [...(project.event_rows ?? [])]
    .sort((a, b) => (b.records ?? 0) - (a.records ?? 0))
    .slice(0, TOP_EVENTS)
    .map((row) => ({
      key: row.name,
      label: row.label,
      value: row.records,
      display: row.records === null ? "—" : formatCount(row.records),
      color: studyColor(project.study),
    }));

  return (
    <div className={styles.grid2}>
      <Card pad={20}>
        <SectionLabel>Field types</SectionLabel>
        <HBar rows={types} title="Field types" labelWidth={110} />
      </Card>
      <Card pad={20}>
        <SectionLabel>Participants per event</SectionLabel>
        <HBar
          rows={events}
          title="Participants per event"
          labelWidth={150}
          empty="This project has no longitudinal events."
        />
      </Card>
    </div>
  );
}

function InstrumentTable({
  project,
  search,
  onSearch,
}: {
  project: RedcapPortfolioProject;
  search: string;
  onSearch: (value: string) => void;
}) {
  const term = search.trim().toLowerCase();
  const rows = (project.instrument_rows ?? []).filter(
    (row) =>
      !term || row.label.toLowerCase().includes(term) || row.name.toLowerCase().includes(term),
  );

  return (
    <Card pad={20}>
      <div className={styles.cardHead}>
        <SectionLabel>Instruments</SectionLabel>
        <input
          type="search"
          className={styles.search}
          placeholder="Filter instruments…"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          aria-label="Filter instruments"
        />
      </div>
      <div className={`${styles.tableScroll} ${styles.tall}`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Instrument</th>
              <th scope="col">Name</th>
              <th scope="col" className={styles.num}>Fields</th>
              <th scope="col" className={styles.num}>Events</th>
              <th scope="col" className={styles.num}>Started</th>
              <th scope="col" className={styles.num}>Complete</th>
              <th scope="col">Completion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.label}</th>
                <td className={styles.mono}>{row.name}</td>
                <td className={styles.num}>{formatCount(row.fields)}</td>
                <td className={styles.num}>{formatCount(row.events)}</td>
                <td className={styles.num}>{formatCount(row.started)}</td>
                <td className={styles.num}>{formatCount(row.complete)}</td>
                <td>
                  <ProgressCell rate={row.rate} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className={styles.state}>No instrument matches that filter.</p>}
      </div>
    </Card>
  );
}

function EventTable({ project }: { project: RedcapPortfolioProject }) {
  return (
    <Card pad={20}>
      <SectionLabel>Events</SectionLabel>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Unique name</th>
              <th scope="col" className={styles.num}>Participants</th>
              <th scope="col" className={styles.num}>Record-events</th>
              <th scope="col" className={styles.num}>Started</th>
              <th scope="col">Completion</th>
            </tr>
          </thead>
          <tbody>
            {(project.event_rows ?? []).map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.label}</th>
                <td className={styles.mono}>{row.name}</td>
                <td className={styles.num}>{formatCount(row.records)}</td>
                <td className={styles.num}>{formatCount(row.rows)}</td>
                <td className={styles.num}>{formatCount(row.started)}</td>
                <td>
                  <ProgressCell rate={row.rate} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function QualityTable({
  project,
  threshold,
}: {
  project: RedcapPortfolioProject;
  threshold: number;
}) {
  return (
    <Card pad={20}>
      <div className={styles.cardHead}>
        <SectionLabel>Structural signals</SectionLabel>
        <Badge kind="info" size="sm">design metadata</Badge>
      </div>
      <p className={styles.cardNote}>
        Counts of design features, not errors. They describe how the instrument was built and
        what that implies for the data it produces. None of these counts describe participants,
        so the small-cell rule (below {threshold}) does not apply to them.
      </p>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Signal</th>
              <th scope="col" className={styles.num}>Fields</th>
              <th scope="col">What it means</th>
            </tr>
          </thead>
          <tbody>
            {(project.quality ?? []).map((row) => (
              <tr key={row.check}>
                <th scope="row">{row.check}</th>
                <td className={styles.num}>{formatCount(row.count)}</td>
                <td className={styles.detail}>{row.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
