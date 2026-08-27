import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const aim3 = {
  n_clusters: 3,
  silhouette_score: 0.61,
  epsilon: 1.8,
  min_samples: 4,
  tsne_coords: [
    { participant: "VPT-001", x: -6, y: 4, cluster: 0, ados_css: 3.2, ga_weeks: 27.1, top_shap_feature: "rsa_cwt" },
    { participant: "VPT-002", x: 5.5, y: 5, cluster: 1, ados_css: 6.8, ga_weeks: 25.4, top_shap_feature: "sai" },
    { participant: "VPT-003", x: 0.5, y: -6.5, cluster: 2, ados_css: 5.1, ga_weeks: 30.2, top_shap_feature: "pai" },
  ],
  trajectory_by_cluster: {},
  trajectory_metrics: [],
  hotelling_t2_matrix: [
    [1, 0.002, 0.014],
    [0.002, 1, 0.041],
    [0.014, 0.041, 1],
  ],
  cluster_ados_css: { "0": 3.2, "1": 6.8, "2": 5.1 },
};

const studyData = { nano: {}, nico: { aim3_clusters: aim3 }, shared: {} };
const mockState = { data: studyData as unknown, isLoading: false, isError: false };

vi.mock("@/api/studyData", () => ({
  useStudyData: () => mockState,
}));

import { Aim3Clusters } from "@/routes/Aim3Clusters";

function renderRoute() {
  return render(
    <MemoryRouter>
      <Aim3Clusters />
    </MemoryRouter>,
  );
}

describe("Aim3Clusters", () => {
  it("renders the DBSCAN cluster view with parameters and scatter", () => {
    renderRoute();
    expect(screen.getByRole("heading", { name: /phenotypic clusters/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /t-sne cluster scatter/i })).toBeInTheDocument();
    expect(screen.getByText("Silhouette")).toBeInTheDocument();
    expect(screen.getByText("0.61")).toBeInTheDocument();
  });

  it("handles an empty cluster solution without crashing", () => {
    mockState.data = { nano: {}, nico: { aim3_clusters: { ...aim3, tsne_coords: [] } }, shared: {} } as unknown;
    renderRoute();
    expect(screen.getByText(/no cluster solution available/i)).toBeInTheDocument();
    mockState.data = studyData as unknown;
  });
});
