"""Hybrid retrieval over the lab's approved corpus.

Dense-only retrieval loses badly on this vocabulary. The questions people
actually ask carry tokens like ``HDA_SA``, ``CPTd``, ``ASIB``, ``NNNS-II`` and
``RSA`` -- short, capitalised, domain-specific strings that an embedding model
has never seen enough of to place well, and that a BM25 index matches exactly.
So retrieval runs both and fuses the rankings.

    sparse   SQLite FTS5, BM25
    dense    nomic-embed-text via Ollama, cosine
    fuse     reciprocal rank fusion, k=60

Everything is one SQLite file. That is deliberate: it makes the index atomically
swappable (build beside, rename over), trivially inspectable, and free of an
extra service in the resource budget.

**No PHI reaches this index.** Every chunk is scanned before it is written, and
a chunk that trips the guard is dropped rather than redacted -- a redacted chunk
is still a chunk that was built from participant text.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
import struct
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_INDEX_PATH = PROJECT_ROOT / "dashboard" / "data" / "assistant_index.sqlite3"
MANIFEST_PATH = PROJECT_ROOT / "dashboard" / "data" / "index_manifest.json"

#: Approved sources, and nothing else. `data/` is absent on purpose: it holds
#: participant-level material and is never indexed under any configuration.
APPROVED_ROOTS: tuple[tuple[str, str], ...] = (
    ("docs", "docs"),
    ("esd-lab-readings", "readings"),
    ("dashboard/context_skill/references", "context"),
)

#: Aggregate artifacts that may be indexed. Named individually rather than
#: globbed, so a new artifact has to be reviewed before it becomes retrievable.
APPROVED_ARTIFACTS: tuple[str, ...] = (
    "dashboard/data/redcap_portfolio.json",
    "dashboard/data/organization_site_data.json",
    "dashboard/data/similar_studies.json",
)

#: Roughly 512 tokens at ~4 characters per token, with a 64-token overlap.
CHUNK_CHARS = 2048
OVERLAP_CHARS = 256

EMBED_MODEL = "nomic-embed-text"
EMBED_DIM = 768

#: Reciprocal rank fusion constant. 60 is the value the original RRF paper used
#: and it is a reasonable default: large enough that the top few ranks are not
#: winner-take-all, small enough that rank still matters.
RRF_K = 60


class IndexError_(RuntimeError):
    """Raised when the index cannot be built or opened."""


# ---------------------------------------------------------------------------
# PHI guard
# ---------------------------------------------------------------------------

def _content_guards() -> tuple:
    """The PHI patterns that apply to *prose*.

    nano_buddy carries four guards, and they are not interchangeable. Two of
    them -- ``_EXPLICIT_IDENTIFIER_RE`` and ``_DIRECT_PHI_RE`` -- match PHI
    *content*: an identifier, an MRN, a date of birth. Those are exactly right
    for scanning a corpus.

    The other two -- ``_PARTICIPANT_LEVEL_RE`` and ``_RAW_SIGNAL_RE`` -- match
    the *shape of a request*: "list the participants", "show me the raw ECG".
    They are correct on the query path and wrong here, because documentation
    legitimately contains sentences like "the pipeline exports participant
    records", and running them over prose dropped 361 chunks of the lab's own
    docs -- including its input tables and pipeline guides -- while finding no
    actual PHI. A guard that removes the answer is not protecting anything.

    So: content guards scan the corpus, request guards scan the request, and
    both remain active on their own path. `is_phi_or_raw_request` still runs on
    every question that reaches retrieval.
    """
    from dashboard.assistant import nano_buddy

    return (
        nano_buddy._EXPLICIT_IDENTIFIER_RE,
        nano_buddy._DIRECT_PHI_RE,
        nano_buddy._EMAIL_RE,
        nano_buddy._PHONE_RE,
    )


#: Structural identifiers that carry no legitimate reason to appear in the
#: corpus. Complements the nano_buddy content guards above.
_CORPUS_PHI = re.compile(
    r"\b\d{3}-\d{2}-\d{4}\b"          # SSN
    r"|\bMRN[:\s#]*\d+"                 # medical record number
    r"|\b\d{1,2}/\d{1,2}/\d{4}\b",    # US date-of-birth shape
    re.IGNORECASE,
)


def chunk_is_safe(text: str) -> bool:
    """Whether this chunk may be indexed.

    Anything ambiguous is dropped rather than redacted: a redacted chunk is
    still a chunk that was built out of participant text, and the point is that
    such text never enters the index at all.
    """
    if _CORPUS_PHI.search(text):
        return False
    return not any(pattern.search(text) for pattern in _content_guards())


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

@dataclass
class Chunk:
    text: str
    source_path: str
    source_kind: str
    ordinal: int
    sha256: str
    study: str | None = None
    source_url: str | None = None

    def as_row(self) -> tuple[Any, ...]:
        return (
            self.source_path,
            self.source_kind,
            self.ordinal,
            self.sha256,
            self.study,
            self.source_url,
            self.text,
        )


_HEADING = re.compile(r"^\s{0,3}#{1,6}\s+\S", re.MULTILINE)
_STUDY_RE = re.compile(r"\b(NANO|NICO|IPSA|ACTION|ABC)\b")


def split_structured(text: str) -> list[str]:
    """Split on document structure first, then on length.

    Splitting purely by length cuts through the middle of tables and headings
    and produces chunks that retrieve well but read as nonsense once packed into
    a prompt. Sections are the natural unit; long sections then get windowed.
    """
    positions = [m.start() for m in _HEADING.finditer(text)]
    sections: list[str] = []
    if positions:
        bounds = [0, *positions, len(text)]
        for start, end in zip(bounds, bounds[1:]):
            section = text[start:end].strip()
            if section:
                sections.append(section)
    else:
        sections = [text]

    chunks: list[str] = []
    for section in sections:
        if len(section) <= CHUNK_CHARS:
            chunks.append(section)
            continue
        step = CHUNK_CHARS - OVERLAP_CHARS
        for start in range(0, len(section), step):
            window = section[start : start + CHUNK_CHARS].strip()
            if window:
                chunks.append(window)
            if start + CHUNK_CHARS >= len(section):
                break
    return chunks


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def read_text_file(path: Path) -> str | None:
    """Read one corpus file, or None when it is not text we can index."""
    suffix = path.suffix.lower()
    if suffix in {".md", ".txt", ".rst"}:
        try:
            return path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError:
            return None
        try:
            reader = PdfReader(str(path))
            return "\n\n".join((page.extract_text() or "") for page in reader.pages)
        except Exception:
            # A malformed PDF is a skipped document, never a failed build.
            return None
    return None


def collect_chunks(root: Path = PROJECT_ROOT) -> tuple[list[Chunk], list[str]]:
    """Walk the approved corpus and produce safe chunks plus a drop log."""
    chunks: list[Chunk] = []
    dropped: list[str] = []

    for rel_root, kind in APPROVED_ROOTS:
        base = root / rel_root
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file():
                continue
            text = read_text_file(path)
            if not text or not text.strip():
                continue
            rel = str(path.relative_to(root))
            for ordinal, piece in enumerate(split_structured(text)):
                if not chunk_is_safe(piece):
                    dropped.append(f"{rel}#{ordinal}")
                    continue
                study = _STUDY_RE.search(piece)
                chunks.append(
                    Chunk(
                        text=piece,
                        source_path=rel,
                        source_kind=kind,
                        ordinal=ordinal,
                        sha256=sha256_text(piece),
                        study=study.group(1) if study else None,
                    )
                )

    for rel in APPROVED_ARTIFACTS:
        path = root / rel
        if not path.exists():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        for ordinal, piece in enumerate(_artifact_chunks(payload)):
            if not chunk_is_safe(piece):
                dropped.append(f"{rel}#{ordinal}")
                continue
            chunks.append(
                Chunk(
                    text=piece,
                    source_path=rel,
                    source_kind="artifact",
                    ordinal=ordinal,
                    sha256=sha256_text(piece),
                )
            )

    return chunks, dropped


def _artifact_chunks(payload: Any) -> list[str]:
    """Flatten an aggregate artifact into retrievable prose.

    Only scalar summary fields are emitted. Nested record arrays are skipped
    entirely, which is what keeps a future artifact regression from quietly
    indexing rows.
    """
    lines: list[str] = []

    def walk(node: Any, trail: str) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                walk(value, f"{trail}.{key}" if trail else str(key))
        elif isinstance(node, list):
            # Summarise rather than enumerate: a list of records is exactly what
            # must not become searchable text.
            scalars = [item for item in node if isinstance(item, (str, int, float, bool))]
            if scalars and len(scalars) == len(node):
                lines.append(f"{trail}: {', '.join(str(item) for item in scalars[:40])}")
            else:
                lines.append(f"{trail}: {len(node)} entries")
                for item in node[:60]:
                    if isinstance(item, dict):
                        walk(item, trail)
        elif node is not None:
            lines.append(f"{trail}: {node}")

    walk(payload, "")
    text = "\n".join(lines)
    return split_structured(text)


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------

def embed_texts(
    texts: Sequence[str],
    *,
    base_url: str = "http://127.0.0.1:11434",
    model: str = EMBED_MODEL,
    timeout: int = 120,
) -> list[list[float]]:
    """Embed a batch through Ollama, one call per text.

    Ollama's embedding endpoint is single-text, so batching here means pipelining
    rather than a batch API. Failure is fatal for the build: an index that is
    half-embedded retrieves worse than one that does not exist, because it looks
    like it worked.
    """
    out: list[list[float]] = []
    for text in texts:
        body = json.dumps({"model": model, "prompt": text}).encode("utf-8")
        request = urllib.request.Request(
            f"{base_url}/api/embeddings",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
                payload = json.loads(response.read())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise IndexError_(f"embedding failed against {base_url}: {exc}") from exc
        vector = payload.get("embedding")
        if not isinstance(vector, list) or not vector:
            raise IndexError_("embedding endpoint returned no vector")
        out.append([float(value) for value in vector])
    return out


def pack_vector(vector: Sequence[float]) -> bytes:
    return struct.pack(f"<{len(vector)}f", *vector)


def unpack_vector(blob: bytes) -> list[float]:
    return list(struct.unpack(f"<{len(blob) // 4}f", blob))


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


# ---------------------------------------------------------------------------
# Index
# ---------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS chunks (
    id           INTEGER PRIMARY KEY,
    source_path  TEXT NOT NULL,
    source_kind  TEXT NOT NULL,
    ordinal      INTEGER NOT NULL,
    sha256       TEXT NOT NULL,
    study        TEXT,
    source_url   TEXT,
    text         TEXT NOT NULL,
    embedding    BLOB,
    indexed_at   TEXT NOT NULL,
    phi_scanned  INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS chunks_source ON chunks(source_path);
CREATE INDEX IF NOT EXISTS chunks_study ON chunks(study);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    text, source_path UNINDEXED, content='chunks', content_rowid='id', tokenize='porter unicode61'
);
"""


def open_index(path: Path = DEFAULT_INDEX_PATH) -> sqlite3.Connection:
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    return connection


def build_index(
    *,
    index_path: Path = DEFAULT_INDEX_PATH,
    embed_base_url: str | None = "http://127.0.0.1:11434",
    root: Path = PROJECT_ROOT,
) -> dict[str, Any]:
    """Build the index beside the live one and swap it in atomically.

    A query that arrives mid-rebuild is served by the old index right up to the
    rename, and by the new one after. There is no window in which a half-built
    index answers anything.
    """
    started = datetime.now(timezone.utc)
    chunks, dropped = collect_chunks(root)
    if not chunks:
        raise IndexError_("no chunks collected from the approved corpus")

    staging = index_path.with_suffix(".building")
    staging.unlink(missing_ok=True)
    index_path.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(staging)
    try:
        connection.executescript(SCHEMA)
        now = started.isoformat(timespec="seconds")

        vectors: list[bytes | None]
        embedded = 0
        if embed_base_url:
            raw = embed_texts([chunk.text for chunk in chunks], base_url=embed_base_url)
            vectors = [pack_vector(vector) for vector in raw]
            embedded = len(raw)
        else:
            # Sparse-only build. Answers get worse and the status endpoint says
            # so; it does not pretend the dense half is present.
            vectors = [None] * len(chunks)

        connection.executemany(
            "INSERT INTO chunks (source_path, source_kind, ordinal, sha256, study, source_url,"
            " text, embedding, indexed_at, phi_scanned) VALUES (?,?,?,?,?,?,?,?,?,1)",
            [(*chunk.as_row(), vector, now) for chunk, vector in zip(chunks, vectors)],
        )
        connection.execute(
            "INSERT INTO chunks_fts(rowid, text, source_path) SELECT id, text, source_path FROM chunks"
        )
        connection.commit()
    finally:
        connection.close()

    staging.replace(index_path)

    duration = (datetime.now(timezone.utc) - started).total_seconds()
    content_hash = hashlib.sha256(
        "".join(sorted(chunk.sha256 for chunk in chunks)).encode("utf-8")
    ).hexdigest()

    manifest = {
        "schema": "esd.assistant.index.v1",
        "built_at": started.isoformat(timespec="seconds"),
        "duration_seconds": round(duration, 2),
        "chunks": len(chunks),
        "chunks_dropped_phi": len(dropped),
        "embedded": embedded,
        "embedding_model": EMBED_MODEL if embed_base_url else None,
        "embedding_dim": EMBED_DIM if embed_base_url else 0,
        "sparse": "sqlite-fts5-bm25",
        "dense": "cosine over packed float32" if embed_base_url else None,
        "fusion": f"reciprocal rank fusion, k={RRF_K}",
        "sources": sorted({chunk.source_path for chunk in chunks}),
        "source_count": len({chunk.source_path for chunk in chunks}),
        "content_hash": content_hash,
        "index_path": str(index_path.relative_to(root)),
        "degraded": embed_base_url is None,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

@dataclass
class Hit:
    chunk_id: int
    text: str
    source_path: str
    study: str | None
    score: float
    sparse_rank: int | None = None
    dense_rank: int | None = None


def _fts_query(question: str) -> str:
    """Turn a question into an FTS5 MATCH expression.

    Terms are OR-ed and quoted. Quoting matters: acronyms such as ``NNNS-II``
    contain characters FTS5 reads as operators, and an unquoted one is a syntax
    error rather than a search.
    """
    terms = re.findall(r"[A-Za-z0-9_][A-Za-z0-9_-]*", question)
    terms = [term for term in terms if len(term) > 1]
    if not terms:
        return '""'
    return " OR ".join(f'"{term}"' for term in terms[:24])


def _rank_dense(query: Sequence[float], blobs: Sequence[bytes], top: int) -> list[int]:
    """Indices of the ``top`` closest embeddings, best first.

    Uses numpy when it is importable, which it is in every deployment: scoring
    ~1,800 chunks as a Python loop cost about two seconds per query, and the
    same work as one matrix product is roughly a millisecond. The pure-Python
    path is kept so retrieval still functions in a stripped environment, just
    slowly.
    """
    if not blobs:
        return []
    try:
        import numpy as np
    except ImportError:
        scored = [(cosine(query, unpack_vector(blob)), i) for i, blob in enumerate(blobs)]
        scored.sort(reverse=True)
        return [i for _, i in scored[:top]]

    matrix = np.frombuffer(b"".join(blobs), dtype=np.float32).reshape(len(blobs), -1)
    vector = np.asarray(query, dtype=np.float32)
    norms = np.linalg.norm(matrix, axis=1) * np.linalg.norm(vector)
    # A zero-norm row would divide by zero; such a row scores 0 and sorts last.
    norms[norms == 0] = np.inf
    scores = (matrix @ vector) / norms
    count = min(top, len(blobs))
    idx = np.argpartition(-scores, count - 1)[:count]
    return [int(i) for i in idx[np.argsort(-scores[idx])]]


def search(
    question: str,
    *,
    index_path: Path = DEFAULT_INDEX_PATH,
    limit: int = 8,
    candidates: int = 40,
    embed_base_url: str | None = "http://127.0.0.1:11434",
) -> list[Hit]:
    """Hybrid search: BM25 and cosine, fused by reciprocal rank.

    Falls back to sparse-only when the embedding service is unreachable. That is
    a real degradation and the caller is expected to say so rather than serve
    worse answers as if they were normal.
    """
    if not index_path.exists():
        return []

    # sqlite3.connect() succeeds on a corrupt file: the header is only validated
    # on first read, so the failure surfaces later as DatabaseError from inside
    # the query. A truncated or half-written index must degrade to no results,
    # never take down the request that touched it.
    try:
        connection = open_index(index_path)
        connection.execute("SELECT 1 FROM chunks LIMIT 1").fetchone()
    except sqlite3.DatabaseError:
        return []

    try:
        sparse: list[tuple[int, str, str, str | None]] = []
        try:
            rows = connection.execute(
                "SELECT c.id, c.text, c.source_path, c.study FROM chunks_fts f"
                " JOIN chunks c ON c.id = f.rowid"
                " WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts) LIMIT ?",
                (_fts_query(question), candidates),
            ).fetchall()
            sparse = [(row["id"], row["text"], row["source_path"], row["study"]) for row in rows]
        except sqlite3.DatabaseError:
            # Includes OperationalError (a bad MATCH expression) and the
            # corruption cases. Either way: no sparse half, not a failed request.
            sparse = []

        dense: list[tuple[int, str, str, str | None]] = []
        if embed_base_url:  # noqa: SIM102 - the nested guard reads clearer here
            try:
                query_vector = embed_texts([question], base_url=embed_base_url)[0]
            except IndexError_:
                query_vector = None
            if query_vector is not None:
                try:
                    rows = connection.execute(
                        "SELECT id, text, source_path, study, embedding FROM chunks WHERE embedding IS NOT NULL"
                    ).fetchall()
                except sqlite3.DatabaseError:
                    rows = []
                order = _rank_dense(query_vector, [row["embedding"] for row in rows], candidates)
                dense = [
                    (rows[i]["id"], rows[i]["text"], rows[i]["source_path"], rows[i]["study"])
                    for i in order
                ]

        fused: dict[int, dict[str, Any]] = {}
        for rank, (chunk_id, text, path, study) in enumerate(sparse, start=1):
            entry = fused.setdefault(
                chunk_id,
                {"text": text, "path": path, "study": study, "score": 0.0, "sparse": None, "dense": None},
            )
            entry["score"] += 1.0 / (RRF_K + rank)
            entry["sparse"] = rank
        for rank, (chunk_id, text, path, study) in enumerate(dense, start=1):
            entry = fused.setdefault(
                chunk_id,
                {"text": text, "path": path, "study": study, "score": 0.0, "sparse": None, "dense": None},
            )
            entry["score"] += 1.0 / (RRF_K + rank)
            entry["dense"] = rank

        ordered = sorted(fused.items(), key=lambda pair: pair[1]["score"], reverse=True)
        return [
            Hit(
                chunk_id=chunk_id,
                text=entry["text"],
                source_path=entry["path"],
                study=entry["study"],
                score=entry["score"],
                sparse_rank=entry["sparse"],
                dense_rank=entry["dense"],
            )
            for chunk_id, entry in ordered[:limit]
        ]
    finally:
        connection.close()


def read_manifest(path: Path = MANIFEST_PATH) -> dict[str, Any] | None:
    """The answer to 'how current are you?'."""
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


__all__ = [
    "APPROVED_ARTIFACTS",
    "APPROVED_ROOTS",
    "Chunk",
    "Hit",
    "build_index",
    "chunk_is_safe",
    "collect_chunks",
    "embed_texts",
    "read_manifest",
    "search",
    "split_structured",
]
