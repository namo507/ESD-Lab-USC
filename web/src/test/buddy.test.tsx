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
});