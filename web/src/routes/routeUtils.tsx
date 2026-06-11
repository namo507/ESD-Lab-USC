import { useMemo, type ReactNode } from "react";
import { Card, SectionLabel } from "@/components/primitives";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { FeatureFlag } from "@/config/featureFlags";
import type { Participant } from "@/api/schemas";
import styles from "@/components/dyn/DynamicRoutes.module.css";

export const GROUP_COLORS = {
  VPT: "var(--usc-garnet)",
  ASIB: "var(--purple)",
  TD: "var(--green)",
} as const;

export const VISIT_OPTIONS = [
  { value: "3", label: "3 mo" },
  { value: "6", label: "6 mo" },
  { value: "9", label: "9 mo" },
  { value: "12", label: "12 mo" },
  { value: "18", label: "18 mo" },
  { value: "24", label: "24 mo" },
];

export function FeatureGate({ flag, children }: { flag: FeatureFlag; children: ReactNode }) {
  const enabled = useFeatureFlag(flag);
  if (!enabled) return null;
  return <>{children}</>;
}

export function firstParticipant(participants: Participant[], preferred = "NANO-0173") {
  return participants.find((p) => p.id === preferred)?.id ?? participants[0]?.id ?? preferred;
}

export function ParticipantVisitControls({
  participants,
  nanoId,
  setNanoId,
  visitAge,
  setVisitAge,
}: {
  participants: Participant[];
  nanoId: string;
  setNanoId: (value: string) => void;
  visitAge: string;
  setVisitAge: (value: string) => void;
}) {
  return (
    <div className={styles.actions}>
      <label className={styles.controlGroup}>
        <span className={styles.controlLabel}>NANOID</span>
        <select className={styles.select} value={nanoId} onChange={(e) => setNanoId(e.target.value)} aria-label="Participant">
          {participants.map((p) => (
            <option key={p.id} value={p.id}>{p.id} · {p.group}</option>
          ))}
        </select>
      </label>
      <label className={styles.controlGroup}>
        <span className={styles.controlLabel}>Visit</span>
        <select className={styles.select} value={visitAge} onChange={(e) => setVisitAge(e.target.value)} aria-label="Visit age">
          {VISIT_OPTIONS.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function EmptyState({ title = "No endpoint data yet", detail }: { title?: string; detail: string }) {
  return (
    <Card pad={20}>
      <SectionLabel>{title}</SectionLabel>
      <p className={styles.muted}>{detail}</p>
    </Card>
  );
}

export function useSeriesExtent(values: number[]) {
  return useMemo(() => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min || 1) * 0.08;
    return { min: min - pad, max: max + pad };
  }, [values]);
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
