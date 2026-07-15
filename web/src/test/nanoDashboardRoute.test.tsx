import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({ brand }: { brand?: string }) => (
    <div data-testid="app-shell" data-brand={brand ?? "default"}>
      <span>Legacy operator shell</span>
      <Outlet />
    </div>
  ),
}));

vi.mock("@/components/shell/ChatDrawer", () => ({
  ChatDrawer: ({ showLauncher }: { showLauncher?: boolean }) => (
    <div data-testid="nano-buddy" data-launcher={String(showLauncher ?? true)}>NANO Buddy</div>
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
  it("mounts /nano/dashboard outside the legacy operator shell and keeps Buddy", async () => {
    renderPath("/nano/dashboard");

    expect(await screen.findByRole("heading", { name: /nano dashboard route marker/i })).toBeInTheDocument();
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
    expect(screen.queryByText(/legacy operator shell/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("nano-buddy")).toHaveAttribute("data-launcher", "false");
  });

  it("preserves /nano as the existing LGCM redirect inside the legacy shell", async () => {
    renderPath("/nano");

    expect(await screen.findByRole("heading", { name: /existing lgcm route marker/i })).toBeInTheDocument();
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-brand", "default");
    expect(screen.queryByRole("heading", { name: /nano dashboard route marker/i })).not.toBeInTheDocument();
  });
});
