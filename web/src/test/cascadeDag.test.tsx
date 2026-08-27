import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/api/hooks", () => ({
  useCascadeDag: () => ({
    isLoading: false,
    data: {
      data: [
        ["NICU stress physiology", "Autonomic regulation", "context", "physiology", 0.78, "HRC + RSA coupling"],
        ["Autonomic regulation", "Sustained attention", "physiology", "attention", 0.72, "HDA phase stability"],
        ["Caregiver co-regulation", "Sustained attention", "family", "attention", 0.54, "home-study linkage"],
        ["Sustained attention", "Social communication", "attention", "behavior", 0.64, "CSBS + M-CHAT"],
        ["Thermal stability", "Autonomic regulation", "physiology", "physiology", 0.48, "central-peripheral gradient"],
        ["Social communication", "Adaptive outcome", "behavior", "outcome", 0.69, "Bayley + Vineland"],
      ].map(([source, target, sourceDomain, targetDomain, weight, evidence]) => ({
        source,
        target,
        sourceDomain,
        targetDomain,
        weight,
        evidence,
      })),
    },
  }),
}));

import { CascadeDag } from "@/routes/CascadeDag";

function renderPage() {
  return render(
    <MemoryRouter>
      <CascadeDag />
    </MemoryRouter>,
  );
}

describe("CascadeDag", () => {
  it("renders the layered graph with summary metrics", () => {
    renderPage();
    expect(screen.getByText("Developmental Cascade DAG")).toBeInTheDocument();
    // 7 factors, 6 links, depth 5 from the longest causal chain.
    expect(screen.getByText("Factors").parentElement).toHaveTextContent("7");
    expect(screen.getByText("Mechanistic links").parentElement).toHaveTextContent("6");
    expect(screen.getByText("Cascade depth").parentElement).toHaveTextContent("5");
    // Every factor node is rendered as an accessible button.
    expect(screen.getByRole("button", { name: /Sustained attention/ })).toBeInTheDocument();
  });

  it("traces drivers and effects when a factor is selected", () => {
    renderPage();
    const node = screen.getByRole("button", { name: /Sustained attention, Attention domain/ });
    fireEvent.click(node);

    // The detail panel shows upstream drivers (Autonomic regulation, Caregiver
    // co-regulation) and the downstream effect (Social communication).
    expect(screen.getByText("Upstream drivers")).toBeInTheDocument();
    expect(screen.getByText("Downstream effects")).toBeInTheDocument();
    expect(node).toHaveAttribute("aria-pressed", "true");

    // Clicking again clears the pinned selection.
    fireEvent.click(node);
    expect(node).toHaveAttribute("aria-pressed", "false");
  });

  it("exposes the underlying edges through the data table", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /show data table/i }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("Adaptive outcome").length).toBeGreaterThan(0);
    expect(within(table).getByText("HRC + RSA coupling")).toBeInTheDocument();
  });
});
