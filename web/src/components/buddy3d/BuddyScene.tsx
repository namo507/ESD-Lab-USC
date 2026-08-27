/**
 * Hosts the buddy: canvas, lighting, pointer plumbing, and every degrade path.
 *
 * The canvas is decorative and marked `aria-hidden`. Everything the buddy
 * conveys — its state, what it is looking at, and every word it says — also
 * exists as real text in the DOM next to it, because a surface whose content
 * lives only in a WebGL context is unreadable to a screen reader and gone
 * entirely on a machine without WebGL.
 */
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BRAND } from "./brand3d";
import { BuddyCharacter } from "./BuddyCharacter";
import { BuddyStatic } from "./BuddyStatic";
import { resolveGazeTarget, type Vec2 } from "./gaze";
import { useReducedMotion } from "./useReducedMotion";
import { STATE_PROFILE, type BuddyState } from "./buddyState";

export interface BuddySceneProps {
  state: BuddyState;
  openness: number;
  /** Anchor of the pinned codex card, in normalised -1..1 scene space. */
  pinnedAnchor: Vec2 | null;
  /** Anchor of whatever the pointer is currently over. */
  hoveredAnchor: Vec2 | null;
  /** 0..1 system activity; the sunburst spins faster as it rises. */
  activity: number;
  /** Human-readable state description, mirrored into the DOM for assistive tech. */
  describedBy?: string;
}

/** True when the browser can actually give us a WebGL context. */
function detectWebgl(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ?? canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

/**
 * Low-power machines get half the pixels and no extras.
 *
 * `hardwareConcurrency < 8` is a crude proxy for integrated graphics, but it is
 * the only signal available before the first frame, and guessing wrong costs a
 * slightly softer image rather than a broken one.
 */
function lowPower(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator.hardwareConcurrency ?? 8) < 8;
}

export function BuddyScene({
  state,
  openness,
  pinnedAnchor,
  hoveredAnchor,
  activity,
  describedBy,
}: BuddySceneProps) {
  const reducedMotion = useReducedMotion();
  const [webgl] = useState(detectWebgl);
  const [degraded, setDegraded] = useState(lowPower);
  const host = useRef<HTMLDivElement>(null);

  const pointer = useRef<Vec2 | null>(null);
  const exitEdge = useRef<Vec2 | null>(null);
  const lastPointerMove = useRef(0);
  const idleTarget = useRef<Vec2>({ x: 0, y: 0 });
  const [target, setTarget] = useState<Vec2>({ x: 0, y: 0 });

  /* Idle wander. Resampled every 2–5 s so the gaze has somewhere to go when
     nothing is asking for its attention. */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wander = () => {
      idleTarget.current = { x: (Math.random() - 0.5) * 1.1, y: (Math.random() - 0.5) * 0.7 };
      timer = globalThis.setTimeout(wander, 2000 + Math.random() * 3000);
    };
    wander();
    return () => globalThis.clearTimeout(timer);
  }, []);

  /* Pointer tracking is bound to the window, not the canvas: the buddy should
     notice the cursor crossing a codex card several hundred pixels away. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMove = (event: PointerEvent) => {
      const rect = host.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      // Direction from the character to the cursor, measured against the
      // *viewport* rather than the canvas box.
      //
      // Normalising against the box was wrong twice over. The box is a fraction
      // of the page, so a cursor resting on the ask bar normalised to roughly
      // (1.2, -2.4) — off the scale, which spilled into a body turn and left the
      // character answering with its back to the reader. Clamping fixed the
      // spin but still read that cursor as "far right", swivelling ~70° for a
      // pointer that is barely off-centre on the page.
      //
      // Measuring from the character's centre across the viewport gives the
      // reading a person would make: the ask bar is slightly right and well
      // below, so the buddy glances down at it.
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const nx = (event.clientX - cx) / (window.innerWidth / 2);
      const ny = -(event.clientY - cy) / (window.innerHeight / 2);
      pointer.current = {
        x: Math.max(-1, Math.min(1, nx)),
        y: Math.max(-1, Math.min(1, ny)),
      };
      exitEdge.current = null;
      lastPointerMove.current = performance.now();
    };
    const onLeave = () => {
      // Hold the exit edge for a beat, then fall back to idle wander. A cursor
      // that vanishes without the buddy noticing reads as inattentive.
      exitEdge.current = pointer.current;
      pointer.current = null;
      globalThis.setTimeout(() => {
        exitEdge.current = null;
      }, 1000);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  /* Resolve the gaze on a rAF loop rather than inside useFrame, so the target
     is still correct on the static path where there is no render loop. */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      setTarget(
        resolveGazeTarget({
          pinnedAnchor,
          hoveredAnchor,
          pointer: pointer.current,
          explaining: null,
          exitEdge: exitEdge.current,
          idleTarget: idleTarget.current,
          pointerIdleMs: lastPointerMove.current ? now - lastPointerMove.current : 0,
        }),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pinnedAnchor, hoveredAnchor]);

  /* Sustained frame-time regression drops the DPR once and stays there. It does
     not oscillate: re-upgrading on a brief recovery is how a scene ends up
     thrashing between two quality levels. */
  const onFrameBudget = useCallback((ms: number) => {
    if (ms > 26) setDegraded(true);
  }, []);

  const dpr = useMemo<[number, number]>(() => (degraded ? [1, 1] : [1, 2]), [degraded]);

  if (!webgl) {
    return (
      <div ref={host} className="buddy-scene" data-webgl="false">
        <BuddyStatic state={state} />
      </div>
    );
  }

  return (
    <div ref={host} className="buddy-scene" data-degraded={degraded ? "true" : "false"}>
      <Canvas
        aria-hidden="true"
        role="presentation"
        dpr={dpr}
        // Reduced motion still renders and still tracks the cursor; it just has
        // no idle animation to drive, so on-demand framing is enough.
        frameloop={reducedMotion ? "demand" : "always"}
        gl={{ antialias: !degraded, powerPreference: degraded ? "low-power" : "high-performance", alpha: true }}
        camera={{ position: [0, 0, 3.1], fov: 42 }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          // Must be set here: R3F passes unrecognised props to the wrapper div,
          // so aria-hidden on <Canvas> lands on the div and leaves the canvas
          // itself exposed to screen readers.
          gl.domElement.setAttribute("aria-hidden", "true");
          gl.domElement.setAttribute("role", "presentation");
          gl.domElement.removeAttribute("tabindex");
        }}
      >
        {/* A flat white ambient turned the Cool Blue body grey: the lit side
            washed to white and the shadow side went neutral, so the brand
            colour never appeared. A hemisphere light puts Science Blue in the
            shadows instead, which is what keeps the palette reading as blue. */}
        <hemisphereLight args={[BRAND.coolWhite, BRAND.discoveryBlue, 1.15]} />
        <ambientLight intensity={0.25} />
        <directionalLight position={[2.5, 3, 4]} intensity={0.85} color={BRAND.coolWhite} />
        <directionalLight position={[-3, -1, 2]} intensity={0.7} color={BRAND.scienceBlue} />
        <BuddyCharacter
          target={target}
          state={state}
          openness={openness}
          reducedMotion={reducedMotion}
          activity={activity}
        />
        <FrameBudget onSample={onFrameBudget} />
      </Canvas>
      {/* The canvas is aria-hidden, so the buddy's state has to reach assistive
          tech some other way. This is that way. */}
      <p className="buddy-scene__sr" role="status">
        {describedBy ?? `Buddy is ${state}.`}
      </p>
    </div>
  );
}

/** Samples frame time and reports a sustained regression exactly once. */
function FrameBudget({ onSample }: { onSample: (ms: number) => void }) {
  const samples = useRef<number[]>([]);
  const reported = useRef(false);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      const buffer = samples.current;
      buffer.push(dt);
      if (buffer.length > 120) buffer.shift();
      if (!reported.current && buffer.length === 120) {
        const sorted = [...buffer].sort((a, b) => a - b);
        const median = sorted[60] ?? 0;
        if (median > 26) {
          reported.current = true;
          onSample(median);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onSample]);
  return null;
}

export { STATE_PROFILE };
