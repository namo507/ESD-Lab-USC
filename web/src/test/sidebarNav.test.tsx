import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Sidebar } from "@/components/shell/Sidebar";
import type { StudySummary } from "@/api/schemas";

const STUDY: StudySummary = {
  enrolled: 231,
  target: 260,
  groups: {
    VPT: { count: 184, target: 200 },
    ASIB: { count: 26, target: 30 },
    TD: { count: 21, target: 30 },
  },
};

function renderSidebar(initialEntry = "/overview") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Sidebar study={STUDY} qaPending={3} enrolled={231} />
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
  });

  it("shows the feature-gated Discovery preview section", () => {
    renderSidebar();

    expect(screen.getByText(/brand preview/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /discovery landing/i })).toHaveAttribute("href", "/discovery");
    expect(screen.getByRole("link", { name: /discovery overview/i })).toHaveAttribute("href", "/discovery/overview");
  });

  it("keeps existing navigation inside the Discovery route subtree", () => {
    renderSidebar("/discovery/overview");

    expect(screen.getByRole("link", { name: /^overview/i })).toHaveAttribute("href", "/discovery/overview");
    expect(screen.getByRole("link", { name: /redcap sync/i })).toHaveAttribute("href", "/discovery/redcap");
    expect(screen.getByRole("link", { name: /home study/i })).toHaveAttribute("href", "/discovery/participants?study=home");
  });
});
