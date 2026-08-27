import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, SectionLabel } from "@/components/primitives";
import { HDABarStack } from "@/components/charts/HDABarStack";
import { MetricChip } from "@/components/dyn/MetricChip";
import { RouteDataTable } from "@/components/dyn/RouteDataTable";
import { GroupTag } from "@/components/warm/GroupTag";
import { useParticipants, usePassport } from "@/api/hooks";
import type { HdaDist, VisitId } from "@/api/schemas";
import {
  enrollmentKind,
  formPolicyLabel,
  operationsFor,
  questionnaireKind,
  questionnaireLabel,
  riskKind,
} from "@/lib/participantOperations";
import { FeatureGate, firstParticipant, round } from "./routeUtils";
import styles from "@/components/dyn/DynamicRoutes.module.css";

const VISITS: Array<{ id: VisitId; label: string; age: number }> = [
  { id: "nicu_dc", label: "NICU DC", age: 0 },
  { id: "cga_3mo", label: "3 mo", age: 3 },
  { id: "cga_6mo", label: "6 mo", age: 6 },
  { id: "cga_9mo", label: "9 mo", age: 9 },
  { id: "cga_12mo", label: "12 mo", age: 12 },
  { id: "cga_18mo", label: "18 mo", age: 18 },
  { id: "cga_24mo", label: "24 mo", age: 24 },
];

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
  const [selectedVisit, setSelectedVisit] = useState<string | null>(null);
  const activeId = nanoId || firstParticipant(participants);
  const { data } = usePassport(activeId);
  const activeParticipantIndex = participants.findIndex((participant) => participant.id === activeId);
  const activeParticipant = participants[activeParticipantIndex] ?? participants[0];
  const operations = data?.operations ?? (activeParticipant ? operationsFor(activeParticipant, Math.max(0, activeParticipantIndex)) : null);

  const modalities = useMemo(() => {
    const grouped = new Map<string, NonNullable<typeof data>["timeline"]>();
    (data?.timeline ?? []).forEach((row) => grouped.set(row.modality, [...(grouped.get(row.modality) ?? []), row]));
    return Array.from(grouped.entries());
  }, [data]);

  const completeness = modalities.length ? Math.min(100, (modalities.filter(([, rows]) => rows.length >= 4).length / 6) * 100) : 0;
  const risk = modalities.find(([modality]) => modality === "Risk")?.[1] ?? [];
  const latestRisk = risk.at(-1)?.value ?? 0;
  const hdaDist = useMemo<HdaDist>(() => ({
    VPT: { orienting: 180, sustained: 520, inattention: 210, termination: 90 },
    ASIB: { orienting: 220, sustained: 430, inattention: 250, termination: 100 },
    TD: { orienting: 160, sustained: 610, inattention: 150, termination: 80 },
  }), []);
  const latestAge = Math.max(...(data?.timeline.map((row) => row.ageMonths) ?? [0]));

  return (
    <div className={styles.page}>
      <header className={styles.hero} style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--warm-card)", borderBottom: "1px solid var(--warm-border)", padding: "var(--s-12) 0" }}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Dynamics &amp; Dyads · case synthesis</span>
          <h1 className={styles.h1} data-insight="passport-header">Infant Developmental Passport</h1>
          <p className={styles.lede}>
            One de-identified longitudinal view across physiology, attention, CVA, attachment, spatial
            assessment, NICU context, and model-updated risk trend.
          </p>
          {data && <div style={{ marginTop: 8 }}><GroupTag group={data.group} /> <span className="t-mono" style={{ color: "var(--warm-fg3)", marginLeft: 8 }}>{activeId} · sex {data.sex} · {operations?.participant_code ?? "operation code pending"}</span></div>}
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
        <MetricChip label="Study role" value={operations?.role_label ?? "-"} insight="dyn-passport-role" />
        <MetricChip label="Enrollment" value={operations?.enrollment_type ?? "-"} insight="dyn-passport-enrollment" />
        <MetricChip label="Gestational age" value={data ? round(data.gestationalAge, 1) : "-"} unit="wks" insight="dyn-passport-ga" />
        <MetricChip label="Completeness" value={`${Math.round(completeness)}%`} insight="dyn-passport-complete" />
        <MetricChip label="Latest risk trend" value={round(latestRisk, 2)} verify insight="dyn-passport-risk" />
      </section>

      <Card pad={20}>
        <SectionLabel>Visit timeline</SectionLabel>
        <div className={styles.cardTitle}>Longitudinal schedule and completion state</div>
        <div className={styles.controlBar} role="list" aria-label="Passport visit timeline">
          {VISITS.map((visit) => {
            const status = visit.age <= latestAge ? "complete" : visit.age <= latestAge + 6 ? "partial" : "future";
            const bg = status === "complete" ? "var(--green)" : status === "partial" ? "var(--amber)" : "var(--warm-border)";
            const fg = status === "future" ? "var(--warm-fg4)" : "var(--fg-on-brand)";
            return (
              <button
                key={visit.id}
                type="button"
                className={styles.toggle}
                onClick={() => setSelectedVisit(visit.id)}
                style={{ background: bg, color: fg, borderColor: "var(--warm-border)" }}
              >
                {visit.label}
              </button>
            );
          })}
        </div>
        {selectedVisit && (
          <div className={styles.detailPanel}>
            <div className={styles.cardHead}>
              <div>
                <div className={styles.chipLabel}>Visit detail</div>
                <div className={styles.chipValue}>{selectedVisit}</div>
              </div>
              <Button size="sm" variant="secondary" icon="x" onClick={() => setSelectedVisit(null)}>Close</Button>
            </div>
            <p className={styles.muted}>Mini-drawer preview: source visit remains de-identified and links back to secure REDCap only when available.</p>
          </div>
        )}
      </Card>

      {operations && (
        <Card pad={20}>
          <div className={styles.cardHead}>
            <div>
              <SectionLabel>Operations passport</SectionLabel>
              <div className={styles.cardTitle}>{operations.role_label} · {operations.form_policy.label} · next {operations.next_visit.marker}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Badge kind={enrollmentKind(operations.enrollment_type)} size="sm">{operations.enrollment_type}</Badge>
              <Badge kind={riskKind(operations.scheduling_risk)} size="sm">{operations.scheduling_risk} risk</Badge>
              <Badge kind="neutral" size="sm">{operations.linking_id}</Badge>
            </div>
          </div>
          <div className={styles.split} style={{ marginTop: 12 }}>
            <div className={styles.detailPanel}>
              <div className={styles.chipLabel}>Scheduling note</div>
              <p className={styles.muted}>{operations.scheduling_note}</p>
              <div className={styles.chipLabel}>Packet requirements</div>
              <ul className={styles.muted} style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {operations.packet_requirements.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className={styles.detailPanel}>
              <div className={styles.chipLabel}>Linked forms</div>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {operations.linked_forms.slice(0, 5).map((form) => (
                  <div key={`${form.form}-${form.owner}`} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>{form.form} · {form.owner} · {formPolicyLabel(form.policy)}</span>
                    <Badge kind={questionnaireKind(form.status)} size="sm">{questionnaireLabel(form.status)}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

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

      <div className={styles.wideSplit}>
        <Card pad={20}>
          <SectionLabel>HDA phase evolution</SectionLabel>
          <div className={styles.cardTitle}>Phase composition by cohort context</div>
          <HDABarStack dist={hdaDist} />
        </Card>
        <Card pad={20}>
          <SectionLabel>Assessment scores</SectionLabel>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>{["Assessment", "Age", "Score", "Range"].map((h) => <th key={h} className={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {[
                  ["Bayley-4 Cognitive", "12 mo", "92", "typical"],
                  ["M-CHAT-R/F", "18 mo", data?.group === "ASIB" ? "5" : "2", data?.group === "ASIB" ? "review" : "typical"],
                  ["ADOS CSS", "36 mo", String(data?.outcome?.adosCSS ?? 3), (data?.outcome?.adosCSS ?? 3) >= 4 ? "review" : "typical"],
                ].map((row) => (
                  <tr key={row[0]} style={{ background: row[3] === "review" ? "var(--red-tint)" : undefined }}>
                    {row.map((cell, index) => <td key={`${row[0]}-${index}`} className={`${styles.td} ${index === 2 ? "t-mono" : ""}`}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card pad={20}>
        <SectionLabel>QA notes</SectionLabel>
        <div className={styles.detailPanel}>
          <Badge kind="neutral" size="sm">CST</Badge>
          <p className={styles.muted} style={{ marginTop: 10 }}>
            Latest mock review: ECG windows pass automated SQI threshold with two motion-adjacent epochs held for analyst review.
            All data accessed via de-identified NANO IDs. IRB #Pro00115234.
          </p>
        </div>
      </Card>

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
