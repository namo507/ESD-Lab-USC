import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, SectionLabel, Segmented } from "@/components/primitives";
import { useCohortSwimmer } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { CohortSwimmerRow, GroupCode } from "@/api/schemas";
import styles from "./FeatureRoutes.module.css";

type GroupFilter = "all" | GroupCode;
type SortKey = "completionPct" | "completedVisits" | "nanoId";

const GROUP_KIND: Record<GroupCode, "vpt" | "asib" | "td"> = { VPT: "vpt", ASIB: "asib", TD: "td" };
const GROUP_COLORS: Record<GroupCode, string> = { VPT: "var(--usc-garnet)", ASIB: "var(--purple)", TD: "var(--green)" };

export function SwimmerPlot() {
  const enabled = useFeatureFlag("SWIMMER_PLOT");
  const navigate = useNavigate();
  const showPassport = useFeatureFlag("DYN_INFANT_PASSPORT");
  const showCoverage = useFeatureFlag("DYN_STREAM_COVERAGE");
  const { data } = useCohortSwimmer();
  const rows = useMemo(() => data?.data ?? [], [data?.data]);
  const [group, setGroup] = useState<GroupFilter>("all");
  const [sort, setSort] = useState<SortKey>("completionPct");
  const [selected, setSelected] = useState<CohortSwimmerRow | null>(null);

  const filtered = useMemo(() => {
    const next = rows.filter((row) => group === "all" || row.group === group);
    next.sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (typeof av === "number" && typeof bv === "number") return bv - av;
      return String(av).localeCompare(String(bv));
    });
    return next.slice(0, 28);
  }, [group, rows, sort]);

  const W = 780;
  const rowH = 24;
  const H = 48 + filtered.length * rowH;
  const sx = (month: number) => 110 + (month / 24) * 600;

  if (!enabled) return null;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Cohort progress</span>
          <h1 className={styles.h1}>Cohort Swimmer Plot</h1>
          <p className={styles.lede}>
            Visit completion lanes by surrogate NANO ID, with click-through detail for completion risk.
          </p>
        </div>
      </header>

      <div className={styles.split}>
        <Card pad={0}>
          <div className={styles.filterBar}>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Group</span>
              <Segmented<GroupFilter>
                size="sm"
                options={[{ value: "all", label: "all" }, { value: "VPT", label: "VPT" }, { value: "ASIB", label: "ASIB" }, { value: "TD", label: "TD" }]}
                value={group}
                onChange={setGroup}
              />
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Sort</span>
              <select className={styles.select} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort swimmer rows">
                <option value="completionPct">completion</option>
                <option value="completedVisits">visits</option>
                <option value="nanoId">NANO ID</option>
              </select>
            </div>
            <span className="t-mono" style={{ marginLeft: "auto", color: "var(--slate-500)", fontSize: 11 }}>{filtered.length} lanes</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className={styles.plotSvg} role="img" aria-label="Cohort swimmer plot by participant">
            {[0, 3, 6, 9, 12, 18, 24].map((m) => (
              <g key={m}>
                <line x1={sx(m)} x2={sx(m)} y1={28} y2={H - 12} stroke="var(--slate-100)" />
                <text x={sx(m)} y={20} textAnchor="middle" className={styles.tinyLabel}>{m}m</text>
              </g>
            ))}
            {filtered.map((row, i) => {
              const y = 44 + i * rowH;
              return (
                <g key={row.nanoId} tabIndex={0} onClick={() => setSelected(row)} onKeyDown={(e) => { if (e.key === "Enter") setSelected(row); }} style={{ cursor: "pointer" }}>
                  <text x={10} y={y + 4} className={styles.tinyLabel}>{row.nanoId}</text>
                  <line x1={sx(0)} x2={sx(24)} y1={y} y2={y} stroke="var(--slate-100)" strokeWidth={7} strokeLinecap="round" />
                  <line x1={sx(0)} x2={sx(row.completedVisits >= 7 ? 24 : row.completedVisits * 3)} y1={y} y2={y} stroke={GROUP_COLORS[row.group]} strokeWidth={7} strokeLinecap="round" />
                  {row.milestones.map((m) => (
                    <circle key={`${row.nanoId}-${m.visit}`} cx={sx(m.month)} cy={y} r={m.status === "missed" ? 4.5 : 3.5} fill={m.status === "complete" ? "var(--bg-surface)" : m.status === "missed" ? "var(--red)" : "var(--slate-300)"} stroke={GROUP_COLORS[row.group]} />
                  ))}
                </g>
              );
            })}
          </svg>
        </Card>

        <aside className={styles.detailPanel} aria-label="Swimmer row detail">
          <SectionLabel>Selected lane</SectionLabel>
          {selected ? (
            <>
              <div className={styles.cardTitle}>{selected.nanoId}</div>
              <div style={{ marginBottom: 12 }}><Badge kind={GROUP_KIND[selected.group]}>{selected.group}</Badge></div>
              <div className={styles.metricGrid}>
                <div className={styles.metric}><div className={styles.metricLabel}>Complete</div><div className={styles.metricValue}>{selected.completionPct.toFixed(1)}%</div></div>
                <div className={styles.metric}><div className={styles.metricLabel}>Risk</div><div className={styles.metricValue}>{selected.dropoutRisk}</div></div>
                <div className={styles.metric}><div className={styles.metricLabel}>Visits</div><div className={styles.metricValue}>{selected.completedVisits}/{selected.expectedVisits}</div></div>
                <div className={styles.metric}><div className={styles.metricLabel}>Last</div><div className={styles.metricValue}>{selected.lastVisit.replace("cga_", "")}</div></div>
              </div>
              <div className={styles.actions} style={{ marginTop: 14, justifyContent: "flex-start" }}>
                {showPassport && <Button size="sm" variant="secondary" icon="id-card" onClick={() => navigate(`/passport?nanoid=${encodeURIComponent(selected.nanoId)}`)}>Open passport</Button>}
                {showCoverage && <Button size="sm" variant="secondary" icon="layers" onClick={() => navigate(`/stream-coverage?nanoid=${encodeURIComponent(selected.nanoId)}`)}>View stream coverage</Button>}
              </div>
            </>
          ) : (
            <p className={styles.muted}>Select a lane to inspect the participant visit sequence.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
