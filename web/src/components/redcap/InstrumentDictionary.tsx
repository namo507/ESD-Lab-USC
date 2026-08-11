import { useMemo, useState } from "react";
import {
  selectDictionaryProjects,
  summarizeDictionaryScope,
  useRedcapDictionary,
  type RedcapInstrument,
} from "@/api/redcapDictionary";
import { redcapOrigin, redcapProjectUrl } from "@/api/redcapLinks";
import styles from "./InstrumentDictionary.module.css";

/**
 * Survey instrument inventory for the active study scope.
 *
 * Shows how each REDCap project is built -- instruments, field counts, field
 * types, required and branching logic -- and links each instrument's project
 * to its REDCap home page.
 *
 * Deliberately shows no item text. The `field_label` values behind these
 * counts are the verbatim wording of licensed assessments, so the backend
 * never exports them. Fields REDCap flags as direct identifiers are withheld
 * and reported only as a count.
 */
export interface InstrumentDictionaryProps {
  /** Active scope: a study key, or `all` for the whole portfolio. */
  studyKey: string;
  /** Overridable for tests; defaults to the build-time REDCap origin. */
  origin?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  text: "Text",
  radio: "Radio",
  checkbox: "Checkbox",
  dropdown: "Dropdown",
  notes: "Notes",
  calc: "Calculated",
  yesno: "Yes / No",
  truefalse: "True / False",
  file: "File upload",
  slider: "Slider",
  descriptive: "Descriptive",
  sql: "SQL",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

export function InstrumentDictionary({
  studyKey,
  origin = redcapOrigin(),
}: InstrumentDictionaryProps) {
  const { data, isLoading, isError } = useRedcapDictionary();
  const [expanded, setExpanded] = useState<string | null>(null);

  const projects = useMemo(
    () => selectDictionaryProjects(data, studyKey),
    [data, studyKey],
  );
  const summary = useMemo(() => summarizeDictionaryScope(projects), [projects]);

  if (isLoading) {
    return <p className={styles.state}>Loading instrument dictionary…</p>;
  }

  // The dictionary is an optional artifact: a deployment that has not run the
  // sync should say so plainly rather than render an empty table.
  if (isError || !data) {
    return (
      <p className={styles.state}>
        The instrument dictionary has not been published for this deployment. Run{" "}
        <code>make redcap-dictionary</code> to generate it.
      </p>
    );
  }

  if (!projects.length) {
    return (
      <p className={styles.state}>
        No REDCap projects are configured for this study scope.
      </p>
    );
  }

  const maxTypeCount = summary.fieldTypes[0]?.count ?? 1;

  return (
    <div className={styles.wrap}>
      <div className={styles.summaryRow}>
        <Stat label="Projects" value={formatCount(summary.projects)} />
        <Stat label="Instruments" value={formatCount(summary.instruments)} />
        <Stat label="Fields" value={formatCount(summary.fields)} />
        <Stat label="Required" value={formatCount(summary.requiredFields)} />
        <Stat label="Branching" value={formatCount(summary.branchingFields)} />
      </div>

      {summary.fieldTypes.length ? (
        <section
          className={styles.typeChart}
          aria-label="Field types across the selected scope"
          data-insight="redcap-field-types"
          data-insight-term="Field type mix"
          data-insight-body="Counts every field by REDCap type across the selected scope. Item wording is never published; only the structure of each instrument."
        >
          <div className={styles.eyebrow}>Field types</div>
          <ul className={styles.typeList}>
            {summary.fieldTypes.map((entry) => (
              <li key={entry.type} className={styles.typeRow}>
                <span className={styles.typeName}>{typeLabel(entry.type)}</span>
                <span className={styles.typeBar} aria-hidden>
                  <i style={{ width: `${Math.max(2, (entry.count / maxTypeCount) * 100)}%` }} />
                </span>
                <span className={styles.typeCount}>{formatCount(entry.count)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {projects.map((project) => {
        const instruments = project.instruments ?? [];
        const href =
          origin && project.project_id ? redcapProjectUrl(origin, project.project_id) : null;

        return (
          <section key={project.key} className={styles.project} aria-label={project.title ?? project.key}>
            <header className={styles.projectHead}>
              <div>
                <div className={styles.eyebrow}>{project.study?.toUpperCase() ?? "STUDY"}</div>
                <h3 className={styles.projectTitle}>{project.title ?? project.key}</h3>
                <p className={styles.projectMeta}>
                  {formatCount(project.instruments_total ?? instruments.length)} instruments ·{" "}
                  {formatCount(project.fields_total ?? 0)} fields
                  {project.identifier_fields_withheld
                    ? ` · ${formatCount(project.identifier_fields_withheld)} identifier fields not listed`
                    : ""}
                </p>
              </div>
              {href ? (
                <a className={styles.projectLink} href={href} target="_blank" rel="noopener noreferrer">
                  Open pid {project.project_id}
                </a>
              ) : null}
            </header>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="sr-only">
                  Survey instruments in {project.title ?? project.key}. Structure only; no item text.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Instrument</th>
                    <th scope="col" className={styles.num}>Fields</th>
                    <th scope="col" className={styles.num}>Required</th>
                    <th scope="col" className={styles.num}>Branching</th>
                    <th scope="col" className={styles.num}>Withheld</th>
                  </tr>
                </thead>
                <tbody>
                  {instruments.map((instrument) => (
                    <InstrumentRow
                      key={`${project.key}:${instrument.name}`}
                      instrument={instrument}
                      expanded={expanded === `${project.key}:${instrument.name}`}
                      onToggle={() =>
                        setExpanded((current) =>
                          current === `${project.key}:${instrument.name}`
                            ? null
                            : `${project.key}:${instrument.name}`,
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <p className={styles.footnote}>
        Structure only. Item wording is not published because these instruments are
        licensed, and fields REDCap flags as direct identifiers are withheld — their
        counts are shown so totals still reconcile.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <strong className={styles.statValue}>{value}</strong>
    </div>
  );
}

interface InstrumentRowProps {
  instrument: RedcapInstrument;
  expanded: boolean;
  onToggle: () => void;
}

function InstrumentRow({ instrument, expanded, onToggle }: InstrumentRowProps) {
  return (
    <>
      <tr className={styles.row} data-expanded={expanded || undefined}>
        <th scope="row" className={styles.instrumentCell}>
          <button
            type="button"
            className={styles.disclose}
            aria-expanded={expanded}
            onClick={onToggle}
          >
            <span className={styles.chevron} aria-hidden data-open={expanded || undefined}>
              ›
            </span>
            <span>
              <span className={styles.instrumentLabel}>{instrument.label}</span>
              <span className={styles.instrumentName}>{instrument.name}</span>
            </span>
          </button>
        </th>
        <td className={styles.num}>{formatCount(instrument.fields_total)}</td>
        <td className={styles.num}>{formatCount(instrument.required_fields)}</td>
        <td className={styles.num}>{formatCount(instrument.branching_fields)}</td>
        <td className={styles.num} data-muted={!instrument.identifier_fields_withheld || undefined}>
          {instrument.identifier_fields_withheld
            ? formatCount(instrument.identifier_fields_withheld)
            : "—"}
        </td>
      </tr>
      {expanded ? (
        <tr className={styles.detailRow}>
          <td colSpan={5}>
            <ul className={styles.fieldList}>
              {instrument.fields.map((field) => (
                <li key={field.field_name} className={styles.fieldItem}>
                  <code className={styles.fieldName}>{field.field_name}</code>
                  <span className={styles.fieldType}>{typeLabel(field.field_type)}</span>
                  {field.choices ? (
                    <span className={styles.fieldFlag}>{field.choices} options</span>
                  ) : null}
                  {field.validation ? (
                    <span className={styles.fieldFlag}>{field.validation}</span>
                  ) : null}
                  {field.required ? <span className={styles.fieldFlag}>required</span> : null}
                  {field.branching ? <span className={styles.fieldFlag}>branching</span> : null}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </>
  );
}
