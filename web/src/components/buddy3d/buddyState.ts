/**
 * The buddy's eight-state machine.
 *
 * Every state is reachable from every other state — there is no trap state, and
 * `buddyState.test.ts` asserts that by walking the full transition matrix. The
 * renderer never cuts between states; it spring-interpolates over
 * `TRANSITION_MS`, so a state change is a target for the damping loop rather
 * than an instant pose swap.
 */
import { create } from "zustand";

import { ACCENT, type AccentName } from "./brand3d";

export type BuddyState =
  | "idle"
  | "attentive"
  | "listening"
  | "thinking"
  | "speaking"
  | "presenting"
  | "concerned"
  | "celebrating";

export const BUDDY_STATES: readonly BuddyState[] = [
  "idle",
  "attentive",
  "listening",
  "thinking",
  "speaking",
  "presenting",
  "concerned",
  "celebrating",
] as const;

/** Spring window for a state change. Nothing hard-cuts. */
export const TRANSITION_MS = 300;

/** Celebrating is capped hard: ≤1.2 s, and never twice inside a minute. */
export const CELEBRATE_MAX_MS = 1200;
export const CELEBRATE_COOLDOWN_MS = 60_000;

interface StateProfile {
  /** Breathing frequency, Hz. */
  breathHz: number;
  /** Sunburst rotations per second. */
  spin: number;
  /** Blinks per minute; listening drops this, which reads as focus. */
  blinkRate: number;
  /** Forward lean, world units. */
  lean: number;
  /** Vertical posture offset. Negative reads as deflated. */
  posture: number;
  /** At most one accent is lit at a time. */
  accent: AccentName | null;
}

export const STATE_PROFILE: Record<BuddyState, StateProfile> = {
  idle: { breathHz: 0.25, spin: 0.08, blinkRate: 14, lean: 0, posture: 0, accent: null },
  attentive: { breathHz: 0.3, spin: 0.16, blinkRate: 15, lean: 0.04, posture: 0.02, accent: "attention" },
  listening: { breathHz: 0.22, spin: 0.12, blinkRate: 8, lean: 0.12, posture: 0.01, accent: "warm" },
  thinking: { breathHz: 0.35, spin: 0.85, blinkRate: 10, lean: -0.03, posture: 0.01, accent: "discovery" },
  speaking: { breathHz: 0.4, spin: 0.3, blinkRate: 16, lean: 0.06, posture: 0, accent: "attention" },
  presenting: { breathHz: 0.3, spin: 0.22, blinkRate: 14, lean: 0.02, posture: 0.01, accent: "attention" },
  concerned: { breathHz: 0.2, spin: 0.05, blinkRate: 12, lean: -0.05, posture: -0.06, accent: "blocked" },
  celebrating: { breathHz: 0.5, spin: 1.1, blinkRate: 18, lean: 0, posture: 0.1, accent: "discovery" },
};

export function accentHex(state: BuddyState): string | null {
  const name = STATE_PROFILE[state].accent;
  return name ? ACCENT[name] : null;
}

interface BuddyStore {
  state: BuddyState;
  /** What the buddy should look at, if anything outranks the cursor. */
  focusAnchor: { x: number; y: number } | null;
  /** Rises while tokens stream; drives the mouth. */
  speechEnergy: number;
  /** Set when the last celebration fired, for the 60 s cooldown. */
  lastCelebratedAt: number;
  setState: (next: BuddyState) => void;
  setFocusAnchor: (anchor: { x: number; y: number } | null) => void;
  setSpeechEnergy: (energy: number) => void;
  /** No-ops inside the cooldown window rather than queueing a second hop. */
  celebrate: () => void;
}

export const useBuddy = create<BuddyStore>((set, get) => ({
  state: "idle",
  focusAnchor: null,
  speechEnergy: 0,
  lastCelebratedAt: 0,
  setState: (next) => set({ state: next }),
  setFocusAnchor: (anchor) => set({ focusAnchor: anchor }),
  setSpeechEnergy: (energy) => set({ speechEnergy: Math.max(0, Math.min(1, energy)) }),
  celebrate: () => {
    const now = Date.now();
    if (now - get().lastCelebratedAt < CELEBRATE_COOLDOWN_MS) return;
    set({ state: "celebrating", lastCelebratedAt: now });
    globalThis.setTimeout(() => {
      // Only stand down if nothing else claimed the buddy in the meantime.
      if (useBuddy.getState().state === "celebrating") set({ state: "idle" });
    }, CELEBRATE_MAX_MS);
  },
}));
