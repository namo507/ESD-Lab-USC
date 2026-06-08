import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
  abstract: "A long abstract about autism, preterm infants, RSA, RMSSD, and longitudinal developmental cascades.".repeat(4),
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
  usePublications: () => ({ data: { publications: [publication], total: 1, page: 0, pageSize: 50, tag_counts: [{ tag: "preterm", count: 1 }] }, isLoading: false, isError: false }),
  usePublicationTags: () => ({ data: [{ tag: "preterm", count: 1 }] }),
  usePublicationSyncStatus: () => ({ data: { last_sync: "2026-06-08T00:00:00", total: 1, inserted: 0, updated: 0, new_this_week: 1, errors: [] } }),
  useSyncPublications: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));

import { Publications } from "@/routes/Publications";

describe("Publications", () => {
  it("renders publication cards and filter controls", () => {
    render(
      <MemoryRouter>
        <Publications />
      </MemoryRouter>,
    );

    expect(screen.getByText("1 publications")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sync now/i })).toBeInTheDocument();
    expect(screen.getByText("Autonomic pathways in infancy")).toBeInTheDocument();
    expect(screen.getByText(/preterm · 1/i)).toBeInTheDocument();
  });

  it("expands and collapses long abstracts", () => {
    render(
      <MemoryRouter>
        <Publications />
      </MemoryRouter>,
    );

    const readMore = screen.getByRole("button", { name: /read more/i });
    fireEvent.click(readMore);

    expect(screen.getByRole("button", { name: /read less/i })).toBeInTheDocument();
  });
});
