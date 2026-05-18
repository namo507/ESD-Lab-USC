import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByText(/231 of 260 infants are enrolled/i)).toBeInTheDocument();
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
});