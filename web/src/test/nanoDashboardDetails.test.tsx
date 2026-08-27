import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { NanoDashboardData } from "@/api/nanoDashboardData";
import { NanoDashboardDetails } from "@/routes/nano/NanoDashboardDetails";
import { useUi } from "@/store/ui";

const aggregateData: NanoDashboardData = {
  meta: {
    study: "NANO",
    longName: "Neurodevelopment of Autonomic and Neural Organization",
    state: "Actively Enrolling",
    asOf: "2026-07-14T12:00:00Z",
    target: 333,
    source: "synthetic",
    aggregateOnly: true,
  },
  enrollment: {
    target: 333,
    enrolled: 37,
    active: 31,
    retentionPct: 88.2,
    byGroup: [
      { group: "ASIB", target: 81, enrolled: 9 },
      { group: "PT", target: 171, enrolled: 18 },
      { group: "TD", target: 81, enrolled: 10 },
    ],
    funnel: [
      { stage: "Referred", count: 70 },
      { stage: "Screened", count: 54 },
      { stage: "Consented", count: 41 },
      { stage: "Enrolled", count: 37 },
      { stage: "Active", count: 31 },
    ],
    byGaStratum: [{ label: "early_preterm", count: 5 }],
    bySite: [{ label: "Main research suite", count: 37 }],
  },
  attention: {
    hdaSustainedPct: 61.2,
    phases: [
      { phase: "Sustained", pct: 61.2 },
      { phase: "Orienting", pct: 17.4 },
      { phase: "Termination", pct: 8.1 },
      { phase: "Inattention", pct: 13.3 },
    ],
    hdaQualityBpm: -6.4,
    byWindow: [
      { window: "1-3m", sustainedPct: 57.5 },
      { window: "6m", sustainedPct: 61.2 },
    ],
    byGroupWindow: [
      {
        group: "ASIB",
        window: "1-3m",
        sustainedPct: 54.1,
        orientingPct: 18.2,
        terminationPct: 9.1,
        inattentionPct: 18.6,
        hdaQualityBpm: -5.8,
      },
    ],
  },
  autonomic: {
    rsaBaselineMs2: 5.123,
    cptdMeanC: 0.42,
    byWindow: [{ window: "1-3m", rsaBaselineMs2: 4.987, cptdMeanC: 0.38 }],
    byGroupWindow: [{ group: "ASIB", window: "1-3m", rsaBaselineMs2: 4.765, cptdMeanC: 0.31 }],
  },
  schedule: [
    { id: "month_1", due: 2, upcoming14d: 3, overdue: 0, completed: 21, windowAdherencePct: 96.5 },
    { id: "month_6", due: 1, upcoming14d: 2, overdue: 1, completed: 14, windowAdherencePct: 91.2 },
  ],
  pipeline: [
    { stage: "Ingested", count: 27, delta7d: 3, qcPassPct: 92.4, qaPassed: 25 },
    { stage: "Pre-model-ready review", count: 999, delta7d: 99, qcPassPct: 1, qaPassed: 1 },
    { stage: "ECG preproc", count: 23, delta7d: 2, qcPassPct: 95.6, qaPassed: 22 },
    { stage: "Model-ready", count: 11, delta7d: 0, qcPassPct: 100, qaPassed: 11 },
  ],
  pipelineSummary: { qaPassedSessions: 25 },
  assessments: [
    { instrument: "NNNS-II", timepoint: "month_1", complete: 9, expected: 10, pctComplete: 90, applicable: true },
    { instrument: "CSBS", timepoint: "month_6", complete: 7, expected: 8, pctComplete: 87.5, applicable: true },
  ],
  inventory: [
    { item: "Actiheart-5 ECG", category: "ECG", inUse: 3, available: 4, calibrationDue: 1, reorderThreshold: null, lowStock: false, status: "ready" },
    { item: "Squirrel temp datalogger", category: "temperature", inUse: 2, available: 1, calibrationDue: 0, reorderThreshold: null, lowStock: true, status: "low_stock" },
  ],
  checklists: {
    onboarding: [{ key: "consent", done: 30, total: 31 }],
    visitPrep: [{ key: "device_charge", done: 28, total: 31 }],
    qc: [{ key: "signal_review", done: 24, total: 25 }],
    openQcActions: 1,
    sopAckPct: 94.6,
  },
  redcap: {
    apiTokenValid: true,
    lastSync: "2026-07-14T11:30:00Z",
    recordsLocked: 12,
    doubleEntryDiscrepancies: 1,
    instrumentsDefined: 22,
    dags: 3,
    syncHealth: "ok",
  },
  models: {
    aim3Status: "training",
    bestMetric: 0.812,
    bestModel: "Random forest",
    metricName: "AUROC",
    shapReady: true,
    candidates: [{ model: "Random forest", metric_name: "AUROC", value: 0.812 }],
  },
  library: {
    href: "/docs",
    label: "NANO reading library",
    indexSource: "approved docs",
    indexedDocuments: 19,
    lastIndexed: "2026-07-14T10:00:00Z",
  },
};

function renderDetails(data: NanoDashboardData = aggregateData) {
  return render(<NanoDashboardDetails data={data} />);
}

function openEveryDisclosure(container: HTMLElement) {
  container.querySelectorAll("summary").forEach((summary) => fireEvent.click(summary));
}

describe("NanoDashboardDetails", () => {
  beforeEach(() => {
    useUi.getState().setChatOpen(false);
    useUi.getState().setChatSeed(null);
  });

  it("renders every required Section 5 detail surface and the source context", () => {
    renderDetails();

    for (const heading of [
      "Enrollment and cohort",
      "Visit schedule tracker",
      "Data pipeline and QC",
      "Autonomic and attention metrics",
      "Assessments",
      "Operations hub",
      "Library",
      "ESD Lab Buddy",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }

    const context = screen.getByLabelText("Dashboard data context");
    expect(within(context).getByText("Synthetic data")).toBeInTheDocument();
    expect(within(context).getByText("Aggregate only")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/no participant identifiers.*protected health information/i);
  });

  it("keeps depth behind initially collapsed semantic disclosures", () => {
    const { container } = renderDetails();
    const expectedSummaries = [
      "View cohort details",
      "View visit schedule details",
      "View pipeline and QC details",
      "View autonomic and attention details",
      "View assessment details",
      "View inventory details",
      "View checklist and compliance details",
      "View REDCap and model details",
    ];

    const disclosures = Array.from(container.querySelectorAll("details"));
    expect(disclosures).toHaveLength(expectedSummaries.length);
    disclosures.forEach((details) => expect(details).not.toHaveAttribute("open"));

    expectedSummaries.forEach((label) => {
      const summary = screen.getByText(label);
      expect(summary.tagName).toBe("SUMMARY");
      expect(summary.closest("details")).not.toHaveAttribute("open");
    });

    fireEvent.click(screen.getByText("View cohort details"));
    expect(screen.getByText("View cohort details").closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("region", { name: /enrollment by study group.*scroll horizontally/i })).toHaveAttribute("tabindex", "0");
  });

  it("binds the disclosed cohort, schedule, pipeline, research, assessment, and operations depth to aggregate data", () => {
    const { container } = renderDetails();
    openEveryDisclosure(container);

    const enrollment = screen.getByRole("table", { name: "Enrollment by study group" });
    expect(within(enrollment).getByRole("rowheader", { name: "ASIB" })).toBeInTheDocument();
    const schedule = screen.getByRole("table", { name: "Visit schedule by timepoint" });
    expect(within(schedule).getByRole("rowheader", { name: "Month 1" })).toBeInTheDocument();
    const pipeline = screen.getByRole("table", { name: "Aggregate pipeline stages and quality status" });
    expect(within(pipeline).getByRole("rowheader", { name: "ECG preproc" })).toBeInTheDocument();
    expect(screen.getByLabelText("model-ready sessions: 11")).toBeInTheDocument();
    const phases = screen.getByRole("table", { name: "Attention phases" });
    expect(within(phases).getByRole("rowheader", { name: "Orienting" })).toBeInTheDocument();
    const assessments = screen.getByRole("table", { name: "Assessment completion matrix by instrument and timepoint" });
    expect(within(assessments).getByRole("rowheader", { name: "NNNS-II" })).toBeInTheDocument();
    const inventory = screen.getByRole("table", { name: "Aggregate study inventory" });
    expect(within(inventory).getByRole("rowheader", { name: "Actiheart-5 ECG" })).toBeInTheDocument();
    const onboarding = screen.getByRole("table", { name: "Onboarding checklist" });
    expect(within(onboarding).getByRole("rowheader", { name: "Consent" })).toBeInTheDocument();
    expect(screen.getByText("Double-entry discrepancies")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open reading library/i })).toHaveAttribute("href", "/docs");
  });

  it("preserves zero while presenting missing values as Awaiting data", () => {
    const zeroAndNull: NanoDashboardData = {
      ...aggregateData,
      enrollment: {
        ...aggregateData.enrollment,
        enrolled: 0,
        active: 0,
        retentionPct: null,
        byGroup: [{ group: "ASIB", target: 81, enrolled: 0 }],
      },
      attention: {
        ...aggregateData.attention,
        hdaSustainedPct: 0,
        hdaQualityBpm: null,
        phases: [{ phase: "Sustained", pct: null }],
      },
      autonomic: { ...aggregateData.autonomic, rsaBaselineMs2: 0, cptdMeanC: null },
      schedule: [{ id: "month_1", due: 0, upcoming14d: null, overdue: 0, completed: 0, windowAdherencePct: null }],
      pipeline: [{ stage: "Ingested", count: 0, delta7d: 0, qcPassPct: null, qaPassed: 0 }],
      pipelineSummary: { qaPassedSessions: 0 },
      assessments: [{ instrument: "NNNS-II", timepoint: "month_1", complete: 0, expected: 0, pctComplete: null, applicable: true }],
      inventory: [{ ...aggregateData.inventory[0]!, inUse: 0, available: 0, calibrationDue: null }],
      checklists: { ...aggregateData.checklists, openQcActions: 0, sopAckPct: null },
      redcap: { ...aggregateData.redcap, recordsLocked: 0, doubleEntryDiscrepancies: 0 },
      library: { ...aggregateData.library, indexedDocuments: 0, lastIndexed: null },
    };
    const { container } = renderDetails(zeroAndNull);

    expect(screen.getByLabelText("visits overdue: 0")).toBeInTheDocument();
    expect(screen.getByLabelText("model-ready sessions: Awaiting data")).toBeInTheDocument();
    expect(screen.getByLabelText("sustained attention: 0.0%")).toBeInTheDocument();
    expect(screen.getByLabelText("documents indexed: 0")).toBeInTheDocument();
    expect(screen.getAllByText("Awaiting data").length).toBeGreaterThan(0);

    openEveryDisclosure(container);
    const schedule = screen.getByRole("table", { name: "Visit schedule by timepoint" });
    const scheduleRow = within(schedule).getByRole("row", { name: /Month 1/ });
    expect(within(scheduleRow).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "0",
      "Awaiting data",
      "0",
      "0",
      "Awaiting data",
    ]);
  });

  it("stays aggregate-only and seeds the shared Buddy with privacy-safe context", () => {
    renderDetails();

    for (const forbiddenHeader of ["Participant", "Participant ID", "Name", "MRN", "DOB", "Free text", "Raw signal"]) {
      expect(screen.queryByRole("columnheader", { name: forbiddenHeader })).not.toBeInTheDocument();
    }
    expect(document.body).not.toHaveTextContent(/NANO-\d{3,}/i);

    fireEvent.click(screen.getByRole("button", { name: /summarize current nano cohort progress/i }));
    expect(useUi.getState().chatOpen).toBe(true);
    expect(useUi.getState().chatSeed).toMatch(/aggregate data only/i);
    expect(useUi.getState().chatSeed).not.toMatch(/\b(?:name|mrn|dob)\b/i);
  });

  it("fails closed when aggregate-only status is false or unknown", () => {
    const unsafe = { ...aggregateData, meta: { ...aggregateData.meta, aggregateOnly: false } };
    const { rerender } = render(<NanoDashboardDetails data={unsafe} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/not marked aggregate-only/i);
    expect(screen.queryByRole("heading", { name: "Enrollment and cohort" })).not.toBeInTheDocument();

    rerender(<NanoDashboardDetails data={{ ...unsafe, meta: { ...unsafe.meta, aggregateOnly: null } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/did not confirm its aggregate-only status/i);
  });

  it("keeps empty collections and date-only context honest", () => {
    const empty: NanoDashboardData = {
      ...aggregateData,
      meta: { ...aggregateData.meta, asOf: "2026-07-15", source: "secure" },
      enrollment: { ...aggregateData.enrollment, byGroup: [], bySite: [], funnel: [], byGaStratum: [] },
      schedule: [],
      pipeline: [],
      assessments: [],
      inventory: [],
      redcap: { ...aggregateData.redcap, apiTokenValid: null, syncHealth: null, lastSync: null },
      models: { ...aggregateData.models, candidates: [] },
    };
    renderDetails(empty);

    expect(screen.getByLabelText("Dashboard data context")).toHaveTextContent("As of Jul 15, 2026");
    expect(screen.getByLabelText("visits overdue: Awaiting data")).toBeInTheDocument();
    expect(screen.getByLabelText("aggregate form coverage: Awaiting data")).toBeInTheDocument();
    expect(screen.queryByText("0 / 0")).not.toBeInTheDocument();
    expect(screen.getByText("Equipment readiness").closest("article")).toHaveTextContent("Awaiting data");
    expect(screen.getByText("REDCap and data systems").closest("article")).toHaveTextContent("Awaiting data");
    fireEvent.click(screen.getByText("View REDCap and model details"));
    expect(screen.getByText("Candidates reported").closest("div")).toHaveTextContent("Awaiting data");
  });
});
