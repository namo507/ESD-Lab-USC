import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  compareInstrument,
  decodeFields,
  harmonizationHeadline,
  parseRedcapPortfolio,
  portfolioFreshness,
  portfolioTotals,
  sharedInstruments,
  type RedcapPortfolio,
} from "@/api/redcapPortfolio";
import { PortfolioDefinitions } from "@/components/redcap/PortfolioDefinitions";
import { PortfolioStudyDetail } from "@/components/redcap/PortfolioStudyDetail";

function completion(complete: number, unverified: number, incomplete: number, notStarted: number) {
  const started = complete + unverified + incomplete;
  return {
    complete,
    unverified,
    incomplete,
    not_started: notStarted,
    started,
    total: started + notStarted,
    rate: started ? Math.round((complete / started) * 1000) / 10 : null,
    suppressed: false,
  };
}

const SUPPRESSED = {
  complete: null,
  unverified: null,
  incomplete: null,
  not_started: null,
  started: null,
  total: null,
  rate: null,
  suppressed: true,
};

/** A study whose projects all failed reports zeroes, not a suppression flag:
 *  there is no small count to protect, only an absence of data. */
const NOT_REPORTING = {
  complete: 0,
  unverified: 0,
  incomplete: 0,
  not_started: 0,
  started: 0,
  total: 0,
  rate: null,
  suppressed: false,
};

const PAYLOAD: RedcapPortfolio = {
  schema: "redcap.metadata.v1",
  data_version: "sha256:0123456789abcdef0123456789abcdef",
  generated_at: "2026-08-12T15:00:00Z",
  aggregate_only: true,
  contains_item_text: false,
  contains_record_data: false,
  identifier_fields_withheld: true,
  read_only: true,
  small_cell_threshold: 5,
  refresh_cadence_seconds: 300,
  projects_total: 3,
  projects_ok: 2,
  instruments_total: 3,
  fields_total: 7,
  studies: [
    {
      key: "nano",
      label: "NANO",
      target: 260,
      status: "ok",
      projects_total: 1,
      projects_ok: 1,
      project_keys: ["nano_surveys"],
      records: 260,
      instruments: 2,
      fields: 4,
      events: 2,
      completion: completion(300, 20, 30, 90),
    },
    {
      key: "nico",
      label: "NICO",
      target: null,
      status: "ok",
      projects_total: 1,
      projects_ok: 1,
      project_keys: ["nico"],
      records: 80,
      instruments: 1,
      fields: 3,
      events: 0,
      completion: completion(100, 10, 10, 20),
    },
    {
      key: "abc",
      label: "ABC",
      target: null,
      status: "degraded",
      projects_total: 1,
      projects_ok: 0,
      project_keys: ["abc_surveys"],
      records: null,
      instruments: 0,
      fields: 0,
      events: 0,
      completion: NOT_REPORTING,
    },
  ],
  projects: [
    {
      key: "nano_surveys",
      study: "nano",
      role: "surveys",
      project_id: 4218,
      title: "NANO Study Surveys",
      status: "ok",
      longitudinal: true,
      repeating: true,
      surveys: true,
      records: 260,
      record_events: 520,
      instruments: 2,
      fields: 4,
      fields_published: 3,
      identifier_fields_withheld: 1,
      required_fields: 1,
      branching_fields: 1,
      events: 2,
      completion: completion(300, 20, 30, 90),
      field_types: [
        ["radio", 2],
        ["text", 1],
      ],
      instrument_rows: [
        {
          name: "demographics",
          label: "Demographics",
          fields: 1,
          events: 1,
          ...completion(200, 10, 10, 40),
        },
        {
          name: "csbs",
          label: "CSBS",
          fields: 2,
          events: 2,
          ...completion(100, 10, 20, 50),
        },
      ],
      event_rows: [
        {
          name: "baseline_arm_1",
          label: "Baseline",
          records: 260,
          rows: 260,
          started: 300,
          rate: 88.5,
          suppressed: false,
        },
      ],
      quality: [
        {
          check: "Required fields",
          count: 1,
          detail: "Required fields block survey submission until answered.",
        },
        {
          check: "Identifier fields withheld",
          count: 1,
          detail: "Fields REDCap flags as direct identifiers are counted here.",
        },
      ],
    },
    {
      key: "nico",
      study: "nico",
      role: "combined",
      project_id: 3836,
      title: "NICO Study",
      status: "ok",
      longitudinal: false,
      repeating: false,
      surveys: true,
      records: 80,
      record_events: 80,
      instruments: 1,
      fields: 3,
      fields_published: 3,
      identifier_fields_withheld: 0,
      required_fields: 0,
      branching_fields: 0,
      events: 0,
      completion: completion(100, 10, 10, 20),
      field_types: [["radio", 3]],
      instrument_rows: [
        { name: "csbs", label: "CSBS", fields: 3, events: 0, ...completion(100, 10, 10, 20) },
      ],
      event_rows: [],
      quality: [],
    },
    {
      key: "abc_surveys",
      study: "abc",
      role: "surveys",
      project_id: 1140,
      title: "ABC Study Surveys",
      status: "error",
      error: "missing_token",
    },
  ],
  failed: [
    { key: "abc_surveys", study: "abc", title: "ABC Study Surveys", error: "missing_token" },
  ],
  matrix: [
    {
      name: "csbs",
      label: "CSBS",
      projects: ["nano_surveys", "nico"],
      studies: ["nano", "nico"],
      project_count: 2,
      study_count: 2,
    },
    {
      name: "demographics",
      label: "Demographics",
      projects: ["nano_surveys"],
      studies: ["nano"],
      project_count: 1,
      study_count: 1,
    },
  ],
  overlap: {
    keys: ["nano_surveys", "nico"],
    cells: [
      [2, 1],
      [1, 1],
    ],
  },
  fields: {
    projects: ["nano_surveys", "nico"],
    forms: ["demographics", "csbs"],
    types: ["text", "radio"],
    validations: ["", "number"],
    rows: [
      [0, 0, 0, 0, "record_id", 0, 0],
      [0, 1, 1, 0, "csbs_q1", 2, 1 | 2],
      [0, 1, 1, 1, "csbs_score", 0, 4],
      [1, 1, 1, 0, "csbs_q1", 2, 0],
      [1, 1, 0, 0, "csbs_note", 0, 0],
      [1, 1, 1, 0, "csbs_extra", 3, 0],
    ],
  },
};

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("redcap portfolio payload", () => {
  it("accepts a well-formed artifact", () => {
    expect(parseRedcapPortfolio(PAYLOAD).schema).toBe("redcap.metadata.v1");
  });

  it("refuses a payload that claims to carry item text", () => {
    expect(() => parseRedcapPortfolio({ ...PAYLOAD, contains_item_text: true })).toThrow();
  });

  it("refuses a payload that claims to carry record data", () => {
    expect(() => parseRedcapPortfolio({ ...PAYLOAD, contains_record_data: true })).toThrow();
  });

  it("refuses a payload that is not declared read-only", () => {
    expect(() => parseRedcapPortfolio({ ...PAYLOAD, read_only: false })).toThrow();
  });
});

describe("field inventory decoding", () => {
  it("expands dictionary-encoded rows into readable fields", () => {
    const fields = decodeFields(PAYLOAD);
    expect(fields).toHaveLength(6);

    const branching = fields.find((f) => f.project === "nano_surveys" && f.fieldName === "csbs_q1");
    expect(branching).toMatchObject({
      form: "csbs",
      type: "radio",
      choices: 2,
      required: true,
      branching: true,
      validated: false,
    });

    const validated = fields.find((f) => f.fieldName === "csbs_score");
    expect(validated).toMatchObject({ validation: "number", validated: true, required: false });
  });

  it("returns nothing for a missing payload", () => {
    expect(decodeFields(null)).toEqual([]);
  });
});

describe("instrument harmonization", () => {
  const fields = decodeFields(PAYLOAD);

  it("finds instruments defined by at least two projects", () => {
    const shared = sharedInstruments(PAYLOAD, ["nano_surveys", "nico"]);
    expect(shared.map((row) => row.name)).toEqual(["csbs"]);
  });

  it("classifies each field by how the projects define it", () => {
    const comparison = compareInstrument(fields, "csbs", ["nano_surveys", "nico"]);
    const byName = Object.fromEntries(comparison.map((row) => [row.fieldName, row.verdict]));

    // Same name, same type in both projects.
    expect(byName.csbs_q1).toBe("identical");
    // Defined only by NANO.
    expect(byName.csbs_score).toBe("partial");
    // Defined only by NICO.
    expect(byName.csbs_extra).toBe("partial");
    // Same name in both, but text in one and radio in the other.
    expect(byName.csbs_note).toBe("partial");
  });

  it("reports a type mismatch when both projects define a field differently", () => {
    const base = {
      form: "csbs",
      fieldName: "shared",
      validation: "",
      choices: 2,
      required: false,
      branching: false,
      validated: false,
    };
    const drifted = [
      { ...base, project: "nano_surveys", type: "radio" },
      { ...base, project: "nico", type: "dropdown" },
    ];
    const comparison = compareInstrument(drifted, "csbs", ["nano_surveys", "nico"]);
    expect(comparison[0]).toMatchObject({ fieldName: "shared", verdict: "type differs" });
  });

  it("counts the verdicts for the headline row", () => {
    const headline = harmonizationHeadline(
      compareInstrument(fields, "csbs", ["nano_surveys", "nico"]),
    );
    expect(headline.fields).toBe(4);
    expect(headline.identical).toBe(1);
    expect(headline.partial).toBe(3);
  });
});

describe("portfolio roll-up", () => {
  it("sums structure and derives one completion rate", () => {
    const totals = portfolioTotals(PAYLOAD);
    expect(totals.instruments).toBe(3);
    expect(totals.fields).toBe(7);
    expect(totals.events).toBe(2);
    // 300 + 100 complete of 350 + 120 started.
    expect(totals.complete).toBe(400);
    expect(totals.started).toBe(470);
    expect(totals.rate).toBeCloseTo(85.1, 1);
  });

  it("withholds the portfolio headcount when a study's own count is withheld", () => {
    // ABC failed to report, so its enrollment is null and the total is unknown
    // rather than silently short by one study.
    expect(portfolioTotals(PAYLOAD).records).toBeNull();
  });

  it("reports a rate of null when any study suppressed its buckets", () => {
    const suppressed = {
      ...PAYLOAD,
      studies: PAYLOAD.studies.map((study) => ({ ...study, completion: SUPPRESSED })),
    };
    expect(portfolioTotals(suppressed).rate).toBeNull();
  });
});

describe("freshness", () => {
  it("reads as live within two sync cycles", () => {
    const state = portfolioFreshness(PAYLOAD, Date.parse("2026-08-12T15:04:00Z"));
    expect(state.status).toBe("live");
    expect(state.ageSeconds).toBe(240);
  });

  it("goes stale past two sync cycles", () => {
    const state = portfolioFreshness(PAYLOAD, Date.parse("2026-08-12T15:20:00Z"));
    expect(state.status).toBe("stale");
    expect(state.label).toBe("20 min ago");
  });

  it("reports an unpublished artifact rather than guessing", () => {
    expect(portfolioFreshness(null).status).toBe("unavailable");
  });
});

describe("study detail panel", () => {
  it("shows the selected project's structure and withheld identifier count", () => {
    renderWithQuery(<PortfolioStudyDetail portfolio={PAYLOAD} scope="nano" />);

    expect(screen.getByRole("tab", { name: /NANO Study Surveys/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("1 identifier fields withheld")).toBeInTheDocument();
    expect(screen.getAllByText("Demographics").length).toBeGreaterThan(0);
    // Instruments, events, and structural signals each get their own table.
    expect(screen.getAllByRole("table")).toHaveLength(3);
  });

  it("selects the project matching the sidebar scope", () => {
    renderWithQuery(<PortfolioStudyDetail portfolio={PAYLOAD} scope="nico" />);
    expect(screen.getByRole("tab", { name: /NICO Study/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("omits the event table for a project with no events", () => {
    renderWithQuery(<PortfolioStudyDetail portfolio={PAYLOAD} scope="nico" />);
    expect(screen.queryByText("Unique name")).not.toBeInTheDocument();
  });
});

describe("definitions panel", () => {
  it("states the small-cell threshold and sync cadence from the payload", () => {
    const { container } = renderWithQuery(<PortfolioDefinitions portfolio={PAYLOAD} />);
    const text = container.textContent ?? "";

    expect(text).toContain("fewer than 5 participants");
    expect(text).toContain("every 5 minutes");
    expect(text).toContain("Complete ÷ Started");
  });

  it("explains that an identical verdict is not a claim about item wording", () => {
    const { container } = renderWithQuery(<PortfolioDefinitions portfolio={PAYLOAD} />);
    const flat = (container.textContent ?? "").replace(/\s+/g, " ");
    expect(flat).toContain("confirms matching definitions, not matching questions");
  });
});

describe("suppression rendering", () => {
  it("prints a dash instead of a suppressed completion rate", () => {
    const suppressed: RedcapPortfolio = {
      ...PAYLOAD,
      projects: PAYLOAD.projects.map((project) =>
        project.key === "nico"
          ? {
              ...project,
              records: null,
              record_events: null,
              completion: SUPPRESSED,
              instrument_rows: (project.instrument_rows ?? []).map((row) => ({
                ...row,
                ...SUPPRESSED,
              })),
            }
          : project,
      ),
    };
    renderWithQuery(<PortfolioStudyDetail portfolio={suppressed} scope="nico" />);

    expect(screen.getByText("withheld by the small-cell rule")).toBeInTheDocument();
    expect(screen.getByText("record-events withheld")).toBeInTheDocument();

    // The instrument row's completion cell shows a dash, never a computed zero.
    const instrumentRow = screen.getByRole("row", { name: /CSBS/ });
    expect(within(instrumentRow).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(instrumentRow).queryByText("0.0%")).not.toBeInTheDocument();
  });
});
