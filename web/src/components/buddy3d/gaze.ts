/**
 * Where the buddy is looking, and how it gets there.
 *
 * Pure functions only — no React, no three.js — so the behaviour that carries
 * the whole illusion is testable without a canvas. `gaze.test.ts` covers the
 * priority order, the cone clamps, and the Poisson timing.
 */

import { GAZE_LIMITS } from "./brand3d";

export interface Vec2 {
  x: number;
  y: number;
}

export interface GazeInputs {
  /** A pinned codex card outranks everything; the buddy stays with the topic. */
  pinnedAnchor: Vec2 | null;
  /** A hovered glyph or control. */
  hoveredAnchor: Vec2 | null;
  /** Raw pointer, normalised to -1..1. Null once the pointer leaves. */
  pointer: Vec2 | null;
  /** A materialized data object the buddy is currently explaining. */
  explaining: Vec2 | null;
  /** Where the pointer left the window, held briefly after exit. */
  exitEdge: Vec2 | null;
  /** Perlin-ish wander target, resampled every 2–5 s. */
  idleTarget: Vec2;
  /** ms since the pointer last moved. */
  pointerIdleMs: number;
}

/** After this long without pointer movement, attention drifts. */
export const ATTENTION_DECAY_MS = 4000;

/**
 * Resolve the gaze target from the priority ladder.
 *
 * The ladder is strict: a pinned card beats a hover, a hover beats the raw
 * pointer, and the idle wander only wins when nothing else is asking. The one
 * soft rule is attention decay — after four still seconds the target blends
 * toward the wander point while keeping a bias to where the pointer last was,
 * the way a person's attention lingers on something before drifting off it.
 */
export function resolveGazeTarget(inputs: GazeInputs): Vec2 {
  const { pinnedAnchor, hoveredAnchor, pointer, explaining, exitEdge, idleTarget, pointerIdleMs } = inputs;

  if (pinnedAnchor) return pinnedAnchor;
  if (hoveredAnchor) return hoveredAnchor;

  if (pointer) {
    if (pointerIdleMs <= ATTENTION_DECAY_MS) return pointer;
    // Linger, then drift. Fully decayed 4 s after the decay window opens.
    const t = Math.min(1, (pointerIdleMs - ATTENTION_DECAY_MS) / 4000);
    return lerp2(pointer, idleTarget, t);
  }

  if (explaining) return explaining;
  if (exitEdge) return exitEdge;
  return idleTarget;
}

export function lerp2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * Split one gaze target into eye and head rotations.
 *
 * The eyes take the target first and clamp at their cone; whatever they cannot
 * cover spills to the head, and whatever the head cannot cover spills to the
 * body. That cascade is why the character never over-rotates a single joint.
 */
export function splitGaze(target: Vec2): {
  eye: { yaw: number; pitch: number };
  head: { yaw: number; pitch: number };
  bodyYaw: number;
} {
  // Saturate the input first. Every joint below is clamped, but the body term is
  // computed from the *residual*, which grows without bound as the target does —
  // an off-canvas pointer could turn the character right around.
  const tx = clamp(target.x, 1);
  const ty = clamp(target.y, 1);
  const wantYaw = tx * GAZE_LIMITS.headYaw * 1.6;
  const wantPitch = -ty * GAZE_LIMITS.headPitch * 1.4;

  const eyeYaw = clamp(wantYaw, GAZE_LIMITS.eyeYaw);
  const eyePitch = clamp(wantPitch, GAZE_LIMITS.eyePitch);

  const headYaw = clamp(wantYaw - eyeYaw, GAZE_LIMITS.headYaw);
  const headPitch = clamp(wantPitch - eyePitch, GAZE_LIMITS.headPitch);

  const bodyYaw = clamp((wantYaw - eyeYaw - headYaw) * 0.6, GAZE_LIMITS.headYaw);

  return { eye: { yaw: eyeYaw, pitch: eyePitch }, head: { yaw: headYaw, pitch: headPitch }, bodyYaw };
}

/**
 * Next event time for a Poisson process with the given mean interval.
 *
 * Blinks and saccades both use this. A fixed interval is the tell that gives
 * away a rigged character — the irregularity is the point.
 */
export function nextPoissonDelay(meanMs: number, random: () => number = Math.random): number {
  const u = Math.max(random(), 1e-6);
  return -Math.log(u) * meanMs;
}

/** Mean interval between blinks, ms, from a blinks-per-minute rate. */
export function blinkIntervalMs(blinksPerMinute: number): number {
  return 60_000 / Math.max(1, blinksPerMinute);
}

export const BLINK_CLOSE_MS = 110;

/** Saccades fire every 0.8–2.4 s and throw the eyes 2–6° off-axis. */
export const SACCADE_MIN_MS = 800;
export const SACCADE_MAX_MS = 2400;
export const SACCADE_MIN_RAD = (2 * Math.PI) / 180;
export const SACCADE_MAX_RAD = (6 * Math.PI) / 180;
export const SACCADE_HOLD_MIN_MS = 60;
export const SACCADE_HOLD_MAX_MS = 120;

export function sampleSaccade(random: () => number = Math.random): {
  yaw: number;
  pitch: number;
  holdMs: number;
  nextMs: number;
} {
  const angle = random() * Math.PI * 2;
  const magnitude = SACCADE_MIN_RAD + random() * (SACCADE_MAX_RAD - SACCADE_MIN_RAD);
  return {
    yaw: Math.cos(angle) * magnitude,
    pitch: Math.sin(angle) * magnitude,
    holdMs: SACCADE_HOLD_MIN_MS + random() * (SACCADE_HOLD_MAX_MS - SACCADE_HOLD_MIN_MS),
    nextMs: SACCADE_MIN_MS + random() * (SACCADE_MAX_MS - SACCADE_MIN_MS),
  };
}
