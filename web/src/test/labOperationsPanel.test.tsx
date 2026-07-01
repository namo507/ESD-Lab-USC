import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LabOperationsPanelContent } from "@/components/studies/LabOperationsPanel";
import { useUi } from "@/store/ui";
import type { LabOperationsData } from "@/api/studyData";

const operations = {
  generated_at: "2026-07-01T00:00:00Z",
  source_documents: [
    { study: "NANO", file: "esd-lab-readings/NANO.pdf", pages: 107, award: "R01MH132925", status: "primary" },
    { study: "NICO", file: "esd-lab-readings/NICO.pdf", pages: 105, award: "R01MH138028", status: "secondary" },
  ],
  priority: {
    primary_objective: "Improve lab workflow.",
    secondary_objective: "Align research outputs with operations.",
    current_priority: "Nano grant data and lab processes first; Nico remains visible.",
    decision_dependency: "Pace rollout with Sam and Dr. Bradshaw.",
    scope_guardrail: "Use de-identified aggregate status only.",
  },
  dashboard_surface_status: [
    { area: "Overview", status: "live", shown: "KPIs and study hero.", next_need: "Show operations workflow." },
    { area: "Assistant", status: "live", shown: "Buddy and local chat.", next_need: "Ground operations answers." },
  ],
  current_problems: [],
  recommendations: [],
  workflow_phases: [
    {
      id: "phase-1",
      phase: "Onboarding and observation",
      timeframe: "Weeks 1-2",
      status: "active",
      study_focus: "Nano first, Nico document context second",
      tasks: ["Read grant documents", "Shadow coordinators"],
      outputs: ["Initial process map", "Quick-win opportunity list"],
      owners: ["Coordinator"],
    },
    {
      id: "phase-2",
      phase: "Data and process standardization",
      timeframe: "Weeks 3-4",
      status: "next",
      study_focus: "Nano REDCap and coding conventions",
      tasks: ["Explore Nano REDCap"],
      outputs: ["Draft operational metrics list"],
      owners: ["Graduate students"],
    },
  ],
  role_workflows: [
    { role: "Coordinators", focus: "Visits and blockers.", handoff: "Daily check-in notes." },
    { role: "Undergraduates", focus: "Coding support.", handoff: "Coding logs." },
  ],
  draft_metrics: [
    { name: "REDCap freshness", kind: "operations", definition: "Hours since sync.", status: "live" },
  ],
  daily_routine: [
    { block: "Morning check-in", purpose: "Align priorities." },
    { block: "Afternoon check-in", purpose: "Capture blockers." },
  ],
  rollout_controls: ["All data access stays within business hours."],
  quick_wins: ["Add a Nano-first operations panel."],
  family_data_sharing: {
    current_state: "Text updates and individual feedback on request.",
    near_term_policy: "Do not add family-facing participant visualizations yet.",
    future_option: "Explore aggregate insights after review.",
  },
  assistant_sync: {
    context_key: "lab_operations",
    buddy_insights: ["lab-ops-priority"],
    fast_paths: ["Summarize the Nano-first rollout plan."],
  },
} satisfies LabOperationsData;

describe("LabOperationsPanel", () => {
  beforeEach(() => {
    useUi.setState({ activeStudy: "BOTH", chatOpen: false, chatSeed: null });
  });

  it("renders the Nano-first workflow status and dashboard inventory", () => {
    render(<LabOperationsPanelContent operations={operations} />);

    expect(screen.getByText(/Nano-first lab workflow/i)).toBeInTheDocument();
    expect(screen.getByText("Onboarding and observation")).toBeInTheDocument();
    expect(screen.getByText("Data and process standardization")).toBeInTheDocument();
    expect(screen.getByText("Current dashboard status")).toBeInTheDocument();
    expect(screen.getByText(/Do not add family-facing participant visualizations yet/i)).toBeInTheDocument();
  });

  it("seeds ESD Buddy from the rollout action", () => {
    render(<LabOperationsPanelContent operations={operations} />);
    fireEvent.click(screen.getByRole("button", { name: /Ask Buddy/i }));

    expect(useUi.getState().chatOpen).toBe(true);
    expect(useUi.getState().chatSeed).toMatch(/Nano-first rollout plan/i);
  });
});
