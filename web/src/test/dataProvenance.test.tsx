import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataProvenance } from "@/components/data/DataProvenance";
import type { DashboardSourceState } from "@/api/dashboardMetrics";

const LIVE: DashboardSourceState = {
  status: "live",
  label: "Live REDCap",
  detail: "Updated now · 8/8 projects healthy",
  isLive: true,
  generatedAt: "2026-08-07T12:00:00Z",
  ageSeconds: 30,
  projectsOk: 8,
  projectsTotal: 8,
};

describe("DataProvenance", () => {
  it("renders the live label only for a resolved live source", () => {
    render(<DataProvenance source={LIVE} />);

    expect(screen.getByRole("status")).toHaveAttribute("data-source-state", "live");
    expect(screen.getByText("Live REDCap")).toBeInTheDocument();
  });

  it("never emits a Live label for unavailable data", () => {
    render(<DataProvenance source={{ ...LIVE, status: "unavailable", label: "REDCap unavailable", isLive: false }} />);

    expect(screen.getByRole("status")).toHaveAttribute("data-source-state", "unavailable");
    expect(screen.queryByText(/live redcap/i)).not.toBeInTheDocument();
    expect(screen.getByText("REDCap unavailable")).toBeInTheDocument();
  });

  it("labels retained operational data as a snapshot", () => {
    render(<DataProvenance kind="snapshot" detail="Repository operation feed" />);

    expect(screen.getByRole("status")).toHaveAttribute("data-source-state", "snapshot");
    expect(screen.getByText("Snapshot")).toBeInTheDocument();
  });
});
