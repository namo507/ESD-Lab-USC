import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { Badge, Button, Card, Gloss, Icon, Segmented, Tooltip } from "@/components/primitives";
import { useParticipants } from "@/api/hooks";
import { useUi } from "@/store/ui";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { Participant, GroupCode, QaStatus, VisitId } from "@/api/schemas";
import {
  PARTICIPANT_ID_LEGEND,
  enrollmentKind,
  operationsFor,
  riskKind,
} from "@/lib/participantOperations";
import styles from "./Participants.module.css";

type GroupF = "all" | GroupCode;
type QaF = "all" | QaStatus;
type VisitF = "all" | VisitId;
type EnrollmentF = "all" | "single" | "dual";
type SortKey = keyof Participant | "updated";

const VISITS: VisitId[] = ["nicu_dc", "cga_3mo", "cga_6mo", "cga_9mo", "cga_12mo", "cga_18mo", "cga_24mo"];

const GROUP_KIND: Record<GroupCode, "vpt" | "asib" | "td"> = { VPT: "vpt", ASIB: "asib", TD: "td" };

interface ShellCtx {
  query: string;
}

export function Participants() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const showPassport = useFeatureFlag("DYN_INFANT_PASSPORT");
  const { query } = useOutletContext<ShellCtx>();
  const { data: rows = [] } = useParticipants();
  const studyParam = searchParams.get("study");

  const [groupF, setGroupF] = useState<GroupF>("all");
  const [qaF, setQaF] = useState<QaF>("all");
  const [visitF, setVisitF] = useState<VisitF>("all");
  const [enrollmentF, setEnrollmentF] = useState<EnrollmentF>("all");

  /*
   * The de-identified participant feed carries a study only through
   * `operations.primary_study`, whose vocabulary is NANO / NICO / ANONICO. ABC,
   * IPSA, and ACTION have no participant rows here at all, so those scopes get
   * an explicit empty state rather than a filter that silently matches nothing
   * and reads as "no participants enrolled".
   */
  const activeStudy = useUi((s) => s.activeStudy);
  const scopeCoversParticipants =
    activeStudy === "ALL" || activeStudy === "NANO" || activeStudy === "NICO";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "updated", dir: "desc" });
  const operationsById = useMemo(() => new Map(rows.map((row, index) => [row.id, operationsFor(row, index)])), [rows]);

  const filtered = useMemo(() => {
    let r = rows.slice();
    const q = (query || "").toLowerCase();
    if (q) {
      r = r.filter(
        (p) => {
          const ops = operationsById.get(p.id);
          return (
            p.id.toLowerCase().includes(q) ||
            p.group.toLowerCase().includes(q) ||
            p.visit.toLowerCase().includes(q) ||
            (p.hda ?? "").toLowerCase().includes(q) ||
            (ops?.participant_code ?? "").toLowerCase().includes(q) ||
            (ops?.role_label ?? "").toLowerCase().includes(q) ||
            (ops?.visit_type ?? "").toLowerCase().includes(q)
          );
        },
      );
    }
    if (activeStudy !== "ALL") {
      r = scopeCoversParticipants
        ? r.filter((p) => {
            const ops = operationsById.get(p.id);
            if (!ops) return false;
            // ANONICO participants are part of the NICO study arm.
            return ops.study_roles.some((role) =>
              activeStudy === "NICO" ? role === "NICO" || role === "ANONICO" : role === activeStudy,
            );
          })
        : [];
    }
    if (groupF !== "all") r = r.filter((p) => p.group === groupF);
    if (studyParam === "home") r = r.filter((p) => p.site === "USC Lab");
    if (studyParam === "fiscal") r = r.filter((p) => p.group === "ASIB");
    if (qaF !== "all") r = r.filter((p) => p.qa === qaF);
    if (visitF !== "all") r = r.filter((p) => p.visit === visitF);
    if (enrollmentF !== "all") r = r.filter((p) => operationsById.get(p.id)?.enrollment_type === enrollmentF);

    r.sort((a, b) => {
      const av = a[sort.key as keyof Participant];
      const bv = b[sort.key as keyof Participant];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [rows, query, groupF, studyParam, qaF, visitF, enrollmentF, sort, operationsById, activeStudy, scopeCoversParticipants]);

  const counts = {
    VPT: rows.filter((p) => p.group === "VPT").length,
    ASIB: rows.filter((p) => p.group === "ASIB").length,
    TD: rows.filter((p) => p.group === "TD").length,
  };
  const dualCount = rows.filter((p) => operationsById.get(p.id)?.enrollment_type === "dual").length;
  const elevatedRiskCount = rows.filter((p) => {
    const risk = operationsById.get(p.id)?.scheduling_risk;
    return risk === "watch" || risk === "high";
  }).length;

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }

  const headers: Array<{ id: string; key?: SortKey; label: ReactNode }> = [
    { id: "id", key: "id", label: "Participant" },
    { id: "role", label: "Role" },
    { id: "enrollment", label: "Enroll" },
    { id: "group", key: "group", label: "Group" },
    { id: "cga", key: "cga_wks", label: <Gloss term="CGA">CGA</Gloss> },
    { id: "sex", key: "sex", label: "Sex" },
    { id: "visit", key: "visit", label: "Visit" },
    { id: "visit-type", label: "Visit type" },
    { id: "qa", key: "qa", label: <Gloss term="SQI">QA</Gloss> },
    { id: "risk", label: "Risk" },
    { id: "updated", key: "updated", label: "Updated" },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Participants</span>
          <div className={styles.h1}>
            {filtered.length} <span className={styles.dim}>of {rows.length}</span>
          </div>
          <div className={styles.sub}>
            {studyParam === "home" && "Home Study prefilter · "}
            {studyParam === "fiscal" && "FiSCAL-ASD prefilter · "}
            <Gloss term="VPT">VPT</Gloss> {counts.VPT} · <Gloss term="ASIB">ASIB</Gloss> {counts.ASIB} · <Gloss term="TD">TD</Gloss> {counts.TD}
            {" · "}dual {dualCount} · elevated scheduling risk {elevatedRiskCount}
          </div>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" icon="filter">Saved filters</Button>
          <Button variant="secondary" icon="download">Export · CSV</Button>
          {showPassport && <Button variant="secondary" icon="id-card" onClick={() => navigate("/passport")}>Open passport</Button>}
          <Button icon="user-plus">Add visit</Button>
        </div>
      </header>

      <Card pad={0}>
        <div className={styles.filterBar}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Group</span>
            <Segmented<GroupF>
              size="sm"
              options={[{ value: "all", label: "all" }, { value: "VPT", label: "VPT" }, { value: "ASIB", label: "ASIB" }, { value: "TD", label: "TD" }]}
              value={groupF}
              onChange={setGroupF}
            />
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>QA</span>
            <Segmented<QaF>
              size="sm"
              options={[{ value: "all", label: "all" }, { value: "pass", label: "pass" }, { value: "pending", label: "pending" }, { value: "reject", label: "reject" }]}
              value={qaF}
              onChange={setQaF}
            />
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Visit</span>
            <select
              className={styles.select}
              value={visitF}
              onChange={(e) => setVisitF(e.target.value as VisitF)}
              aria-label="Filter by visit"
            >
              <option value="all">all</option>
              {VISITS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Enrollment</span>
            <Segmented<EnrollmentF>
              size="sm"
              options={[{ value: "all", label: "all" }, { value: "single", label: "single" }, { value: "dual", label: "dual" }]}
              value={enrollmentF}
              onChange={setEnrollmentF}
            />
          </div>
          <span style={{ flex: 1 }} />
          <span className={`${styles.rowCount} t-mono`}>{filtered.length} rows</span>
        </div>

        {!scopeCoversParticipants && (
          <p className={styles.scopeNotice} role="status">
            The de-identified participant table covers NANO and NICO only.{" "}
            {activeStudy} participants are not part of this feed &mdash; open that study
            in REDCap from the ESD Lab front door to review its records.
          </p>
        )}

        <div className={styles.legendBar} data-insight="participant-id-legend">
          {PARTICIPANT_ID_LEGEND.map((item) => (
            <span key={item} className={`${styles.legendItem} t-mono`}>{item}</span>
          ))}
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Participants list — click a row to open detail.</caption>
            <thead>
              <tr>
                {headers.map((h) => {
                  const active = h.key ? sort.key === h.key : false;
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                      onClick={() => h.key && toggleSort(h.key)}
                      className={`${styles.th} ${!h.key ? styles.staticTh : ""}`}
                    >
                      <span className={styles.thInner}>
                        {h.label}
                        {active && (
                          <Icon name={sort.dir === "desc" ? "arrow-down" : "arrow-up"} size={10} color="var(--slate-500)" />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const ops = operationsById.get(r.id) ?? operationsFor(r);
                return (
                  <tr key={r.id} onClick={() => navigate(`/participants/${r.id}`)} className={styles.tr}>
                    <td className={`${styles.td} ${styles.idCell}`}>
                      <span className="t-mono">{r.id}</span>
                      <span className={`${styles.opCode} t-mono`}>{ops.participant_code}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.studyFlags}>
                        {ops.study_roles.map((study) => (
                          <Badge key={study} kind={study === "NANO" ? "vpt" : study === "ANONICO" ? "asib" : "info"} size="sm">{study}</Badge>
                        ))}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <Badge kind={enrollmentKind(ops.enrollment_type)} size="sm">{ops.enrollment_type}</Badge>
                    </td>
                    <td className={styles.td}><Badge kind={GROUP_KIND[r.group]} size="sm">{r.group}</Badge></td>
                    <td className={`${styles.td} t-num t-mono`}>{r.cga_wks.toFixed(1)} <span className={styles.dim}>wks</span></td>
                    <td className={`${styles.td} ${styles.muted}`}>{r.sex}</td>
                    <td className={`${styles.td} t-mono ${styles.smallMuted}`}>{r.visit}</td>
                    <td className={styles.td}>
                      <div className={styles.visitType}>{ops.visit_type}</div>
                      <div className={`${styles.visitMarker} t-mono`}>{ops.visit_marker} · next {ops.next_visit.marker}</div>
                    </td>
                    <td className={styles.td}>
                      <Badge kind={r.qa === "pass" ? "ok" : r.qa === "reject" ? "fail" : "pending"} size="sm">{r.qa}</Badge>
                    </td>
                    <td className={styles.td}>
                      <Tooltip text={ops.scheduling_risk_reasons.join(" ") || ops.scheduling_note} maxWidth={340}>
                        <span>
                          <Badge kind={riskKind(ops.scheduling_risk)} size="sm">{ops.scheduling_risk}</Badge>
                        </span>
                      </Tooltip>
                    </td>
                    <td className={`${styles.td} ${styles.muted} t-mono`}>{r.updated}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={styles.foot}>
          <span>showing {filtered.length} of {rows.length}</span>
          <span>updated 2 min ago · auto every 60 s</span>
        </div>
      </Card>
    </div>
  );
}
