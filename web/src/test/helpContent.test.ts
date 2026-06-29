import { describe, expect, it } from "vitest";
import {
  GLOSSARY_TERMS,
  HOW_TO_CARDS,
  LANDING_REFERENCES,
  OPERATOR_REFERENCES,
  OPERATOR_TOUR_STEPS,
  PUBLIC_TOUR_STEPS,
  TODO_GLOSSARY_TERMS,
} from "@/data/helpContent";

describe("dashboard help content", () => {
  it("documents every public landing section", () => {
    const required = [
      "Overview and hero",
      "Metrics",
      "Aims",
      "Architecture",
      "Pipeline",
      "QA",
      "Cohort",
      "Model performance",
      "Model Studio",
      "Assistant",
      "Library",
    ];
    expect(LANDING_REFERENCES.map((entry) => entry.title)).toEqual(required);
  });

  it("documents every named operator panel from the prompt", () => {
    const titles = new Set(OPERATOR_REFERENCES.map((entry) => entry.title));
    [
      "Ask the lab search",
      "Session timer",
      "Force Sync",
      "Overview",
      "Intakes and Stories",
      "Window QA",
      "NANO Study VPT",
      "Home Study",
      "FiSCAL-ASD",
      "Clinical Pipeline",
      "REDCap Sync",
      "Pipeline Health",
      "MATLAB Bridge",
      "Results and Trajectories",
      "HDA Timeline",
      "Thermal Heatmap",
      "Swimmer Plot",
      "Attrition",
      "ECG Quality",
      "SDOH Map",
      "Documentation",
      "Help / Tour",
    ].forEach((title) => expect(titles.has(title)).toBe(true));
  });

  it("keeps every how-to visualized and mapped to a tour track", () => {
    expect(HOW_TO_CARDS.length).toBeGreaterThanOrEqual(11);
    HOW_TO_CARDS.forEach((card) => {
      expect(card.steps.length).toBeGreaterThanOrEqual(3);
      expect(card.steps.length).toBeLessThanOrEqual(6);
      expect(card.figure.pins.length).toBeGreaterThan(0);
      expect(["public", "operator"]).toContain(card.track);
    });
  });

  it("keeps public and operator tour steps targetable", () => {
    expect(PUBLIC_TOUR_STEPS.length).toBeGreaterThanOrEqual(9);
    expect(OPERATOR_TOUR_STEPS.length).toBeGreaterThanOrEqual(7);
    [...PUBLIC_TOUR_STEPS, ...OPERATOR_TOUR_STEPS].forEach((step) => {
      expect(step.target).toMatch(/^[a-z0-9-]+$/);
      expect(step.route.startsWith("/")).toBe(true);
    });
  });

  it("keeps lab-confirmation TODOs explicit", () => {
    expect(TODO_GLOSSARY_TERMS.map((term) => term.definition)).toEqual(
      TODO_GLOSSARY_TERMS.map(() => "TODO: confirm with lab."),
    );
    expect(GLOSSARY_TERMS.length).toBeGreaterThanOrEqual(30);
  });

  it("does not add em dash copy to new help content", () => {
    const serialized = JSON.stringify({
      GLOSSARY_TERMS,
      HOW_TO_CARDS,
      LANDING_REFERENCES,
      OPERATOR_REFERENCES,
      PUBLIC_TOUR_STEPS,
      OPERATOR_TOUR_STEPS,
    });
    expect(serialized).not.toContain("—");
  });
});
