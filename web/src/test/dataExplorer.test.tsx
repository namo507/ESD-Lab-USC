import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/api/hooks", () => ({
  useParticipants: () => ({
    data: [{ id: "NANO-0102", group: "VPT", cga_wks: 28.4, sex: "F", visit: "cga_12mo", windows: 51, qa: "pass", rmssd: 38.41, hf: 412.1, hda: "sustained", updated: "2 min", enrolled: "2024-08-12", site: "USC Lab" }],
    isLoading: false,
  }),
  useRuns: () => ({ data: [{ id: "run_1", triggered: "2026-06-08", actor: "cron", scope: "nightly", status: "done", duration: "2m", stage: "merge", windows: 20 }], isLoading: false }),
  useStages: () => ({ data: [{ id: "merge", label: "Merge", inflight: 0, queued: 1, done: 4, fail: 0, rate: 12, eta: "now" }], isLoading: false }),
  useRedcapEvents: () => ({ data: [{ ts: "09:14", form: "visit_intake_v2", n: 3, status: "ok", note: "pulled" }], isLoading: false }),
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));

import { DataExplorer } from "@/routes/DataExplorer";

function renderPage() {
  return render(
    <MemoryRouter>
      <DataExplorer />
    </MemoryRouter>,
  );
}

describe("DataExplorer", () => {
  it("renders participants and switches virtual tables", () => {
    renderPage();

    expect(screen.getByText("Data Explorer")).toBeInTheDocument();
    expect(screen.getByText("NANO-0102")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /runs/i }));

    expect(screen.getByText("run_1")).toBeInTheDocument();
  });

  it("opens the column visibility panel", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /columns/i }));

    expect(screen.getByLabelText("id")).toBeInTheDocument();
    expect(screen.getByLabelText("group")).toBeInTheDocument();
  });
});
