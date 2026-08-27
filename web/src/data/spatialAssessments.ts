export interface SpatialAssessment {
  measure: string;
  domain: "visual-motor" | "navigation" | "mental-rotation" | "construction";
  ageBand: string;
  modality: "tablet" | "paper" | "examiner";
  required: boolean;
  minutes: number;
  scoring: string;
}

export const SPATIAL_ASSESSMENTS: SpatialAssessment[] = [
  { measure: "Bayley-4 Cognitive spatial items", domain: "construction", ageBand: "6-24 mo", modality: "examiner", required: true, minutes: 12, scoring: "scaled score + item pass" },
  { measure: "Object permanence search", domain: "visual-motor", ageBand: "6-12 mo", modality: "examiner", required: true, minutes: 6, scoring: "latency + success" },
  { measure: "Block construction sequence", domain: "construction", ageBand: "12-24 mo", modality: "examiner", required: true, minutes: 10, scoring: "highest level" },
  { measure: "Mental rotation card sort", domain: "mental-rotation", ageBand: "18-36 mo", modality: "paper", required: false, minutes: 8, scoring: "accuracy" },
  { measure: "Toddler route recall", domain: "navigation", ageBand: "24-36 mo", modality: "tablet", required: false, minutes: 7, scoring: "path efficiency" },
  { measure: "Shape matching transfer", domain: "visual-motor", ageBand: "12-24 mo", modality: "tablet", required: false, minutes: 5, scoring: "accuracy + reaction time" },
];
