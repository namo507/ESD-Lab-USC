import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Sidebar } from "@/components/shell/Sidebar";
import type { DashboardSourceState, DashboardStudyMetrics } from "@/api/dashboardMetrics";

const STUDY: DashboardStudyMetrics = {
  key: "nano",
  label: "NANO",
  status: "ok",
  projectsTotal: 2,
  projectsOk: 2,
  enrollment: 221,
  target: 260,
  eventRecords: null,
  events: [],
  forms: {
    instrumentsTotal: null,
    incomplete: null,
    unverified: null,
    complete: null,
    unknown: null,
    total: null,
    completionRate: null,
  },
};

const SOURCE: DashboardSourceState = {
  status: "live",
  label: "Live REDCap",
  detail: "Updated now · 8/8 projects healthy",
  isLive: true,
  generatedAt: "2026-08-07T12:00:00Z",
  ageSeconds: 30,
  projectsOk: 8,
  projectsTotal: 8,
};

function renderSidebar(initialEntry = "/esd-lab") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Sidebar study={STUDY} sourceState={SOURCE} qaPending={3} />
    </MemoryRouter>,
  );
}

describe("Sidebar navigation", () => {
  it("adds the Presentation Maker link without dropping existing items", () => {
    renderSidebar();

    // New feature is reachable from the nav.
    const link = screen.getByRole("link", { name: /presentation maker/i });
    expect(link).toHaveAttribute("href", "/presentation-maker");

    // Existing infrastructure links are not regressed by the addition.
    expect(screen.getByRole("link", { name: /matlab bridge/i })).toHaveAttribute("href", "/matlab");
    expect(screen.getByRole("link", { name: /redcap sync/i })).toHaveAttribute("href", "/redcap");
    expect(screen.getByRole("link", { name: /window qa/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^nano study$/i })).toHaveAttribute("href", "/nano/dashboard");
  });

  it("retires the brand-preview group now that ESD 2026 is canonical", () => {
    renderSidebar();

    expect(screen.queryByText(/brand preview/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /discovery overview/i })).toBeNull();
    expect(screen.getByRole("link", { name: /^esd lab$/i })).toHaveAttribute("href", "/esd-lab");
  });

  it("keeps existing navigation inside the Discovery route subtree", () => {
    renderSidebar("/discovery/results");

    expect(screen.getByRole("link", { name: /^esd lab$/i })).toHaveAttribute("href", "/discovery/esd-lab");
    expect(screen.getByRole("link", { name: /redcap sync/i })).toHaveAttribute("href", "/discovery/redcap");
    expect(screen.getByRole("link", { name: /home study/i })).toHaveAttribute("href", "/discovery/participants?study=home");
  });
});
