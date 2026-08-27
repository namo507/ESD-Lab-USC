import { useMemo } from "react";
import type { DashboardMetrics } from "@/api/dashboardMetrics";
import { useUi, STUDY_FILTERS, type StudyFilter } from "@/store/ui";
import styles from "./StudySelector.module.css";

/**
 * Portfolio study scope, rendered in the sidebar under the logo.
 *
 * Options come from the live metrics payload rather than a hardcoded list, so
 * a sixth study reaching REDCap shows up here on its own. `ALL` is always
 * offered because the portfolio total is meaningful even when a single study
 * is unreachable.
 *
 * Selection lives in `uiStore.activeStudy` and persists to localStorage, so
 * every page, table, and chart filters to the chosen scope.
 */

interface StudyOption {
  value: StudyFilter;
  label: string;
  /** Enrollment for the scope, used as a compact secondary line. */
  detail: string | null;
  /** False when the payload has no data for this study right now. */
  available: boolean;
}

const ALL_OPTION_LABEL = "All";

export interface StudySelectorProps {
  /**
   * Live metrics, supplied by the shell.
   *
   * Passed in rather than fetched here so the sidebar stays presentational and
   * does not oblige every consumer to provide a QueryClient. Without it the
   * control still renders every scope, just without enrollment counts.
   */
  metrics?: DashboardMetrics | null;
}

export function StudySelector({ metrics }: StudySelectorProps = {}) {
  const activeStudy = useUi((s) => s.activeStudy);
  const setActiveStudy = useUi((s) => s.setActiveStudy);

  const options = useMemo<StudyOption[]>(() => {
    const reported = new Map(
      (metrics?.studies ?? []).map((study) => [study.key.toUpperCase(), study]),
    );

    const portfolio = metrics?.portfolio.studyEnrollments ?? null;
    const all: StudyOption = {
      value: "ALL",
      label: ALL_OPTION_LABEL,
      detail: portfolio !== null ? `${portfolio.toLocaleString()} enrolled` : null,
      available: true,
    };

    // Keep the declared order stable so the control does not reshuffle when a
    // study drops out of the payload.
    const studies = STUDY_FILTERS.filter((key) => key !== "ALL").map((key) => {
      const study = reported.get(key);
      return {
        value: key,
        label: study?.label ?? key,
        detail: study?.enrollment != null ? `${study.enrollment.toLocaleString()} enrolled` : null,
        available: Boolean(study),
      } satisfies StudyOption;
    });

    return [all, ...studies];
  }, [metrics]);

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}>Study scope</div>
      <div role="radiogroup" aria-label="Active study scope" className={styles.group}>
        {options.map((opt) => {
          const isActive = activeStudy === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              // A study absent from the payload stays selectable so the route
              // can explain why it is empty, rather than silently vanishing.
              aria-disabled={opt.available ? undefined : true}
              onClick={() => setActiveStudy(opt.value)}
              className={styles.option}
              data-active={isActive || undefined}
              data-unavailable={opt.available ? undefined : true}
              data-insight="study-scope"
              data-insight-term={opt.value === "ALL" ? "Portfolio scope" : `${opt.label} scope`}
              data-insight-body={
                opt.value === "ALL"
                  ? "Shows combined totals across every configured REDCap study. Individual study figures stay available by selecting that study."
                  : `Filters every metric, table, and chart on this page to ${opt.label}. ${
                      opt.available
                        ? "Figures come from that study's configured REDCap projects."
                        : "This study is not in the current aggregate payload, so panels will show an empty state."
                    }`
              }
            >
              <span className={styles.label}>{opt.label}</span>
              {opt.detail ? <span className={styles.detail}>{opt.detail}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
