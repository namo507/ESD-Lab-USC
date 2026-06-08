import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const publication = {
  pmid: "39000001",
  title: "Autonomic pathways in infancy",
  authors: [{ last: "Bradshaw", first: "Jessica", initials: "J", affiliation: "University of South Carolina" }],
  journal: "Developmental Psychobiology",
  volume: "67",
  issue: "2",
  year: 2026,
  month: 2,
  pages: "44-59",
  doi: "10.1002/dev.99999",
  abstract: "Full abstract.",
  pub_type: "Journal Article",
  mesh_terms: ["Infant"],
  keywords: ["rsa"],
  tags: ["preterm", "hrv-rsa"],
  apa_citation: "Bradshaw, J. (2026). Autonomic pathways in infancy.",
  citation_count: 3,
  source: "manual",
  epub_date: null,
  updated_at: "2026-06-08T00:00:00",
};

vi.mock("@/api/hooks", () => ({
  usePublication: () => ({ data: publication, isLoading: false }),
  useAdminCapabilities: () => ({ data: { canEditPublicationTags: false, canCreateSnapshots: false, canTriggerPublicationSync: true } }),
  useEntityHistory: () => ({ data: [] }),
  useUpdatePublicationTags: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));

import { PublicationDetail } from "@/routes/PublicationDetail";

describe("PublicationDetail", () => {
  it("renders metadata and disables tag editing without admin capability", () => {
    render(
      <MemoryRouter initialEntries={["/publications/39000001"]}>
        <Routes>
          <Route path="/publications/:pmid" element={<PublicationDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Autonomic pathways in infancy")).toBeInTheDocument();
    expect(screen.getByText("Developmental Psychobiology")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit tags/i })).toBeDisabled();
    expect(screen.getByText("Full abstract.")).toBeInTheDocument();
  });
});
