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

function renderSidebar() {
  return render(
    <MemoryRouter>
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
});
