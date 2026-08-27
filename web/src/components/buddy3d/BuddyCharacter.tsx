/**
 * The buddy, built entirely from geometry and brand vocabulary.
 *
 * There is no .glb, no .vrm, and no character SDK here on purpose: everything
 * is procedural, so the character is diffable in review, version-controlled
 * like any other source, brand-exact by construction, and costs nothing to ship
 * over the wire beyond the code that draws it.
 *
 * Shape language comes from the lab's own iconography rather than a generic
 * robot — the sunburst is the core, the body is a rounded capsule, and nothing
 * anywhere has a sharp corner, because sharp corners are off-brand and that
 * rule does not stop applying in three dimensions.
 */
import { useFrame } from "@react-three/fiber";
import { easing } from "maath";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { ACCENT, BRAND, DAMPING, GAZE_LIMITS } from "./brand3d";
import {
  BLINK_CLOSE_MS,
  blinkIntervalMs,
  clamp,
  nextPoissonDelay,
  sampleSaccade,
  splitGaze,
  type Vec2,
} from "./gaze";
import { STATE_PROFILE, accentHex, type BuddyState } from "./buddyState";

const RAY_COUNT = 12;

/**
 * Colour per sunburst ray.
 *
 * The signature blue leads and the secondary palette threads through it, so the
 * core reads as the lab's sunburst rather than a plain ring. Accents still never
 * dominate: they are one ray in three, at partial opacity, against nine blues.
 */
const RAY_PALETTE = [
  BRAND.discoveryBlue, BRAND.scienceBlue, ACCENT.attention,
  BRAND.discoveryBlue, BRAND.scienceBlue, ACCENT.discovery,
  BRAND.discoveryBlue, BRAND.scienceBlue, ACCENT.warm,
  BRAND.discoveryBlue, BRAND.scienceBlue, ACCENT.attention,
];

/** Motes that orbit the core; they speed up with system activity. */
const ORBIT_COUNT = 8;

export interface BuddyCharacterProps {
  /**
   * Resolved gaze target, normalised to -1..1, passed as a ref.
   *
   * A ref rather than a value on purpose: the target changes every frame, and
   * threading it through props would re-render the whole route sixty times a
   * second for something only the render loop reads.
   */
  targetRef: React.RefObject<Vec2>;
  state: BuddyState;
  /** 0..1 mouth opening from the token stream. */
  openness: number;
  /** Freezes idle motion; the gaze still tracks. */
  reducedMotion: boolean;
  /** Rises while the pipeline is busy; the sunburst reads it as urgency. */
  activity: number;
}

export function BuddyCharacter({ targetRef, state, openness, reducedMotion, activity }: BuddyCharacterProps) {
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const leftLid = useRef<THREE.Mesh>(null);
  const rightLid = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const sunburst = useRef<THREE.InstancedMesh>(null);
  const orbit = useRef<THREE.InstancedMesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const accentRing = useRef<THREE.Mesh>(null);
  const leftEar = useRef<THREE.Mesh>(null);
  const rightEar = useRef<THREE.Mesh>(null);

  // Per-instance transform scratch. Reused every frame so the sunburst never
  // allocates inside the render loop.
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const rayColors = useMemo(
    () => Float32Array.from(RAY_PALETTE.flatMap((hex) => new THREE.Color(hex).toArray())),
    [],
  );
  const orbitColors = useMemo(
    () =>
      Float32Array.from(
        Array.from({ length: ORBIT_COUNT }, (_, i) =>
          new THREE.Color(
            [ACCENT.attention, ACCENT.discovery, ACCENT.warm, BRAND.scienceBlue][i % 4],
          ).toArray(),
        ).flat(),
      ),
    [],
  );
  const accentColor = useMemo(() => new THREE.Color(BRAND.discoveryBlue), []);

  const timers = useRef({
    blinkAt: 900,
    blinkUntil: -1,
    doubleBlink: false,
    saccadeAt: 1200,
    saccadeUntil: -1,
    saccade: { yaw: 0, pitch: 0 },
    elapsed: 0,
    lastState: state as BuddyState,
    gestureUntil: -1,
  });

  useFrame((_, delta) => {
    const t = timers.current;
    // Cap dt so a backgrounded tab does not fast-forward the whole animation
    // when it comes back.
    const dt = Math.min(delta, 0.1);
    t.elapsed += dt * 1000;
    const profile = STATE_PROFILE[state];

    // Always blink on a state transition — it hides the pose change the way a
    // real blink hides a saccade.
    if (t.lastState !== state) {
      t.lastState = state;
      t.blinkUntil = t.elapsed + BLINK_CLOSE_MS;
      t.gestureUntil = t.elapsed + 260;
    }

    /* ── Gaze ────────────────────────────────────────────────────────────
       Eyes clamp first and spill what they cannot cover to the head, which
       spills again to the body. The eyes are damped roughly three times
       faster than the head, and that lag is what reads as alive. */
    if (t.elapsed >= t.saccadeAt) {
      const s = sampleSaccade();
      t.saccade = { yaw: s.yaw, pitch: s.pitch };
      t.saccadeUntil = t.elapsed + s.holdMs;
      t.saccadeAt = t.elapsed + s.nextMs;
    }
    const saccading = !reducedMotion && t.elapsed < t.saccadeUntil;
    const split = splitGaze(targetRef.current ?? { x: 0, y: 0 });

    if (eyes.current) {
      easing.damp(
        eyes.current.rotation,
        "y",
        split.eye.yaw + (saccading ? t.saccade.yaw : 0),
        DAMPING.eye,
        dt,
      );
      easing.damp(
        eyes.current.rotation,
        "x",
        split.eye.pitch + (saccading ? t.saccade.pitch : 0),
        DAMPING.eye,
        dt,
      );
    }
    if (head.current) {
      easing.damp(head.current.rotation, "y", split.head.yaw, DAMPING.head, dt);
      easing.damp(head.current.rotation, "x", split.head.pitch, DAMPING.head, dt);
      // Idle head tilt. Small, slow, and off the breathing frequency so the two
      // never beat against each other.
      const tilt = reducedMotion ? 0 : Math.sin(t.elapsed / 3400) * 0.05;
      easing.damp(head.current.rotation, "z", tilt, DAMPING.head, dt);
    }

    /* ── Body: breathing, lean, posture ──────────────────────────────── */
    if (root.current) {
      easing.damp(root.current.rotation, "y", split.bodyYaw, DAMPING.body, dt);
      const breath = reducedMotion
        ? 0
        : Math.sin((t.elapsed / 1000) * profile.breathHz * Math.PI * 2) * 0.018;
      const gesturing = !reducedMotion && t.elapsed < t.gestureUntil;
      easing.damp3(
        root.current.position,
        [0, profile.posture + breath + (gesturing ? 0.03 : 0), profile.lean],
        DAMPING.body,
        dt,
      );
      const sway = reducedMotion ? 0 : Math.sin(t.elapsed / 2600) * 0.012;
      easing.damp(root.current.rotation, "z", sway, DAMPING.body, dt);
    }

    /* ── Blink ───────────────────────────────────────────────────────────
       Poisson-timed, never on a fixed interval, because a metronome blink is
       the single clearest tell that a character is rigged rather than alive. */
    if (t.elapsed >= t.blinkAt) {
      t.blinkUntil = t.elapsed + BLINK_CLOSE_MS;
      // Occasionally double-blink, the way people actually do.
      t.doubleBlink = Math.random() < 0.18;
      t.blinkAt = t.elapsed + nextPoissonDelay(blinkIntervalMs(profile.blinkRate));
    }
    let lid = 0;
    if (!reducedMotion && t.elapsed < t.blinkUntil) {
      const phase = 1 - (t.blinkUntil - t.elapsed) / BLINK_CLOSE_MS;
      lid = Math.sin(phase * Math.PI);
    } else if (!reducedMotion && t.doubleBlink && t.elapsed < t.blinkUntil + BLINK_CLOSE_MS * 1.6) {
      const phase = (t.elapsed - t.blinkUntil - BLINK_CLOSE_MS * 0.6) / BLINK_CLOSE_MS;
      lid = phase > 0 && phase < 1 ? Math.sin(phase * Math.PI) * 0.9 : 0;
    }
    const lidScale = 1 - lid * 0.94;
    if (leftLid.current) leftLid.current.scale.y = lidScale;
    if (rightLid.current) rightLid.current.scale.y = lidScale;

    /* ── Mouth ───────────────────────────────────────────────────────────
       Scaled rather than morph-targeted: one arc, two axes, no morph buffer to
       upload every frame. */
    if (mouth.current) {
      const open = state === "speaking" ? openness : state === "concerned" ? 0.12 : 0.06;
      easing.damp(mouth.current.scale, "y", 0.25 + open * 1.5, 0.08, dt);
      easing.damp(mouth.current.scale, "x", 1 - open * 0.18, 0.08, dt);
    }

    /* ── Ears: the listening tell ────────────────────────────────────── */
    const earScale = state === "listening" ? 1.35 : 1;
    for (const ear of [leftEar.current, rightEar.current]) {
      if (ear) easing.damp3(ear.scale, [earScale, earScale, earScale], DAMPING.accent, dt);
    }

    /* ── Sunburst: rate bound to system activity ─────────────────────────
       Calm when the lab is idle, quicker when a pipeline is running. It is the
       one ambient signal on the resting surface that carries information. */
    if (sunburst.current) {
      const spin = profile.spin * (1 + activity * 1.4);
      sunburst.current.rotation.z += reducedMotion ? 0 : spin * dt * Math.PI * 2;
      for (let i = 0; i < RAY_COUNT; i += 1) {
        const angle = (i / RAY_COUNT) * Math.PI * 2;
        // Rays breathe out of phase with each other so the core never pulses as
        // a single flat ring.
        const pulse = reducedMotion ? 1 : 1 + Math.sin(t.elapsed / 700 + i) * 0.09;
        dummy.position.set(Math.cos(angle) * 1.02, Math.sin(angle) * 1.02, -0.02);
        dummy.rotation.set(0, 0, angle);
        dummy.scale.set(pulse, 1, 1);
        dummy.updateMatrix();
        sunburst.current.setMatrixAt(i, dummy.matrix);
      }
      sunburst.current.instanceMatrix.needsUpdate = true;
    }

    /* ── Orbiting motes ─────────────────────────────────────────────────
       Always present, but they tighten and speed up while the buddy is
       thinking, which is what makes the wait legible without a spinner. */
    if (orbit.current) {
      const busy = state === "thinking" || state === "speaking";
      const speed = (busy ? 1.4 : 0.35) * (1 + activity);
      const radius = busy ? 0.92 : 1.12;
      for (let i = 0; i < ORBIT_COUNT; i += 1) {
        const phase = (i / ORBIT_COUNT) * Math.PI * 2;
        const angle = phase + (reducedMotion ? 0 : (t.elapsed / 1000) * speed);
        const wobble = reducedMotion ? 0 : Math.sin(t.elapsed / 900 + i) * 0.1;
        dummy.position.set(
          Math.cos(angle) * (radius + wobble),
          Math.sin(angle) * (radius + wobble) * 0.62,
          Math.sin(angle * 1.6) * 0.28,
        );
        const scale = busy ? 1 : 0.68;
        dummy.rotation.set(0, 0, angle);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        orbit.current.setMatrixAt(i, dummy.matrix);
      }
      orbit.current.instanceMatrix.needsUpdate = true;
    }

    /* ── Accent: exactly one lit at a time ───────────────────────────── */
    const hex = accentHex(state);
    accentColor.lerp(new THREE.Color(hex ?? BRAND.discoveryBlue), 1 - Math.exp(-dt / DAMPING.accent));
    if (core.current) {
      (core.current.material as THREE.MeshStandardMaterial).emissive.copy(accentColor);
    }
    if (accentRing.current) {
      const mat = accentRing.current.material as THREE.MeshBasicMaterial;
      mat.color.copy(accentColor);
      mat.opacity = hex ? 0.75 : 0.25;
      const flare = state === "celebrating" ? 1.25 : 1;
      easing.damp3(accentRing.current.scale, [flare, flare, flare], DAMPING.accent, dt);
    }
  });

  return (
    <group ref={root} dispose={null}>
      {/* Core: the ESD sunburst.
          It sits *behind* the head and reads past the silhouette on every side.
          An earlier placement put it at z=-0.16 against a head of radius 0.5,
          which occluded it completely — the signature brand element was in the
          scene and invisible. Radius and depth here are set so the rays clear
          the head outline rather than hide inside it. */}
      <group position={[0, 0.42, -0.9]}>
        <instancedMesh ref={sunburst} args={[undefined, undefined, RAY_COUNT]} frustumCulled={false}>
          <capsuleGeometry args={[0.032, 0.4, 3, 6]}>
            <instancedBufferAttribute attach="attributes-color" args={[rayColors, 3]} />
          </capsuleGeometry>
          <meshBasicMaterial vertexColors transparent opacity={0.62} />
        </instancedMesh>
        {/* Orbiting motes. One draw call, eight instances. */}
        <instancedMesh ref={orbit} args={[undefined, undefined, ORBIT_COUNT]} frustumCulled={false}>
          <sphereGeometry args={[0.05, 10, 8]}>
            <instancedBufferAttribute attach="attributes-color" args={[orbitColors, 3]} />
          </sphereGeometry>
          <meshBasicMaterial vertexColors transparent opacity={0.85} />
        </instancedMesh>
        <mesh ref={core}>
          <sphereGeometry args={[0.3, 24, 18]} />
          <meshStandardMaterial
            color={BRAND.discoveryBlue}
            emissive={BRAND.discoveryBlue}
            emissiveIntensity={0.9}
            roughness={0.35}
          />
        </mesh>
        <mesh ref={accentRing}>
          <torusGeometry args={[1.34, 0.01, 8, 48]} />
          <meshBasicMaterial color={BRAND.discoveryBlue} transparent opacity={0.14} />
        </mesh>
      </group>

      {/* Body: rounded capsule, Cool Blue, with a Science Blue rim. */}
      <mesh position={[0, -0.58, 0]}>
        <capsuleGeometry args={[0.4, 0.34, 8, 28]} />
        <meshStandardMaterial
          color={BRAND.coolBlue}
          emissive={BRAND.scienceBlue}
          emissiveIntensity={0.22}
          roughness={0.5}
          metalness={0.04}
        />
      </mesh>
      <mesh position={[0, -0.58, 0]} scale={1.035}>
        <capsuleGeometry args={[0.4, 0.34, 6, 24]} />
        <meshBasicMaterial color={BRAND.scienceBlue} transparent opacity={0.3} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      <group ref={head} position={[0, 0.42, 0]}>
        <mesh>
          <sphereGeometry args={[0.5, 32, 24]} />
          <meshStandardMaterial
            color={BRAND.coolBlue}
            emissive={BRAND.scienceBlue}
            emissiveIntensity={0.2}
            roughness={0.45}
            metalness={0.04}
          />
        </mesh>
        {/* Fresnel-ish rim: a slightly larger back-faced shell. Cheaper than a
            custom shader and it survives the low-power path unchanged. */}
        <mesh scale={1.04}>
          <sphereGeometry args={[0.5, 24, 18]} />
          <meshBasicMaterial color={BRAND.scienceBlue} transparent opacity={0.32} side={THREE.BackSide} depthWrite={false} />
        </mesh>

        {/* Ears: the geometry that expands while listening. */}
        <mesh ref={leftEar} position={[-0.49, 0.04, -0.1]}>
          <sphereGeometry args={[0.072, 16, 12]} />
          <meshStandardMaterial color={BRAND.scienceBlue} emissive={BRAND.discoveryBlue} emissiveIntensity={0.25} roughness={0.5} />
        </mesh>
        <mesh ref={rightEar} position={[0.49, 0.04, -0.1]}>
          <sphereGeometry args={[0.072, 16, 12]} />
          <meshStandardMaterial color={BRAND.scienceBlue} emissive={BRAND.discoveryBlue} emissiveIntensity={0.25} roughness={0.5} />
        </mesh>

        {/* Eyes. Oversized relative to the head, the way appealing game
            characters are — a realistically-scaled eye reads as cold here. */}
        <group ref={eyes} position={[0, 0.02, 0]}>
          <Eye side={-1} lidRef={leftLid} />
          <Eye side={1} lidRef={rightLid} />
        </group>

        {/* Mouth: one arc, scaled on two axes by the token stream. */}
        <mesh ref={mouth} position={[0, -0.235, 0.415]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.1, 0.022, 8, 20, Math.PI]} />
          <meshStandardMaterial color="#2a3350" roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/** One eye: white, iris, specular highlight, and a lid that scales to blink. */
function Eye({ side, lidRef }: { side: -1 | 1; lidRef: React.RefObject<THREE.Mesh> }) {
  const x = 0.2 * side;
  return (
    <group position={[x, 0.05, 0.35]}>
      <mesh ref={lidRef}>
        <sphereGeometry args={[0.145, 20, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.25} />
      </mesh>
      <mesh position={[0, 0, 0.108]}>
        <sphereGeometry args={[0.072, 18, 14]} />
        <meshStandardMaterial color="#141a2e" roughness={0.2} />
      </mesh>
      {/* The highlight is what makes the eye read as wet rather than painted. */}
      <mesh position={[0.03, 0.042, 0.132]}>
        <sphereGeometry args={[0.019, 10, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

export { GAZE_LIMITS, clamp };
