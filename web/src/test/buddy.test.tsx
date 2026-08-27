import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Buddy } from "@/components/shell/Buddy";

describe("Buddy", () => {
  it("shows the matching insight bubble for hovered production hotspots", async () => {
    render(
      <>
        <button type="button" data-insight="kpi-enroll">
          Enrollment KPI
        </button>
        <Buddy />
      </>,
    );

    fireEvent.mouseOver(screen.getByRole("button", { name: "Enrollment KPI" }));

    expect(await screen.findByText("Enrollment")).toBeInTheDocument();
    expect(screen.getByText(/current aggregate NANO enrollment/i)).toBeInTheDocument();
  });

  it("uses dynamic hover copy supplied by overview elements", async () => {
    render(
      <>
        <button
          type="button"
          data-insight="dynamic"
          data-insight-term="Illinois"
          data-insight-body="3 readings linked to Illinois across 63 indexed pages."
        >
          Illinois tile
        </button>
        <Buddy />
      </>,
    );

    fireEvent.mouseOver(screen.getByRole("button", { name: "Illinois tile" }));

    expect(await screen.findByText("Illinois")).toBeInTheDocument();
    expect(screen.getByText(/3 readings linked to Illinois across 63 indexed pages/i)).toBeInTheDocument();
  });

  it("shows MATLAB route insight copy for MATLAB KPI hotspots", async () => {
    render(
      <>
        <button type="button" data-insight="matlab-files">
          MATLAB files KPI
        </button>
        <Buddy />
      </>,
    );

    fireEvent.mouseOver(screen.getByRole("button", { name: "MATLAB files KPI" }));

    expect(await screen.findByText("Parquet files")).toBeInTheDocument();
    expect(screen.getByText(/handoff contract from MATLAB into the dashboard/i)).toBeInTheDocument();
  });

  it("keeps the stage mounted so entry and exit are animatable", () => {
    const { container } = render(<Buddy />);

    // A display:none stage has no intermediate state to transition through, so
    // the element must exist before the first hover.
    const stage = container.querySelector("[aria-live='polite']");
    expect(stage).not.toBeNull();
    expect(stage).toHaveAttribute("aria-hidden", "true");
  });

  it("marks the hovered hotspot and clears it on exit", async () => {
    render(
      <>
        <button type="button" data-insight="kpi-enroll">
          Enrollment KPI
        </button>
        <Buddy />
      </>,
    );

    const hotspot = screen.getByRole("button", { name: "Enrollment KPI" });
    fireEvent.mouseOver(hotspot);
    expect(hotspot).toHaveClass("insight-active");

    fireEvent.mouseOut(hotspot, { relatedTarget: document.body });
    expect(hotspot).not.toHaveClass("insight-active");
  });

  it("crossfades between hotspots without blanking the bubble", async () => {
    render(
      <>
        <button type="button" data-insight="kpi-enroll">
          Enrollment KPI
        </button>
        <button type="button" data-insight="kpi-epochs">
          Epochs KPI
        </button>
        <Buddy />
      </>,
    );

    fireEvent.mouseOver(screen.getByRole("button", { name: "Enrollment KPI" }));
    expect(await screen.findByText("Enrollment")).toBeInTheDocument();

    fireEvent.mouseOver(screen.getByRole("button", { name: "Epochs KPI" }));

    // The outgoing insight stays rendered while it fades, so the bubble never
    // collapses to empty between the two.
    expect(screen.getByText("Enrollment")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Epochs")).toBeInTheDocument());
    expect(screen.queryByText("Enrollment")).not.toBeInTheDocument();
  });
});
