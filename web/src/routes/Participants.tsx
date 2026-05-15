import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Badge, Button, Card, Gloss, Icon, Segmented, Tooltip } from "@/components/primitives";
import { useParticipants } from "@/api/hooks";
import type { Participant, GroupCode, QaStatus, VisitId } from "@/api/schemas";
import styles from "./Participants.module.css";

type GroupF = "all" | GroupCode;
type QaF = "all" | QaStatus;
type VisitF = "all" | VisitId;
type SortKey = keyof Participant | "updated";

const VISITS: VisitId[] = ["nicu_dc", "cga_3mo", "cga_6mo", "cga_9mo", "cga_12mo", "cga_18mo", "cga_24mo"];

const GROUP_KIND: Record<GroupCode, "vpt" | "asib" | "td"> = { VPT: "vpt", ASIB: "asib", TD: "td" };

interface ShellCtx {
  query: string;
}

export function Participants() {
  const navigate = useNavigate();
  const { query } = useOutletContext<ShellCtx>();
  const { data: rows = [] } = useParticipants();

  const [groupF, setGroupF] = useState<GroupF>("all");
  const [qaF, setQaF] = useState<QaF>("all");
  const [visitF, setVisitF] = useState<VisitF>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "updated", dir: "desc" });

  const filtered = useMemo(() => {
    let r = rows.slice();
    const q = (query || "").toLowerCase();
    if (q) {
      r = r.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.group.toLowerCase().includes(q) ||
          p.visit.toLowerCase().includes(q) ||
          (p.hda ?? "").toLowerCase().includes(q),
      );
    }
    if (groupF !== "all") r = r.filter((p) => p.group === groupF);
    if (qaF !== "all") r = r.filter((p) => p.qa === qaF);
    if (visitF !== "all") r = r.filter((p) => p.visit === visitF);

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
  }, [rows, query, groupF, qaF, visitF, sort]);

  const counts = {
    VPT: rows.filter((p) => p.group === "VPT").length,
    ASIB: rows.filter((p) => p.group === "ASIB").length,
    TD: rows.filter((p) => p.group === "TD").length,
  };

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }

  const headers: Array<{ key: SortKey; label: React.ReactNode }> = [
    { key: "id", label: "Participant" },
    { key: "group", label: "Group" },
    { key: "cga_wks", label: <Gloss term="CGA">CGA</Gloss> },
    { key: "sex", label: "Sex" },
    { key: "visit", label: "Visit" },
    { key: "windows", label: <Gloss term="Window">Windows</Gloss> },
    { key: "qa", label: <Gloss term="SQI">QA</Gloss> },
    { key: "rmssd", label: <Gloss term="RMSSD">RMSSD</Gloss> },
    { key: "hf", label: <Gloss term="HF">HF</Gloss> },
    { key: "hda", label: <Gloss term="HDA">HDA</Gloss> },
    { key: "updated", label: "Updated" },
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
            <Gloss term="VPT">VPT</Gloss> {counts.VPT} · <Gloss term="ASIB">ASIB</Gloss> {counts.ASIB} · <Gloss term="TD">TD</Gloss> {counts.TD}
          </div>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" icon="filter">Saved filters</Button>
          <Button variant="secondary" icon="download">Export · CSV</Button>
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
          <span style={{ flex: 1 }} />
          <span className={`${styles.rowCount} t-mono`}>{filtered.length} rows</span>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Participants list — click a row to open detail.</caption>
            <thead>
              <tr>
                {headers.map((h) => {
                  const active = sort.key === h.key;
                  return (
                    <th
                      key={String(h.key)}
                      scope="col"
                      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                      onClick={() => toggleSort(h.key)}
                      className={styles.th}
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
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/participants/${r.id}`)} className={styles.tr}>
                  <td className={`${styles.td} ${styles.idCell} t-mono`}>{r.id}</td>
                  <td className={styles.td}><Badge kind={GROUP_KIND[r.group]} size="sm">{r.group}</Badge></td>
                  <td className={`${styles.td} t-num t-mono`}>{r.cga_wks.toFixed(1)} <span className={styles.dim}>wks</span></td>
                  <td className={`${styles.td} ${styles.muted}`}>{r.sex}</td>
                  <td className={`${styles.td} t-mono ${styles.smallMuted}`}>{r.visit}</td>
                  <td className={`${styles.td} t-num t-mono`}>{r.windows}</td>
                  <td className={styles.td}>
                    <Badge kind={r.qa === "pass" ? "ok" : r.qa === "reject" ? "fail" : "pending"} size="sm">{r.qa}</Badge>
                  </td>
                  <td className={`${styles.td} t-num t-mono`}>{r.rmssd != null ? r.rmssd.toFixed(2) : <span className={styles.dim}>—</span>}</td>
                  <td className={`${styles.td} t-num t-mono ${styles.muted}`}>{r.hf != null ? r.hf.toFixed(1) : <span className={styles.dim}>—</span>}</td>
                  <td className={styles.td}>
                    {r.hda ? (
                      <Tooltip gloss={r.hda.charAt(0).toUpperCase() + r.hda.slice(1)} maxWidth={300}>
                        <span className={styles.hda}>{r.hda}</span>
                      </Tooltip>
                    ) : <span className={styles.dim}>—</span>}
                  </td>
                  <td className={`${styles.td} ${styles.muted} t-mono`}>{r.updated}</td>
                </tr>
              ))}
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
