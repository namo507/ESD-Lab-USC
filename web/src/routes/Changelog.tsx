import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, Card, DiffViewer, SectionLabel, Segmented } from "@/components/primitives";
import { useChangelog, useCreateSnapshot, useSnapshots } from "@/api/hooks";
import type { ChangelogAction, ChangelogEntry } from "@/api/schemas";
import { logAudit } from "@/lib/audit";
import styles from "./Changelog.module.css";

type EntityFilter = "All" | "participant" | "run" | "epoch" | "publication" | "redcap_event";
type ActionFilter = "All" | ChangelogAction;

const ACTION_KIND: Record<ChangelogAction, "ok" | "pending" | "fail" | "info" | "neutral"> = {
  INSERT: "ok",
  UPDATE: "pending",
  DELETE: "fail",
  IMPORT: "info",
  SYNC: "neutral",
  QA_OVERRIDE: "pending",
};

function relativeTime(ts: string): string {
  const date = new Date(ts);
  const delta = Date.now() - date.getTime();
  if (!Number.isFinite(delta)) return ts;
  const minutes = Math.max(0, Math.round(delta / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function entryHref(entry: ChangelogEntry): string {
  if (entry.entity_type === "participant") return `/participants/${entry.entity_id}`;
  if (entry.entity_type === "publication") return `/publications/${encodeURIComponent(entry.entity_id)}`;
  return "/changelog";
}

function SnapshotModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreateSnapshot();
  function submit(): void {
    void logAudit({ action: "snapshot.create", scope: "/snapshots/create", detail: { tag } });
    create.mutate({ tag, description }, { onSuccess: onClose });
  }
  return (
    <dialog open className={styles.dialog}>
      <div className={styles.dialogHead}>
        <SectionLabel>Create Snapshot</SectionLabel>
        <Button variant="ghost" size="sm" icon="x" onClick={onClose}>Close</Button>
      </div>
      <div className={styles.field}>
        <span className={styles.muted}>Tag</span>
        <input className={styles.input} value={tag} onChange={(event) => setTag(event.target.value)} placeholder="pre-submission-2026-06" />
      </div>
      <div className={styles.field}>
        <span className={styles.muted}>Description</span>
        <textarea className={styles.input} value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
      </div>
      <Button icon="camera" onClick={submit} disabled={!tag || create.isPending}>Create snapshot checkpoint</Button>
    </dialog>
  );
}

export function Changelog() {
  const [searchParams] = useSearchParams();
  const [entity, setEntity] = useState<EntityFilter>((searchParams.get("entity_type") as EntityFilter | null) ?? "All");
  const [action, setAction] = useState<ActionFilter>((searchParams.get("action") as ActionFilter | null) ?? "All");
  const [actor, setActor] = useState("");
  const [note, setNote] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [versionTag, setVersionTag] = useState(searchParams.get("version_tag") ?? "");
  const [selected, setSelected] = useState<ChangelogEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const params = useMemo(() => ({
    entity_type: entity === "All" ? undefined : entity,
    action: action === "All" ? undefined : action,
    actor: actor || undefined,
    search: note || undefined,
    from: from || undefined,
    to: to || undefined,
    version_tag: versionTag || undefined,
    page: 0,
    pageSize: 50,
  }), [action, actor, entity, from, note, to, versionTag]);
  const changelog = useChangelog(params);
  const snapshots = useSnapshots();
  const rows = changelog.data?.rows ?? [];
  const versionTags = Array.from(new Set(rows.map((row) => row.version_tag).filter((tag): tag is string => Boolean(tag))));

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Admin</div>
          <div className={styles.h1}>Change History</div>
          <div className={styles.muted}>{changelog.data?.total ?? 0} recorded changes</div>
        </div>
      </header>

      <div className={styles.layout}>
        <Card>
          <div className={styles.timeline}>
            {rows.map((entry) => (
              <button key={entry.id} type="button" className={styles.entry} onClick={() => setSelected(entry)}>
                <div className={styles.entryCard}>
                  <div className={styles.line}>
                    <Badge kind={ACTION_KIND[entry.action]} size="sm">{entry.action}</Badge>
                    <a href={entryHref(entry)} onClick={(event) => event.stopPropagation()}>{entry.entity_type}/{entry.entity_id}</a>
                    <span className={styles.muted}>{relativeTime(entry.ts)}</span>
                  </div>
                  <div className={styles.line}>
                    <span>Actor:</span>
                    {entry.actor_role && <Badge size="sm">{entry.actor_role}</Badge>}
                    <span>{entry.actor}</span>
                    <span className={styles.muted}>Session: {(entry.session_id ?? "session").slice(-8)}</span>
                  </div>
                  {entry.note && <em className={styles.muted}>{entry.note}</em>}
                  {entry.action === "UPDATE" && entry.changed_fields && (
                    <div className={styles.diff}>
                      {Object.entries(entry.changed_fields).slice(0, 4).map(([field, values]) => (
                        <span key={field}>
                          {field}: <span className={styles.old}>{String(values[0])}</span> {"->"} <span className={styles.new}>{String(values[1])}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))}
            {!rows.length && <div className={styles.muted}>No changelog entries match the current filters.</div>}
          </div>
        </Card>

        <div className={styles.side}>
          <Card className={styles.filters} dataInsight="changelog-filters">
            <SectionLabel>Filters</SectionLabel>
            <Segmented<EntityFilter>
              size="sm"
              options={["All", "participant", "run", "epoch", "publication", "redcap_event"]}
              value={entity}
              onChange={setEntity}
              ariaLabel="Entity type"
            />
            <Segmented<ActionFilter>
              size="sm"
              options={["All", "INSERT", "UPDATE", "DELETE", "QA_OVERRIDE", "SYNC"]}
              value={action}
              onChange={setAction}
              ariaLabel="Action"
            />
            <div className={styles.row}>
              <input className={styles.input} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              <input className={styles.input} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
            <input className={styles.input} value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Actor or role" />
            <input className={styles.input} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Search notes" />
            <select className={styles.input} value={versionTag} onChange={(event) => setVersionTag(event.target.value)}>
              <option value="">All version tags</option>
              {versionTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </Card>

          <Card className={styles.filters} dataInsight="snapshots-panel">
            <div className={styles.line}>
              <SectionLabel>Dataset Snapshots</SectionLabel>
              <Button icon="camera" size="sm" onClick={() => setCreating(true)}>Create snapshot checkpoint</Button>
            </div>
            {(snapshots.data ?? []).map((snapshot) => (
              <div key={snapshot.id} className={styles.snapshot}>
                <div className={styles.line}>
                  <code className={styles.code}>{snapshot.tag}</code>
                  <span className={styles.muted}>{snapshot.created_at} by {snapshot.created_by}</span>
                </div>
                {snapshot.description && <div className={styles.muted}>{snapshot.description}</div>}
                <div className={styles.muted}>
                  Row counts: {Object.entries(snapshot.row_counts).map(([key, value]) => `${key}: ${value}`).join(" · ")}
                </div>
                <div className={styles.line}>
                  <span className={styles.muted}>Checksum: {snapshot.checksum.slice(0, 12)}...</span>
                  <Button variant="ghost" size="sm" icon="copy" onClick={() => void navigator.clipboard?.writeText(snapshot.checksum)}>Copy full</Button>
                  <Button variant="ghost" size="sm" icon="download" onClick={() => window.open(`/api/snapshots/${encodeURIComponent(snapshot.tag)}/export`, "_blank")}>Download JSON export</Button>
                </div>
              </div>
            ))}
            {!snapshots.data?.length && <div className={styles.muted}>No dataset snapshots yet.</div>}
          </Card>
        </div>
      </div>

      {selected && (
        <dialog open className={styles.dialog}>
          <div className={styles.dialogHead}>
            <SectionLabel>Diff</SectionLabel>
            <Button variant="ghost" size="sm" icon="x" onClick={() => setSelected(null)}>Close</Button>
          </div>
          <DiffViewer before={selected.before ?? {}} after={selected.after ?? {}} highlightFields={Object.keys(selected.changed_fields ?? {})} />
        </dialog>
      )}
      {creating && <SnapshotModal onClose={() => setCreating(false)} />}
    </div>
  );
}
