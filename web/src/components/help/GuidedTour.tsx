import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TOUR_STEPS, type TourTrack } from "@/data/helpContent";
import { NANO_TOUR_EVENT, type NanoTourEventDetail } from "./tourEvents";
import styles from "./GuidedTour.module.css";

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ActiveTour {
  track: TourTrack;
  index: number;
}

const STORAGE_PREFIX = "nano_tour_seen_";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function storageKey(track: TourTrack): string {
  return `${STORAGE_PREFIX}${track}`;
}

function safeGetSeen(track: TourTrack): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey(track)) === "true";
  } catch {
    return false;
  }
}

function safeSetSeen(track: TourTrack): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(track), "true");
  } catch {
    /* privacy modes can reject storage */
  }
}

function BuddyTourMark() {
  return (
    <span className={styles.buddy} aria-hidden="true">
      <svg viewBox="0 0 96 96">
        <ellipse className={styles.buddyBody} cx="48" cy="56" rx="32" ry="28" />
        <circle className={styles.buddyEye} cx="36" cy="50" r="3" />
        <circle className={styles.buddyEye} cx="60" cy="50" r="3" />
        <path className={styles.buddyMouth} d="M42 64 Q 48 68 54 64" />
        <path
          className={styles.buddyPulse}
          transform="translate(69 30) scale(0.48)"
          d="M12 21s-7-4.5-9.5-9.2C0.7 8.5 2.3 5 5.5 5c1.9 0 3.6 1 4.5 2.5C10.9 6 12.6 5 14.5 5c3.2 0 4.8 3.5 3 6.8C19 16.5 12 21 12 21z"
        />
      </svg>
    </span>
  );
}

export function GuidedTourHost() {
  const [active, setActive] = useState<ActiveTour | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [seen, setSeen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const steps = active ? TOUR_STEPS[active.track] : [];
  const step = active ? steps[active.index] : undefined;
  const isLast = active ? active.index >= steps.length - 1 : false;

  const close = useCallback((markSeen: boolean) => {
    setActive((current) => {
      if (current && markSeen) {
        safeSetSeen(current.track);
      }
      return null;
    });
    setRect(null);
  }, []);

  const goTo = useCallback((nextIndex: number) => {
    setActive((current) => {
      if (!current) return current;
      const nextSteps = TOUR_STEPS[current.track];
      if (nextIndex < 0) return { ...current, index: 0 };
      if (nextIndex >= nextSteps.length) {
        safeSetSeen(current.track);
        return null;
      }
      return { ...current, index: nextIndex };
    });
    setRect(null);
  }, []);

  const next = useCallback(() => {
    setActive((current) => {
      if (!current) return current;
      const nextIndex = current.index + 1;
      if (nextIndex >= TOUR_STEPS[current.track].length) {
        safeSetSeen(current.track);
        return null;
      }
      return { ...current, index: nextIndex };
    });
    setRect(null);
  }, []);

  const back = useCallback(() => {
    setActive((current) => {
      if (!current) return current;
      return { ...current, index: Math.max(0, current.index - 1) };
    });
    setRect(null);
  }, []);

  useEffect(() => {
    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<NanoTourEventDetail>).detail;
      const track = detail?.track ?? "public";
      setSeen(safeGetSeen(track));
      setActive({ track, index: 0 });
      setRect(null);
    };

    window.addEventListener(NANO_TOUR_EVENT, onStart);
    return () => window.removeEventListener(NANO_TOUR_EVENT, onStart);
  }, []);

  useEffect(() => {
    if (!step) return;
    if (location.pathname !== step.route) {
      navigate(step.route);
    }
  }, [location.pathname, navigate, step]);

  useEffect(() => {
    if (!active || !step) return;
    if (location.pathname !== step.route) return;

    let cancelled = false;
    let skipTimer = 0;
    let measureTimer = 0;

    const selector = `[data-tour="${step.target}"]`;
    const measure = () => {
      if (cancelled) return;
      const target = document.querySelector<HTMLElement>(selector);
      if (!target || target.offsetParent === null) {
        skipTimer = window.setTimeout(next, 80);
        return;
      }

      target.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
        inline: "center",
      });

      const readRect = () => {
        if (cancelled) return;
        const box = target.getBoundingClientRect();
        const pad = 8;
        setRect({
          left: clamp(box.left - pad, 8, window.innerWidth - 24),
          top: clamp(box.top - pad, 8, window.innerHeight - 24),
          width: clamp(box.width + pad * 2, 24, window.innerWidth - 16),
          height: clamp(box.height + pad * 2, 24, window.innerHeight - 16),
        });
      };

      measureTimer = window.setTimeout(readRect, prefersReducedMotion() ? 40 : 320);
    };

    measureTimer = window.setTimeout(measure, 80);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      cancelled = true;
      window.clearTimeout(skipTimer);
      window.clearTimeout(measureTimer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [active, location.pathname, next, step]);

  useEffect(() => {
    if (!active) return;
    const tooltip = tooltipRef.current;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => tooltip?.focus(), 0);
    return () => prior?.focus?.();
  }, [active, step?.id]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
      } else if (event.key === "Tab") {
        const tooltip = tooltipRef.current;
        if (!tooltip) return;
        const controls = Array.from(
          tooltip.querySelectorAll<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])"),
        ).filter((node) => !node.hasAttribute("disabled"));
        if (!controls.length) {
          event.preventDefault();
          tooltip.focus();
          return;
        }
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, back, close, next]);

  const tooltipStyle = useMemo(() => {
    if (!rect) return { left: 16, top: 16 };
    const width = Math.min(360, window.innerWidth - 32);
    const height = tooltipRef.current?.getBoundingClientRect().height ?? 230;
    const below = rect.top + rect.height + 16;
    const above = rect.top - height - 16;
    const top = below + height < window.innerHeight ? below : Math.max(16, above);
    const left = clamp(rect.left, 16, window.innerWidth - width - 16);
    return { left, top };
  }, [rect]);

  if (!active || !step) return null;

  const safeRect = rect ?? { left: 16, top: 16, width: 1, height: 1 };

  return (
    <div className={styles.overlay} aria-live="polite">
      <div className={styles.scrim} style={{ left: 0, top: 0, right: 0, height: safeRect.top }} aria-hidden="true" />
      <div className={styles.scrim} style={{ left: 0, top: safeRect.top, width: safeRect.left, height: safeRect.height }} aria-hidden="true" />
      <div
        className={styles.scrim}
        style={{ left: safeRect.left + safeRect.width, top: safeRect.top, right: 0, height: safeRect.height }}
        aria-hidden="true"
      />
      <div className={styles.scrim} style={{ left: 0, top: safeRect.top + safeRect.height, right: 0, bottom: 0 }} aria-hidden="true" />
      <div
        className={styles.spotlight}
        style={{ left: safeRect.left, top: safeRect.top, width: safeRect.width, height: safeRect.height }}
        aria-hidden="true"
      />

      <div
        ref={tooltipRef}
        className={styles.tooltip}
        style={tooltipStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nano-tour-title"
        tabIndex={-1}
      >
        <div className={styles.topline}>
          <span className={styles.count}>{active.index + 1} / {steps.length}</span>
          {seen && <span className={styles.seen}>restart</span>}
        </div>
        <div className={styles.titleRow}>
          <BuddyTourMark />
          <div>
            <h2 id="nano-tour-title">{step.title}</h2>
            <p>{step.body}</p>
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => close(false)}>
            Skip
          </button>
          <button type="button" className={styles.button} onClick={back} disabled={active.index === 0}>
            Back
          </button>
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => (isLast ? close(true) : goTo(active.index + 1))}>
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
