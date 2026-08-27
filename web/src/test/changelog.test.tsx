import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const entry = {
  id: "chg_1",
  entity_type: "participant",
  entity_id: "NANO-0102",
  action: "UPDATE",
  actor: "system",
  actor_role: "system",
  changed_fields: { qa: ["pending", "pass"] },
  before: { qa: "pending" },
  after: { qa: "pass" },
  session_id: "mock-session-0102",
  note: "QA correction.",
  ts: new Date().toISOString(),
  version_tag: "pre-manuscript-freeze-2026-06",
};

vi.mock("@/api/hooks", () => ({
  useChangelog: () => ({ data: { rows: [entry], total: 1, page: 0, pageSize: 50 } }),
  useSnapshots: () => ({ data: [{ id: "snap_1", tag: "pre-manuscript-freeze-2026-06", description: "Freeze", created_by: "system", created_at: "2026-06-08", row_counts: { participants: 1, runs: 1, epochs: 0 }, checksum: "f".repeat(64) }] }),
  useCreateSnapshot: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));

import { Changelog } from "@/routes/Changelog";

describe("Changelog", () => {
  it("renders timeline entries and opens the diff dialog", () => {
    render(
      <MemoryRouter>
        <Changelog />
      </MemoryRouter>,
    );

    expect(screen.getByText("Change History")).toBeInTheDocument();
    expect(screen.getByText("participant/NANO-0102")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /UPDATE participant\/NANO-0102/i }));

    expect(screen.getByText("Diff")).toBeInTheDocument();
    expect(screen.getAllByText("pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText("pass").length).toBeGreaterThan(0);
  });

  it("opens the snapshot creation modal", () => {
    render(
      <MemoryRouter>
        <Changelog />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /create snapshot checkpoint/i }));

    expect(screen.getByText("Create Snapshot")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("pre-submission-2026-06")).toBeInTheDocument();
  });
});
