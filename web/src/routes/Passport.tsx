import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, SectionLabel } from "@/components/primitives";
import { MetricChip } from "@/components/dyn/MetricChip";
import { RouteDataTable } from "@/components/dyn/RouteDataTable";
import { useParticipants, usePassport } from "@/api/hooks";
import { FeatureGate, firstParticipant, round } from "./dynRouteUtils";
import styles from "@/components/dyn/DynamicRoutes.module.css";

export function Passport() {
  return (
    <FeatureGate flag="DYN_INFANT_PASSPORT">
      <PassportInner />
    </FeatureGate>
  );
}

function PassportInner() {
  const navigate = useNavigate();
  const { data: participants = [] } = useParticipants();
  const [nanoId, setNanoId] = useState(firstParticipant(participants));
  const activeId = nanoId || firstParticipant(participants);
  const { data } = usePassport(activeId);

  const modalities = useMemo(() => {
    const grouped = new Map<string, NonNullable<typeof data>["timeline"]>();
    (data?.timeline ?? []).forEach((row) => grouped.set(row.modality, [...(grouped.get(row.modality) ?? []), row]));
    return Array.from(grouped.entries());
  }, [data]);

  const completeness = modalities.length ? Math.min(100, (modalities.filter(([, rows]) => rows.length >= 4).length / 6) * 100) : 0;
  const risk = modalities.find(([modality]) => modality === "Risk")?.[1] ?? [];
  const latestRisk = risk.at(-1)?.value ?? 0;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Dynamics &amp; Dyads · case synthesis</span>
          <h1 className={styles.h1}>Infant Developmental Passport</h1>
          <p className={styles.lede}>
            One de-identified longitudinal view across physiology, attention, CVA, attachment, spatial
            assessment, NICU context, and model-updated risk trend.
          </p>
        </div>
        <div className={styles.actions}>
          <label className={styles.controlGroup}>
            <span className={styles.controlLabel}>NANOID</span>
            <select className={styles.select} value={activeId} onChange={(e) => setNanoId(e.target.value)} aria-label="Participant">
              {participants.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.group}</option>)}
            </select>
          </label>
          <Button
            icon="presentation"
            onClick={() => navigate(`/presentation-maker?seed=passport&nanoid=${encodeURIComponent(activeId)}`)}
          >
            Export slide seed
          </Button>
        </div>
      </header>

      <section className={styles.kpis} aria-label="Passport summary">
        <MetricChip label="Group" value={data?.group ?? "-"} insight="dyn-passport-group" />
        <MetricChip label="Gestational age" value={data ? round(data.gestationalAge, 1) : "-"} unit="wks" insight="dyn-passport-ga" />
        <MetricChip label="Completeness" value={`${Math.round(completeness)}%`} insight="dyn-passport-complete" />
        <MetricChip label="Latest risk trend" value={round(latestRisk, 2)} verify insight="dyn-passport-risk" />
      </section>

      <div className={styles.split}>
        <Card pad={20}>
          <div className={styles.cardHead}>
            <div>
              <SectionLabel>Shared age axis</SectionLabel>
              <div className={styles.cardTitle}>{activeId} · {data?.group ?? "group"} · {data?.sex ?? "sex"}</div>
            </div>
            <ProgressRing value={completeness} />
          </div>
          <div className={styles.page} style={{ gap: 10 }}>
            {modalities.map(([modality, rows]) => (
              <MiniPanel key={modality} modality={modality} rows={rows} onOpen={() => navigate(modalityRoute(modality, activeId))} />
            ))}
          </div>
        </Card>

        <Card pad={20}>
          <SectionLabel>Milestones and context</SectionLabel>
          <div className={styles.cardTitle}>Study story anchors</div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>{["Age", "Milestone"].map((h) => <th key={h} className={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {data?.milestones.map((milestone) => (
                  <tr key={milestone.label}>
                    <td className={`${styles.td} t-mono`}>{milestone.ageMonths} mo</td>
                    <td className={styles.td}>{milestone.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.nicu && (
            <div className={styles.notice} style={{ marginTop: 14 }}>
              {data.nicu.hrcSummary} · {data.nicu.thermalSummary}
            </div>
          )}
          {data?.outcome && (
            <div className={styles.detailPanel} style={{ marginTop: 14 }}>
              <div className={styles.chipLabel}>Outcome context</div>
              <div className={styles.chipValue}>ADOS CSS {data.outcome.adosCSS} · {data.outcome.ageMonths} mo</div>
            </div>
          )}
        </Card>
      </div>

      <Card pad={20}>
        <SectionLabel>Passport data</SectionLabel>
        <RouteDataTable
          caption="Passport timeline values."
          columns={["Age", "Modality", "Metric", "Value", "Group mean", "Group SD"]}
          rows={(data?.timeline ?? []).map((row) => [row.ageMonths, row.modality, row.metric, row.value.toFixed(3), row.groupMean?.toFixed(3), row.groupSd?.toFixed(3)])}
        />
      </Card>
    </div>
  );
}

function MiniPanel({
  modality,
  rows,
  onOpen,
}: {
  modality: string;
  rows: Array<{ ageMonths: number; value: number; groupMean?: number; groupSd?: number }>;
  onOpen: () => void;
}) {
  const w = 620;
  const h = 78;
  const ages = rows.map((row) => row.ageMonths);
  const values = rows.map((row) => row.value);
  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (age: number) => 96 + ((age - minAge) / (maxAge - minAge || 1)) * 480;
  const y = (value: number) => 54 - ((value - min) / (max - min || 1)) * 34;
  const d = rows.map((row, i) => `${i ? "L" : "M"}${x(row.ageMonths).toFixed(1)} ${y(row.value).toFixed(1)}`).join(" ");
  const color = modality === "RSA" ? "var(--usc-garnet)" : modality === "HDA" ? "var(--blue)" : modality === "Risk" ? "var(--red)" : "var(--green)";

  return (
    <button type="button" className={styles.detailPanel} onClick={onOpen} style={{ textAlign: "left", cursor: "pointer" }}>
      <svg viewBox={`0 0 ${w} ${h}`} className={styles.svg} role="img" aria-label={`${modality} longitudinal sparkline`}>
        <text x={12} y={32} className={styles.tinyLabel}>{modality}</text>
        <path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        {rows.map((row) => (
          <circle key={row.ageMonths} cx={x(row.ageMonths)} cy={y(row.value)} r={3} fill={color} />
        ))}
        {[3, 6, 12, 24].map((age) => (
          <text key={age} x={x(age)} y={72} textAnchor="middle" className={styles.tinyLabel}>{age}</text>
        ))}
      </svg>
    </button>
  );
}

function ProgressRing({ value }: { value: number }) {
  const radius = 23;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <svg width={58} height={58} viewBox="0 0 58 58" role="img" aria-label={`Completeness ${Math.round(value)} percent`}>
      <circle cx={29} cy={29} r={radius} fill="none" stroke="var(--slate-100)" strokeWidth={7} />
      <circle cx={29} cy={29} r={radius} fill="none" stroke="var(--usc-garnet)" strokeWidth={7} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 29 29)" />
      <text x={29} y={33} textAnchor="middle" className={styles.tinyLabel}>{Math.round(value)}%</text>
    </svg>
  );
}

function modalityRoute(modality: string, nanoId: string) {
  if (modality === "RSA") return "/results";
  if (modality === "HDA") return "/hda-player";
  if (modality === "CVA") return "/cva-theater";
  if (modality === "Risk") return "/model-leaderboard";
  return `/participants/${nanoId}`;
}
