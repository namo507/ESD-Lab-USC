import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { StudySelector } from "@/components/shell/StudySelector";
import { useUi } from "@/store/ui";

describe("StudySelector", () => {
  beforeEach(() => {
    useUi.setState({ activeStudy: "BOTH" });
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("renders the NANO / NICO / Both scope toggle", () => {
    render(<StudySelector />);
    expect(screen.getByRole("radio", { name: "NANO" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "NICO" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Both" })).toBeInTheDocument();
  });

  it("updates the active study in the store and persists it", () => {
    render(<StudySelector />);
    fireEvent.click(screen.getByRole("radio", { name: "NICO" }));
    expect(useUi.getState().activeStudy).toBe("NICO");
    expect(screen.getByRole("radio", { name: "NICO" })).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem("esd-active-study")).toBe("NICO");
  });
});
