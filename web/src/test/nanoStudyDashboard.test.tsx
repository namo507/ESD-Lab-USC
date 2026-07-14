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
  models: { aim3Status: "not_started", bestMetric: null, shapReady: false, candidates: [] },
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

  it("renders all ten progressively disclosed NANO dashboard sections", () => {
    renderDashboard();

    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /heartbeat of every baby's first year/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/nano study headline metrics/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /one cohort, three developmental pathways/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /what is due next/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /signal ingest to model-ready features/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /how regulation changes across infancy/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /completion at every milestone/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /the lab at a glance/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /study methods and sops/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ask the lab, stay grounded/i })).toBeInTheDocument();
    expect(screen.getAllByText(/view details/i).length).toBeGreaterThan(1);
    for (const sectionId of ["cohort", "schedule", "pipeline", "metrics", "assessments", "operations"]) {
      const section = document.getElementById(sectionId);
      const labelId = section?.getAttribute("aria-labelledby");
      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId!)?.tagName).toBe("H2");
    }
  });

  it("renders numeric zero as 0 and null metrics as Awaiting data", () => {
    renderDashboard();

    const enrolledCard = screen.getByText("Enrolled infants").closest("div");
    expect(enrolledCard).not.toBeNull();
    expect(within(enrolledCard!).getByText("0")).toBeInTheDocument();
    expect(screen.getAllByText("Awaiting data").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("cell", { name: "0" }).length).toBeGreaterThan(0);
  });

  it("keeps the public schedule aggregate-only", () => {
    renderDashboard();

    expect(screen.getByText(/public schedule reporting is restricted to counts/i)).toBeInTheDocument();
    expect(screen.getByText(/public surface intentionally exposes counts only/i)).toBeInTheDocument();
    const scheduleCaption = screen.getByText(/aggregate visit schedule counts/i);
    const scheduleTable = scheduleCaption.closest("table");
    expect(scheduleTable).not.toBeNull();
    expect(within(scheduleTable!).queryByRole("columnheader", { name: /participant/i })).not.toBeInTheDocument();
  });

  it("opens the existing local assistant drawer with a NANO aggregate prompt", () => {
    renderDashboard();

    fireEvent.click(screen.getByRole("button", { name: /hda by window/i }));
    expect(useUi.getState().chatOpen).toBe(true);
    expect(useUi.getState().chatSeed).toMatch(/aggregate metrics only/i);
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
    expect(screen.getByText("70.1")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-reveal]").length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-reveal]:not([data-revealed="true"])')).toHaveLength(0);
    Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
  });
});
