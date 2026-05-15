import { describe, it, expect } from "vitest";
import { epochReducer, tallyEpochs, SQI_AUTO_ACCEPT, SQI_AUTO_REJECT } from "@/components/qa/epochReducer";
import type { Epoch } from "@/api/schemas";

function mk(overrides: Partial<Epoch>): Epoch {
  return {
    idx: 0,
    t0: 0,
    t1: 5,
    flag: "clean",
    sqi: 0.85,
    ibi_n: 8,
    decision: "auto",
    ...overrides,
  };
}

describe("epochReducer", () => {
  it("loads a server payload", () => {
    const next = epochReducer([], { type: "load", epochs: [mk({ idx: 0 }), mk({ idx: 1 })] });
    expect(next).toHaveLength(2);
  });

  it("sets a single decision without touching siblings", () => {
    const state = [mk({ idx: 0 }), mk({ idx: 1 }), mk({ idx: 2 })];
    const next = epochReducer(state, { type: "set", idx: 1, decision: "reject" });
    expect(next[0]!.decision).toBe("auto");
    expect(next[1]!.decision).toBe("reject");
    expect(next[2]!.decision).toBe("auto");
  });

  it("auto_accept_clean only flips clean and ectopic", () => {
    const state = [
      mk({ idx: 0, flag: "clean" }),
      mk({ idx: 1, flag: "ectopic" }),
      mk({ idx: 2, flag: "noise" }),
      mk({ idx: 3, flag: "flatline" }),
      mk({ idx: 4, flag: "motion" }),
    ];
    const next = epochReducer(state, { type: "auto_accept_clean" });
    expect(next[0]!.decision).toBe("accept");
    expect(next[1]!.decision).toBe("accept");
    expect(next[2]!.decision).toBe("auto");
    expect(next[3]!.decision).toBe("auto");
    expect(next[4]!.decision).toBe("auto");
  });

  it("auto_reject_bad only flips noise and flatline", () => {
    const state = [
      mk({ idx: 0, flag: "clean" }),
      mk({ idx: 1, flag: "noise" }),
      mk({ idx: 2, flag: "flatline" }),
      mk({ idx: 3, flag: "motion" }),
    ];
    const next = epochReducer(state, { type: "auto_reject_bad" });
    expect(next[0]!.decision).toBe("auto");
    expect(next[1]!.decision).toBe("reject");
    expect(next[2]!.decision).toBe("reject");
    expect(next[3]!.decision).toBe("auto");
  });

  it("clear resets every decision to auto", () => {
    const state = [mk({ decision: "accept" }), mk({ idx: 1, decision: "reject" })];
    const next = epochReducer(state, { type: "clear" });
    expect(next.every((e) => e.decision === "auto")).toBe(true);
  });

  it("returns input on unknown action without mutating reference", () => {
    const state = [mk({})];
    // @ts-expect-error — exercise default branch
    const next = epochReducer(state, { type: "noop" });
    expect(next).toBe(state);
  });
});

describe("tallyEpochs", () => {
  it("uses SQI thresholds when decision is auto", () => {
    const counts = tallyEpochs([
      mk({ idx: 0, sqi: SQI_AUTO_ACCEPT }),
      mk({ idx: 1, sqi: 0.5 }),                 // review
      mk({ idx: 2, sqi: SQI_AUTO_REJECT - 0.01 }), // rejected
    ]);
    expect(counts.accepted).toBe(1);
    expect(counts.review).toBe(1);
    expect(counts.rejected).toBe(1);
  });

  it("explicit decisions override SQI heuristics", () => {
    const counts = tallyEpochs([
      mk({ idx: 0, sqi: 0.99, decision: "reject" }),
      mk({ idx: 1, sqi: 0.05, decision: "accept" }),
    ]);
    expect(counts.accepted).toBe(1);
    expect(counts.rejected).toBe(1);
    expect(counts.review).toBe(0);
  });

  it("always sums to total length", () => {
    const epochs = Array.from({ length: 64 }, (_, i) => mk({ idx: i, sqi: 0.5 + (i % 5) * 0.1 }));
    const counts = tallyEpochs(epochs);
    expect(counts.accepted + counts.rejected + counts.review).toBe(64);
  });
});
