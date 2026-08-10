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

  it("switches adjacent insights without drawing the retired blue/yellow preselect box", async () => {
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

    const enrollment = screen.getByRole("button", { name: "Enrollment KPI" });
    const epochs = screen.getByRole("button", { name: "Epochs KPI" });

    fireEvent.mouseOver(enrollment);
    expect(await screen.findByText("Enrollment")).toBeInTheDocument();

    fireEvent.mouseOut(enrollment, { relatedTarget: epochs });
    fireEvent.mouseOver(epochs);

    expect(await screen.findByText("Epochs")).toBeInTheDocument();
    expect(enrollment).not.toHaveClass("insight-active", "insight-leaving");
    expect(epochs).not.toHaveClass("insight-active", "insight-leaving");
    expect(document.querySelectorAll(".insight-active, .insight-leaving")).toHaveLength(0);
  });

  it("does not restart or dismiss an insight while moving inside the same hotspot", async () => {
    render(
      <>
        <button type="button" data-insight="kpi-enroll">
          <span>Enrollment <em>KPI</em></span>
        </button>
        <Buddy />
      </>,
    );

    const enrollment = screen.getByRole("button", { name: "Enrollment KPI" });
    const label = screen.getByText("Enrollment", { selector: "span" });
    const suffix = screen.getByText("KPI", { selector: "em" });
    fireEvent.mouseOver(enrollment);
    expect(await screen.findByText("Enrollment")).toBeInTheDocument();

    fireEvent.mouseOut(label, { relatedTarget: suffix });
    fireEvent.mouseOver(suffix, { relatedTarget: label });

    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(screen.getByRole("status")).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByText(/current aggregate NANO enrollment/i)).toBeInTheDocument();
    expect(enrollment).not.toHaveClass("insight-active", "insight-leaving");
  });

  it("keeps focused help visible when the pointer exits and then fades it accessibly", async () => {
    render(
      <>
        <button type="button" data-insight="kpi-enroll">Enrollment KPI</button>
        <Buddy />
      </>,
    );

    const enrollment = screen.getByRole("button", { name: "Enrollment KPI" });
    fireEvent.focusIn(enrollment);
    expect(await screen.findByText("Enrollment")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-hidden", "false");

    fireEvent.mouseOut(enrollment, { relatedTarget: null });
    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(screen.getByText(/current aggregate NANO enrollment/i)).toBeInTheDocument();

    fireEvent.focusOut(enrollment, { relatedTarget: null });
    await waitFor(() => expect(screen.queryByText(/current aggregate NANO enrollment/i)).not.toBeInTheDocument());
  });

  it("keeps the insight open while the user moves into its action button", async () => {
    render(
      <>
        <button type="button" data-insight="kpi-enroll">Enrollment KPI</button>
        <Buddy />
      </>,
    );

    const enrollment = screen.getByRole("button", { name: "Enrollment KPI" });
    fireEvent.mouseOver(enrollment);
    const tourButton = await screen.findByRole("button", { name: /walk me through it/i });

    fireEvent.mouseOut(enrollment, { relatedTarget: tourButton });
    fireEvent.mouseOver(tourButton, { relatedTarget: enrollment });
    fireEvent.focusIn(tourButton);

    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(screen.getByRole("status")).toHaveAttribute("aria-hidden", "false");
    expect(tourButton).toHaveAttribute("tabindex", "0");
  });

  it("ignores a hover that only grazes a hotspot in passing", async () => {
    render(
      <>
        <button type="button" data-insight="kpi-enroll">
          Enrollment KPI
        </button>
        <Buddy />
      </>,
    );

    const enrollment = screen.getByRole("button", { name: "Enrollment KPI" });

    // Enter and leave inside the show debounce window: nothing should light up.
    fireEvent.mouseOver(enrollment);
    fireEvent.mouseOut(enrollment, { relatedTarget: null });

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(screen.queryByText("Enrollment")).not.toBeInTheDocument();
    expect(enrollment).not.toHaveClass("insight-active", "insight-leaving");
  });
});
