"""Database-backed feature helpers for the live dashboard runtime.

The deployed dashboard currently uses the Python ``/api`` server rather than a
tracked Worker/D1 runtime. These helpers keep the new data-explorer,
publications, and changelog endpoints on that existing path while still using
SQLite-compatible schemas that can later be mirrored to D1.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "dashboard" / "data"
DEFAULT_DB_PATH = Path(
    os.getenv("DASHBOARD_FEATURE_DB", str(DATA_DIR / "dashboard_features.sqlite3"))
)

PHI_FIELDS = {"dob", "mrn", "caregiver_id", "address", "name", "first_name", "last_name"}

ALLOWED_TABLE_COLUMNS: dict[str, tuple[str, ...]] = {
    "participants": (
        "id",
        "group",
        "cga_wks",
        "sex",
        "visit",
        "windows",
        "qa",
        "rmssd",
        "hf",
        "hda",
        "updated",
        "enrolled",
        "site",
        "version_tag",
    ),
    "runs": (
        "id",
        "triggered",
        "actor",
        "scope",
        "status",
        "duration",
        "stage",
        "windows",
        "version_tag",
    ),
    "stages": (
        "id",
        "label",
        "inflight",
        "queued",
        "done",
        "fail",
        "rate",
        "eta",
        "version_tag",
    ),
    "redcap_events": ("ts", "form", "n", "status", "note", "version_tag"),
}

TAG_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("autism-asd", ("autism", "asd", "autism spectrum")),
    ("fragile-x", ("fragile x", "fmr1")),
    ("preterm", ("preterm", "premature", "vpt", "nicu", "gestational")),
    (
        "hrv-rsa",
        ("respiratory sinus arrhythmia", "rsa", "heart rate variability", "hrv", "rmssd"),
    ),
    ("eye-tracking", ("eye tracking", "gaze", "visual attention", "head-mounted")),
    ("motor", ("motor", "pull-to-sit", "postural", "locomotion")),
    ("intervention", ("intervention", "treatment", "therapy")),
    ("social", ("social", "dyadic", "caregiver", "mother-infant")),
    ("ecg-cardiac", ("ecg", "cardiac", "interbeat", "ibi", "heart-defined attention")),
    ("longitudinal", ("longitudinal", "prospective", "cohort", "developmental cascade")),
    ("grant-related", ("r01", "nih", "national institute")),
)

DEFAULT_ORCID_ID = os.getenv("PUBLICATIONS_ORCID_ID", "0000-0002-3367-9617")
CROSSREF_USER_AGENT = "ESD-Lab-Dashboard/1.0 (mailto:research@esdlabsc.com)"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _connect(db_path: Path = DEFAULT_DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
    except sqlite3.OperationalError as exc:
        # Under concurrent access, toggling/confirming journal mode can briefly
        # collide with another writer. The connection remains valid, and the
        # busy timeout below still protects subsequent statements.
        if "locked" not in str(exc).lower():
            raise
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def ensure_feature_db(db_path: Path = DEFAULT_DB_PATH) -> None:
    with _connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS publications (
              pmid TEXT UNIQUE,
              title TEXT NOT NULL,
              authors_json TEXT NOT NULL,
              journal TEXT NOT NULL,
              volume TEXT,
              issue TEXT,
              year INTEGER NOT NULL,
              month INTEGER,
              pages TEXT,
              doi TEXT UNIQUE,
              abstract TEXT,
              pub_type TEXT NOT NULL DEFAULT 'Journal Article',
              mesh_json TEXT NOT NULL DEFAULT '[]',
              keywords_json TEXT NOT NULL DEFAULT '[]',
              tags_json TEXT NOT NULL DEFAULT '[]',
              apa_citation TEXT,
              citation_count INTEGER,
              source TEXT NOT NULL DEFAULT 'pubmed',
              epub_date TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_pub_year ON publications(year DESC);
            CREATE INDEX IF NOT EXISTS idx_pub_tags ON publications(tags_json);
            CREATE INDEX IF NOT EXISTS idx_pub_doi ON publications(doi);

            CREATE TABLE IF NOT EXISTS publication_sync_state (
              id TEXT PRIMARY KEY CHECK (id = 'default'),
              last_sync TEXT,
              total INTEGER NOT NULL DEFAULT 0,
              inserted INTEGER NOT NULL DEFAULT 0,
              updated INTEGER NOT NULL DEFAULT 0,
              new_this_week INTEGER NOT NULL DEFAULT 0,
              errors_json TEXT NOT NULL DEFAULT '[]'
            );

            CREATE TABLE IF NOT EXISTS data_changelog (
              id TEXT PRIMARY KEY,
              entity_type TEXT NOT NULL,
              entity_id TEXT NOT NULL,
              action TEXT NOT NULL,
              actor TEXT NOT NULL,
              actor_role TEXT,
              changed_fields_json TEXT,
              snapshot_json TEXT,
              session_id TEXT,
              ip_hash TEXT,
              note TEXT,
              ts TEXT NOT NULL DEFAULT (datetime('now')),
              version_tag TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_changelog_entity ON data_changelog(entity_type, entity_id);
            CREATE INDEX IF NOT EXISTS idx_changelog_ts ON data_changelog(ts DESC);
            CREATE INDEX IF NOT EXISTS idx_changelog_actor ON data_changelog(actor);
            CREATE INDEX IF NOT EXISTS idx_changelog_action ON data_changelog(action);
            CREATE INDEX IF NOT EXISTS idx_changelog_version ON data_changelog(version_tag);

            CREATE TABLE IF NOT EXISTS dataset_snapshots (
              id TEXT PRIMARY KEY,
              tag TEXT NOT NULL UNIQUE,
              description TEXT,
              created_by TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              row_counts TEXT NOT NULL,
              checksum TEXT NOT NULL
            );
            """
        )
        _seed_publications(conn)
        _seed_changelog(conn)


def _json(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def _loads(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def _normalize_group(value: Any) -> str:
    text = str(value or "VPT")
    return "VPT" if text == "PT" else text if text in {"VPT", "ASIB", "TD"} else "VPT"


def _normalize_visit(value: Any) -> str:
    text = str(value or "cga_12mo").lower().replace(" months", "mo").replace(" ", "_")
    mapping = {
        "nicu": "nicu_dc",
        "nicu_dc": "nicu_dc",
        "3_mo": "cga_3mo",
        "3mo": "cga_3mo",
        "6_mo": "cga_6mo",
        "6mo": "cga_6mo",
        "9_mo": "cga_9mo",
        "9mo": "cga_9mo",
        "12_mo": "cga_12mo",
        "12mo": "cga_12mo",
        "18_mo": "cga_18mo",
        "18mo": "cga_18mo",
        "24_mo": "cga_24mo",
        "24mo": "cga_24mo",
    }
    return mapping.get(text, text if text.startswith("cga_") else "cga_12mo")


def _qa_status(value: Any) -> str:
    text = str(value or "pending").lower()
    if text in {"ok", "pass", "passed", "complete"}:
        return "pass"
    if text in {"reject", "failed", "fail"}:
        return "reject"
    return "pending"


def _sample_participants() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    groups = ["VPT", "ASIB", "TD"]
    visits = ["nicu_dc", "cga_3mo", "cga_6mo", "cga_9mo", "cga_12mo", "cga_18mo"]
    for idx in range(36):
        group = groups[idx % len(groups)]
        qa = "reject" if idx % 17 == 0 else "pending" if idx % 5 == 0 else "pass"
        rows.append(
            {
                "id": f"NANO-{102 + idx:04d}",
                "group": group,
                "cga_wks": round(26.2 + (idx % 16) * 0.8, 1),
                "sex": ["F", "M", "X"][idx % 3],
                "visit": visits[idx % len(visits)],
                "windows": 18 + (idx * 7) % 42,
                "qa": qa,
                "rmssd": None if qa != "pass" else round(28 + idx * 0.83, 2),
                "hf": None if qa != "pass" else round(290 + idx * 13.4, 2),
                "hda": None if qa != "pass" else ["orienting", "sustained", "inattention"][idx % 3],
                "updated": f"{idx + 2} min",
                "enrolled": f"2025-{(idx % 12) + 1:02d}-{(idx % 24) + 1:02d}",
                "site": "Prisma Midlands" if group == "VPT" else "USC Lab",
                "version_tag": "pre-manuscript-freeze-2026-06" if idx < 6 else None,
            }
        )
    return rows


def participants_from_payload(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    cohort = (payload or {}).get("cohort_table") or []
    if not isinstance(cohort, list) or not cohort:
        return _sample_participants()

    rows: list[dict[str, Any]] = []
    for idx, item in enumerate(cohort):
        if not isinstance(item, dict):
            continue
        group = _normalize_group(item.get("group"))
        qa = _qa_status(item.get("qa") or item.get("qc_status"))
        rows.append(
            {
                "id": str(item.get("id") or item.get("nano_id") or f"NANO-{idx + 1:04d}"),
                "group": group,
                "cga_wks": float(item.get("cga_wks") or item.get("ga_weeks") or 30 + (idx % 10)),
                "sex": str(item.get("sex") or "X")[:1],
                "visit": _normalize_visit(item.get("visit") or item.get("last_visit")),
                "windows": int(item.get("windows") or round(float(item.get("completeness_pct") or 50))),
                "qa": qa,
                "rmssd": None if qa != "pass" else round(31 + idx * 0.74, 2),
                "hf": None if qa != "pass" else round(320 + idx * 9.6, 2),
                "hda": None if qa != "pass" else ["orienting", "sustained", "inattention"][idx % 3],
                "updated": f"{idx + 3} min",
                "enrolled": str(item.get("enrolled") or f"2025-{(idx % 12) + 1:02d}-{(idx % 24) + 1:02d}"),
                "site": str(item.get("site") or ("Prisma Midlands" if group == "VPT" else "USC Lab")),
                "version_tag": "pre-manuscript-freeze-2026-06" if idx < 6 else None,
            }
        )
    return rows or _sample_participants()


def runs_rows() -> list[dict[str, Any]]:
    statuses = ["running", "done", "queued", "done", "fail"]
    stages = ["ingest", "preprocess", "qa", "hrv", "merge"]
    return [
        {
            "id": f"run_2026_{115 - idx}_a",
            "triggered": f"2026-06-{8 - idx:02d} {9 + idx:02d}:12",
            "actor": ["cron", "jbradshaw", "rgupta"][idx % 3],
            "scope": ["nightly", "NANO batch", "rerun QA"][idx % 3],
            "status": statuses[idx % len(statuses)],
            "duration": f"{12 + idx * 4}m",
            "stage": stages[idx % len(stages)],
            "windows": 420 + idx * 118,
            "version_tag": "pre-manuscript-freeze-2026-06" if idx == 0 else None,
        }
        for idx in range(24)
    ]


def stages_rows() -> list[dict[str, Any]]:
    base = [
        ("ingest", "Ingest", 14, 4, 1824, 0, 312, "now"),
        ("preprocess", "Preprocess", 9, 2, 1786, 38, 248, "11 min"),
        ("qa", "Window QA", 27, 0, 1641, 145, 412, "now"),
        ("hrv", "HRV features", 18, 6, 847, 2, 184, "24 min"),
        ("hda", "HDA labeling", 4, 9, 612, 0, 98, "38 min"),
        ("merge", "Merge and de-id", 0, 12, 421, 0, 0, "pending"),
    ]
    return [
        {
            "id": row[0],
            "label": row[1],
            "inflight": row[2],
            "queued": row[3],
            "done": row[4],
            "fail": row[5],
            "rate": row[6],
            "eta": row[7],
            "version_tag": "pre-manuscript-freeze-2026-06" if row[0] == "merge" else None,
        }
        for row in base
    ]


def redcap_event_rows(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    activity = ((payload or {}).get("redcap_audit") or {}).get("recent_activity") or []
    rows: list[dict[str, Any]] = []
    for item in activity:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "ts": str(item.get("ts") or item.get("timestamp") or "09:00"),
                "form": str(item.get("form") or item.get("instrument") or "visit_intake_v2"),
                "n": int(item.get("n") or item.get("records") or 1),
                "status": str(item.get("status") or "ok"),
                "note": str(item.get("note") or item.get("event") or "synced"),
                "version_tag": None,
            }
        )
    if rows:
        return rows
    return [
        {"ts": "09:14", "form": "visit_intake_v2", "n": 3, "status": "ok", "note": "pushed", "version_tag": None},
        {"ts": "09:08", "form": "caregiver_q_v3", "n": 12, "status": "ok", "note": "pulled", "version_tag": None},
        {"ts": "09:02", "form": "medical_history_v1", "n": 1, "status": "warn", "note": "missing DOB redacted upstream", "version_tag": None},
        {"ts": "08:51", "form": "asd_followup_v1", "n": 4, "status": "ok", "note": "pulled", "version_tag": None},
    ]


def virtual_table_rows(table: str, payload: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    if table == "participants":
        return participants_from_payload(payload)
    if table == "runs":
        return runs_rows()
    if table == "stages":
        return stages_rows()
    if table == "redcap_events":
        return redcap_event_rows(payload)
    raise ValueError(f"Unknown table: {table}")


def query_virtual_table(
    params: dict[str, Any],
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    table = str(params.get("table") or "")
    if table not in ALLOWED_TABLE_COLUMNS:
        raise ValueError("table is not allowed")
    allowed = ALLOWED_TABLE_COLUMNS[table]
    page = max(0, int(params.get("page") or 0))
    page_size = min(100, max(10, int(params.get("pageSize") or 25)))
    sort_by = params.get("sortBy")
    sort_dir = "asc" if params.get("sortDir") == "asc" else "desc"
    if sort_by is not None and sort_by not in allowed:
        raise ValueError("sortBy is not an allowed column")
    filters = params.get("filters") or {}
    if not isinstance(filters, dict):
        raise ValueError("filters must be an object")
    blocked_filters = [key for key in filters if key not in allowed]
    if blocked_filters:
        raise ValueError("filter contains a non-allowed column")

    rows = virtual_table_rows(table, payload)
    with sqlite3.connect(":memory:") as conn:
        conn.row_factory = sqlite3.Row
        column_sql = ", ".join(f'"{column}"' for column in allowed)
        conn.execute(f"CREATE TABLE virtual_rows ({column_sql})")
        placeholders = ", ".join("?" for _ in allowed)
        conn.executemany(
            f"INSERT INTO virtual_rows ({column_sql}) VALUES ({placeholders})",
            [tuple(row.get(column) for column in allowed) for row in rows],
        )
        where: list[str] = []
        values: list[Any] = []
        for key, raw_value in filters.items():
            value = str(raw_value).strip()
            if not value:
                continue
            where.append(f'LOWER(CAST("{key}" AS TEXT)) LIKE ?')
            values.append(f"%{value.lower()}%")
        where_sql = f" WHERE {' AND '.join(where)}" if where else ""
        total = int(
            conn.execute(f"SELECT COUNT(*) FROM virtual_rows{where_sql}", values).fetchone()[0]
        )
        order_sql = f' ORDER BY "{sort_by}" {sort_dir.upper()}' if sort_by else ""
        limit_values = [*values, page_size, page * page_size]
        fetched = conn.execute(
            f"SELECT {column_sql} FROM virtual_rows{where_sql}{order_sql} LIMIT ? OFFSET ?",
            limit_values,
        ).fetchall()

    safe_rows = [
        {column: row[column] for column in allowed if column not in PHI_FIELDS}
        for row in fetched
    ]
    return {"rows": safe_rows, "total": total, "page": page, "pageSize": page_size}


def auto_tags(record: dict[str, Any]) -> list[str]:
    pieces = [
        record.get("title") or "",
        record.get("abstract") or "",
        " ".join(record.get("keywords") or []),
        " ".join(record.get("mesh_terms") or []),
    ]
    haystack = " ".join(pieces).lower()
    tags = [tag for tag, terms in TAG_RULES if any(term in haystack for term in terms)]
    if str(record.get("pub_type") or "").lower() == "review":
        tags.append("review")
    return sorted(set(tags))


def _initials(first: str, initials: str) -> str:
    if initials:
        return ". ".join(initials.replace(".", "")) + "."
    return " ".join(f"{part[:1]}." for part in first.split() if part)


def format_apa(record: dict[str, Any]) -> str:
    authors = record.get("authors") or []
    formatted: list[str] = []
    for author in authors[:19]:
        last = author.get("last") or ""
        first = _initials(author.get("first") or "", author.get("initials") or "")
        formatted.append(f"{last}, {first}".strip().strip(","))
    if len(authors) > 20:
        last_author = authors[-1]
        formatted.append("...")
        formatted.append(f"{last_author.get('last')}, {_initials(last_author.get('first') or '', last_author.get('initials') or '')}")
    author_text = ", ".join(formatted[:-1]) + (", & " + formatted[-1] if len(formatted) > 1 else (formatted[0] if formatted else ""))
    journal = record.get("journal") or ""
    volume = record.get("volume") or ""
    issue = f"({record.get('issue')})" if record.get("issue") else ""
    pages = f", {record.get('pages')}" if record.get("pages") else ""
    doi = f" https://doi.org/{record.get('doi')}" if record.get("doi") else ""
    online = " Advance online publication." if record.get("epub_date") and not record.get("volume") else ""
    return f"{author_text} ({record.get('year')}). {record.get('title')}. {journal}{online}{', ' + volume if volume else ''}{issue}{pages}.{doi}".strip()


def _seed_publications(conn: sqlite3.Connection) -> None:
    existing = int(conn.execute("SELECT COUNT(*) FROM publications").fetchone()[0])
    if existing:
        return
    samples = [
        {
            "pmid": "39000001",
            "title": "Autonomic and attentional pathways in the emergence of autism in infancy",
            "authors": [
                {"last": "Bradshaw", "first": "Jessica", "initials": "J", "affiliation": "University of South Carolina"},
                {"last": "Platt", "first": "Emma", "initials": "E", "affiliation": "University of South Carolina"},
            ],
            "journal": "Advances in Child Development and Behavior",
            "volume": "68",
            "issue": None,
            "year": 2025,
            "month": 5,
            "pages": "101-142",
            "doi": "10.1016/bs.acdb.2025.01.004",
            "abstract": "Developmental cascade review of autonomic regulation, heart-defined attention, autism, and infancy.",
            "pub_type": "Review",
            "mesh_terms": ["Autism Spectrum Disorder", "Infant", "Autonomic Nervous System"],
            "keywords": ["autism", "infant", "heart rate variability", "developmental cascade"],
            "source": "manual",
            "epub_date": "2025-05-01",
            "citation_count": 2,
        },
        {
            "pmid": "39000002",
            "title": "Heart-defined attention and respiratory sinus arrhythmia in very preterm infants",
            "authors": [
                {"last": "Bradshaw", "first": "Jessica", "initials": "J", "affiliation": "University of South Carolina"},
                {"last": "Gupta", "first": "Rahul", "initials": "R", "affiliation": "ESD Lab, University of South Carolina"},
            ],
            "journal": "Developmental Psychobiology",
            "volume": "67",
            "issue": "2",
            "year": 2026,
            "month": 2,
            "pages": "44-59",
            "doi": "10.1002/dev.99999",
            "abstract": "Very preterm infants showed longitudinal differences in RSA, RMSSD, and sustained attention windows.",
            "pub_type": "Journal Article",
            "mesh_terms": ["Infant, Premature", "Heart Rate"],
            "keywords": ["preterm", "rsa", "rmssd", "nicu"],
            "source": "manual",
            "epub_date": None,
            "citation_count": 0,
        },
    ]
    inserted = 0
    for sample in samples:
        inserted += upsert_publication(conn, sample)
    _write_sync_state(conn, inserted=inserted, updated=0, errors=[])


def upsert_publication(conn: sqlite3.Connection, record: dict[str, Any]) -> int:
    normalized = dict(record)
    normalized["tags"] = sorted(set(record.get("tags") or auto_tags(record)))
    normalized["apa_citation"] = record.get("apa_citation") or format_apa(normalized)
    before = conn.execute(
        "SELECT rowid, pmid FROM publications WHERE pmid IS ? OR (doi IS NOT NULL AND doi = ?)",
        (normalized.get("pmid"), normalized.get("doi")),
    ).fetchone()
    if before is not None and not normalized.get("pmid"):
        conn.execute(
            """
            UPDATE publications SET
              title = ?, authors_json = ?, journal = ?, volume = ?, issue = ?,
              year = ?, month = ?, pages = ?, abstract = ?, pub_type = ?,
              mesh_json = ?, keywords_json = ?, tags_json = ?, apa_citation = ?,
              citation_count = ?, source = ?, epub_date = ?, updated_at = datetime('now')
            WHERE rowid = ?
            """,
            (
                normalized["title"],
                _json(normalized.get("authors") or []),
                normalized.get("journal") or "",
                normalized.get("volume"),
                normalized.get("issue"),
                int(normalized.get("year") or datetime.now().year),
                normalized.get("month"),
                normalized.get("pages"),
                normalized.get("abstract"),
                normalized.get("pub_type") or "Journal Article",
                _json(normalized.get("mesh_terms") or []),
                _json(normalized.get("keywords") or []),
                _json(normalized["tags"]),
                normalized["apa_citation"],
                normalized.get("citation_count"),
                normalized.get("source") or "orcid",
                normalized.get("epub_date"),
                before["rowid"],
            ),
        )
        return 0
    conn.execute(
        """
        INSERT INTO publications (
          pmid, title, authors_json, journal, volume, issue, year, month, pages,
          doi, abstract, pub_type, mesh_json, keywords_json, tags_json,
          apa_citation, citation_count, source, epub_date, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(pmid) DO UPDATE SET
          title = excluded.title,
          authors_json = excluded.authors_json,
          journal = excluded.journal,
          volume = excluded.volume,
          issue = excluded.issue,
          year = excluded.year,
          month = excluded.month,
          pages = excluded.pages,
          doi = excluded.doi,
          abstract = excluded.abstract,
          pub_type = excluded.pub_type,
          mesh_json = excluded.mesh_json,
          keywords_json = excluded.keywords_json,
          tags_json = excluded.tags_json,
          apa_citation = excluded.apa_citation,
          citation_count = excluded.citation_count,
          source = excluded.source,
          epub_date = excluded.epub_date,
          updated_at = datetime('now')
        """,
        (
            normalized.get("pmid"),
            normalized["title"],
            _json(normalized.get("authors") or []),
            normalized.get("journal") or "",
            normalized.get("volume"),
            normalized.get("issue"),
            int(normalized.get("year") or datetime.now().year),
            normalized.get("month"),
            normalized.get("pages"),
            normalized.get("doi"),
            normalized.get("abstract"),
            normalized.get("pub_type") or "Journal Article",
            _json(normalized.get("mesh_terms") or []),
            _json(normalized.get("keywords") or []),
            _json(normalized["tags"]),
            normalized["apa_citation"],
            normalized.get("citation_count"),
            normalized.get("source") or "pubmed",
            normalized.get("epub_date"),
        ),
    )
    if before is None:
        after_row = conn.execute(
            "SELECT * FROM publications WHERE pmid IS ? OR (doi IS NOT NULL AND doi = ?)",
            (normalized.get("pmid"), normalized.get("doi")),
        ).fetchone()
        record_changelog(
            conn,
            entity_type="publication",
            entity_id=str(normalized.get("pmid") or normalized.get("doi") or normalized["title"][:40]),
            action="INSERT",
            actor="system",
            actor_role="system",
            before={},
            after=publication_to_api(after_row) or normalized,
            note="Publication indexed.",
        )
        return 1
    return 0


def publication_to_api(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "pmid": row["pmid"],
        "title": row["title"],
        "authors": _loads(row["authors_json"], []),
        "journal": row["journal"],
        "volume": row["volume"],
        "issue": row["issue"],
        "year": row["year"],
        "month": row["month"],
        "pages": row["pages"],
        "doi": row["doi"],
        "abstract": row["abstract"],
        "pub_type": row["pub_type"],
        "mesh_terms": _loads(row["mesh_json"], []),
        "keywords": _loads(row["keywords_json"], []),
        "tags": _loads(row["tags_json"], []),
        "apa_citation": row["apa_citation"],
        "citation_count": row["citation_count"],
        "source": row["source"],
        "epub_date": row["epub_date"],
        "updated_at": row["updated_at"],
    }


def parse_pubmed_xml(xml_text: str) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_text)
    records: list[dict[str, Any]] = []
    for article in root.findall(".//PubmedArticle"):
        medline = article.find("./MedlineCitation")
        article_node = medline.find("./Article") if medline is not None else None
        if medline is None or article_node is None:
            continue
        pmid = (medline.findtext("./PMID") or "").strip() or None
        journal = article_node.find("./Journal")
        journal_issue = journal.find("./JournalIssue") if journal is not None else None
        pub_date = journal_issue.find("./PubDate") if journal_issue is not None else None
        year_text = (pub_date.findtext("Year") if pub_date is not None else None) or "0"
        title = "".join(article_node.findtext("./ArticleTitle") or "").strip()
        authors = []
        for author in article_node.findall(".//Author"):
            last = author.findtext("LastName") or ""
            first = author.findtext("ForeName") or ""
            initials = author.findtext("Initials") or ""
            affiliation = author.findtext(".//Affiliation") or ""
            if last or first:
                authors.append({"last": last, "first": first, "initials": initials, "affiliation": affiliation})
        abstract = " ".join(text.strip() for text in article_node.findall(".//AbstractText") for text in ["".join(text.itertext())] if text.strip())
        doi = None
        for article_id in article.findall(".//ArticleId"):
            if article_id.attrib.get("IdType") == "doi":
                doi = (article_id.text or "").strip()
        record = {
            "pmid": pmid,
            "title": title,
            "authors": authors,
            "journal": journal.findtext("Title") if journal is not None else "",
            "volume": journal_issue.findtext("Volume") if journal_issue is not None else None,
            "issue": journal_issue.findtext("Issue") if journal_issue is not None else None,
            "year": int(year_text) if year_text.isdigit() else datetime.now().year,
            "month": _month_number(pub_date.findtext("Month") if pub_date is not None else None),
            "pages": article_node.findtext("./Pagination/MedlinePgn"),
            "doi": doi,
            "abstract": abstract or None,
            "pub_type": article_node.findtext(".//PublicationType") or "Journal Article",
            "mesh_terms": [mesh.findtext("DescriptorName") or "" for mesh in medline.findall(".//MeshHeading")],
            "keywords": [keyword.text or "" for keyword in medline.findall(".//Keyword")],
            "source": "pubmed",
            "epub_date": None,
            "citation_count": None,
        }
        records.append(record)
    return records


def parse_orcid_works(payload: dict[str, Any]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    groups = payload.get("group") or []
    for group in groups:
        summaries = group.get("work-summary") if isinstance(group, dict) else None
        if not isinstance(summaries, list):
            continue
        for summary in summaries:
            if not isinstance(summary, dict):
                continue
            title_block = summary.get("title") or {}
            title = ((title_block.get("title") or {}).get("value") or "Untitled").strip()
            journal = ((summary.get("journal-title") or {}).get("value") or "ORCID").strip()
            date = summary.get("publication-date") or {}
            year_raw = (date.get("year") or {}).get("value")
            month_raw = (date.get("month") or {}).get("value")
            doi = None
            external_ids = ((summary.get("external-ids") or {}).get("external-id") or [])
            for external_id in external_ids:
                if not isinstance(external_id, dict):
                    continue
                if str(external_id.get("external-id-type") or "").lower() == "doi":
                    doi = external_id.get("external-id-value")
            records.append(
                {
                    "pmid": None,
                    "title": title,
                    "authors": [],
                    "journal": journal,
                    "volume": None,
                    "issue": None,
                    "year": int(year_raw) if str(year_raw or "").isdigit() else datetime.now().year,
                    "month": int(month_raw) if str(month_raw or "").isdigit() else None,
                    "pages": None,
                    "doi": doi,
                    "abstract": None,
                    "pub_type": summary.get("type") or "Journal Article",
                    "mesh_terms": [],
                    "keywords": [],
                    "source": "orcid",
                    "epub_date": None,
                    "citation_count": None,
                }
            )
    return records


def merge_pubmed_orcid(
    pubmed_records: list[dict[str, Any]],
    orcid_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen_doi: set[str] = set()
    for record in pubmed_records:
        doi = str(record.get("doi") or "").lower()
        if doi:
            seen_doi.add(doi)
        merged.append(record)
    for record in orcid_records:
        doi = str(record.get("doi") or "").lower()
        if doi and doi in seen_doi:
            continue
        if doi:
            seen_doi.add(doi)
        merged.append(record)
    return merged


def enrich_with_crossref(
    records: list[dict[str, Any]],
    fetch_json: Callable[[str, dict[str, str] | None], dict[str, Any]],
    errors: list[str] | None = None,
) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for record in records:
        doi = str(record.get("doi") or "").strip()
        if not doi:
            enriched.append(record)
            continue
        next_record = dict(record)
        try:
            url = f"https://api.crossref.org/works/{urllib.parse.quote(doi, safe='')}"
            payload = fetch_json(url, {"User-Agent": CROSSREF_USER_AGENT})
            message = payload.get("message") if isinstance(payload, dict) else {}
            if isinstance(message, dict):
                count = message.get("is-referenced-by-count")
                if count is not None:
                    next_record["citation_count"] = int(count)
                if message.get("type"):
                    next_record["pub_type"] = str(message["type"])
                subjects = message.get("subject") or []
                if isinstance(subjects, list):
                    existing = [str(keyword) for keyword in (next_record.get("keywords") or [])]
                    additions = [str(subject) for subject in subjects if str(subject).strip()]
                    next_record["keywords"] = list(dict.fromkeys([*existing, *additions]))
        except Exception as exc:  # pragma: no cover - external service path
            if errors is not None:
                errors.append(f"Crossref enrichment failed for {doi}: {exc}")
        enriched.append(next_record)
    return enriched


def _month_number(value: str | None) -> int | None:
    if not value:
        return None
    months = {month.lower(): idx for idx, month in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
    if value.isdigit():
        return int(value)
    return months.get(value[:3].lower())


def _fetch_json(url: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def _fetch_text(url: str, headers: dict[str, str] | None = None) -> str:
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8")


def sync_publications(
    db_path: Path = DEFAULT_DB_PATH,
    *,
    allow_network: bool | None = None,
    fetch_json: Callable[[str, dict[str, str] | None], dict[str, Any]] | None = None,
    fetch_text: Callable[[str, dict[str, str] | None], str] | None = None,
) -> dict[str, Any]:
    ensure_feature_db(db_path)
    allow_network = (
        os.getenv("PUBLICATIONS_SYNC_NETWORK", "").lower() in {"1", "true", "yes"}
        if allow_network is None
        else allow_network
    )
    fetch_json = fetch_json or _fetch_json
    fetch_text = fetch_text or _fetch_text
    inserted = 0
    updated = 0
    errors: list[str] = []
    records: list[dict[str, Any]] = []

    if allow_network:
        try:
            query = urllib.parse.quote(
                '("Jessica Bradshaw"[Author]) AND ("University of South Carolina"[Affiliation]) AND '
                '("autism" OR "infant" OR "neurobehavior" OR "preterm" OR '
                '"respiratory sinus arrhythmia" OR "fragile X" OR "heart rate" OR '
                '"eye tracking" OR "developmental")'
            )
            esearch = (
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
                f"?db=pubmed&term={query}&retmax=200&retmode=json&tool=esd-lab-dashboard&email=research@esdlabsc.com"
            )
            search_payload = fetch_json(esearch, None)
            pmids = ((search_payload.get("esearchresult") or {}).get("idlist") or [])[:200]
            time.sleep(0.4)
            if pmids:
                efetch = (
                    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
                    f"?db=pubmed&id={','.join(pmids)}&rettype=abstract&retmode=xml"
                )
                records.extend(parse_pubmed_xml(fetch_text(efetch, None)))
        except Exception as exc:  # pragma: no cover - external service path
            errors.append(f"PubMed sync failed: {exc}")

        if DEFAULT_ORCID_ID:
            try:
                orcid_url = f"https://pub.orcid.org/v3.0/{DEFAULT_ORCID_ID}/works"
                orcid_records = parse_orcid_works(fetch_json(orcid_url, {"Accept": "application/json"}))
                records = merge_pubmed_orcid(records, orcid_records)
            except Exception as exc:  # pragma: no cover - external service path
                errors.append(f"ORCID sync failed: {exc}")

        records = enrich_with_crossref(records, fetch_json, errors)
    else:
        records = []

    with _connect(db_path) as conn:
        before_total = int(conn.execute("SELECT COUNT(*) FROM publications").fetchone()[0])
        for record in records:
            was_insert = upsert_publication(conn, record)
            inserted += was_insert
            updated += 0 if was_insert else 1
        after_total = int(conn.execute("SELECT COUNT(*) FROM publications").fetchone()[0])
        _write_sync_state(conn, inserted=inserted, updated=updated, errors=errors)
        if not records and not errors:
            _write_sync_state(conn, inserted=0, updated=0, errors=[])
        total = after_total or before_total

    return get_sync_status(db_path) | {"total": total}


def _write_sync_state(
    conn: sqlite3.Connection,
    *,
    inserted: int,
    updated: int,
    errors: list[str],
) -> None:
    total = int(conn.execute("SELECT COUNT(*) FROM publications").fetchone()[0])
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    new_this_week = int(
        conn.execute("SELECT COUNT(*) FROM publications WHERE created_at >= ?", (week_ago,)).fetchone()[0]
    )
    conn.execute(
        """
        INSERT INTO publication_sync_state (id, last_sync, total, inserted, updated, new_this_week, errors_json)
        VALUES ('default', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          last_sync = excluded.last_sync,
          total = excluded.total,
          inserted = excluded.inserted,
          updated = excluded.updated,
          new_this_week = excluded.new_this_week,
          errors_json = excluded.errors_json
        """,
        (now_iso(), total, inserted, updated, new_this_week, _json(errors)),
    )


def get_sync_status(db_path: Path = DEFAULT_DB_PATH) -> dict[str, Any]:
    ensure_feature_db(db_path)
    with _connect(db_path) as conn:
        row = conn.execute("SELECT * FROM publication_sync_state WHERE id = 'default'").fetchone()
        if row is None:
            _write_sync_state(conn, inserted=0, updated=0, errors=[])
            row = conn.execute("SELECT * FROM publication_sync_state WHERE id = 'default'").fetchone()
    return {
        "last_sync": row["last_sync"],
        "total": row["total"],
        "inserted": row["inserted"],
        "updated": row["updated"],
        "new_this_week": row["new_this_week"],
        "errors": _loads(row["errors_json"], []),
    }


def publication_tags(db_path: Path = DEFAULT_DB_PATH) -> list[dict[str, Any]]:
    ensure_feature_db(db_path)
    counts: dict[str, int] = {}
    with _connect(db_path) as conn:
        rows = conn.execute("SELECT tags_json FROM publications").fetchall()
    for row in rows:
        for tag in _loads(row["tags_json"], []):
            counts[tag] = counts.get(tag, 0) + 1
    return [{"tag": tag, "count": count} for tag, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))]


def list_publications(params: dict[str, Any], db_path: Path = DEFAULT_DB_PATH) -> dict[str, Any]:
    ensure_feature_db(db_path)
    page = max(0, int(params.get("page") or 0))
    page_size = min(100, max(10, int(params.get("pageSize") or 25)))
    where: list[str] = []
    values: list[Any] = []
    if params.get("yearMin"):
        where.append("year >= ?")
        values.append(int(params["yearMin"]))
    if params.get("yearMax"):
        where.append("year <= ?")
        values.append(int(params["yearMax"]))
    pub_type = params.get("pubType")
    if pub_type and pub_type != "All":
        where.append("pub_type = ?")
        values.append(pub_type)
    tags = params.get("tag") or []
    if isinstance(tags, str):
        tags = [tags]
    if tags:
        where.append("(" + " OR ".join("tags_json LIKE ?" for _ in tags) + ")")
        values.extend([f"%{tag}%" for tag in tags])
    search = str(params.get("search") or "").strip().lower()
    if search:
        where.append("(LOWER(title) LIKE ? OR LOWER(abstract) LIKE ? OR LOWER(authors_json) LIKE ?)")
        values.extend([f"%{search}%"] * 3)
    where_sql = f" WHERE {' AND '.join(where)}" if where else ""
    with _connect(db_path) as conn:
        total = int(conn.execute(f"SELECT COUNT(*) FROM publications{where_sql}", values).fetchone()[0])
        rows = conn.execute(
            f"SELECT * FROM publications{where_sql} ORDER BY year DESC, title ASC LIMIT ? OFFSET ?",
            [*values, page_size, page * page_size],
        ).fetchall()
    return {
        "publications": [publication_to_api(row) for row in rows],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "tag_counts": publication_tags(db_path),
    }


def get_publication(identifier: str, db_path: Path = DEFAULT_DB_PATH) -> dict[str, Any] | None:
    ensure_feature_db(db_path)
    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM publications WHERE pmid = ? OR doi = ?",
            (identifier, identifier),
        ).fetchone()
    return publication_to_api(row)


def update_publication_tags(
    identifier: str,
    tags: list[str],
    db_path: Path = DEFAULT_DB_PATH,
) -> dict[str, Any] | None:
    ensure_feature_db(db_path)
    cleaned = sorted({tag.strip() for tag in tags if tag.strip()})
    with _connect(db_path) as conn:
        before_row = conn.execute("SELECT * FROM publications WHERE pmid = ? OR doi = ?", (identifier, identifier)).fetchone()
        before = publication_to_api(before_row)
        if before is None:
            return None
        conn.execute(
            "UPDATE publications SET tags_json = ?, updated_at = datetime('now') WHERE pmid = ? OR doi = ?",
            (_json(cleaned), identifier, identifier),
        )
        after = get_publication(identifier, db_path)
        record_changelog(
            conn,
            entity_type="publication",
            entity_id=identifier,
            action="UPDATE",
            actor="admin",
            actor_role="pi",
            before=before,
            after=after or {},
            note="Manual tag override.",
        )
        return after


def _redact_value(field: str, value: Any) -> Any:
    return "[REDACTED]" if field.lower() in PHI_FIELDS else value


def compute_diff(before: dict[str, Any], after: dict[str, Any]) -> dict[str, list[Any]]:
    diff: dict[str, list[Any]] = {}
    for key in sorted(set(before) | set(after)):
        if json.dumps(before.get(key), sort_keys=True) == json.dumps(after.get(key), sort_keys=True):
            continue
        diff[key] = [_redact_value(key, before.get(key)), _redact_value(key, after.get(key))]
    return diff


def record_changelog(
    conn: sqlite3.Connection,
    *,
    entity_type: str,
    entity_id: str,
    action: str,
    actor: str,
    actor_role: str | None,
    before: dict[str, Any],
    after: dict[str, Any],
    session_id: str | None = None,
    note: str | None = None,
    version_tag: str | None = None,
) -> None:
    changed_fields = compute_diff(before, after)
    redacted_snapshot = {key: _redact_value(key, value) for key, value in after.items()}
    conn.execute(
        """
        INSERT INTO data_changelog (
          id, entity_type, entity_id, action, actor, actor_role, changed_fields_json,
          snapshot_json, session_id, ip_hash, note, ts, version_tag
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            hashlib.sha256(f"{entity_type}:{entity_id}:{action}:{time.time()}".encode()).hexdigest()[:32],
            entity_type,
            entity_id,
            action,
            actor,
            actor_role,
            _json(changed_fields) if changed_fields else None,
            _json(redacted_snapshot),
            session_id or hashlib.sha256(now_iso().encode()).hexdigest()[:16],
            None,
            note,
            now_iso(),
            version_tag,
        ),
    )


def _seed_changelog(conn: sqlite3.Connection) -> None:
    existing = int(
        conn.execute(
            "SELECT COUNT(*) FROM data_changelog WHERE entity_type = 'participant'"
        ).fetchone()[0]
    )
    if existing:
        return
    for row in _sample_participants()[:4]:
        before = {**row, "qa": "pending", "dob": "2024-01-01"}
        after = {**row, "dob": "2024-02-01"}
        record_changelog(
            conn,
            entity_type="participant",
            entity_id=row["id"],
            action="UPDATE" if row["qa"] == "pass" else "IMPORT",
            actor="system",
            actor_role="system",
            before=before,
            after=after,
            note="Demo changelog event from de-identified dashboard import.",
            version_tag=row.get("version_tag"),
        )


def changelog_entry(row: sqlite3.Row) -> dict[str, Any]:
    changed_fields = _loads(row["changed_fields_json"], None)
    snapshot = _loads(row["snapshot_json"], {})
    before = None
    after = None
    if isinstance(changed_fields, dict):
        before = {key: pair[0] for key, pair in changed_fields.items() if isinstance(pair, list) and len(pair) == 2}
        after = {key: pair[1] for key, pair in changed_fields.items() if isinstance(pair, list) and len(pair) == 2}
    return {
        "id": row["id"],
        "entity_type": row["entity_type"],
        "entity_id": row["entity_id"],
        "action": row["action"],
        "actor": row["actor"],
        "actor_role": row["actor_role"],
        "changed_fields": changed_fields,
        "before": before,
        "after": after or snapshot,
        "session_id": row["session_id"],
        "note": row["note"],
        "ts": row["ts"],
        "version_tag": row["version_tag"],
    }


def list_changelog(params: dict[str, Any], db_path: Path = DEFAULT_DB_PATH) -> dict[str, Any]:
    ensure_feature_db(db_path)
    page = max(0, int(params.get("page") or 0))
    page_size = min(100, max(10, int(params.get("pageSize") or 25)))
    where: list[str] = []
    values: list[Any] = []
    for key in ("entity_type", "entity_id", "actor", "action", "version_tag"):
        value = params.get(key)
        if value:
            where.append(f"{key} = ?")
            values.append(value)
    if params.get("from"):
        where.append("ts >= ?")
        values.append(params["from"])
    if params.get("to"):
        where.append("ts <= ?")
        values.append(params["to"])
    if params.get("search"):
        where.append("LOWER(COALESCE(note, '')) LIKE ?")
        values.append(f"%{str(params['search']).lower()}%")
    where_sql = f" WHERE {' AND '.join(where)}" if where else ""
    with _connect(db_path) as conn:
        total = int(conn.execute(f"SELECT COUNT(*) FROM data_changelog{where_sql}", values).fetchone()[0])
        rows = conn.execute(
            f"SELECT * FROM data_changelog{where_sql} ORDER BY ts DESC LIMIT ? OFFSET ?",
            [*values, page_size, page * page_size],
        ).fetchall()
    return {"rows": [changelog_entry(row) for row in rows], "total": total, "page": page, "pageSize": page_size}


def entity_history(entity_type: str, entity_id: str, db_path: Path = DEFAULT_DB_PATH) -> list[dict[str, Any]]:
    ensure_feature_db(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM data_changelog WHERE entity_type = ? AND entity_id = ? ORDER BY ts DESC",
            (entity_type, entity_id),
        ).fetchall()
    return [changelog_entry(row) for row in rows]


def changelog_diff(change_id: str, db_path: Path = DEFAULT_DB_PATH) -> dict[str, Any] | None:
    ensure_feature_db(db_path)
    with _connect(db_path) as conn:
        row = conn.execute("SELECT * FROM data_changelog WHERE id = ?", (change_id,)).fetchone()
    return changelog_entry(row) if row else None


def create_snapshot(
    tag: str,
    description: str,
    *,
    payload: dict[str, Any] | None = None,
    created_by: str = "admin",
    db_path: Path = DEFAULT_DB_PATH,
) -> dict[str, Any]:
    ensure_feature_db(db_path)
    rows = {
        "participants": virtual_table_rows("participants", payload),
        "runs": virtual_table_rows("runs", payload),
        "epochs": [],
        "publications": list_publications({"pageSize": 100}, db_path)["publications"],
    }
    row_counts = {key: len(value) for key, value in rows.items()}
    checksum = hashlib.sha256(json.dumps(rows, sort_keys=True, default=str).encode()).hexdigest()
    snapshot_id = hashlib.sha256(f"{tag}:{checksum}".encode()).hexdigest()[:32]
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO dataset_snapshots (id, tag, description, created_by, created_at, row_counts, checksum)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tag) DO UPDATE SET
              description = excluded.description,
              row_counts = excluded.row_counts,
              checksum = excluded.checksum
            """,
            (snapshot_id, tag, description or None, created_by, now_iso(), _json(row_counts), checksum),
        )
        record_changelog(
            conn,
            entity_type="dataset_snapshot",
            entity_id=tag,
            action="INSERT",
            actor=created_by,
            actor_role="pi",
            before={},
            after={"tag": tag, "row_counts": row_counts, "checksum": checksum},
            note=description or "Snapshot checkpoint created.",
            version_tag=tag,
        )
        row = conn.execute("SELECT * FROM dataset_snapshots WHERE tag = ?", (tag,)).fetchone()
    return snapshot_to_api(row)


def snapshot_to_api(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "tag": row["tag"],
        "description": row["description"],
        "created_by": row["created_by"],
        "created_at": row["created_at"],
        "row_counts": _loads(row["row_counts"], {}),
        "checksum": row["checksum"],
    }


def list_snapshots(db_path: Path = DEFAULT_DB_PATH) -> list[dict[str, Any]]:
    ensure_feature_db(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute("SELECT * FROM dataset_snapshots ORDER BY created_at DESC").fetchall()
    return [snapshot_to_api(row) for row in rows]


def export_snapshot(
    tag: str,
    payload: dict[str, Any] | None = None,
    db_path: Path = DEFAULT_DB_PATH,
) -> dict[str, Any] | None:
    ensure_feature_db(db_path)
    snapshot = next((item for item in list_snapshots(db_path) if item["tag"] == tag), None)
    if snapshot is None:
        return None
    return {
        "snapshot": snapshot,
        "data": {
            "participants": virtual_table_rows("participants", payload),
            "runs": virtual_table_rows("runs", payload),
            "publications": list_publications({"pageSize": 100}, db_path)["publications"],
        },
    }


def admin_capabilities() -> dict[str, bool]:
    can_admin = os.getenv("DASHBOARD_ADMIN_ENABLED", "").lower() in {"1", "true", "yes"}
    return {
        "canEditPublicationTags": can_admin,
        "canCreateSnapshots": can_admin,
        "canTriggerPublicationSync": True,
    }


def parse_query_params(query: dict[str, list[str]]) -> dict[str, Any]:
    parsed: dict[str, Any] = {}
    for key, values in query.items():
        if len(values) > 1:
            parsed[key] = values
        elif values:
            parsed[key] = values[0]
    for numeric_key in ("page", "pageSize", "yearMin", "yearMax"):
        if numeric_key in parsed:
            try:
                parsed[numeric_key] = int(parsed[numeric_key])
            except (TypeError, ValueError):
                parsed.pop(numeric_key, None)
    return parsed


def is_safe_snapshot_tag(tag: str) -> bool:
    return bool(re.fullmatch(r"[a-z0-9][a-z0-9._-]{2,80}", tag))
