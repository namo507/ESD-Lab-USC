import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({ brand }: { brand?: string }) => (
    <div data-testid="app-shell" data-brand={brand ?? "default"}>
      <Outlet />
    </div>
  ),
}));

vi.mock("@/components/help/GuidedTour", () => ({ GuidedTourHost: () => null }));
vi.mock("@/routes/NanoStudyDashboard", () => ({
  NanoStudyDashboard: () => <h1>NANO dashboard route marker</h1>,
}));
vi.mock("@/routes/LgcmTrajectories", () => ({
  LgcmTrajectories: () => <h1>Existing LGCM route marker</h1>,
}));

import App from "@/App";

function renderPath(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("NANO dashboard route", () => {
  it("mounts the additive dashboard at /nano/dashboard in the discovery-blue shell", async () => {
    renderPath("/nano/dashboard");

    expect(await screen.findByRole("heading", { name: /nano dashboard route marker/i })).toBeInTheDocument();
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-brand", "esd-2026");
  });

  it("preserves /nano as the existing LGCM redirect", async () => {
    renderPath("/nano");

    expect(await screen.findByRole("heading", { name: /existing lgcm route marker/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /nano dashboard route marker/i })).not.toBeInTheDocument();
  });
});
