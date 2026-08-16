/**
 * Chart primitives for the REDCap metadata watcher.
 *
 * Three forms cover every panel on the page: a horizontal bar for magnitude
 * comparisons, a stacked horizontal bar for completion composition, and a
 * heatmap for pairwise instrument overlap. Each mark carries a direct value
 * label and a hover title, so identity and magnitude never depend on color
 * alone, and every chart on the page sits beside the table of the same data.
 */
import type { CSSProperties, ReactNode } from "react";
import styles from "./PortfolioCharts.module.css";

/** Study identity colors. Assigned in fixed order and never cycled: a study
 *  keeps its hue no matter which other studies are on screen. Dark-mode steps
 *  live in the stylesheet against the dark surface. */
export const STUDY_VAR: Record<string, string> = {
  nano: "var(--study-nano)",
  nico: "var(--study-nico)",
  ipsa: "var(--study-ipsa)",
  action: "var(--study-action)",
  abc: "var(--study-abc)",
};

export function studyColor(studyKey: string | null | undefined): string {
  const key = String(studyKey ?? "").toLowerCase();
  // Own-property check: `STUDY_VAR["toString"]` resolves up the prototype chain
  // to a function, which `??` happily accepts, so an unknown key like that
  // stringified a function into a CSS value instead of falling back.
  const hue = Object.hasOwn(STUDY_VAR, key) ? STUDY_VAR[key] : undefined;
  return hue ?? "var(--study-other)";
}

/** Same identity, darkened so white text on it clears 4.5. Use this wherever a
 *  study colour is a background with a label on it; `studyColor` stays for
 *  marks, where the requirement is 3:1 separation and the palette is validated
 *  for colour-vision deficiency. */
export function studyChipColor(studyKey: string | null | undefined): string {
  const key = String(studyKey ?? "").toLowerCase();
  return Object.hasOwn(STUDY_VAR, key)
    ? `var(--study-${key}-chip)`
    : "var(--study-other-chip)";
}

/** Completion states reuse the site's reserved status colors, so a green bar
 *  means the same thing here as on the REDCap Sync page. */
export const STATUS_COLOR = {
  complete: "var(--status-green)",
  unverified: "var(--status-amber)",
  incomplete: "var(--status-red)",
  not_started: "var(--status-grey)",
} as const;

export const STATUS_LABEL = {
  complete: "Complete",
  unverified: "Unverified",
  incomplete: "Incomplete",
  not_started: "Not started",
} as const;

export type StatusKey = keyof typeof STATUS_COLOR;

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString();
}

export function formatRate(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;
}

/* ── Horizontal bar ─────────────────────────────────────────────────────── */

export interface BarRow {
  key: string;
  label: string;
  value: number | null;
  color?: string;
  /** Overrides the printed value, e.g. a percentage or a suppression dash. */
  display?: string;
  tip?: string;
}

export interface HBarProps {
  rows: BarRow[];
  title: string;
  /** Fixed axis maximum; defaults to the largest value in the set. */
  max?: number;
  labelWidth?: number;
  empty?: ReactNode;
}

export function HBar({ rows, title, max, labelWidth = 132, empty }: HBarProps) {
  const ceiling = max ?? Math.max(1, ...rows.map((row) => row.value ?? 0));
  if (!rows.length) {
    return <p className={styles.empty}>{empty ?? "No data for this selection."}</p>;
  }

  return (
    <ul
      className={styles.bars}
      role="img"
      aria-label={title}
      style={{ "--label-w": `${labelWidth}px` } as CSSProperties}
    >
      {rows.map((row) => {
        const width = row.value === null ? 0 : (row.value / ceiling) * 100;
        return (
          <li key={row.key} className={styles.barRow}>
            <span className={styles.barLabel} title={row.label}>
              {row.label}
            </span>
            <span className={styles.barTrack}>
              <span
                className={styles.barFill}
                style={{
                  width: `${Math.max(row.value ? 1.5 : 0, width)}%`,
                  background: row.color ?? "var(--study-other)",
                }}
                title={row.tip ?? `${row.label}: ${row.display ?? formatCount(row.value)}`}
              />
            </span>
            <span className={styles.barValue}>{row.display ?? formatCount(row.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Stacked horizontal bar ─────────────────────────────────────────────── */

export interface StackRow {
  key: string;
  label: string;
  parts: Array<{ key: StatusKey; value: number }>;
  /** Rendered instead of the stack when small-cell suppression applies. */
  suppressed?: boolean;
  total?: number;
}

export function HStack({
  rows,
  title,
  labelWidth = 132,
  empty,
}: {
  rows: StackRow[];
  title: string;
  labelWidth?: number;
  empty?: ReactNode;
}) {
  if (!rows.length) {
    return <p className={styles.empty}>{empty ?? "No data for this selection."}</p>;
  }
  const ceiling = Math.max(
    1,
    ...rows.map((row) => row.total ?? row.parts.reduce((sum, part) => sum + part.value, 0)),
  );

  return (
    <ul
      className={styles.bars}
      role="img"
      aria-label={title}
      style={{ "--label-w": `${labelWidth}px` } as CSSProperties}
    >
      {rows.map((row) => {
        const total = row.total ?? row.parts.reduce((sum, part) => sum + part.value, 0);
        return (
          <li key={row.key} className={styles.barRow}>
            <span className={styles.barLabel} title={row.label}>
              {row.label}
            </span>
            <span className={styles.barTrack}>
              {row.suppressed ? (
                <span className={styles.suppressedFill} title="Counts below the small-cell threshold are withheld" />
              ) : (
                row.parts
                  .filter((part) => part.value > 0)
                  .map((part) => (
                    <span
                      key={part.key}
                      className={styles.stackPart}
                      style={{
                        width: `${(part.value / ceiling) * 100}%`,
                        background: STATUS_COLOR[part.key],
                      }}
                      title={`${row.label} · ${STATUS_LABEL[part.key]}: ${formatCount(part.value)}`}
                    />
                  ))
              )}
            </span>
            <span className={styles.barValue}>{row.suppressed ? "—" : formatCount(total)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function StatusLegend({ keys }: { keys?: StatusKey[] }) {
  const shown = keys ?? (["complete", "unverified", "incomplete", "not_started"] as StatusKey[]);
  return (
    <ul className={styles.legend}>
      {shown.map((key) => (
        <li key={key} className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: STATUS_COLOR[key] }} aria-hidden />
          {STATUS_LABEL[key]}
        </li>
      ))}
    </ul>
  );
}

/* ── Overlap heatmap ────────────────────────────────────────────────────── */

export interface HeatmapProps {
  keys: string[];
  cells: number[][];
  title: string;
  /** Maps a project key to the label shown on both axes. */
  labelFor?: (key: string) => string;
}

/**
 * Pairwise instrument overlap. One hue, light to dark, because the value is a
 * magnitude; the count is printed in every cell so the ramp never has to be
 * decoded by eye.
 */
export function Heatmap({ keys, cells, title, labelFor }: HeatmapProps) {
  if (keys.length < 2) {
    return <p className={styles.empty}>At least two connected projects are needed to compare.</p>;
  }
  const ceiling = Math.max(1, ...cells.flatMap((row, index) => row.filter((_, column) => column !== index)));

  return (
    <div className={styles.heatScroll}>
      <table className={styles.heat} aria-label={title}>
        <thead>
          <tr>
            <th scope="col" className={styles.heatCorner}>
              <span className="sr-only">Project</span>
            </th>
            {keys.map((key) => (
              <th key={key} scope="col" className={styles.heatHead}>
                {labelFor?.(key) ?? key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((rowKey, rowIndex) => (
            <tr key={rowKey}>
              <th scope="row" className={styles.heatRowHead}>
                {labelFor?.(rowKey) ?? rowKey}
              </th>
              {keys.map((columnKey, columnIndex) => {
                const value = cells[rowIndex]?.[columnIndex] ?? 0;
                const self = rowIndex === columnIndex;
                const intensity = self ? 0 : Math.min(1, value / ceiling);
                return (
                  <td
                    key={columnKey}
                    className={self ? `${styles.heatCell} ${styles.heatSelf}` : styles.heatCell}
                    style={
                      self
                        ? undefined
                        : { background: `color-mix(in srgb, var(--heat-ink) ${Math.round(intensity * 100)}%, transparent)` }
                    }
                    title={`${labelFor?.(rowKey) ?? rowKey} ∩ ${labelFor?.(columnKey) ?? columnKey}: ${value} shared instruments`}
                  >
                    <span className={intensity > 0.55 ? styles.heatValueOn : styles.heatValue}>
                      {self ? "·" : value}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Inline progress bar for tables ─────────────────────────────────────── */

export function ProgressCell({ rate }: { rate: number | null }) {
  if (rate === null) {
    return <span className={styles.progressEmpty} title="Withheld by the small-cell rule">—</span>;
  }
  const tone = rate >= 66 ? "var(--status-green)" : rate >= 33 ? "var(--status-blue)" : "var(--status-red)";
  return (
    <span className={styles.progress}>
      <span className={styles.progressTrack}>
        <span className={styles.progressFill} style={{ width: `${Math.max(2, rate)}%`, background: tone }} />
      </span>
      <span className={styles.progressValue}>{rate.toFixed(1)}%</span>
    </span>
  );
}
