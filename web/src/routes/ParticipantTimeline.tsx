/**
 * @route ParticipantTimeline
 * @data-sensitivity: PARTICIPANT_LEVEL_DEIDENTIFIED - surrogate NANO IDs only
 * @auth-required: false (internal demo mode only)
 * @hipaa-note: PHI_SCRUB_REQUIRED - use src/utils/hipaa_utils.py before real participant exports; assistant prompts must pass web/src/lib/phiScrub.ts.
 */
import { useMemo, useState } from "react";
import { Card, SectionLabel } from "@/components/primitives";
import { StageDrawer } from "@/components/pipeline/StageDrawer";
import { useCohortSwimmer, useParticipants } from "@/api/hooks";
import type { Participant, QaStatus, Stage } from "@/api/schemas";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { TimelineAxis } from "@/components/timeline/TimelineAxis";
import { SwimLane } from "@/components/timeline/SwimLane";
import type { TimelineEvent, TimelineEventType } from "@/components/timeline/EventMark";
import shared from "./FeatureRoutes.module.css";
import styles from "./ParticipantTimeline.module.css";

const EVENT_LABEL: Record<TimelineEventType, string> = {
  visit: "Visit completed",
  qa: "QA flag",
  run: "MATLAB / pipeline run",
  failed: "Failed / withdrawn",
  redcap: "REDCap milestone",
};

const EVENT_GLYPH: Record<TimelineEventType, string> = {
  visit: "◆",
  qa: "△",
  run: "■",
  failed: "✕",
  redcap: "○",
};

function monthFromVisit(visit: string): number {
  if (visit.includes("24")) return 24;
  if (visit.includes("18")) return 18;
  if (visit.includes("12")) return 12;
  if (visit.includes("9")) return 9;
  if (visit.includes("6")) return 6;
  if (visit.includes("3")) return 3;
  return 0;
}

function makeEvents(participant: Participant, milestones: Array<{ visit: string; month: number; status: string }> | undefined): TimelineEvent[] {
  const baseDate = participant.enrolled || "2024-01-01";
  const milestoneEvents = (milestones ?? []).flatMap((milestone): TimelineEvent[] => {
    if (milestone.status === "scheduled") {
      return [{
        id: `${participant.id}-${milestone.visit}-redcap`,
        type: "redcap",
        month: milestone.month,
        label: `REDCap ${milestone.visit}`,
        date: baseDate,
        cga: milestone.month,
        status: "scheduled",
      }];
    }
    return [{
      id: `${participant.id}-${milestone.visit}-${milestone.status}`,
      type: milestone.status === "missed" ? "failed" : "visit",
      month: milestone.month,
      label: milestone.status === "missed" ? `Missed ${milestone.visit}` : `Completed ${milestone.visit}`,
      date: baseDate,
      cga: milestone.month,
      status: milestone.status,
    }];
  });
  const activeMonth = monthFromVisit(participant.visit);
  return [
    ...milestoneEvents,
    {
      id: `${participant.id}-run-${participant.visit}`,
      type: "run" as const,
      month: activeMonth,
      label: "Feature pipeline run",
      date: participant.updated,
      cga: activeMonth,
      status: `${participant.windows} windows`,
    },
    ...(participant.qa === "pass" ? [] : [{
      id: `${participant.id}-qa-${participant.visit}`,
      type: "qa" as const,
      month: activeMonth,
      label: "QA review needed",
      date: participant.updated,
      cga: activeMonth,
      status: participant.qa,
    }]),
  ].sort((a, b) => a.month - b.month);
}

function stageFromEvent(event: TimelineEvent | null): Stage | undefined {
  if (!event) return undefined;
  return {
    id: event.type,
    label: event.label,
    short: EVENT_LABEL[event.type],
    description: `${event.date} · ${event.cga} months CGA · ${event.status}`,
    inflight: event.type === "qa" ? 1 : 0,
    queued: event.type === "redcap" ? 1 : 0,
    done: event.type === "visit" || event.type === "run" ? 1 : 0,
    fail: event.type === "failed" ? 1 : 0,
    rate: event.type === "run" ? 184 : 0,
    eta: event.type === "qa" ? "review" : "-",
  };
}

export function ParticipantTimeline() {
  const enabled = useFeatureFlag("PARTICIPANT_TIMELINE_V2");
  const participantsQuery = useParticipants();
  const swimmerQuery = useCohortSwimmer();
  const participantsSource = participantsQuery.data;
  const swimmersSource = swimmerQuery.data?.data;
  const participants = useMemo(() => participantsSource ?? [], [participantsSource]);
  const swimmers = useMemo(() => swimmersSource ?? [], [swimmersSource]);
  const [group, setGroup] = useState("all");
  const [qa, setQa] = useState("all");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [eventTypes, setEventTypes] = useState<Set<TimelineEventType>>(new Set(["visit", "qa", "run", "failed", "redcap"]));
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  const rows = useMemo(() => participants.map((participant) => {
    const swimmer = swimmers.find((row) => row.nanoId === participant.id);
    return { participant, events: makeEvents(participant, swimmer?.milestones) };
  }), [participants, swimmers]);

  const filtered = rows.filter(({ participant, events }) => {
    if (group !== "all" && participant.group !== group) return false;
    if (qa !== "all" && participant.qa !== qa) return false;
    if (search && !participant.id.toLowerCase().includes(search.toLowerCase())) return false;
    return events.some((event) => eventTypes.has(event.type));
  });
  const visibleRows = filtered.slice(0, 28);
  const selectedParticipant = participants.find((participant) => participant.id === selectedParticipantId) ?? visibleRows[0]?.participant;
  const W = Math.round(980 * zoom);
  const H = 80 + visibleRows.length * 38;
  const x = (month: number) => 180 + (month / 36) * (W - 220);

  if (!enabled) return null;

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <header className={shared.hero}>
        <div>
          <span className={`${shared.eyebrow} t-mono`}>Participant operations</span>
          <h1 className={shared.h1}>Participant Passport Timeline</h1>
          <p className={shared.lede}>A de-identified swimlane timeline combining visits, QA flags, REDCap milestones, and pipeline events.</p>
        </div>
      </header>

      <Card pad={0}>
        <div className={styles.filters}>
          <select className={styles.select} value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Filter by group">
            <option value="all">All groups</option>
            <option value="VPT">VPT</option>
            <option value="ASIB">ASIB</option>
            <option value="TD">TD</option>
          </select>
          <select className={styles.select} value={qa} onChange={(event) => setQa(event.target.value)} aria-label="Filter by QA status">
            <option value="all">All QA</option>
            {(["pass", "pending", "reject"] satisfies QaStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <input className={styles.search} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search NANO ID" aria-label="Participant search" />
          <span className={styles.eventFilters} aria-label="Event type filters">
            {(Object.keys(EVENT_LABEL) as TimelineEventType[]).map((type) => (
              <label key={type} className={styles.eventFilter}>
                <input
                  type="checkbox"
                  checked={eventTypes.has(type)}
                  onChange={(event) => {
                    const next = new Set(eventTypes);
                    if (event.target.checked) next.add(type);
                    else next.delete(type);
                    setEventTypes(next);
                  }}
                />
                {EVENT_GLYPH[type]} {EVENT_LABEL[type]}
              </label>
            ))}
          </span>
          <label className={styles.zoom}>
            Zoom
            <input type="range" min={1} max={2.4} step={0.2} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
        </div>

        <div className={styles.legend}>
          {(Object.keys(EVENT_LABEL) as TimelineEventType[]).map((type) => (
            <span key={type} className={styles.legendItem}><span aria-hidden>{EVENT_GLYPH[type]}</span>{EVENT_LABEL[type]}</span>
          ))}
        </div>

        <div className={styles.body}>
          <div className={styles.timelineShell}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={styles.timelineSvg} role="img" aria-label="Participant swimlane timeline">
              <TimelineAxis x={x} y={38} width={W - 20} />
              {visibleRows.map(({ participant, events }, index) => (
                <SwimLane
                  key={participant.id}
                  id={participant.id}
                  group={participant.group}
                  qa={participant.qa}
                  y={78 + index * 38}
                  width={W - 20}
                  events={events.filter((event) => eventTypes.has(event.type))}
                  x={x}
                  selectedEventId={selectedEvent?.id}
                  onSelectEvent={(event) => {
                    setSelectedEvent(event);
                    setSelectedParticipantId(participant.id);
                  }}
                  onSelectRow={() => setSelectedParticipantId(participant.id)}
                />
              ))}
            </svg>
          </div>

          <aside className={styles.detailPanel} data-insight="participant-timeline-detail">
            <SectionLabel>Detail panel</SectionLabel>
            {selectedParticipant ? (
              <>
                {/* PHI_SCRUB_REQUIRED: de-identified NANO ID only; scrub real participant text through web/src/lib/phiScrub.ts before assistant seeding. */}
                <h2>{selectedParticipant.id}</h2>
                <p className={shared.muted} style={{ margin: 0, fontSize: 13 }}>
                  {selectedParticipant.group} · {selectedParticipant.sex} · last visit {selectedParticipant.visit}
                </p>
                <div className={styles.metaGrid}>
                  <div className={styles.metaCell}><div className={styles.metaLabel}>Completion</div><div className={`${styles.metaValue} t-mono`}>{selectedParticipant.windows} windows</div></div>
                  <div className={styles.metaCell}><div className={styles.metaLabel}>QA</div><div className={`${styles.metaValue} t-mono`}>{selectedParticipant.qa}</div></div>
                  <div className={styles.metaCell}><div className={styles.metaLabel}>RMSSD</div><div className={`${styles.metaValue} t-mono`}>{selectedParticipant.rmssd?.toFixed(1) ?? "missing"}</div></div>
                  <div className={styles.metaCell}><div className={styles.metaLabel}>RSA/HF</div><div className={`${styles.metaValue} t-mono`}>{selectedParticipant.hf?.toFixed(1) ?? "missing"}</div></div>
                  <div className={styles.metaCell}><div className={styles.metaLabel}>SDNN</div><div className={`${styles.metaValue} t-mono`}>{selectedParticipant.rmssd ? (selectedParticipant.rmssd * 1.18).toFixed(1) : "missing"}</div></div>
                  <div className={styles.metaCell}><div className={styles.metaLabel}>Missingness</div><div className={`${styles.metaValue} t-mono`}>{selectedParticipant.qa === "pass" ? "low" : "review"}</div></div>
                </div>
              </>
            ) : (
              <p className={shared.muted}>Select a participant row to inspect metadata and mini-metrics.</p>
            )}
          </aside>
        </div>
      </Card>

      <StageDrawer stage={stageFromEvent(selectedEvent)} />
    </div>
  );
}
