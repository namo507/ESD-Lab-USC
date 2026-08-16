import { useMemo, useState } from "react";
import { Card, KPI, SectionLabel } from "@/components/primitives";
import {
  compareInstrument,
  harmonizationHeadline,
  healthyProjects,
  sharedInstruments,
  type DecodedField,
  type HarmonizationVerdict,
  type RedcapPortfolio,
} from "@/api/redcapPortfolio";
import { HBar, Heatmap, formatCount, studyChipColor } from "./PortfolioCharts";
import styles from "@/routes/RedcapPortfolio.module.css";

/**
 * Cross-project instrument comparison.
 *
 * Answers the question the lab cannot answer by opening projects one at a
 * time: where the same instrument has drifted apart between studies. The
 * verdicts compare field *definitions* -- names and types -- because the item
 * wording that would settle a deeper comparison is deliberately not published.
 */
export interface PortfolioComparisonProps {
  portfolio: RedcapPortfolio;
  fields: DecodedField[];
}

const VERDICT_CLASS: Record<HarmonizationVerdict, string | undefined> = {
  identical: styles.verdictOk,
  "type differs": styles.verdictBad,
  partial: styles.verdictPartial,
};

export function PortfolioComparison({ portfolio, fields }: PortfolioComparisonProps) {
  const projects = useMemo(() => healthyProjects(portfolio), [portfolio]);
  const projectKeys = useMemo(() => projects.map((project) => project.key), [projects]);
  const shared = useMemo(
    () => sharedInstruments(portfolio, projectKeys),
    [portfolio, projectKeys],
  );

  const [minProjects, setMinProjects] = useState(2);
  const [instrument, setInstrument] = useState(shared[0]?.name ?? "");
  const [onlyDiffs, setOnlyDiffs] = useState(false);

  const activeInstrument = shared.some((row) => row.name === instrument)
    ? instrument
    : shared[0]?.name ?? "";
  const activeRow = shared.find((row) => row.name === activeInstrument);
  // Memoized so the comparison below is not recomputed on every render by a
  // fresh empty array identity.
  const comparisonKeys = useMemo(() => activeRow?.projects ?? [], [activeRow]);

  const comparison = useMemo(
    () =>
      activeInstrument ? compareInstrument(fields, activeInstrument, comparisonKeys) : [],
    [activeInstrument, comparisonKeys, fields],
  );
  const headline = useMemo(() => harmonizationHeadline(comparison), [comparison]);

  const sharingRows = useMemo(() => {
    const buckets = new Map<number, number>();
    for (const row of portfolio.matrix) {
      buckets.set(row.project_count, (buckets.get(row.project_count) ?? 0) + 1);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([count, instruments]) => ({
        key: String(count),
        label: `${count} project${count === 1 ? "" : "s"}`,
        value: instruments,
        color: count > 1 ? "var(--status-green)" : "var(--study-other)",
      }));
  }, [portfolio.matrix]);

  const titleFor = (key: string) =>
    projects.find((project) => project.key === key)?.title ?? key;
  const shortFor = (key: string) => key.replace(/_/g, " ");
  const studyFor = (key: string) =>
    projects.find((project) => project.key === key)?.study ?? "";

  // Placed after every hook so the component's hook order never changes.
  if (projects.length < 2) {
    return (
      <p className={styles.state}>
        Instrument comparison needs at least two connected REDCap projects. Only{" "}
        {projects.length} reported.
      </p>
    );
  }

  const visible = onlyDiffs
    ? comparison.filter((row) => row.verdict !== "identical")
    : comparison;

  return (
    <>
      <div className={styles.grid2}>
        <Card pad={20}>
          <SectionLabel>Instrument reuse</SectionLabel>
          <p className={styles.cardNote}>
            How many projects define each instrument. Forms defined once are study-specific;
            forms defined in several are the portfolio&apos;s shared backbone.
          </p>
          <HBar rows={sharingRows} title="Instruments by number of projects" labelWidth={100} />
        </Card>
        <Card pad={20}>
          <SectionLabel>Shared instruments, pairwise</SectionLabel>
          <p className={styles.cardNote}>
            Instruments both projects define. Darker means more overlap.
          </p>
          <Heatmap
            keys={portfolio.overlap.keys}
            cells={portfolio.overlap.cells}
            title="Pairwise shared instruments"
            labelFor={shortFor}
          />
        </Card>
      </div>

      <Card pad={20}>
        <div className={styles.cardHead}>
          <SectionLabel>Instrument matrix</SectionLabel>
          <label className={styles.control}>
            Defined in at least
            <input
              type="range"
              min={1}
              max={Math.max(2, projectKeys.length)}
              value={minProjects}
              onChange={(event) => setMinProjects(Number(event.target.value))}
            />
            <strong>{minProjects}</strong> project{minProjects === 1 ? "" : "s"}
          </label>
        </div>
        <div className={`${styles.tableScroll} ${styles.tall}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Instrument</th>
                <th scope="col" className={styles.num}>Projects</th>
                <th scope="col" className={styles.num}>Studies</th>
                {projectKeys.map((key) => (
                  <th key={key} scope="col" className={styles.matrixHead} title={titleFor(key)}>
                    {shortFor(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portfolio.matrix
                .filter((row) => row.project_count >= minProjects)
                .map((row) => (
                  <tr key={row.name}>
                    <th scope="row">{row.label}</th>
                    <td className={styles.num}>{row.project_count}</td>
                    <td className={styles.num}>{row.study_count}</td>
                    {projectKeys.map((key) => (
                      <td key={key} className={styles.matrixCell}>
                        {row.projects.includes(key) ? (
                          <span
                            className={styles.dot}
                            style={{ background: studyChipColor(studyFor(key)) }}
                            title={`${row.label} is defined in ${titleFor(key)}`}
                          />
                        ) : (
                          <span className={styles.dotOff} aria-hidden />
                        )}
                        <span className="sr-only">
                          {row.projects.includes(key) ? "defined" : "not defined"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {activeInstrument ? (
        <Card pad={20}>
          <div className={styles.cardHead}>
            <SectionLabel>Field harmonization</SectionLabel>
            <div className={styles.controls}>
              <label className={styles.control}>
                Instrument
                <select
                  value={activeInstrument}
                  onChange={(event) => setInstrument(event.target.value)}
                >
                  {shared.map((row) => (
                    <option key={row.name} value={row.name}>
                      {row.label} ({row.projects.length})
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.control}>
                <input
                  type="checkbox"
                  checked={onlyDiffs}
                  onChange={(event) => setOnlyDiffs(event.target.checked)}
                />
                Only fields that differ
              </label>
            </div>
          </div>

          <section className={styles.kpisTight}>
            <KPI label="Fields (union)" value={formatCount(headline.fields)} />
            <KPI label="Identical" value={formatCount(headline.identical)} sub="same name and type" />
            <KPI label="Type differs" value={formatCount(headline["type differs"])} sub="same name, different type" />
            <KPI label="Partial" value={formatCount(headline.partial)} sub="missing from a project" />
          </section>

          <p className={styles.cardNote}>
            Comparing <strong>{activeRow?.label}</strong> across {comparisonKeys.length}{" "}
            projects. A verdict of <em>identical</em> means the field name and REDCap type
            match; it cannot confirm the two projects ask the same question, because item
            wording is not published.
          </p>

          <div className={`${styles.tableScroll} ${styles.tall}`}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  {comparisonKeys.map((key) => (
                    <th key={key} scope="col" title={titleFor(key)}>
                      {shortFor(key)}
                    </th>
                  ))}
                  <th scope="col">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.fieldName}>
                    <th scope="row" className={styles.mono}>{row.fieldName}</th>
                    {comparisonKeys.map((key) => (
                      <td key={key} className={row.byProject[key] ? undefined : styles.missing}>
                        {row.byProject[key] ?? "—"}
                      </td>
                    ))}
                    <td>
                      <span className={`${styles.pill} ${VERDICT_CLASS[row.verdict]}`}>
                        {row.verdict}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <p className={styles.state}>
                Every field in this instrument is defined identically across all{" "}
                {comparisonKeys.length} projects.
              </p>
            )}
          </div>
        </Card>
      ) : (
        <p className={styles.state}>No instrument is defined in more than one project.</p>
      )}
    </>
  );
}
