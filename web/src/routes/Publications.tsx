import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, SectionLabel, Segmented, Tooltip } from "@/components/primitives";
import {
  usePublicationSyncStatus,
  usePublicationTags,
  usePublications,
  useSyncPublications,
} from "@/api/hooks";
import type { Publication } from "@/api/schemas";
import { exportBibtexFile } from "@/lib/exportBibtex";
import { logAudit } from "@/lib/audit";
import styles from "./Publications.module.css";

type PubType = "All" | "Journal Article" | "Review" | "Book Chapter";

const TAG_COLORS: Record<string, string> = {
  "autism-asd": "var(--tag-purple)",
  "fragile-x": "var(--tag-garnet)",
  preterm: "var(--tag-amber)",
  "hrv-rsa": "var(--tag-blue)",
  "eye-tracking": "var(--tag-ocean)",
  motor: "var(--tag-green)",
  social: "var(--tag-purple)",
  "ecg-cardiac": "var(--tag-red)",
  longitudinal: "var(--tag-slate)",
  intervention: "var(--tag-blue)",
  review: "var(--tag-slate)",
  "grant-related": "var(--tag-green)",
};

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

function tagStyle(tag: string): CSSProperties {
  return {
    background: TAG_COLORS[tag] ?? "var(--tag-slate)",
    // Pinned white, not --fg-on-brand: these fills do not flip with the
    // theme, so an ink that does landed at 4.46 on purple in dark.
    color: "#fff",
  };
}

function authorLine(pub: Publication): React.ReactNode {
  return pub.authors.map((author, idx) => {
    const label = `${author.first || author.initials} ${author.last}`.trim();
    const content = author.affiliation.toLowerCase().includes("south carolina")
      ? <strong>{label}</strong>
      : label;
    return (
      <span key={`${author.last}-${idx}`}>
        {idx > 0 ? ", " : ""}
        {content}
      </span>
    );
  });
}

function PublicationCard({ pub }: { pub: Publication }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const id = pub.pmid ?? pub.doi ?? pub.title;
  const abstract = pub.abstract ?? "No abstract available.";
  const visibleTags = pub.tags.slice(0, 4);
  const extraTags = pub.tags.slice(4);

  return (
    <Card pad={18} dataInsight="publications-card">
      <div className={styles.pubHead}>
        <div className={styles.metaLine}>
          <Badge kind={pub.pub_type === "Review" ? "pending" : "info"} size="sm">{pub.pub_type}</Badge>
          <span>{pub.year}</span>
          {visibleTags.map((tag) => (
            <Badge key={tag} size="sm" style={tagStyle(tag)}>{tag}</Badge>
          ))}
          {extraTags.length > 0 && (
            <Tooltip text={extraTags.join(", ")}>
              <Badge size="sm">+{extraTags.length}</Badge>
            </Tooltip>
          )}
        </div>
        {pub.citation_count ? <span className={styles.sub}>Cited by {pub.citation_count}</span> : null}
      </div>

      <button
        type="button"
        className={styles.title}
        onClick={() => navigate(`/publications/${encodeURIComponent(id)}`)}
      >
        {pub.title}
      </button>
      <p className={styles.authors}>Authors: {authorLine(pub)}</p>
      <p className={styles.journal}>
        {pub.journal}{pub.volume ? `, ${pub.volume}` : ""}{pub.issue ? `(${pub.issue})` : ""}{pub.pages ? `:${pub.pages}` : ""}
        {pub.doi && (
          <>
            {" · "}
            <a href={`https://doi.org/${pub.doi}`} target="_blank" rel="noreferrer">DOI</a>
          </>
        )}
      </p>
      <p className={styles.abstract}>
        {expanded || abstract.length <= 200 ? abstract : `${abstract.slice(0, 200)}...`}{" "}
        {abstract.length > 200 && (
          <button type="button" className={styles.readMore} onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Read less" : "Read more"}
          </button>
        )}
      </p>
      {pub.apa_citation && (
        <details className={styles.citation}>
          <summary>APA citation</summary>
          <div className={styles.codeBlock}>{pub.apa_citation}</div>
          <Button
            variant="ghost"
            size="sm"
            icon="copy"
            onClick={() => void navigator.clipboard?.writeText(pub.apa_citation ?? "")}
          >
            Copy citation
          </Button>
        </details>
      )}
    </Card>
  );
}

export function Publications() {
  const currentYear = new Date().getFullYear();
  const [yearMin, setYearMin] = useState(2018);
  const [yearMax, setYearMax] = useState(currentYear);
  const [search, setSearch] = useState("");
  const [pubType, setPubType] = useState<PubType>("All");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const debouncedSearch = useDebounced(search, 300);

  const params = useMemo(() => ({
    yearMin,
    yearMax,
    search: debouncedSearch,
    pubType,
    tag: activeTags,
    page: 0,
    pageSize: 50,
  }), [activeTags, debouncedSearch, pubType, yearMax, yearMin]);

  const publications = usePublications(params);
  const tags = usePublicationTags();
  const syncStatus = usePublicationSyncStatus();
  const sync = useSyncPublications();
  const total = publications.data?.total ?? 0;
  const rows = publications.data?.publications ?? [];

  function toggleTag(tag: string): void {
    setActiveTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  function triggerSync(): void {
    void logAudit({ action: "publications.sync.trigger", scope: "/publications/sync" });
    sync.mutate();
  }

  function exportBibtex(): void {
    void logAudit({ action: "export.bibtex", scope: "/publications/bibtex" });
    exportBibtexFile(rows, `nano-publications-${new Date().toISOString().slice(0, 10)}.bib`);
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Publications · ESD Lab</div>
          <div className={styles.h1}>{total} publications</div>
          <div className={styles.sub}>Last synced: {syncStatus.data?.last_sync ?? "never"}</div>
        </div>
        <div className={styles.actions}>
          <Button icon="refresh-cw" onClick={triggerSync} disabled={sync.isPending}>
            Sync now
          </Button>
          <Button variant="secondary" icon="download" onClick={exportBibtex}>
            Export · BibTeX
          </Button>
        </div>
      </header>

      <div className={styles.layout}>
        <Card pad={16} className={styles.filters} dataInsight="publications-filters">
          <div className={styles.field}>
            <SectionLabel>Year Range</SectionLabel>
            <div className={styles.row}>
              <input className={styles.input} type="number" value={yearMin} onChange={(event) => setYearMin(Number(event.target.value))} />
              <input className={styles.input} type="number" value={yearMax} onChange={(event) => setYearMax(Number(event.target.value))} />
            </div>
          </div>
          <div className={styles.field}>
            <SectionLabel>Tags</SectionLabel>
            <div className={styles.tagCloud}>
              {(tags.data ?? publications.data?.tag_counts ?? []).map((tag) => (
                <button
                  key={tag.tag}
                  type="button"
                  className={`${styles.tagButton} ${activeTags.includes(tag.tag) ? styles.activeTag : ""}`}
                  onClick={() => toggleTag(tag.tag)}
                >
                  <Badge size="sm" style={tagStyle(tag.tag)}>{tag.tag} · {tag.count}</Badge>
                </button>
              ))}
            </div>
          </div>
          <div className={styles.field}>
            <SectionLabel>Type</SectionLabel>
            <Segmented<PubType>
              size="sm"
              options={["All", "Journal Article", "Review", "Book Chapter"]}
              value={pubType}
              onChange={setPubType}
              ariaLabel="Publication type"
            />
          </div>
          <div className={styles.field}>
            <SectionLabel>Search</SectionLabel>
            <input
              className={styles.input}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title, abstract, author"
            />
          </div>
        </Card>

        <div className={styles.cards}>
          {publications.isLoading ? (
            <Card><div className={styles.empty}>Loading publications...</div></Card>
          ) : publications.isError ? (
            <Card><div className={styles.empty}>Publications could not load.</div></Card>
          ) : rows.length ? (
            rows.map((pub) => <PublicationCard key={pub.pmid ?? pub.doi ?? pub.title} pub={pub} />)
          ) : (
            <Card><div className={styles.empty}>No publications match the current filters.</div></Card>
          )}
        </div>
      </div>
    </div>
  );
}
