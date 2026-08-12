import { useMemo, useState } from "react";
import { Badge, Button, Card, KPI } from "@/components/primitives";
import {
  compareInstrument,
  harmonizationHeadline,
  useRedcapPortfolioFields,
  type HarmonizationVerdict,
  type RedcapPortfolio,
} from "@/api/redcapPortfolio";
import {
  HBar,
  HStack,
  HeatGrid,
  PanelHead,
  StudyChip,
  formatCount,
  type StackPart,
} from "./portfolioPrimitives";
import styles from "./RedcapPortfolio.module.css";

const VERDICT_COLORS: Record<HarmonizationVerdict, string> = {
  identical: "var(--status-green)",
  "label differs": "var(--purple)",
  "type differs": "var(--status-red)",
  partial: "var(--status-grey)",
};

const VERDICT_BADGES: Record<HarmonizationVerdict, "ok" | "warn" | "fail" | "neutral"> = {
  identical: "ok",
  "label differs": "warn",
  "type differs": "fail",
  partial: "neutral",
};

export function RedcapComparisonTab({ portfolio }: { portfolio: RedcapPortfolio }) {
  const [minProjects, setMinProjects] = useState(2);
  const [instrument, setInstrument] = useState("");
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const [fieldsRequested, setFieldsRequested] = useState(false);

  const projectLabels = useMemo(
    () => Object.fromEntries(portfolio.projects.map((project) => [project.key, project.label])),
    [portfolio.projects],
  );
  const projectKeys = useMemo(
    () => portfolio.projects.map((project) => project.key),
    [portfolio.projects],
  );

  const shared = useMemo(
    () => portfolio.matrix.filter((row) => row.projects >= 2),
    [portfolio.matrix],
  );

  const sharingRows = useMemo(() => {
    const counts = new Map<number, number>();
    for (const row of portfolio.matrix) {
      counts.set(row.projects, (counts.get(row.projects) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([projects, total]) => ({
        key: String(projects),
        label: projects === 1 ? "1 project" : `${projects} projects`,
        value: total,
        color: "var(--status-blue)",
      }));
  }, [portfolio.matrix]);

  const overlap = useMemo(() => {
    const membership = portfolio.matrix.map((row) => new Set(row.in));
    return projectKeys.map((rowKey) =>
      projectKeys.map((columnKey) =>
        rowKey === columnKey
          ? 0
          : membership.filter((row) => row.has(rowKey) && row.has(columnKey)).length,
      ),
    );
  }, [portfolio.matrix, projectKeys]);

  const matrixRows = useMemo(
    () => portfolio.matrix.filter((row) => row.projects >= minProjects).slice(0, 200),
    [portfolio.matrix, minProjects],
  );

  const fieldIndex = useRedcapPortfolioFields(fieldsRequested);
  const selectedInstrument = instrument || shared[0]?.name || "";
  const instrumentProjects = useMemo(
    () => portfolio.matrix.find((row) => row.name === selectedInstrument)?.in ?? [],
    [portfolio.matrix, selectedInstrument],
  );

  const comparison = useMemo(
    () => compareInstrument(fieldIndex.data, selectedInstrument, instrumentProjects),
    [fieldIndex.data, selectedInstrument, instrumentProjects],
  );
  const headline = useMemo(() => harmonizationHeadline(comparison), [comparison]);
  const visibleRows = differencesOnly
    ? comparison.filter((row) => row.verdict !== "identical")
    : comparison;

  const consistencyLegend: StackPart[] = (
    Object.keys(VERDICT_COLORS) as HarmonizationVerdict[]
  ).map((verdict) => ({
    key: verdict,
    label: verdict,
    value: headline[verdict],
    color: VERDICT_COLORS[verdict],
  }));

  if (portfolio.projects.length < 2) {
    return (
      <p className={styles.empty}>
        Instrument comparison needs at least two projects to report their structure.
      </p>
    );
  }

  return (
    <div className={styles.stack}>
      <div className={styles.chartGrid}>
        <Card pad={0}>
          <PanelHead
            title="Shared by how many projects"
            hint="How many instrument names appear in exactly N REDCap projects."
          />
          <div className={styles.chartBody}>
            <HBar ariaLabel="Instruments shared by project count" rows={sharingRows} />
          </div>
        </Card>

        <Card pad={0}>
          <PanelHead
            title="Pairwise shared instruments"
            hint="Instrument names present in both projects of each pair."
          />
          <div className={styles.chartBody}>
            <HeatGrid
              keys={projectKeys}
              labels={projectLabels}
              cells={overlap}
              ariaLabel="Pairwise shared instrument counts"
            />
          </div>
        </Card>
      </div>

      <Card pad={0}>
        <PanelHead
          title="Instrument matrix"
          hint="Which projects define each instrument name."
          aside={
            <label className={styles.rangeLabel}>
              <span>Min projects</span>
              <input
                type="range"
                min={1}
                max={Math.max(1, portfolio.projects.length)}
                step={1}
                value={minProjects}
                onChange={(event) => setMinProjects(Number(event.target.value))}
              />
              <strong className="t-mono">{minProjects}</strong>
            </label>
          }
        />
        <div className={`${styles.tableWrap} ${styles.tall}`}>
          <table className={styles.table}>
            <caption className="sr-only">Instrument presence per REDCap project.</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.th}>
                  Instrument
                </th>
                <th scope="col" className={styles.th}>
                  Label
                </th>
                <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                  Projects
                </th>
                {portfolio.projects.map((project) => (
                  <th key={project.key} scope="col" className={styles.th}>
                    {project.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr key={row.name}>
                  <td className={`${styles.td} t-mono`}>{row.name}</td>
                  <td className={styles.td}>{row.label}</td>
                  <td className={`${styles.td} ${styles.num} t-num`}>{formatCount(row.projects)}</td>
                  {portfolio.projects.map((project) => (
                    <td key={project.key} className={`${styles.td} ${styles.num}`}>
                      {row.in.includes(project.key) ? (
                        <span
                          className={styles.dot}
                          style={{ background: project.color }}
                          title={`${row.name} is defined in ${project.label}`}
                        />
                      ) : (
                        <span className={styles.muted}>·</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {matrixRows.length === 0 && (
                <tr>
                  <td className={styles.td} colSpan={3 + portfolio.projects.length}>
                    No instrument is shared by that many projects.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card pad={0}>
        <PanelHead
          title="Field-level harmonization"
          hint="Compare one shared instrument field-by-field across the projects that define it."
          aside={
            <div className={styles.controlRow}>
              <label className={styles.selectLabel}>
                <span className="sr-only">Shared instrument</span>
                <select
                  className={styles.select}
                  value={selectedInstrument}
                  onChange={(event) => setInstrument(event.target.value)}
                  disabled={!shared.length}
                >
                  {shared.map((row) => (
                    <option key={row.name} value={row.name}>
                      {row.label} ({row.projects})
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={differencesOnly}
                  onChange={(event) => setDifferencesOnly(event.target.checked)}
                />
                <span>Only fields that differ</span>
              </label>
            </div>
          }
        />

        {!fieldsRequested && (
          <div className={styles.lazyPanel}>
            <p>
              Field-by-field comparison reads the full field index
              ({formatCount(portfolio.fieldIndex.rows)} fields). It is fetched only when you
              ask for it.
            </p>
            <Button size="sm" variant="secondary" onClick={() => setFieldsRequested(true)}>
              Load field index
            </Button>
          </div>
        )}

        {fieldsRequested && fieldIndex.isLoading && (
          <p className={styles.lazyPanel} role="status">
            Loading the field index…
          </p>
        )}

        {fieldsRequested && fieldIndex.isError && (
          <div className={styles.lazyPanel} role="alert">
            <p>The field index could not be loaded.</p>
            <Button size="sm" variant="secondary" onClick={() => void fieldIndex.refetch()}>
              Retry
            </Button>
          </div>
        )}

        {fieldsRequested && fieldIndex.data && (
          <>
            <section className={styles.kpis} aria-label="Harmonization headline">
              <KPI label="Fields (union)" value={formatCount(comparison.length)} sub={selectedInstrument} />
              <KPI label="Identical" value={formatCount(headline.identical)} sub="same type and label" />
              <KPI label="Label differs" value={formatCount(headline["label differs"])} sub="same type" />
              <KPI label="Type differs" value={formatCount(headline["type differs"])} sub="field type mismatch" />
              <KPI label="Partial" value={formatCount(headline.partial)} sub="missing from a project" />
            </section>

            <div className={styles.chartBody}>
              <HStack
                ariaLabel="Field consistency across projects"
                legend={consistencyLegend}
                emptyLabel="Select a shared instrument to compare its fields."
                rows={
                  comparison.length
                    ? [
                        {
                          key: selectedInstrument,
                          label: selectedInstrument,
                          total: comparison.length,
                          parts: consistencyLegend,
                        },
                      ]
                    : []
                }
              />
            </div>

            <div className={`${styles.tableWrap} ${styles.tall}`}>
              <table className={styles.table}>
                <caption className="sr-only">Field-by-field harmonization.</caption>
                <thead>
                  <tr>
                    <th scope="col" className={styles.th}>
                      Field
                    </th>
                    {instrumentProjects.map((key) => (
                      <th key={key} scope="col" className={styles.th}>
                        {projectLabels[key] ?? key}
                      </th>
                    ))}
                    <th scope="col" className={styles.th}>
                      Verdict
                    </th>
                    <th scope="col" className={`${styles.th} ${styles.thNum}`}>
                      Projects with field
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.slice(0, 500).map((row) => (
                    <tr key={row.field}>
                      <td className={`${styles.td} t-mono`}>{row.field}</td>
                      {instrumentProjects.map((key) => {
                        const cell = row.byProject[key];
                        return (
                          <td key={key} className={styles.td} title={cell?.label ?? "field absent"}>
                            {cell ? cell.type : <span className={styles.muted}>absent</span>}
                          </td>
                        );
                      })}
                      <td className={styles.td}>
                        <Badge kind={VERDICT_BADGES[row.verdict]} size="sm">
                          {row.verdict}
                        </Badge>
                      </td>
                      <td className={`${styles.td} ${styles.num} t-num`}>{row.present}</td>
                    </tr>
                  ))}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td className={styles.td} colSpan={3 + instrumentProjects.length}>
                        {comparison.length
                          ? "Every field in this instrument is identical across those projects."
                          : "No shared instrument selected."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <div className={styles.legendRow}>
        {portfolio.projects.map((project) => (
          <StudyChip key={project.key} label={project.label} color={project.color} />
        ))}
      </div>
    </div>
  );
}
