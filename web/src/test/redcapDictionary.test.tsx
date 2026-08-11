import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  parseRedcapDictionary,
  selectDictionaryProjects,
  summarizeDictionaryScope,
} from "@/api/redcapDictionary";
import { InstrumentDictionary } from "@/components/redcap/InstrumentDictionary";

function field(name: string, form: string, type = "text", extra = {}) {
  return {
    field_name: name,
    form_name: form,
    field_type: type,
    required: false,
    branching: false,
    validation: "",
    choices: 0,
    ...extra,
  };
}

function instrument(name: string, label: string, fields: ReturnType<typeof field>[], withheld = 0) {
  const types: Record<string, number> = {};
  for (const f of fields) types[f.field_type] = (types[f.field_type] ?? 0) + 1;
  return {
    name,
    label,
    fields_total: fields.length + withheld,
    fields_published: fields.length,
    identifier_fields_withheld: withheld,
    required_fields: fields.filter((f) => f.required).length,
    branching_fields: fields.filter((f) => f.branching).length,
    field_types: types,
    fields,
  };
}

const NANO_SURVEYS = {
  key: "nano_surveys",
  study: "nano",
  project_id: 4218,
  title: "NANO Study Surveys",
  instruments_total: 2,
  fields_total: 5,
  fields_published: 4,
  identifier_fields_withheld: 1,
  instruments: [
    instrument(
      "mchat",
      "M-CHAT-R",
      [field("mchat_1", "mchat", "radio", { choices: 2 }), field("mchat_2", "mchat", "radio", { choices: 2 })],
      1,
    ),
    instrument("visit_occurred", "Visit Occurred?", [
      field("visit_date", "visit_occurred", "text", { validation: "date_ymd", required: true }),
      field("visit_note", "visit_occurred", "notes"),
    ]),
  ],
};

const NICO = {
  key: "nico",
  study: "nico",
  project_id: 3836,
  title: "NICO Study",
  instruments_total: 1,
  fields_total: 1,
  fields_published: 1,
  identifier_fields_withheld: 0,
  instruments: [instrument("intake", "Intake", [field("intake_a", "intake")])],
};

function payload(projects: unknown[] = [NANO_SURVEYS, NICO]) {
  return {
    schema: "redcap.dictionary.v1",
    generated_at: "2026-08-11T18:00:00Z",
    aggregate_only: true,
    contains_item_text: false,
    contains_record_data: false,
    projects_total: projects.length,
    projects_ok: projects.length,
    instruments_total: 3,
    fields_total: 6,
    projects,
  };
}

function renderWithQuery(ui: React.ReactElement, data: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["redcap", "dictionary", "v1"], parseRedcapDictionary(data));
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("parseRedcapDictionary", () => {
  it("accepts a structural payload", () => {
    expect(parseRedcapDictionary(payload()).projects).toHaveLength(2);
  });

  it("rejects a payload that claims to carry item text", () => {
    // A backend regression must fail loudly here, not render licensed wording.
    expect(() => parseRedcapDictionary({ ...payload(), contains_item_text: true })).toThrow();
  });

  it("rejects a payload that claims to carry record data", () => {
    expect(() => parseRedcapDictionary({ ...payload(), contains_record_data: true })).toThrow();
  });

  it("rejects a payload that is not aggregate-only", () => {
    expect(() => parseRedcapDictionary({ ...payload(), aggregate_only: false })).toThrow();
  });
});

describe("selectDictionaryProjects", () => {
  const parsed = parseRedcapDictionary(payload());

  it("filters to one study", () => {
    expect(selectDictionaryProjects(parsed, "nano").map((p) => p.key)).toEqual(["nano_surveys"]);
  });

  it("returns everything for the portfolio scope", () => {
    expect(selectDictionaryProjects(parsed, "all")).toHaveLength(2);
  });

  it("omits projects that failed to sync", () => {
    const withError = parseRedcapDictionary(
      payload([NANO_SURVEYS, { key: "abc_lab", study: "abc", error: "missing_token" }]),
    );
    expect(selectDictionaryProjects(withError, "abc")).toEqual([]);
  });
});

describe("summarizeDictionaryScope", () => {
  const parsed = parseRedcapDictionary(payload());

  it("rolls instrument structure up across projects", () => {
    const summary = summarizeDictionaryScope(selectDictionaryProjects(parsed, "all"));
    expect(summary.projects).toBe(2);
    expect(summary.instruments).toBe(3);
    // Totals include withheld identifier fields so they reconcile with REDCap.
    expect(summary.fields).toBe(6);
    expect(summary.identifierFieldsWithheld).toBe(1);
    expect(summary.requiredFields).toBe(1);
  });

  it("orders field types by frequency", () => {
    const summary = summarizeDictionaryScope(selectDictionaryProjects(parsed, "all"));
    expect(summary.fieldTypes[0]?.type).toBe("radio");
  });

  it("returns an empty summary rather than throwing on no projects", () => {
    expect(summarizeDictionaryScope([]).instruments).toBe(0);
  });
});

describe("InstrumentDictionary", () => {
  it("renders instrument structure with reconciling counts", () => {
    renderWithQuery(<InstrumentDictionary studyKey="nano" origin={null} />, payload());

    expect(screen.getByRole("button", { name: /M-CHAT-R/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Visit Occurred/ })).toBeInTheDocument();
    expect(screen.getByText(/1 identifier fields not listed/)).toBeInTheDocument();
  });

  it("states that item wording is not published", () => {
    renderWithQuery(<InstrumentDictionary studyKey="nano" origin={null} />, payload());
    expect(screen.getByText(/Item wording is not published/)).toBeInTheDocument();
  });

  it("links each project to REDCap when an origin is configured", () => {
    renderWithQuery(
      <InstrumentDictionary studyKey="nano" origin="https://redcap.research.sc.edu" />,
      payload(),
    );

    const link = screen.getByRole("link", { name: /Open pid 4218/ });
    expect(link).toHaveAttribute("href", "https://redcap.research.sc.edu/index.php?pid=4218");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders no project link when no origin is configured", () => {
    renderWithQuery(<InstrumentDictionary studyKey="nano" origin={null} />, payload());
    expect(screen.queryByRole("link", { name: /Open pid/ })).not.toBeInTheDocument();
  });

  it("explains an empty scope instead of rendering a blank table", () => {
    renderWithQuery(<InstrumentDictionary studyKey="abc" origin={null} />, payload());
    expect(screen.getByText(/No REDCap projects are configured/)).toBeInTheDocument();
  });
});
