import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { parseDashboardMetrics } from "@/api/dashboardMetrics";
import { redcapLinksForStudy, redcapOrigin, redcapProjectUrl } from "@/api/redcapLinks";
import { RedcapProjectLinks } from "@/components/redcap/RedcapProjectLinks";

const ORIGIN = "https://redcap.research.sc.edu";

function project(
  key: string,
  study: string,
  projectId: number | null,
  extra: Record<string, unknown> = {},
) {
  return {
    key,
    study,
    role: "surveys",
    project_id: projectId,
    title: `${key} project`,
    status: "ok",
    enrollment_authority: false,
    records: 10,
    forms: {},
    error: null,
    ...extra,
  };
}

function metricsFixture(projects: ReturnType<typeof project>[]) {
  return parseDashboardMetrics({
    schema: "dashboard.metrics.v1",
    data_version: "sha256:test",
    generated_at: new Date().toISOString(),
    aggregate_only: true,
    source: {
      kind: "live",
      system: "REDCap",
      cadence: "every_5_minutes",
      sla: { max_age_minutes: 15 },
      projects_total: projects.length,
      projects_ok: projects.length,
    },
    portfolio: { status: "ok", forms: {} },
    studies: [],
    projects,
  });
}

const PORTFOLIO = metricsFixture([
  project("nano_surveys", "nano", 4218, { enrollment_authority: true }),
  project("nano_lab", "nano", 5484, { role: "assessments" }),
  project("nico", "nico", 3836, { role: "combined" }),
]);

describe("redcapProjectUrl", () => {
  it("builds the verified project-home form", () => {
    // Verified against the live instance: the version-prefixed paths 404.
    expect(redcapProjectUrl(ORIGIN, 4218)).toBe(`${ORIGIN}/index.php?pid=4218`);
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(redcapProjectUrl(`${ORIGIN}/`, 3836)).toBe(`${ORIGIN}/index.php?pid=3836`);
  });
});

describe("redcapOrigin", () => {
  it("returns null when unset, which is the public Pages default", () => {
    expect(redcapOrigin({})).toBeNull();
    expect(redcapOrigin({ VITE_REDCAP_APP_ORIGIN: "   " })).toBeNull();
  });

  it("refuses a non-HTTPS origin", () => {
    expect(redcapOrigin({ VITE_REDCAP_APP_ORIGIN: "http://redcap.internal" })).toBeNull();
  });

  it("refuses a malformed origin instead of producing a broken link", () => {
    expect(redcapOrigin({ VITE_REDCAP_APP_ORIGIN: "not a url" })).toBeNull();
  });

  it("normalizes a valid origin down to scheme and host", () => {
    expect(redcapOrigin({ VITE_REDCAP_APP_ORIGIN: `${ORIGIN}/some/path` })).toBe(ORIGIN);
  });
});

describe("redcapLinksForStudy", () => {
  it("returns only the projects for the requested study", () => {
    const links = redcapLinksForStudy(PORTFOLIO, "nano", ORIGIN);
    expect(links.map((l) => l.projectId)).toEqual([4218, 5484]);
  });

  it("puts the enrollment authority first", () => {
    expect(redcapLinksForStudy(PORTFOLIO, "nano", ORIGIN)[0]?.key).toBe("nano_surveys");
  });

  it("returns every project for the portfolio scope", () => {
    expect(redcapLinksForStudy(PORTFOLIO, "all", ORIGIN)).toHaveLength(3);
  });

  it("returns nothing for an unknown study rather than falling back to all", () => {
    expect(redcapLinksForStudy(PORTFOLIO, "not_a_study", ORIGIN)).toEqual([]);
  });

  it("returns nothing when no origin is configured", () => {
    expect(redcapLinksForStudy(PORTFOLIO, "nano", null)).toEqual([]);
  });

  it("skips a project with a missing or invalid pid", () => {
    const broken = metricsFixture([
      project("no_pid", "nano", null),
      project("zero_pid", "nano", 0),
      project("good", "nano", 4218),
    ]);
    expect(redcapLinksForStudy(broken, "nano", ORIGIN).map((l) => l.projectId)).toEqual([4218]);
  });
});

describe("RedcapProjectLinks", () => {
  it("renders one external link per project", () => {
    render(<RedcapProjectLinks metrics={PORTFOLIO} studyKey="nano" origin={ORIGIN} />);

    const link = screen.getByRole("link", { name: /nano_surveys project/ });
    expect(link).toHaveAttribute("href", `${ORIGIN}/index.php?pid=4218`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders nothing at all when the origin is unset", () => {
    const { container } = render(
      <RedcapProjectLinks metrics={PORTFOLIO} studyKey="nano" origin={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("never puts a record id or token in a link", () => {
    const { container } = render(
      <RedcapProjectLinks metrics={PORTFOLIO} studyKey="all" origin={ORIGIN} />,
    );

    for (const anchor of Array.from(container.querySelectorAll("a"))) {
      const href = anchor.getAttribute("href") ?? "";
      expect(href).toMatch(/^https:\/\/[^?]+\/index\.php\?pid=\d+$/);

      // `pid` must be the only parameter. Anything else would mean a record
      // reference or credential had leaked into a browser-visible URL.
      const params = [...new URL(href).searchParams.keys()];
      expect(params).toEqual(["pid"]);
    }
  });
});
