import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NanoDashboardData } from "@/api/nanoDashboardData";
import { useUi } from "@/store/ui";

const dashboardData: NanoDashboardData = {
  meta: {
    study: "NANO",
    longName: "Neurodevelopment of Autonomic and Neural Organization",
    state: "Actively Enrolling",
    asOf: "2026-07-14T12:00:00Z",
    target: 260,
    source: "synthetic",
    aggregateOnly: true,
  },
  enrollment: {
    target: 260,
    enrolled: 0,
    active: 0,
    retentionPct: null,
    byGroup: [
      { group: "ASIB", target: 65, enrolled: 0 },
      { group: "PT", target: 130, enrolled: 0 },
      { group: "TD", target: 65, enrolled: 0 },
    ],
    funnel: [
      { stage: "Referred", count: 0 },
      { stage: "Enrolled", count: 0 },
    ],
    byGaStratum: [],
    bySite: [],
  },
  attention: {
    hdaSustainedPct: null,
    phases: [
      { phase: "Sustained", pct: null },
      { phase: "Orienting", pct: null },
      { phase: "Inattention", pct: null },
      { phase: "Termination", pct: null },
    ],
    hdaQualityBpm: null,
    byWindow: [{ window: "1-3m", sustainedPct: null }],
    byGroupWindow: [],
  },
  autonomic: {
    rsaBaselineMs2: null,
    cptdMeanC: null,
    byWindow: [],
    byGroupWindow: [],
  },
  schedule: [
    { id: "month_1", due: 0, upcoming14d: 0, overdue: 0, completed: 0, windowAdherencePct: null },
  ],
  pipeline: [
    { stage: "Ingested", count: 0, delta7d: 0, qcPassPct: null, qaPassed: 0 },
    { stage: "Model-ready", count: 0, delta7d: 0, qcPassPct: null, qaPassed: 0 },
  ],
  pipelineSummary: { qaPassedSessions: 0 },
  assessments: [
    { instrument: "NNNS-II", timepoint: "month_1", complete: 0, expected: 0, pctComplete: 0, applicable: true },
  ],
  inventory: [
    { item: "Actiheart-5 ECG", category: "ECG", inUse: 0, available: 0, calibrationDue: 0, reorderThreshold: null, lowStock: false, status: "ready" },
  ],
  checklists: {
    onboarding: [{ key: "consent", done: 0, total: 0 }],
    visitPrep: [],
    qc: [],
    openQcActions: 0,
    sopAckPct: null,
  },
  redcap: {
    apiTokenValid: true,
    lastSync: null,
    recordsLocked: 0,
    doubleEntryDiscrepancies: 0,
    instrumentsDefined: 0,
    dags: 0,
    syncHealth: "ok",
  },
  models: {
    aim3Status: "not_started",
    bestMetric: null,
    bestModel: null,
    metricName: null,
    shapReady: false,
    candidates: [],
  },
  library: { href: "/docs", label: "Open Library", indexSource: "approved docs", indexedDocuments: 0, lastIndexed: null },
};

const queryState = {
  data: dashboardData,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock("@/api/nanoDashboardData", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/nanoDashboardData")>();
  return { ...original, useNanoDashboardData: () => queryState };
});

import { NanoStudyDashboard } from "@/routes/NanoStudyDashboard";

function renderDashboard() {
  return render(
    <MemoryRouter>
      <NanoStudyDashboard />
    </MemoryRouter>,
  );
}

describe("NanoStudyDashboard", () => {
  beforeEach(() => {
    queryState.data = dashboardData;
    queryState.isLoading = false;
    queryState.isError = false;
    queryState.refetch.mockClear();
    useUi.getState().setChatOpen(false);
    useUi.getState().setChatSeed(null);
  });

  it("renders the supplied template structure as a standalone public dashboard", () => {
    renderDashboard();

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /heartbeat of every baby/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /primary navigation/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/nano study headline metrics/i)).toBeInTheDocument();
    expect(screen.getByText("Attention Phase Timeline")).toBeInTheDocument();
    expect(screen.getByText("Pipeline Watch")).toBeInTheDocument();
    expect(screen.getByText("Assistant Insight")).toBeInTheDocument();
    expect(screen.getByText(/no participant identifiers are exposed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export dashboard/i })).toBeInTheDocument();
  });

  it("renders numeric zero as 0 and preserves null as Awaiting data", () => {
    renderDashboard();

    const metrics = screen.getByLabelText(/nano study headline metrics/i);
    expect(within(metrics).getAllByText("0").length).toBeGreaterThan(0);
    expect(within(metrics).getAllByText("Awaiting data").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("cell", { name: "0" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "Attention phase distribution awaiting data" })).toBeInTheDocument();
    expect(screen.getByLabelText("Overall HDA awaiting data")).toBeEmptyDOMElement();
  });

  it("does not collapse incomplete schedule aggregates to zero", () => {
    queryState.data = {
      ...dashboardData,
      schedule: [
        { id: "month_1", due: 2, upcoming14d: 1, overdue: 0, completed: 4, windowAdherencePct: 90 },
        { id: "month_3", due: null, upcoming14d: null, overdue: null, completed: null, windowAdherencePct: null },
      ],
    };

    renderDashboard();

    expect(screen.getAllByText("visits due")[0]?.parentElement).toHaveTextContent(/Awaiting data\s+visits due/);
    expect(screen.getAllByText("visits upcoming")[0]?.parentElement).toHaveTextContent(/Awaiting data\s+visits upcoming/);
    expect(screen.getAllByText("visits overdue")[0]?.parentElement).toHaveTextContent(/Awaiting data\s+visits overdue/);
  });

  it("keeps unknown enrollment progress indeterminate and prefers the precise sync timestamp", () => {
    queryState.data = {
      ...dashboardData,
      meta: { ...dashboardData.meta, asOf: "2026-07-15" },
      enrollment: { ...dashboardData.enrollment, target: null, enrolled: 12 },
      redcap: { ...dashboardData.redcap, lastSync: "2026-07-15T14:30:00Z" },
    };

    renderDashboard();

    expect(screen.getByLabelText("Enrollment progress awaiting data")).not.toHaveAttribute("value");
    expect(screen.getByText(/Data refreshed Jul 15, 2026, 10:30 AM EDT/i)).toBeInTheDocument();
  });

  it("keeps the visible surface aggregate-only", () => {
    renderDashboard();

    expect(screen.getByText(/live aggregate nano metrics/i)).toBeInTheDocument();
    expect(screen.queryByText(/NANO-\d{3,}/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /participant/i })).not.toBeInTheDocument();
  });

  it("opens the shared local assistant with a grounded NANO prompt", () => {
    renderDashboard();

    fireEvent.click(screen.getByRole("button", { name: /ask a follow-up/i }));
    expect(useUi.getState().chatOpen).toBe(true);
    expect(useUi.getState().chatSeed).toMatch(/live aggregate nano attention/i);
  });

  it("supports the timeline controls and mobile navigation toggle", () => {
    renderDashboard();

    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByLabelText(/open menu/i));
    expect(screen.getByLabelText(/close menu/i)).toHaveAttribute("aria-expanded", "true");
  });

  it("shows final count-up values immediately for reduced-motion users", () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
    queryState.data = {
      ...dashboardData,
      enrollment: { ...dashboardData.enrollment, enrolled: 17 },
      attention: { ...dashboardData.attention, hdaSustainedPct: 70.1 },
    };

    renderDashboard();

    expect(screen.getAllByText("17").length).toBeGreaterThan(0);
    expect(screen.getAllByText("70.1").length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-reveal]:not([data-revealed="true"])')).toHaveLength(0);
    Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
  });
});
