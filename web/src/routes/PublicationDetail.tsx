import { useMemo, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Button, Card, SectionLabel, Tooltip } from "@/components/primitives";
import {
  useAdminCapabilities,
  useEntityHistory,
  usePublication,
  useUpdatePublicationTags,
} from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { logAudit } from "@/lib/audit";
import styles from "./PublicationDetail.module.css";

const TAG_RULES = [
  "autism-asd",
  "fragile-x",
  "preterm",
  "hrv-rsa",
  "eye-tracking",
  "motor",
  "intervention",
  "social",
  "ecg-cardiac",
  "longitudinal",
  "review",
  "grant-related",
];

const TAG_COLORS: Record<string, string> = {
  "autism-asd": "var(--purple)",
  "fragile-x": "var(--usc-garnet)",
  preterm: "var(--amber)",
  "hrv-rsa": "var(--blue)",
  "eye-tracking": "var(--ocean)",
  motor: "var(--green)",
  social: "var(--purple)",
  "ecg-cardiac": "var(--red)",
  longitudinal: "var(--slate-500)",
  intervention: "var(--blue)",
  review: "var(--slate-500)",
  "grant-related": "var(--green)",
};

function tagStyle(tag: string): CSSProperties {
  return { background: TAG_COLORS[tag] ?? "var(--slate-500)", color: "var(--fg-on-brand)" };
}

function relativeTime(ts: string): string {
  const delta = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(delta)) return ts;
  const minutes = Math.max(0, Math.round(delta / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function HistoryTable({ entityId }: { entityId: string }) {
  const history = useEntityHistory("publication", entityId);
  const rows = history.data ?? [];
  if (!rows.length) return null;
  return (
    <details open>
      <summary><SectionLabel>Change History</SectionLabel></summary>
      <table className={styles.table}>
        <thead>
          <tr><th>When</th><th>Action</th><th>By</th><th>Fields Changed</th><th>Note</th></tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.id}>
              <td>{relativeTime(entry.ts)}</td>
              <td><Badge kind={entry.action === "UPDATE" ? "pending" : entry.action === "DELETE" ? "fail" : "ok"} size="sm">{entry.action}</Badge></td>
              <td>{entry.actor_role ? `${entry.actor_role}: ` : ""}{entry.actor}</td>
              <td>{Object.keys(entry.changed_fields ?? {}).join(", ") || "—"}</td>
              <td>{entry.note ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function PublicationDetail() {
  const { pmid } = useParams();
  const identifier = pmid ? decodeURIComponent(pmid) : undefined;
  const publication = usePublication(identifier);
  const caps = useAdminCapabilities();
  const showChangelog = useFeatureFlag("DATA_CHANGELOG");
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState("");
  const pub = publication.data;
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const saveTags = useUpdatePublicationTags(identifier);

  const tags = useMemo(() => draftTags.length ? draftTags : pub?.tags ?? [], [draftTags, pub?.tags]);
  const canEdit = caps.data?.canEditPublicationTags ?? false;
  const entityId = pub?.pmid ?? pub?.doi ?? identifier ?? "";

  if (publication.isLoading) {
    return <div className={styles.page}><Card>Loading publication...</Card></div>;
  }
  if (!pub) {
    return <div className={styles.page}><Card>Publication not found.</Card></div>;
  }

  function toggleTag(tag: string): void {
    setDraftTags((current) => {
      const source = current.length ? current : pub?.tags ?? [];
      return source.includes(tag) ? source.filter((item) => item !== tag) : [...source, tag];
    });
  }

  function save(): void {
    const customTags = custom.split(",").map((tag) => tag.trim()).filter(Boolean);
    const next = Array.from(new Set([...tags, ...customTags]));
    void logAudit({ action: "publication.tags.update", scope: `/publications/${entityId}/tags` });
    saveTags.mutate({ tags: next });
    setEditing(false);
  }

  return (
    <div className={styles.page}>
      <div className={styles.actions}>
        <Button variant="ghost" icon="arrow-left" onClick={() => history.back()}>Back</Button>
        <Link to="/publications">Publications</Link>
      </div>

      <header className={styles.hero} data-insight="publication-detail">
        <div className={styles.eyebrow}>Publication Detail</div>
        <div className={styles.title}>{pub.title}</div>
        <div className={styles.metaLine}>
          <Badge kind={pub.source === "pubmed" ? "info" : "neutral"} size="sm">{pub.source}</Badge>
          <Badge kind={pub.pub_type === "Review" ? "pending" : "info"} size="sm">{pub.pub_type}</Badge>
          <span>{pub.journal} · {pub.year}</span>
        </div>
      </header>

      <Card className={styles.section}>
        <SectionLabel>Metadata</SectionLabel>
        <div className={styles.grid}>
          <div className={styles.kv}><span className={styles.label}>Journal</span>{pub.journal}</div>
          <div className={styles.kv}><span className={styles.label}>Volume</span>{pub.volume ?? "—"}{pub.issue ? `(${pub.issue})` : ""}</div>
          <div className={styles.kv}><span className={styles.label}>Pages</span>{pub.pages ?? "—"}</div>
          <div className={styles.kv}><span className={styles.label}>Citation Count</span>{pub.citation_count ?? 0}</div>
        </div>
        <div className={styles.actions}>
          {pub.doi && <Button variant="secondary" icon="external-link" onClick={() => window.open(`https://doi.org/${pub.doi}`, "_blank", "noreferrer")}>DOI</Button>}
          {pub.pmid && <Button variant="secondary" icon="external-link" onClick={() => window.open(`https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}/`, "_blank", "noreferrer")}>PubMed</Button>}
          {pub.doi && <Button variant="secondary" icon="external-link" onClick={() => window.open(`https://scholar.google.com/scholar?q=${encodeURIComponent(pub.doi ?? "")}`, "_blank", "noreferrer")}>Scholar</Button>}
        </div>
      </Card>

      <Card className={styles.section}>
        <SectionLabel>Authors</SectionLabel>
        <div className={styles.authors}>
          {pub.authors.map((author, idx) => (
            <Tooltip key={`${author.last}-${idx}`} text={author.affiliation || "No affiliation supplied"}>
              <div className={styles.author}>
                <strong>{author.first || author.initials} {author.last}</strong>
                <div className={styles.label}>{author.affiliation || "—"}</div>
              </div>
            </Tooltip>
          ))}
        </div>
      </Card>

      <Card className={styles.section}>
        <SectionLabel>Abstract</SectionLabel>
        <p className={styles.text}>{pub.abstract ?? "No abstract available."}</p>
      </Card>

      <Card className={styles.section}>
        <SectionLabel>Tags</SectionLabel>
        <div className={styles.tags}>
          {pub.mesh_terms.map((term) => <Badge key={term} size="sm">{term}</Badge>)}
        </div>
        <div className={styles.tags}>
          {tags.map((tag) => <Badge key={tag} size="sm" style={tagStyle(tag)}>· {tag}</Badge>)}
        </div>
        <div className={styles.tags}>
          {pub.keywords.map((keyword) => <Badge key={keyword} kind="neutral" size="sm">{keyword}</Badge>)}
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" icon="tags" disabled={!canEdit} onClick={() => setEditing((value) => !value)}>Edit Tags</Button>
        </div>
        {editing && (
          <div className={styles.section}>
            <div className={styles.editGrid}>
              {TAG_RULES.map((tag) => (
                <label key={tag} className={styles.metaLine}>
                  <input type="checkbox" checked={tags.includes(tag)} onChange={() => toggleTag(tag)} />
                  {tag}
                </label>
              ))}
            </div>
            <label className={styles.editField}>
              <span className={styles.label}>Custom tags</span>
              <input className={styles.input} value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="tag-one, tag-two" />
            </label>
            <Button icon="save" onClick={save} disabled={saveTags.isPending}>Save tags</Button>
          </div>
        )}
      </Card>

      {pub.apa_citation && (
        <Card className={styles.section}>
          <SectionLabel>APA Citation</SectionLabel>
          <div className={styles.codeBlock}>{pub.apa_citation}</div>
          <Button variant="secondary" icon="copy" onClick={() => void navigator.clipboard?.writeText(pub.apa_citation ?? "")}>Copy citation</Button>
        </Card>
      )}

      {showChangelog && <Card><HistoryTable entityId={entityId} /></Card>}
    </div>
  );
}
