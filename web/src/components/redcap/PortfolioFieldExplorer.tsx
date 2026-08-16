import { useMemo, useState } from "react";
import { Badge, Button, Card, SectionLabel } from "@/components/primitives";
import { healthyProjects, type DecodedField, type RedcapPortfolio } from "@/api/redcapPortfolio";
import { formatCount, studyChipColor } from "./PortfolioCharts";
import { exportCsvFile } from "@/lib/exportCsv";
import { logAudit } from "@/lib/audit";
import styles from "@/routes/RedcapPortfolio.module.css";

/**
 * Searchable index of every published field across the portfolio.
 *
 * Search covers the field name, its instrument, and its type -- the three
 * things that are published. It deliberately cannot search item wording or
 * answer options: that text is licensed assessment content and never leaves
 * REDCap. Identifier-flagged fields are absent entirely.
 */
export interface PortfolioFieldExplorerProps {
  portfolio: RedcapPortfolio;
  fields: DecodedField[];
}

/** Rendering every field of eight projects at once would jank the page; the
 *  count above the table always reports the full match set. */
const RENDER_LIMIT = 500;

type FlagFilter = "required" | "branching" | "unvalidated";

export function PortfolioFieldExplorer({ portfolio, fields }: PortfolioFieldExplorerProps) {
  const projects = useMemo(() => healthyProjects(portfolio), [portfolio]);
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("all");
  const [type, setType] = useState("all");
  const [form, setForm] = useState("all");
  const [flags, setFlags] = useState<Set<FlagFilter>>(new Set());

  const types = useMemo(
    () => [...new Set(fields.map((field) => field.type))].filter(Boolean).sort(),
    [fields],
  );
  const forms = useMemo(
    () =>
      [...new Set(fields.filter((f) => project === "all" || f.project === project).map((f) => f.form))]
        .filter(Boolean)
        .sort(),
    [fields, project],
  );

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return fields.filter((field) => {
      if (project !== "all" && field.project !== project) return false;
      if (type !== "all" && field.type !== type) return false;
      if (form !== "all" && field.form !== form) return false;
      if (flags.has("required") && !field.required) return false;
      if (flags.has("branching") && !field.branching) return false;
      if (flags.has("unvalidated") && field.validated) return false;
      if (!term) return true;
      return (
        field.fieldName.toLowerCase().includes(term) ||
        field.form.toLowerCase().includes(term) ||
        field.type.toLowerCase().includes(term)
      );
    });
  }, [fields, flags, form, project, search, type]);

  const distinctForms = useMemo(
    () => new Set(matches.map((field) => field.form)).size,
    [matches],
  );
  const distinctProjects = useMemo(
    () => new Set(matches.map((field) => field.project)).size,
    [matches],
  );

  function toggleFlag(flag: FlagFilter) {
    setFlags((current) => {
      const next = new Set(current);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  }

  function download() {
    exportCsvFile(
      matches.map((field) => ({
        project: field.project,
        instrument: field.form,
        field_name: field.fieldName,
        field_type: field.type,
        validation: field.validation,
        answer_options: field.choices,
        required: field.required ? "y" : "",
        branching_logic: field.branching ? "y" : "",
      })),
      "redcap-field-inventory.csv",
    );
    void logAudit({ action: "export.csv", scope: "/redcap-portfolio/fields" });
  }

  const studyFor = (key: string) =>
    projects.find((item) => item.key === key)?.study ?? "";

  return (
    <>
      <Card pad={20}>
        <div className={styles.cardHead}>
          <SectionLabel>Field explorer</SectionLabel>
          <Badge kind="info" size="sm">structure only</Badge>
        </div>
        <p className={styles.cardNote}>
          Every field REDCap defines across the portfolio, minus the identifier-flagged fields
          the backend withholds. Item wording and answer-option text are not published, so an
          option count stands in for the choices themselves.
        </p>

        <div className={styles.filters}>
          <label className={styles.control}>
            Search
            <input
              type="search"
              value={search}
              placeholder="field name, instrument, type…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className={styles.control}>
            Project
            <select value={project} onChange={(event) => { setProject(event.target.value); setForm("all"); }}>
              <option value="all">All projects</option>
              {projects.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.control}>
            Instrument
            <select value={form} onChange={(event) => setForm(event.target.value)}>
              <option value="all">All instruments</option>
              {forms.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.control}>
            Type
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="all">All types</option>
              {types.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.flagRow}>
          <label className={styles.control}>
            <input
              type="checkbox"
              checked={flags.has("required")}
              onChange={() => toggleFlag("required")}
            />
            Required only
          </label>
          <label className={styles.control}>
            <input
              type="checkbox"
              checked={flags.has("branching")}
              onChange={() => toggleFlag("branching")}
            />
            Has branching logic
          </label>
          <label className={styles.control}>
            <input
              type="checkbox"
              checked={flags.has("unvalidated")}
              onChange={() => toggleFlag("unvalidated")}
            />
            No validation rule
          </label>
        </div>

        <div className={styles.resultRow}>
          <span className={styles.resultCount}>
            <strong>{formatCount(matches.length)}</strong> of {formatCount(fields.length)} fields ·{" "}
            {formatCount(distinctForms)} distinct instruments · {formatCount(distinctProjects)}{" "}
            projects
          </span>
          <Button icon="download" size="sm" onClick={download} disabled={!matches.length}>
            Download CSV
          </Button>
        </div>

        <div className={`${styles.tableScroll} ${styles.tall}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Instrument</th>
                <th scope="col">Field</th>
                <th scope="col">Type</th>
                <th scope="col">Validation</th>
                <th scope="col" className={styles.num}>Options</th>
                <th scope="col">Req.</th>
                <th scope="col">Branch</th>
              </tr>
            </thead>
            <tbody>
              {matches.slice(0, RENDER_LIMIT).map((field) => (
                <tr key={`${field.project}-${field.form}-${field.fieldName}`}>
                  <td>
                    <span
                      className={styles.chipSmall}
                      style={{ background: studyChipColor(studyFor(field.project)) }}
                    >
                      {field.project.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td>{field.form}</td>
                  <th scope="row" className={styles.mono}>{field.fieldName}</th>
                  <td>{field.type}</td>
                  <td className={styles.mono}>{field.validation || "—"}</td>
                  <td className={styles.num}>{field.choices || "—"}</td>
                  <td>{field.required ? "✓" : ""}</td>
                  <td>{field.branching ? "✓" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!matches.length && <p className={styles.state}>No field matches these filters.</p>}
          {matches.length > RENDER_LIMIT && (
            <p className={styles.state}>
              Showing the first {formatCount(RENDER_LIMIT)} of {formatCount(matches.length)}{" "}
              matches. Narrow the filters, or download the CSV for the full set.
            </p>
          )}
        </div>
      </Card>
    </>
  );
}
