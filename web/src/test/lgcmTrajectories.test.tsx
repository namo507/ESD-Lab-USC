import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const outcome = {
  asib_intercept_mean: 34,
  asib_slope_mean: 3.1,
  pt_intercept_mean: 30,
  pt_slope_mean: 3.6,
  td_intercept_mean: 38,
  td_slope_mean: 4.4,
  asib_vs_td_intercept_p: 0.018,
  asib_vs_td_slope_p: 0.006,
  pt_vs_td_intercept_p: 0.004,
  pt_vs_td_slope_p: 0.021,
  growth_curves: [
    { group: "asib", timepoint_m: 1, mean: 34, ci_low: 30, ci_high: 38 },
    { group: "asib", timepoint_m: 2, mean: 37, ci_low: 33, ci_high: 41 },
    { group: "td", timepoint_m: 1, mean: 38, ci_low: 34, ci_high: 42 },
    { group: "td", timepoint_m: 2, mean: 42, ci_low: 38, ci_high: 46 },
  ],
  individual_traces: [
    { group: "asib", participant: "ASIB-01", values: [{ timepoint_m: 1, value: 33 }, { timepoint_m: 2, value: 36 }] },
  ],
};

const studyData = {
  nano: { lgcm_results: { pct_sa: outcome, hr_decel: outcome, rsa: outcome } },
  nico: {},
  shared: {},
};

const mockState = { data: studyData as unknown, isLoading: false, isError: false };

vi.mock("@/api/studyData", () => ({
  useStudyData: () => mockState,
}));

import { LgcmTrajectories } from "@/routes/LgcmTrajectories";

function renderRoute() {
  return render(
    <MemoryRouter>
      <LgcmTrajectories />
    </MemoryRouter>,
  );
}

describe("LgcmTrajectories", () => {
  it("renders the LGCM growth curve view with outcome + group controls", () => {
    renderRoute();
    expect(screen.getByRole("heading", { name: /lgcm growth trajectories/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /lgcm growth curves/i })).toBeInTheDocument();
    // significance table renders the protocol contrasts
    expect(screen.getByText(/intercept diff · asib vs td/i)).toBeInTheDocument();
    expect(screen.getByText(/slope diff · pt vs td/i)).toBeInTheDocument();
  });

  it("labels award and aim from the protocol", () => {
    renderRoute();
    expect(screen.getByText(/R01MH132925/)).toBeInTheDocument();
  });

  it("states when individual traces and significance estimates are absent", () => {
    const aggregateOnlyOutcome = {
      ...outcome,
      individual_traces: [],
      asib_vs_td_intercept_p: null,
      asib_vs_td_slope_p: null,
      pt_vs_td_intercept_p: null,
      pt_vs_td_slope_p: null,
    };
    mockState.data = {
      nano: { lgcm_results: { pct_sa: aggregateOnlyOutcome, hr_decel: aggregateOnlyOutcome, rsa: aggregateOnlyOutcome } },
      nico: {},
      shared: {},
    } as unknown;

    renderRoute();

    expect(screen.getByText(/individual traces are not included in this data release/i)).toBeInTheDocument();
    expect(screen.getByText(/group-difference significance estimates are not available in this data release/i)).toBeInTheDocument();
    expect(screen.getByText(/group comparison availability/i)).toBeInTheDocument();
    expect(screen.queryByText(/^n\.s\.$/i)).not.toBeInTheDocument();
    mockState.data = studyData as unknown;
  });

  it("handles an empty result set without crashing", () => {
    mockState.data = { nano: { lgcm_results: {} }, nico: {}, shared: {} } as unknown;
    renderRoute();
    expect(screen.getByText(/no lgcm results available/i)).toBeInTheDocument();
    mockState.data = studyData as unknown;
  });
});
