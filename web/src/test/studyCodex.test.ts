import { describe, expect, it } from "vitest";

import { ambientStatus, buildStudyCodex } from "@/components/esdlab/studyCodex";
import { GLYPH_ORDER, STUDY_PROFILES, studyProfile } from "@/data/studyProfiles";

const NOW = Date.parse("2026-08-27T12:00:00Z");

function portfolio(generatedAt: string) {
  return {
    generated_at: generatedAt,
    refresh_cadence_seconds: 1800,
    sla_seconds: 5400,
    studies: [
      {
        key: "nano",
        label: "NANO",
        project_keys: ["nano_surveys", "nano_lab"],
        records: 770,
        instruments: 71,
        fields: 5128,
        events: 21,
        completion: {
          complete: 1, unverified: 0, incomplete: 0, not_started: 0,
          started: 1, total: 1, rate: 0.3, suppressed: false,
        },
      },
    ],
  } as never;
}

describe("study profiles", () => {
  it("carries all five studies in glyph order", () => {
    expect(GLYPH_ORDER).toHaveLength(5);
    expect(STUDY_PROFILES).toHaveLength(5);
    for (const key of GLYPH_ORDER) expect(() => studyProfile(key)).not.toThrow();
  });

  it("keeps both vocabularies, because REDCap and the public site disagree", () => {
    expect(studyProfile("nico").label).toBe("NICO");
    expect(studyProfile("nico").publicName).toBe("NICU Exit Study");
  });

  it("records the NANO expansion conflict instead of silently picking one", () => {
    const nano = studyProfile("nano");
    expect(nano.longName).toBe("Neonatal Autonomic Nervous System Organization");
    expect(nano.longNameAlt).toBe("Neurodevelopment of Autonomic and Neural Organization");
  });

  it("leaves longName null where no source publishes an expansion", () => {
    // Inventing an expansion would be the character claiming something it
    // cannot cite, which is the one thing it must never do.
    expect(studyProfile("nico").longName).toBeNull();
    expect(studyProfile("action").longName).toBeNull();
    expect(studyProfile("abc").longName).toBeNull();
  });

  it("cites a source for every profile", () => {
    for (const profile of STUDY_PROFILES) expect(profile.sources.length).toBeGreaterThan(0);
  });
});

describe("codex facts", () => {
  it("gives every fact a source — an uncited number cannot be constructed", () => {
    const codex = buildStudyCodex("nano", portfolio("2026-08-27T11:57:00Z"), NOW);
    expect(codex.facts.length).toBeGreaterThan(0);
    for (const fact of codex.facts) {
      expect(fact.source).toBeTruthy();
    }
  });

  it("reports REDCap counts from the artifact", () => {
    const codex = buildStudyCodex("nano", portfolio("2026-08-27T11:57:00Z"), NOW);
    const byLabel = Object.fromEntries(codex.facts.map((f) => [f.label, f.value]));
    expect(byLabel["REDCap projects"]).toBe("2 projects");
    expect(byLabel.Records).toBe("770");
    expect(byLabel.Instruments).toBe("71");
    expect(byLabel.Fields).toBe("5,128");
  });

  it("caps the card at eight facts so it stays a tooltip, not a table", () => {
    const codex = buildStudyCodex("nano", portfolio("2026-08-27T11:57:00Z"), NOW);
    expect(codex.facts.length).toBeLessThanOrEqual(8);
  });

  it("says the counts are unpublished rather than rendering a zero", () => {
    const codex = buildStudyCodex("nano", null, NOW);
    const values = codex.facts.map((f) => f.value);
    expect(values).toContain("not published yet");
    expect(values).not.toContain("0");
  });

  it("still shows the quoted descriptive facts with no artifact", () => {
    const codex = buildStudyCodex("action", null, NOW);
    const labels = codex.facts.map((f) => f.label);
    expect(labels).toContain("Ages");
    expect(labels).toContain("Setting");
  });

  it("surfaces the vocabulary conflict on the NANO card only", () => {
    expect(buildStudyCodex("nano", null, NOW).conflict).toContain("Neurodevelopment");
    expect(buildStudyCodex("ipsa", null, NOW).conflict).toBeNull();
  });
});

describe("ambient status", () => {
  it("reads live inside the SLA", () => {
    expect(ambientStatus(portfolio("2026-08-27T11:57:00Z"), NOW).word).toBe("live");
  });

  it("reads stale past the SLA", () => {
    // sla_seconds is 5400; four hours is well past it.
    expect(ambientStatus(portfolio("2026-08-27T08:00:00Z"), NOW).word).toBe("stale");
  });

  it("reads offline with no artifact at all", () => {
    const status = ambientStatus(null, NOW);
    expect(status.word).toBe("offline");
    expect(status.detail).toContain("redcap_portfolio.json");
  });
});
