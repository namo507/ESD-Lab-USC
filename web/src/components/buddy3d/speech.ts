/**
 * Drives the mouth from the token stream.
 *
 * There is no TTS, so there are no visemes to sync against. What there is, is a
 * token stream whose *cadence* already carries the rhythm of the sentence — so
 * the mouth is driven from arrival rate and token shape instead of from audio.
 *
 * The interface is deliberately the same shape a real viseme driver would have
 * (`push(token)` in, `sample(now)` out). If TTS is added later, swap the
 * implementation and leave every caller alone.
 */

/** Amplitude smoothing window. Below ~90 ms the mouth chatters. */
export const SMOOTHING_MS = 90;

/** Full close plus a beat. */
const SENTENCE_END = /[.!?]$/;
/** Partial close. */
const CLAUSE_END = /[,;:]$/;

/** At most one gesture per 1.5 s, however many clauses arrive. */
export const GESTURE_COOLDOWN_MS = 1500;

const VOWELS = /[aeiouAEIOU]/g;

/**
 * How wide this token opens the mouth.
 *
 * Vowel-dense tokens open wider than consonant-dense ones. It is a cheap
 * heuristic and it reads convincingly at this level of stylization, where the
 * mouth is a single morphing arc rather than a modelled jaw.
 */
export function tokenOpenness(token: string): number {
  const trimmed = token.trim();
  if (!trimmed) return 0;
  if (SENTENCE_END.test(trimmed)) return 0;
  if (CLAUSE_END.test(trimmed)) return 0.18;
  const vowels = (trimmed.match(VOWELS) ?? []).length;
  const ratio = vowels / trimmed.length;
  return Math.max(0.25, Math.min(1, 0.3 + ratio * 1.4));
}

export function isClauseBoundary(token: string): boolean {
  const trimmed = token.trim();
  return SENTENCE_END.test(trimmed) || CLAUSE_END.test(trimmed);
}

export interface SpeechSample {
  /** 0..1 mouth opening. */
  openness: number;
  /** True on the frame a gesture should fire. */
  gesture: boolean;
}

export class SpeechDriver {
  private target = 0;
  private current = 0;
  private lastSampleAt = 0;
  private lastGestureAt = -Infinity;
  private gesturePending = false;
  /** Set on a sentence end so the mouth holds shut for a beat. */
  private holdUntil = 0;

  push(token: string, now: number = Date.now()): void {
    this.target = tokenOpenness(token);
    if (SENTENCE_END.test(token.trim())) this.holdUntil = now + 180;
    if (isClauseBoundary(token) && now - this.lastGestureAt >= GESTURE_COOLDOWN_MS) {
      this.gesturePending = true;
      this.lastGestureAt = now;
    }
  }

  /** Call once per frame. Decays toward closed when nothing is arriving. */
  sample(now: number = Date.now()): SpeechSample {
    const dt = this.lastSampleAt ? Math.max(0, now - this.lastSampleAt) : 16;
    this.lastSampleAt = now;

    const goal = now < this.holdUntil ? 0 : this.target;
    // Exponential smoothing with a SMOOTHING_MS half-life, frame-rate independent.
    const alpha = 1 - Math.exp(-dt / SMOOTHING_MS);
    this.current += (goal - this.current) * alpha;

    // Tokens stop arriving between words; decay so the mouth does not hang open.
    this.target *= Math.exp(-dt / 220);

    const gesture = this.gesturePending;
    this.gesturePending = false;
    return { openness: Math.max(0, Math.min(1, this.current)), gesture };
  }

  reset(): void {
    this.target = 0;
    this.current = 0;
    this.holdUntil = 0;
    this.gesturePending = false;
    this.lastGestureAt = -Infinity;
  }
}
