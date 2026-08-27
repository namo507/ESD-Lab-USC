import { describe, expect, it } from "vitest";

import { GAZE_LIMITS } from "@/components/buddy3d/brand3d";
import {
  ATTENTION_DECAY_MS,
  blinkIntervalMs,
  clamp,
  nextPoissonDelay,
  resolveGazeTarget,
  sampleSaccade,
  splitGaze,
  type GazeInputs,
} from "@/components/buddy3d/gaze";

function inputs(overrides: Partial<GazeInputs> = {}): GazeInputs {
  return {
    pinnedAnchor: null,
    hoveredAnchor: null,
    pointer: null,
    explaining: null,
    exitEdge: null,
    idleTarget: { x: 0, y: 0 },
    pointerIdleMs: 0,
    ...overrides,
  };
}

describe("gaze target priority", () => {
  it("puts a pinned card above everything else", () => {
    const target = resolveGazeTarget(
      inputs({
        pinnedAnchor: { x: 0.9, y: 0.1 },
        hoveredAnchor: { x: -0.5, y: 0 },
        pointer: { x: 0.2, y: 0.2 },
      }),
    );
    expect(target).toEqual({ x: 0.9, y: 0.1 });
  });

  it("prefers a hovered region over the raw pointer", () => {
    const target = resolveGazeTarget(
      inputs({ hoveredAnchor: { x: -0.5, y: 0.3 }, pointer: { x: 0.2, y: 0.2 } }),
    );
    expect(target).toEqual({ x: -0.5, y: 0.3 });
  });

  it("follows the pointer while it is still moving", () => {
    const target = resolveGazeTarget(inputs({ pointer: { x: 0.4, y: -0.2 }, pointerIdleMs: 100 }));
    expect(target).toEqual({ x: 0.4, y: -0.2 });
  });

  it("lingers on the last pointer position before drifting", () => {
    // Just past the decay threshold the gaze should still be near the pointer,
    // not snapped to the idle target. The lingering is the point.
    const target = resolveGazeTarget(
      inputs({
        pointer: { x: 1, y: 1 },
        idleTarget: { x: -1, y: -1 },
        pointerIdleMs: ATTENTION_DECAY_MS + 200,
      }),
    );
    expect(target.x).toBeGreaterThan(0.8);
    expect(target.x).toBeLessThan(1);
  });

  it("fully decays to the idle target once attention is gone", () => {
    const target = resolveGazeTarget(
      inputs({
        pointer: { x: 1, y: 1 },
        idleTarget: { x: -1, y: -1 },
        pointerIdleMs: ATTENTION_DECAY_MS + 10_000,
      }),
    );
    expect(target).toEqual({ x: -1, y: -1 });
  });

  it("looks at the exit edge when the pointer has left", () => {
    const target = resolveGazeTarget(inputs({ exitEdge: { x: -1, y: 0.4 } }));
    expect(target).toEqual({ x: -1, y: 0.4 });
  });

  it("falls back to the idle wander when nothing is asking", () => {
    expect(resolveGazeTarget(inputs({ idleTarget: { x: 0.3, y: -0.3 } }))).toEqual({ x: 0.3, y: -0.3 });
  });
});

describe("gaze cone limits", () => {
  it("never rotates a joint past its cone, however extreme the target", () => {
    for (const target of [
      { x: 10, y: 10 },
      { x: -10, y: -10 },
      { x: 1, y: -1 },
    ]) {
      const split = splitGaze(target);
      expect(Math.abs(split.eye.yaw)).toBeLessThanOrEqual(GAZE_LIMITS.eyeYaw + 1e-9);
      expect(Math.abs(split.eye.pitch)).toBeLessThanOrEqual(GAZE_LIMITS.eyePitch + 1e-9);
      expect(Math.abs(split.head.yaw)).toBeLessThanOrEqual(GAZE_LIMITS.headYaw + 1e-9);
      expect(Math.abs(split.head.pitch)).toBeLessThanOrEqual(GAZE_LIMITS.headPitch + 1e-9);
      // The body term is computed from the residual the eyes and head could not
      // cover, so it grows with the target unless the input is saturated. An
      // off-canvas pointer once rotated the character away from the viewer
      // entirely — it answered with its back turned.
      expect(Math.abs(split.bodyYaw)).toBeLessThanOrEqual(GAZE_LIMITS.headYaw + 1e-9);
    }
  });

  it("saturates an off-canvas target instead of spinning the body", () => {
    // A pointer far outside the scene box must read the same as one at the edge.
    const edge = splitGaze({ x: 1, y: 0 });
    const far = splitGaze({ x: 6, y: 0 });
    expect(far.bodyYaw).toBeCloseTo(edge.bodyYaw, 9);
    expect(far.head.yaw).toBeCloseTo(edge.head.yaw, 9);
    expect(far.eye.yaw).toBeCloseTo(edge.eye.yaw, 9);
  });

  it("moves the eyes before the head, so the head lags", () => {
    // A small target should be entirely within the eye cone, leaving the head
    // still. That ordering is what reads as alive.
    const split = splitGaze({ x: 0.1, y: 0 });
    expect(Math.abs(split.eye.yaw)).toBeGreaterThan(0);
    expect(Math.abs(split.head.yaw)).toBeLessThan(1e-9);
  });

  it("spills to the head only once the eyes have saturated", () => {
    const split = splitGaze({ x: 1, y: 0 });
    expect(Math.abs(split.eye.yaw)).toBeCloseTo(GAZE_LIMITS.eyeYaw, 6);
    expect(Math.abs(split.head.yaw)).toBeGreaterThan(0);
  });

  it("clamps symmetrically", () => {
    expect(clamp(5, 2)).toBe(2);
    expect(clamp(-5, 2)).toBe(-2);
    expect(clamp(1, 2)).toBe(1);
  });
});

describe("irregular timing", () => {
  it("produces a spread of blink intervals rather than a metronome", () => {
    const delays = Array.from({ length: 200 }, () => nextPoissonDelay(1000));
    const unique = new Set(delays.map((d) => Math.round(d)));
    expect(unique.size).toBeGreaterThan(150);
    expect(Math.min(...delays)).toBeGreaterThan(0);
  });

  it("derives the blink interval from a per-minute rate", () => {
    expect(blinkIntervalMs(15)).toBeCloseTo(4000, 6);
    // Guards against a divide-by-zero when a state declares no blinking.
    expect(Number.isFinite(blinkIntervalMs(0))).toBe(true);
  });

  it("keeps saccades small, brief, and within their declared bands", () => {
    for (let i = 0; i < 200; i += 1) {
      const s = sampleSaccade();
      const magnitude = Math.hypot(s.yaw, s.pitch);
      expect(magnitude).toBeGreaterThanOrEqual((2 * Math.PI) / 180 - 1e-9);
      expect(magnitude).toBeLessThanOrEqual((6 * Math.PI) / 180 + 1e-9);
      expect(s.holdMs).toBeGreaterThanOrEqual(60);
      expect(s.holdMs).toBeLessThanOrEqual(120);
      expect(s.nextMs).toBeGreaterThanOrEqual(800);
      expect(s.nextMs).toBeLessThanOrEqual(2400);
    }
  });
});
