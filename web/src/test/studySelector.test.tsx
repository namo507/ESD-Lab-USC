import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { StudySelector } from "@/components/shell/StudySelector";
import { parseDashboardMetrics } from "@/api/dashboardMetrics";
import { useUi, loadInitialStudy, normalizeStudyFilter } from "@/store/ui";

function forms() {
  return {
    incomplete: 1,
    unverified: 0,
    complete: 4,
    unknown: 0,
    total: 5,
    completion_rate: 0.8,
  };
}

function metricsFixture() {
  return parseDashboardMetrics({
    schema: "dashboard.metrics.v1",
    data_version: "sha256:test",
    generated_at: new Date().toISOString(),
    aggregate_only: true,
    source: {
      kind: "live",
      system: "REDCap",
      cadence: "every_30_minutes",
      sla: { max_age_minutes: 90 },
      projects_total: 8,
      projects_ok: 8,
    },
    portfolio: { status: "ok", studies_total: 5, studies_reporting: 5, study_enrollments: 655, forms: forms() },
    studies: [
      { key: "abc", label: "ABC", enrollment: 128, forms: forms() },
      { key: "ipsa", label: "IPSA", enrollment: 167, forms: forms() },
      { key: "action", label: "ACTION", enrollment: 56, forms: forms() },
      { key: "nico", label: "NICO", enrollment: 83, forms: forms() },
      { key: "nano", label: "NANO", enrollment: 221, target: 260, forms: forms() },
    ],
    projects: [],
  });
}

describe("StudySelector", () => {
  beforeEach(() => {
    useUi.setState({ activeStudy: "ALL" });
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("offers all five studies plus the portfolio scope", () => {
    render(<StudySelector />);

    for (const label of ["All", "ABC", "IPSA", "ACTION", "NICO", "NANO"]) {
      expect(screen.getByRole("radio", { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
  });

  it("updates the active study in the store and persists it", () => {
    render(<StudySelector />);

    fireEvent.click(screen.getByRole("radio", { name: /^NICO/ }));

    expect(useUi.getState().activeStudy).toBe("NICO");
    expect(screen.getByRole("radio", { name: /^NICO/ })).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem("esd-active-study")).toBe("NICO");
  });

  it("shows enrollment counts when metrics are supplied", () => {
    render(<StudySelector metrics={metricsFixture()} />);

    expect(screen.getByRole("radio", { name: /NANO 221 enrolled/ })).toBeInTheDocument();
    // ALL uses the portfolio total, not a sum of the study rows.
    expect(screen.getByRole("radio", { name: /All 655 enrolled/ })).toBeInTheDocument();
  });

  it("renders every scope without metrics rather than collapsing to nothing", () => {
    render(<StudySelector metrics={null} />);

    expect(screen.getAllByRole("radio")).toHaveLength(6);
  });

  it("marks a study absent from the payload as unavailable but still selectable", () => {
    const metrics = metricsFixture();
    const withoutAbc = { ...metrics, studies: metrics.studies.filter((s) => s.key !== "abc") };

    render(<StudySelector metrics={withoutAbc} />);
    const abc = screen.getByRole("radio", { name: /^ABC/ });

    expect(abc).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(abc);
    expect(useUi.getState().activeStudy).toBe("ABC");
  });
});

describe("study scope persistence", () => {
  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("migrates the retired BOTH toggle to the portfolio scope", () => {
    // Anyone who used the dashboard before the portfolio rollout still has
    // this value stored; it must resolve, not reset.
    window.localStorage.setItem("esd-active-study", "BOTH");
    expect(loadInitialStudy()).toBe("ALL");
  });

  it("accepts every current scope and rejects unknown values", () => {
    for (const scope of ["ALL", "ABC", "IPSA", "ACTION", "NICO", "NANO"]) {
      expect(normalizeStudyFilter(scope)).toBe(scope);
    }
    expect(normalizeStudyFilter("nano")).toBe("NANO");
    expect(normalizeStudyFilter("NOT_A_STUDY")).toBeNull();
    expect(normalizeStudyFilter(undefined)).toBeNull();
  });

  it("falls back to the portfolio scope when storage holds junk", () => {
    window.localStorage.setItem("esd-active-study", "{}");
    expect(loadInitialStudy()).toBe("ALL");
  });
});
