import { describe, expect, it } from "vitest";

import { ACCENT } from "@/components/buddy3d/brand3d";
import {
  BUDDY_STATES,
  CELEBRATE_COOLDOWN_MS,
  STATE_PROFILE,
  accentHex,
  useBuddy,
} from "@/components/buddy3d/buddyState";

describe("buddy state machine", () => {
  it("declares all eight states", () => {
    expect(BUDDY_STATES).toHaveLength(8);
  });

  it("has a profile for every state, so none can be entered undefined", () => {
    for (const state of BUDDY_STATES) {
      expect(STATE_PROFILE[state]).toBeDefined();
    }
  });

  it("reaches every state from every other state — no trap states", () => {
    const { setState } = useBuddy.getState();
    for (const from of BUDDY_STATES) {
      for (const to of BUDDY_STATES) {
        setState(from);
        expect(useBuddy.getState().state).toBe(from);
        setState(to);
        expect(useBuddy.getState().state).toBe(to);
      }
    }
    setState("idle");
  });

  it("lights at most one accent at a time", () => {
    const named = Object.values(ACCENT);
    for (const state of BUDDY_STATES) {
      const hex = accentHex(state);
      if (hex !== null) expect(named).toContain(hex);
    }
  });

  it("shows Firetruck Red when concerned and Optimal Yellow when celebrating", () => {
    expect(accentHex("concerned")).toBe(ACCENT.blocked);
    expect(accentHex("celebrating")).toBe(ACCENT.discovery);
  });

  it("drops the blink rate while listening, which reads as focus", () => {
    expect(STATE_PROFILE.listening.blinkRate).toBeLessThan(STATE_PROFILE.idle.blinkRate);
  });

  it("spins the sunburst up while thinking", () => {
    expect(STATE_PROFILE.thinking.spin).toBeGreaterThan(STATE_PROFILE.idle.spin);
  });

  it("drops posture when concerned", () => {
    expect(STATE_PROFILE.concerned.posture).toBeLessThan(0);
  });
});

describe("celebration cooldown", () => {
  it("refuses to celebrate twice inside a minute", () => {
    useBuddy.setState({ state: "idle", lastCelebratedAt: 0 });
    useBuddy.getState().celebrate();
    expect(useBuddy.getState().state).toBe("celebrating");

    // Something else claims the buddy, then a second celebration is requested
    // straight away. It must not fire.
    useBuddy.setState({ state: "idle" });
    useBuddy.getState().celebrate();
    expect(useBuddy.getState().state).toBe("idle");
  });

  it("celebrates again once the cooldown has passed", () => {
    useBuddy.setState({ state: "idle", lastCelebratedAt: Date.now() - CELEBRATE_COOLDOWN_MS - 1 });
    useBuddy.getState().celebrate();
    expect(useBuddy.getState().state).toBe("celebrating");
    useBuddy.setState({ state: "idle", lastCelebratedAt: 0 });
  });
});
