import { describe, it, expect } from "vitest";
import { GLOSS, lookupGloss } from "@/lib/glossary";

const REQUIRED_TERMS = [
  "RMSSD", "HF", "pNN50", "SDNN", "IBI",
  "CGA", "PMA", "VPT", "ASIB", "TD",
  "HDA", "SQI", "Epoch", "Window", "Ectopic",
  "Orienting", "Sustained", "Inattention", "Termination",
  "RedCap", "Actiheart5", "PHI", "HIPAA",
  "Actiheart", "ASD",
] as const;

describe("glossary", () => {
  it("contains every required acronym", () => {
    for (const term of REQUIRED_TERMS) {
      expect(GLOSS, `${term} missing`).toHaveProperty(term);
    }
  });

  it("returns the long-form definition for known terms", () => {
    expect(lookupGloss("RMSSD")).toMatch(/Root Mean Square/);
    expect(lookupGloss("HDA")).toMatch(/Heart-rate Defined Attention/);
    expect(lookupGloss("PHI")).toMatch(/Protected Health Information/);
  });

  it("returns undefined for unknown or empty terms", () => {
    expect(lookupGloss(undefined)).toBeUndefined();
    expect(lookupGloss(null)).toBeUndefined();
    expect(lookupGloss("")).toBeUndefined();
    expect(lookupGloss("UNKNOWN_TERM")).toBeUndefined();
  });

  it("definitions are non-empty strings", () => {
    for (const [term, def] of Object.entries(GLOSS)) {
      expect(typeof def, term).toBe("string");
      expect(def.length, term).toBeGreaterThan(20);
    }
  });
});
