import { useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Card, Gloss, Icon, KPI, SectionLabel, Tooltip } from "@/components/primitives";
import { useParticipant } from "@/api/hooks";
import { ecgPath } from "@/lib/ecgPath";
import type { GroupCode, VisitId } from "@/api/schemas";
import styles from "./ParticipantDetail.module.css";

const VISITS: VisitId[] = ["nicu_dc", "cga_3mo", "cga_6mo", "cga_9mo", "cga_12mo", "cga_18mo", "cga_24mo"];
const GROUP_KIND: Record<GroupCode, "vpt" | "asib" | "td"> = { VPT: "vpt", ASIB: "asib", TD: "td" };

export function ParticipantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: p, isLoading } = useParticipant(id);

  if (isLoading || !p) {
    return <div className={styles.empty}>Loading participant…</div>;
  }

  const cur = VISITS.indexOf(p.visit);
  const visitStatus = VISITS.map((v, i) => {
    let s: "scheduled" | "complete" | "in_progress" | "failed" = "scheduled";
    if (i < cur) s = "complete";
    else if (i === cur) s = p.qa === "pass" ? "complete" : p.qa === "reject" ? "failed" : "in_progress";
    return { id: v, status: s };
  });
  const completedCount = visitStatus.filter((v) => v.status === "complete").length;

  function statusColor(s: string): string {
    if (s === "complete") return "var(--green)";
    if (s === "in_progress") return "var(--blue)";
    if (s === "failed") return "var(--red)";
    return "var(--slate-300)";
  }

  return (
    <div className={styles.page}>
      <div>
        <button onClick={() => navigate(-1)} className={styles.back} type="button">
          <Icon name="chevron-left" size={13} color="var(--slate-500)" /> Back to participants
        </button>
        <div className={styles.head}>
          <div>
            <div className={styles.idRow}>
              <span className={styles.idLarge}>{p.id}</span>
              <Badge kind={GROUP_KIND[p.group]}>{p.group}</Badge>
              <Badge kind="phi" size="sm">PHI gated</Badge>
            </div>
            <div className={`${styles.metaLine} t-mono`}>
              <Gloss term="CGA">CGA</Gloss> {p.cga_wks.toFixed(1)} wks · {p.sex} · enrolled {p.enrolled} · {p.site}
            </div>
          </div>
          <div className={styles.actions}>
            <Button variant="secondary" icon="file-text">Open SOP</Button>
            <Button variant="secondary" icon="download">Export · de-id</Button>
            <Button icon="shield-check" onClick={() => navigate(`/qa/${p.id}`)}>Open QA</Button>
          </div>
        </div>
      </div>

      <section className={styles.kpis}>
        <KPI label="Latest visit" value={p.visit.replace("cga_", "")} unit={p.visit.startsWith("cga_") ? "mo" : ""} sub="visit on schedule" />
        <KPI label="Windows" value={p.windows} sub="this visit · 5-s epochs" gloss="Window" />
        <KPI label="QA" value={p.qa === "pass" ? "✓" : p.qa === "reject" ? "✕" : "⋯"} sub={`signal review ${p.qa}`} gloss="SQI" />
        <KPI label="RMSSD" value={p.rmssd != null ? p.rmssd.toFixed(1) : "—"} unit="ms" sub="vagal-tone marker" gloss="RMSSD" />
        <KPI
          label="HDA mode"
          value={p.hda ?? "—"}
          sub="dominant phase this visit"
          gloss={p.hda ? p.hda.charAt(0).toUpperCase() + p.hda.slice(1) : "HDA"}
        />
      </section>

      <Card pad={20}>
        <div className={styles.timelineHead}>
          <SectionLabel>Visit timeline · NICU discharge → CGA 24 mo</SectionLabel>
          <span className={`${styles.timelineCount} t-mono`}>{completedCount} / {visitStatus.length} complete</span>
        </div>
        <div className={styles.timeline} style={{ gridTemplateColumns: `repeat(${visitStatus.length}, 1fr)` }}>
          <div className={styles.timelineLine} />
          {visitStatus.map((v) => {
            const color = statusColor(v.status);
            return (
              <div key={v.id} className={styles.timelineCell}>
                <Tooltip text={`${v.id} · ${v.status.replace("_", " ")}`}>
                  <div
                    className={styles.timelineDot}
                    style={{ background: v.status === "scheduled" ? "var(--white)" : color, borderColor: color }}
                  >
                    {v.status === "complete" && <Icon name="check" size={11} color="var(--fg-on-brand)" stroke={2.5} />}
                    {v.status === "in_progress" && <span className="pulse-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--fg-on-brand)", display: "inline-block" }} />}
                    {v.status === "failed" && <Icon name="x" size={11} color="var(--fg-on-brand)" stroke={2.5} />}
                  </div>
                </Tooltip>
                <div className={`${styles.timelineLabel} t-mono`} data-active={v.status === "in_progress" || undefined}>
                  {v.id.replace("cga_", "").replace("nicu_dc", "NICU")}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className={styles.bottom}>
        <Card pad={20}>
          <div className={styles.ecgHead}>
            <SectionLabel>ECG · last 30 s preview</SectionLabel>
            <span className={`${styles.ecgMeta} t-mono`}>1024 Hz · Actiheart-5 · ch I</span>
          </div>
          <div className={styles.ecgBox}>
            <svg viewBox="0 0 600 110" className={styles.ecgSvg} aria-hidden>
              {Array.from({ length: 13 }).map((_, i) => (
                <line key={`v${i}`} x1={i * 50} y1={0} x2={i * 50} y2={110} stroke="var(--ecg-grid)" strokeWidth={1} />
              ))}
              {Array.from({ length: 5 }).map((_, i) => (
                <line key={`h${i}`} x1={0} y1={i * 27.5} x2={600} y2={i * 27.5} stroke="var(--ecg-grid)" strokeWidth={1} />
              ))}
              <path d={ecgPath(600, 110, 5, "clean")} fill="none" stroke="var(--green)" strokeWidth={1.4} />
              {Array.from({ length: 8 }).map((_, i) => (
                <circle key={i} cx={30 + i * 72} cy={32} r={2.5} fill="var(--usc-gold)" />
              ))}
            </svg>
            <div className={styles.ecgFoot}>
              <span>00:00</span><span>15 s</span><span>30 s</span>
            </div>
          </div>
          <div className={styles.ecgStats}>
            {[
              { lbl: "IBI median", val: "432.1", unit: "ms", g: "IBI" as const },
              { lbl: "R-peaks", val: "64", unit: "/30 s", g: undefined },
              { lbl: "Ectopic", val: "1.3", unit: "%", g: "Ectopic" as const },
              { lbl: "SQI", val: "0.91", unit: "", g: "SQI" as const },
            ].map((s) => (
              <div key={s.lbl} className={styles.ecgStat}>
                <div className={styles.ecgStatLabel}>{s.g ? <Gloss term={s.g}>{s.lbl}</Gloss> : s.lbl}</div>
                <div className={`${styles.ecgStatValue} t-mono`}>
                  {s.val}<span className={styles.ecgUnit}> {s.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card pad={0}>
          <div className={styles.logHead}>
            <SectionLabel>Processing log</SectionLabel>
            <span className={`${styles.logMeta} t-mono`}>last 24 h</span>
          </div>
          <ul className={styles.logList}>
            {p.visit_log.map((e, i) => {
              const dot =
                e.kind === "ok" ? "var(--green)" : e.kind === "warn" ? "var(--usc-gold)" : e.kind === "fail" ? "var(--red)" : "var(--blue)";
              return (
                <li key={i} className={styles.logRow}>
                  <span className={styles.logDot} style={{ background: dot }} />
                  <div>
                    <div className={styles.logHeadRow}>
                      <span className={styles.logEvent}>{e.event}</span>
                      <span className={`${styles.logTs} t-mono`}>{e.ts.split(" ")[1] ?? e.ts}</span>
                    </div>
                    <div className={`${styles.logDetail} t-mono`}>{e.detail}</div>
                    <div className={styles.logActor}>by {e.actor}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
