import type { Epoch, EpochDecision } from "@/api/schemas";

/** Threshold constants — match docs and prototype. */
export const SQI_AUTO_REJECT = 0.4;
export const SQI_AUTO_ACCEPT = 0.7;

export type EpochAction =
  | { type: "set"; idx: number; decision: EpochDecision }
  | { type: "auto_accept_clean" }
  | { type: "auto_reject_bad" }
  | { type: "clear" }
  | { type: "load"; epochs: Epoch[] };

/**
 * Pure reducer for QA epoch decisions. Tested in src/test/epochReducer.test.ts.
 * Server is the source of truth — the reducer feeds optimistic updates while
 * the PATCH is in flight.
 */
export function epochReducer(state: Epoch[], action: EpochAction): Epoch[] {
  switch (action.type) {
    case "load":
      return action.epochs;
    case "set":
      return state.map((e) => (e.idx === action.idx ? { ...e, decision: action.decision } : e));
    case "auto_accept_clean":
      return state.map((e) =>
        e.flag === "clean" || e.flag === "ectopic" ? { ...e, decision: "accept" } : e,
      );
    case "auto_reject_bad":
      return state.map((e) =>
        e.flag === "noise" || e.flag === "flatline" ? { ...e, decision: "reject" } : e,
      );
    case "clear":
      return state.map((e) => ({ ...e, decision: "auto" }));
    default:
      return state;
  }
}

export interface EpochCounts {
  accepted: number;
  rejected: number;
  review: number;
}

/**
 * Decision counts: explicit decisions take precedence; otherwise SQI thresholds.
 * Always sums to state.length.
 */
export function tallyEpochs(state: Epoch[]): EpochCounts {
  let accepted = 0;
  let rejected = 0;
  for (const e of state) {
    if (e.decision === "accept" || (e.decision === "auto" && e.sqi >= SQI_AUTO_ACCEPT)) {
      accepted += 1;
    } else if (e.decision === "reject" || (e.decision === "auto" && e.sqi < SQI_AUTO_REJECT)) {
      rejected += 1;
    }
  }
  return { accepted, rejected, review: state.length - accepted - rejected };
}
