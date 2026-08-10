import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  REDCAP_PROJECT_IDENTITIES,
  type DashboardMetrics,
  type DashboardProjectKey,
  type DashboardSourceState,
} from "@/api/dashboardMetrics";
import { RedcapProjectStatusGrid } from "@/routes/Redcap";

const UNAVAILABLE_STATE: DashboardSourceState = {
  status: "unavailable",
  label: "REDCap unavailable",
  detail: "No verified aggregate metrics are available.",
  isLive: false,
  generatedAt: null,
  ageSeconds: null,
  projectsOk: 0,
  projectsTotal: 0,
};

const STALE_STATE: DashboardSourceState = {
  status: "stale",
  label: "Stale REDCap",
  detail: "Last verified Aug 7, 2026 · 8/8 projects reported",
  isLive: false,
  generatedAt: "2026-08-07T12:00:00Z",
  ageSeconds: 1_000,
  projectsOk: 8,
  projectsTotal: 8,
};

function metricsFixture(): DashboardMetrics {
  const projectKeys = Object.keys(REDCAP_PROJECT_IDENTITIES) as DashboardProjectKey[];
  return {
    schema: "dashboard.metrics.v1",
    dataVersion: `sha256:${"a".repeat(64)}`,
    generatedAt: "2026-08-07T12:00:00Z",
    aggregateOnly: true,
    source: {
      kind: "live",
      declaredKind: "live",
      system: "REDCap",
      refreshCadenceSeconds: 300,
      slaSeconds: 900,
      projectsTotal: 8,
      projectsOk: 8,
    },
    portfolio: {
      status: "ok",
      studiesTotal: 5,
      studiesReporting: 5,
      studyEnrollments: null,
      studyEnrollmentsSuppressed: true,
      eventRecords: null,
      eventRecordsSuppressed: true,
      forms: {
        instrumentsTotal: null,
        incomplete: null,
        unverified: null,
        complete: null,
        unknown: null,
        total: null,
        completionRate: null,
        countsSuppressed: true,
      },
    },
    studies: [],
    projects: projectKeys.map((key, index) => {
      const identity = REDCAP_PROJECT_IDENTITIES[key];
      const suppressed = index === 0;
      return {
        key,
        study: identity.study,
        role: identity.role,
        projectId: identity.projectId,
        title: `${key.replaceAll("_", " ")} aggregate project`,
        status: "ok",
        enrollmentAuthority: identity.enrollmentAuthority,
        records: suppressed ? null : 10,
        recordsSuppressed: suppressed,
        eventRecords: suppressed ? null : 20,
        eventRecordsSuppressed: suppressed,
        events: [],
        forms: {
          instrumentsTotal: 3,
          incomplete: suppressed ? null : 10,
          unverified: suppressed ? null : 0,
          complete: suppressed ? null : 90,
          unknown: suppressed ? null : 0,
          total: suppressed ? null : 100,
          completionRate: suppressed ? null : 90,
          countsSuppressed: suppressed,
        },
        errorCode: null,
      };
    }),
  };
}

describe("REDCap eight-project status grid", () => {
  it("announces the loading state without inventing project values", () => {
    render(
      <RedcapProjectStatusGrid
        metrics={undefined}
        sourceState={UNAVAILABLE_STATE}
        isLoading
        isFetching
        isError={false}
        onReload={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/loading aggregate project snapshot/i);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("shows a recoverable error with honest reload wording", () => {
    const onReload = vi.fn();
    render(
      <RedcapProjectStatusGrid
        metrics={undefined}
        sourceState={UNAVAILABLE_STATE}
        isLoading={false}
        isFetching={false}
        isError
        onReload={onReload}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/snapshot unavailable/i);
    fireEvent.click(screen.getByRole("button", { name: /reload snapshot/i }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("renders all eight aggregate identities and labels stale and suppressed values", () => {
    render(
      <RedcapProjectStatusGrid
        metrics={metricsFixture()}
        sourceState={STALE_STATE}
        isLoading={false}
        isFetching={false}
        isError={false}
        onReload={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByText(/this snapshot is stale/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/suppressed for privacy/i)).toHaveLength(3);
    expect(screen.getByText(/abc_surveys · #1140/i)).toBeInTheDocument();
    expect(screen.getByText(/tokens and participant rows are rejected/i)).toBeInTheDocument();
  });

  it("keeps a prior snapshot visible when a reload fails", () => {
    render(
      <RedcapProjectStatusGrid
        metrics={metricsFixture()}
        sourceState={STALE_STATE}
        isLoading={false}
        isFetching={false}
        isError
        onReload={vi.fn()}
      />,
    );

    expect(screen.getByText(/reload failed; showing the prior snapshot/i)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
  });
});
