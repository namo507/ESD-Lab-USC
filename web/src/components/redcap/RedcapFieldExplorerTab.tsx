import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@/components/primitives";
import {
  useRedcapPortfolioFields,
  type PortfolioField,
  type RedcapPortfolio,
} from "@/api/redcapPortfolio";
import { exportCsvFile } from "@/lib/exportCsv";
import { logAudit } from "@/lib/audit";
import { PanelHead, StudyChip, formatCount } from "./portfolioPrimitives";
import styles from "./RedcapPortfolio.module.css";

const MAX_ROWS = 3000;

interface FieldFlags {
  required: boolean;
  identifier: boolean;
  branching: boolean;
  missingLabel: boolean;
}

const EMPTY_FLAGS: FieldFlags = {
  required: false,
  identifier: false,
  branching: false,
  missingLabel: false,
};

function matches(field: PortfolioField, needle: string): boolean {
  if (!needle) return true;
  return (
    field.name.toLowerCase().includes(needle)
    || field.label.toLowerCase().includes(needle)
    || field.note.toLowerCase().includes(needle)
    || field.choices.toLowerCase().includes(needle)
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  labels,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <fieldset className={styles.filterGroup}>
      <legend>{label}</legend>
      <div className={styles.filterOptions}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`${styles.filterChip} ${selected.has(option) ? styles.filterChipOn : ""}`}
            aria-pressed={selected.has(option)}
            onClick={() => onToggle(option)}
          >
            {labels?.[option] ?? option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function RedcapFieldExplorerTab({ portfolio }: { portfolio: RedcapPortfolio }) {
  const [requested, setRequested] = useState(false);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [forms, setForms] = useState<Set<string>>(new Set());
  const [flags, setFlags] = useState<FieldFlags>(EMPTY_FLAGS);

  const index = useRedcapPortfolioFields(requested);
  const projectLabels = useMemo(
    () => Object.fromEntries(portfolio.projects.map((project) => [project.key, project.label])),
    [portfolio.projects],
  );
  const projectColors = useMemo(
    () => Object.fromEntries(portfolio.projects.map((project) => [project.key, project.color])),
    [portfolio.projects],
  );

  const formOptions = useMemo(() => {
    if (!index.data) return [];
    const relevant = projects.size
      ? index.data.fields.filter((field) => projects.has(field.projectKey))
      : index.data.fields;
    return [...new Set(relevant.map((field) => field.form))].sort().slice(0, 120);
  }, [index.data, projects]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!index.data) return [];
    return index.data.fields.filter((field) => {
      if (projects.size && !projects.has(field.projectKey)) return false;
      if (types.size && !types.has(field.type)) return false;
      if (forms.size && !forms.has(field.form)) return false;
      if (flags.required && !field.required) return false;
      if (flags.identifier && !field.identifier) return false;
      if (flags.branching && !field.branching) return false;
      if (flags.missingLabel && field.labelled) return false;
      return matches(field, needle);
    });
  }, [index.data, projects, types, forms, flags, needle]);

  const distinctInstruments = useMemo(
    () => new Set(filtered.map((field) => field.form)).size,
    [filtered],
  );
  const distinctProjects = useMemo(
    () => new Set(filtered.map((field) => field.projectKey)).size,
    [filtered],
  );

  function toggle(setter: (updater: (current: Set<string>) => Set<string>) => void, value: string) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function resetFilters() {
    setQuery("");
    setProjects(new Set());
    setTypes(new Set());
    setForms(new Set());
    setFlags(EMPTY_FLAGS);
  }

  function downloadCsv() {
    exportCsvFile(
      filtered.slice(0, MAX_ROWS).map((field) => ({
        project: field.projectKey,
        instrument: field.form,
        field: field.name,
        type: field.type,
        validation: field.validation,
        label: field.label,
        note: field.note,
        choices: field.choices,
        choice_count: field.choiceCount,
        required: field.required ? "yes" : "no",
        identifier_flagged: field.identifier ? "yes" : "no",
        branching_logic: field.branching ? "yes" : "no",
      })),
      "redcap-fields.csv",
    );
    void logAudit({ action: "export.csv", scope: "/redcap/field-explorer" });
  }

  if (!requested) {
    return (
      <Card pad={0}>
        <PanelHead
          title="Field explorer"
          hint="Search every field definition across the reporting REDCap projects."
        />
        <div className={styles.lazyPanel}>
          <p>
            The field index holds {formatCount(portfolio.fieldIndex.rows)} field definitions
            across {formatCount(portfolio.projects.length)} projects. It is a separate artifact
            so the rest of this page stays fast; load it when you need to search.
          </p>
          <Button size="sm" onClick={() => setRequested(true)}>
            Load field index
          </Button>
        </div>
      </Card>
    );
  }

  if (index.isLoading) {
    return (
      <p className={styles.lazyPanel} role="status">
        Loading {formatCount(portfolio.fieldIndex.rows)} field definitions…
      </p>
    );
  }

  if (index.isError || !index.data) {
    return (
      <div className={styles.lazyPanel} role="alert">
        <p>The field index could not be loaded.</p>
        <Button size="sm" variant="secondary" onClick={() => void index.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const rows = filtered.slice(0, MAX_ROWS);

  return (
    <div className={styles.stack}>
      <Card pad={0}>
        <PanelHead
          title="Field explorer"
          hint="Matches field names, labels, notes, and answer choices. Metadata only — no participant values."
          aside={
            <div className={styles.controlRow}>
              <Badge kind="neutral" size="sm">
                {formatCount(filtered.length)} of {formatCount(index.data.fields.length)} fields
              </Badge>
              <Button size="sm" variant="secondary" onClick={resetFilters}>
                Reset
              </Button>
              <Button size="sm" icon="download" onClick={downloadCsv} disabled={!rows.length}>
                CSV
              </Button>
            </div>
          }
        />
        <div className={styles.filterPanel}>
          <label className={styles.searchWide}>
            <span className="sr-only">Search fields</span>
            <input
              type="search"
              value={query}
              placeholder="Search name, label, note, or choices…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className={styles.filterGrid}>
            <MultiSelect
              label="Project"
              options={index.data.projects}
              selected={projects}
              labels={projectLabels}
              onToggle={(value) => toggle(setProjects, value)}
            />
            <MultiSelect
              label="Field type"
              options={index.data.types}
              selected={types}
              onToggle={(value) => toggle(setTypes, value)}
            />
            <MultiSelect
              label="Instrument"
              options={formOptions}
              selected={forms}
              onToggle={(value) => toggle(setForms, value)}
            />
            <fieldset className={styles.filterGroup}>
              <legend>Flags</legend>
              <div className={styles.filterOptions}>
                {(
                  [
                    ["required", "Required only"],
                    ["identifier", "Identifier-flagged"],
                    ["branching", "Has branching logic"],
                    ["missingLabel", "Missing label"],
                  ] as Array<[keyof FieldFlags, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`${styles.filterChip} ${flags[key] ? styles.filterChipOn : ""}`}
                    aria-pressed={flags[key]}
                    onClick={() => setFlags((current) => ({ ...current, [key]: !current[key] }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <p className={styles.resultLine}>
            {formatCount(filtered.length)} fields · {formatCount(distinctInstruments)} instruments ·{" "}
            {formatCount(distinctProjects)} projects
            {filtered.length > MAX_ROWS
              ? ` · showing the first ${formatCount(MAX_ROWS)}`
              : ""}
          </p>
        </div>
        <div className={`${styles.tableWrap} ${styles.tall}`}>
          <table className={styles.table}>
            <caption className="sr-only">REDCap field definitions.</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.th}>
                  Project
                </th>
                <th scope="col" className={styles.th}>
                  Instrument
                </th>
                <th scope="col" className={styles.th}>
                  Field
                </th>
                <th scope="col" className={styles.th}>
                  Type
                </th>
                <th scope="col" className={styles.th}>
                  Label
                </th>
                <th scope="col" className={styles.th}>
                  Validation
                </th>
                <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                  Choices
                </th>
                <th scope="col" className={styles.th}>
                  Flags
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((field) => (
                <tr key={`${field.projectKey}:${field.form}:${field.name}`}>
                  <td className={styles.td}>
                    <StudyChip
                      label={projectLabels[field.projectKey] ?? field.projectKey}
                      color={projectColors[field.projectKey] ?? "var(--slate-400)"}
                    />
                  </td>
                  <td className={`${styles.td} t-mono`}>{field.form}</td>
                  <td className={`${styles.td} t-mono`}>{field.name}</td>
                  <td className={styles.td}>{field.type}</td>
                  <td className={`${styles.td} ${styles.note}`}>
                    {field.label || <span className={styles.muted}>no label</span>}
                  </td>
                  <td className={styles.td}>
                    {field.validation || <span className={styles.muted}>—</span>}
                  </td>
                  <td className={`${styles.td} ${styles.num} t-num`} title={field.choices}>
                    {field.choiceCount || <span className={styles.muted}>—</span>}
                  </td>
                  <td className={styles.td}>
                    <span className={styles.markRow}>
                      {field.required && (
                        <Badge kind="info" size="sm">
                          Required
                        </Badge>
                      )}
                      {field.identifier && (
                        <Badge kind="phi" size="sm">
                          Identifier
                        </Badge>
                      )}
                      {field.branching && (
                        <Badge kind="neutral" size="sm">
                          Branching
                        </Badge>
                      )}
                      {!field.required && !field.identifier && !field.branching && (
                        <span className={styles.muted}>—</span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={8}>
                    No field matches these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
