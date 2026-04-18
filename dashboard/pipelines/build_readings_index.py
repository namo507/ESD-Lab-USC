"""Build metadata for the ESD Lab reading library.

Scans the committed ``ESD Lab readings`` directory, extracts stable file
metadata, enriches PDF records with lightweight document metadata when
available, and emits ``dashboard/data/readings_data.json`` for the live
dashboard.

The indexer is designed to stay resilient in lean environments:

- It falls back to filename-derived metadata if PDF parsing is unavailable.
- It can cache extracted records by file signature when explicitly requested.
- It emits only lightweight excerpts rather than full document text.
"""
from __future__ import annotations

import argparse
import json
import logging
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Optional
from urllib.parse import quote

try:  # pragma: no cover - exercised in the dashboard container
    from pypdf import PdfReader
except Exception:  # pragma: no cover - optional dependency for local-only runs
    PdfReader = None

logging.getLogger("pypdf").setLevel(logging.ERROR)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_READINGS_DIR = PROJECT_ROOT / "ESD Lab readings"
DEFAULT_OUTPUT = PROJECT_ROOT / "dashboard" / "data" / "readings_data.json"
DEFAULT_CACHE: Optional[Path] = None
INDEX_VERSION = 4
ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".ppt", ".pptx", ".md", ".txt"}
STOP_WORDS = {
    "a", "about", "address", "advances", "an", "and", "applying",
    "assessment", "author", "authors", "base", "behavior", "center",
    "centre", "chapter", "child", "children", "college", "contents",
    "copyright", "corresponding", "develo", "department", "develop",
    "development", "editor", "edited", "email", "for", "framework",
    "from", "full", "half", "in", "insight", "introduction", "into",
    "its", "journal", "lab", "of", "on", "page", "paper", "papers",
    "perspective", "perspectives", "research", "role", "school",
    "script", "secure", "series", "state", "states", "study", "the",
    "their", "these", "this", "title", "understanding", "university",
    "usa", "volume", "with", "words",
}
GENERIC_TITLES = {
    "", "contents", "copyright", "document", "full title page",
    "half title page", "microsoft word", "series page", "untitled",
}
GENERIC_TITLE_TOKENS = ("combined papers", "paper packet", "reading packet", "readings packet")
CHAPTER_LABEL_PATTERN = r"(?:[IVXLC]+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|[0-9]+)"
FRONT_MATTER_TOKENS = (
    "contents", "contributors", "copyright", "dedication", "front matter",
    "half title", "series page", "title page",
)
AUTHOR_REJECT_TOKENS = {
    "academic", "behavior", "carolina", "center", "centre", "cognition",
    "contributors", "development", "editor", "elsevier", "inc", "lab",
    "laboratory", "neurodevelopment", "neuroscience", "press", "research",
    "team",
}


def _atomic_write_json(output_path: Path, payload: dict) -> None:
    """Write JSON atomically so the dashboard never reads a partial file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    temp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    temp_path.replace(output_path)


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _clean_extracted_text(value: str) -> str:
    cleaned = value.replace("\x00", " ")
    replacements = {
        "\uf6dc": " ",
        "\ufb01": "fi",
        "\ufb02": "fl",
        "\u2020": " ",
        "\u2021": " ",
        "\u2217": " * ",
    }
    for needle, replacement in replacements.items():
        cleaned = cleaned.replace(needle, replacement)
    cleaned = re.sub(r"\b(?:e-?mail address|email address)\s*:\s*\S+", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\S+@\S+", " ", cleaned)
    cleaned = re.sub(r"\s+([,.;:])", r"\1", cleaned)
    cleaned = re.sub(r"([,;:])([A-Za-z])", r"\1 \2", cleaned)
    return _normalize_whitespace(cleaned)


def _strip_chapter_prefix(text: str) -> str:
    return re.sub(rf"^CHAPTER\s+{CHAPTER_LABEL_PATTERN}\s+", "", text, flags=re.IGNORECASE)


def _looks_like_affiliation(text: str) -> bool:
    lowered = text.lower()
    return any(
        marker in lowered
        for marker in (
            "department of",
            "school of",
            "university",
            "college of",
            "institute",
            "hospital",
            "center",
            "centre",
            "laboratory",
            "united states",
        )
    )


def _is_plausible_author_name(candidate: str) -> bool:
    cleaned = _normalize_whitespace(candidate.strip(" ,;:-"))
    tokens = [token.strip(".,") for token in cleaned.split() if token.strip(".,")]
    if len(tokens) < 2 or len(tokens) > 5:
        return False
    if _looks_like_affiliation(cleaned):
        return False
    if any(token.lower() in AUTHOR_REJECT_TOKENS for token in tokens):
        return False
    if not any(any(char.islower() for char in token) for token in tokens):
        return False
    return True


def is_noisy_title(title: str) -> bool:
    lowered = _normalize_whitespace(title).lower()
    return (
        len(lowered) > 180
        or any(marker in lowered for marker in ("corresponding author", "contents ", "department of", "university", "school of"))
    )


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "reading"


def _clean_pdf_value(value: Any) -> str:
    if value is None:
        return ""
    text = _clean_extracted_text(str(value))
    return text.strip("/ ")


def is_generic_title(title: str) -> bool:
    lowered = _normalize_whitespace(title).lower()
    return lowered in GENERIC_TITLES or any(token in lowered for token in GENERIC_TITLE_TOKENS)


def humanize_title(path: Path) -> str:
    """Turn a filename into a readable title without losing core wording."""
    stem = path.stem.replace("_", " ")
    stem = re.sub(r"\s*-\s*", " - ", stem)
    stem = stem.replace("-", " ")
    stem = _normalize_whitespace(stem)
    return stem


def extract_year(text: str) -> Optional[int]:
    match = re.search(r"\b(19|20)\d{2}\b", text)
    return int(match.group(0)) if match else None


def infer_source(*texts: str) -> str:
    """Infer the publication source from title, subject, and excerpt signals."""
    combined = " ".join(texts)
    lowered = combined.lower()
    if "advances in child development and behavior" in lowered or "advances in child" in lowered:
        return "Advances in Child Development and Behavior"
    if "child development perspectives" in lowered or "child dev perspectives" in lowered:
        return "Child Development Perspectives"
    if "journal of child psychology and psychiatry" in lowered:
        return "Journal of Child Psychology and Psychiatry"
    if any(token in lowered for token in ("research strategy", "researchstrategy", "specific aims", "specificaims", "grant")):
        return "Grant Materials"
    return "ESD Lab Reading Library"


def infer_category(*texts: str) -> str:
    """Assign a lightweight category from filename and PDF-content cues."""
    lowered = " ".join(texts).lower()
    rules = [
        ("Grant Materials", ("researchstrategy", "specificaims", "grant")),
        ("Front Matter", FRONT_MATTER_TOKENS),
        ("Autism and Development", ("autism", "ados", "cascade", "infant siblings")),
        ("Attention and Emotion", ("attention", "emotion")),
        ("Language and Communication", ("sound", "words", "language", "communication", "speech", "vocabulary")),
        ("Math and Spatial", ("math", "spatial", "numeracy")),
        ("Family and Parenting", ("family", "parenting", "community", "engagement")),
        ("Physiology and Autonomic", ("autonomic", "attachment", "heart", "hrv", "physiology", "vagal")),
        ("Developmental Theory", ("ability", "childhood", "concepts", "essentialism", "theory")),
    ]
    for label, tokens in rules:
        if any(token in lowered for token in tokens):
            return label
    return "Research Articles"


def _weighted_tokens(text: str, weight: int) -> Counter[str]:
    counts: Counter[str] = Counter()
    for token in re.findall(r"[A-Za-z][A-Za-z'-]+", text):
        lowered = token.lower().strip("-'")
        if lowered in STOP_WORDS or len(lowered) < 4:
            continue
        counts[lowered] += weight
    return counts


def infer_keywords(title: str, subject: str = "", excerpt: str = "") -> list[str]:
    scored = Counter()
    scored.update(_weighted_tokens(title, 4))
    scored.update(_weighted_tokens(subject, 3))
    scored.update(_weighted_tokens(excerpt, 1))
    return [token for token, _count in scored.most_common(6)]


def parse_authors(raw_author: str) -> list[str]:
    if not raw_author:
        return []
    authors: list[str] = []
    for candidate in re.split(r";|\n|\band\b|&", raw_author, flags=re.IGNORECASE):
        cleaned = _normalize_whitespace(candidate)
        if not cleaned:
            continue
        if "," in cleaned and cleaned.count(",") == 1:
            last, first = [part.strip() for part in cleaned.split(",", 1)]
            cleaned = _normalize_whitespace(f"{first} {last}")
        if not _is_plausible_author_name(cleaned):
            continue
        if cleaned not in authors:
            authors.append(cleaned)
    return authors


def format_authors(authors: list[str]) -> str:
    if not authors:
        return "Unknown authors"
    if len(authors) == 1:
        return authors[0]
    if len(authors) == 2:
        return f"{authors[0]} and {authors[1]}"
    return f"{authors[0]}, {authors[1]}, +{len(authors) - 2} more"


def _extract_author_block(excerpt: str, title: str = "") -> str:
    text = _strip_chapter_prefix(_clean_extracted_text(excerpt))
    if not text:
        return ""

    active_title = title or derive_title_from_excerpt(text)
    if active_title:
        title_match = re.search(re.escape(active_title), text, flags=re.IGNORECASE)
        if title_match:
            text = text[title_match.end():].strip(" ,;:-")

    stop_match = re.search(
        r"\b(?:Department|School|University|College|Institute|Hospital|Center|Centre|Laboratory|Lab|Contents|Keywords|Abstract|INTRODUCTION|Introduction|Edited by|Series Editor|Copyright)\b",
        text,
        flags=re.IGNORECASE,
    )
    if stop_match:
        text = text[:stop_match.start()].strip(" ,;:-")

    text = re.sub(r"\*+\s*Corresponding authors?.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\b[a-z]\b", " ", text)
    text = re.sub(r"\s*[*]+\s*", " ", text)
    text = re.sub(r"\s+(and|&)\s+", ", ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+,", ",", text)
    return _normalize_whitespace(text)


def extract_authors_from_excerpt(excerpt: str, title: str = "") -> list[str]:
    author_block = _extract_author_block(excerpt, title)
    if not author_block:
        return []

    authors: list[str] = []
    for match in re.finditer(r"[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}", author_block):
        cleaned = _normalize_whitespace(match.group(0).strip(" ,;:-"))
        lowered = cleaned.lower()
        if len(cleaned) < 5:
            continue
        if lowered.startswith("chapter "):
            continue
        if not _is_plausible_author_name(cleaned):
            continue
        if cleaned not in authors:
            authors.append(cleaned)
        if len(authors) == 6:
            break
    return authors


def build_excerpt(text: str, title: str = "", authors: Optional[list[str]] = None) -> str:
    normalized = _strip_chapter_prefix(_clean_extracted_text(text))
    if not normalized:
        return ""

    title_prefix = " ".join(title.split()[:8]).strip()
    if title_prefix and normalized.lower().startswith(title_prefix.lower()):
        has_body_marker = re.search(r"\b(Abstract|ABSTRACT|Introduction|INTRODUCTION)\b", normalized) is not None
        has_affiliation_marker = re.search(r"\b(University|Department|School|Contents|Corresponding)\b", normalized) is not None
        if has_affiliation_marker and not has_body_marker:
            return ""

    excerpt_source = normalized
    title_match = re.search(re.escape(title), excerpt_source, flags=re.IGNORECASE) if title else None
    if title_match:
        excerpt_source = excerpt_source[title_match.end():].strip(" ,;:-")

    author_block = _extract_author_block(normalized, title)
    if author_block and excerpt_source.lower().startswith(author_block.lower()):
        excerpt_source = excerpt_source[len(author_block):].strip(" ,;:-")

    excerpt_source = re.sub(r"\*+\s*Corresponding authors?.*$", "", excerpt_source, flags=re.IGNORECASE)

    for marker in (
        r"\bAbstract\b\s*[:.-]?\s*",
        r"\bABSTRACT\b\s*[:.-]?\s*",
        r"\bINTRODUCTION\b\s*[:.-]?\s*",
        r"\bIntroduction\b\s*[:.-]?\s*",
    ):
        match = re.search(marker, excerpt_source)
        if match:
            excerpt_source = excerpt_source[match.end():].strip()
            break

    excerpt_source = re.sub(
        r"^(?:Department|School|University|College|Institute|Hospital|Center|Centre|Laboratory|Lab|Language and Cognition Team|Carolina Autism and Neurodevelopment Research Center)[^.?!]{0,220}(?:[.?!]\s+|\s+)",
        "",
        excerpt_source,
        flags=re.IGNORECASE,
    )
    excerpt_source = _normalize_whitespace(excerpt_source)
    if not excerpt_source or _looks_like_affiliation(excerpt_source[:140]):
        return ""

    excerpt_parts: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+", excerpt_source):
        cleaned = _normalize_whitespace(sentence)
        if not cleaned:
            continue
        if cleaned.lower().startswith(("contents ", "keywords ", "series editor", "edited by", "copyright ")):
            continue
        next_text = " ".join(excerpt_parts + [cleaned]).strip()
        if len(next_text) > 320:
            break
        excerpt_parts.append(cleaned)
        if len(next_text) >= 170:
            break

    excerpt = " ".join(excerpt_parts).strip()
    if len(excerpt) < 80:
        return ""
    if len(excerpt) < len(excerpt_source):
        excerpt = excerpt.rstrip(". ") + "..."
    return excerpt


def derive_title_from_excerpt(excerpt: str) -> str:
    text = _strip_chapter_prefix(_clean_extracted_text(excerpt))
    if not text:
        return ""
    patterns = [
        r"^(?P<title>.+?)\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}(?:\s*,\s*[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3})*(?:\s*[∗*])?\s+\b(?:Department|School|University|College|Institute|Hospital|Center|Centre|Laboratory|Lab|Language|Carolina)\b",
        r"^(?P<title>.+?)\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}\s+[a-z](?:\s*,\s*[a-z])*(?:\s*,\s*[∗*])?",
        r"^(?P<title>.+?)\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}\s+[∗*]\s+[A-Z]",
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        title = _normalize_whitespace(match.group("title"))
        if len(title) >= 18:
            return title.rstrip(" ,;:-")

    fallback = text[:160].strip()
    if len(fallback) >= 18:
        return fallback.rstrip(" ,;:-")
    return ""


def extract_pdf_metadata(file_path: Path) -> dict[str, Any]:
    if PdfReader is None or file_path.suffix.lower() != ".pdf":
        return {"title": "", "authors": [], "subject": "", "page_count": None, "excerpt": ""}

    try:
        reader = PdfReader(str(file_path))
        metadata = reader.metadata or {}
        title = _clean_pdf_value(getattr(metadata, "title", "") or metadata.get("/Title"))
        author = _clean_pdf_value(getattr(metadata, "author", "") or metadata.get("/Author"))
        subject = _clean_pdf_value(getattr(metadata, "subject", "") or metadata.get("/Subject"))
        page_count = len(reader.pages)

        text_chunks: list[str] = []
        for page in reader.pages[:3]:
            try:
                text = page.extract_text() or ""
            except Exception:
                text = ""
            if text:
                text_chunks.append(text)
            if sum(len(chunk) for chunk in text_chunks) >= 2400:
                break

        return {
            "title": title,
            "authors": parse_authors(author),
            "subject": subject,
            "page_count": page_count,
            "excerpt": _clean_extracted_text(" ".join(text_chunks)),
        }
    except Exception:
        return {"title": "", "authors": [], "subject": "", "page_count": None, "excerpt": ""}


def choose_title(file_path: Path, pdf_title: str, excerpt: str) -> str:
    cleaned = _normalize_whitespace(pdf_title)
    if cleaned and not is_generic_title(cleaned) and not is_noisy_title(cleaned) and len(cleaned) >= 6:
        return cleaned
    excerpt_title = derive_title_from_excerpt(excerpt)
    if excerpt_title and not is_generic_title(excerpt_title) and not is_noisy_title(excerpt_title):
        return excerpt_title
    return humanize_title(file_path)


def build_search_text(*parts: str) -> str:
    return _normalize_whitespace(" ".join(part for part in parts if part))


def build_cache_signature(file_path: Path) -> str:
    stat = file_path.stat()
    return f"{INDEX_VERSION}:{stat.st_mtime_ns}:{stat.st_size}"


def load_cache(cache_path: Optional[Path]) -> dict[str, dict[str, Any]]:
    if cache_path is None or not cache_path.exists():
        return {}
    try:
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if payload.get("version") != INDEX_VERSION:
        return {}
    records = payload.get("records")
    return records if isinstance(records, dict) else {}


def select_featured_readings(readings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = sorted(
        readings,
        key=lambda item: (
            item.get("category") != "Front Matter",
            not item.get("is_packet"),
            bool(item.get("excerpt")),
            item.get("page_count") or 0,
            item.get("year") or 0,
            item.get("modified_at") or "",
        ),
        reverse=True,
    )

    featured: list[dict[str, Any]] = []
    for item in ranked:
        if item.get("category") == "Front Matter" and len(featured) >= 3:
            continue
        featured.append(item)
        if len(featured) == 4:
            break
    return featured


def build_reading_record(file_path: Path, base_dir: Path) -> dict:
    relative_path = file_path.relative_to(base_dir)
    stat = file_path.stat()
    filename_title = humanize_title(file_path)
    pdf_metadata = extract_pdf_metadata(file_path)
    title = choose_title(file_path, pdf_metadata["title"], pdf_metadata["excerpt"])
    modified_at = datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds")
    encoded_parts = [quote(part) for part in relative_path.parts]
    subject = pdf_metadata["subject"]
    raw_excerpt = pdf_metadata["excerpt"]
    authors = pdf_metadata["authors"] or extract_authors_from_excerpt(raw_excerpt, title)
    combined_text = " ".join(filter(None, [title, subject, raw_excerpt, filename_title, file_path.name]))
    category = infer_category(combined_text)
    if category == "Grant Materials" and not pdf_metadata["authors"]:
        authors = []
    excerpt = build_excerpt(raw_excerpt, title=title, authors=authors)
    if category == "Grant Materials" and not re.search(r"\b(Abstract|ABSTRACT|Introduction|INTRODUCTION)\b", raw_excerpt):
        excerpt = ""
    source = infer_source(title, subject, excerpt or raw_excerpt, filename_title)
    keywords = infer_keywords(title, subject, excerpt or raw_excerpt)
    page_count = pdf_metadata["page_count"]
    is_packet = is_generic_title(filename_title)
    fallback_excerpt = (
        f"Indexed reading from {source} focused on {category.lower()}."
        if not excerpt
        else excerpt
    )
    return {
        "id": _slugify(title),
        "title": title,
        "display_name": file_path.name,
        "relative_path": str(Path(base_dir.name) / relative_path),
        "relative_href": "../" + "/".join([quote(base_dir.name), *encoded_parts]),
        "extension": file_path.suffix.lower().lstrip("."),
        "year": extract_year(build_search_text(title, subject, filename_title, file_path.name)),
        "source": source,
        "category": category,
        "keywords": keywords,
        "authors": authors,
        "authors_display": format_authors(authors),
        "subject": subject,
        "page_count": page_count,
        "is_packet": is_packet,
        "excerpt": fallback_excerpt,
        "search_text": build_search_text(title, subject, fallback_excerpt, source, category, " ".join(authors), " ".join(keywords)),
        "size_mb": round(stat.st_size / (1024 * 1024), 2),
        "modified_at": modified_at,
        "is_recent": (datetime.now().timestamp() - stat.st_mtime) <= 30 * 24 * 60 * 60,
    }


def iter_readings(readings_dir: Path) -> Iterable[Path]:
    if not readings_dir.exists():
        return []
    files = [
        path for path in sorted(readings_dir.rglob("*"))
        if path.is_file() and path.suffix.lower() in ALLOWED_EXTENSIONS
    ]
    return files


def build_payload(readings_dir: Path = DEFAULT_READINGS_DIR, cache_path: Optional[Path] = None) -> dict:
    """Build the JSON payload consumed by the dashboard readings section."""
    cached_records = load_cache(cache_path)
    next_cache_records: dict[str, dict[str, Any]] = {}
    readings: list[dict[str, Any]] = []

    for path in iter_readings(readings_dir):
        relative_key = str(path.relative_to(readings_dir))
        signature = build_cache_signature(path)
        cached_record = cached_records.get(relative_key)
        if cached_record and cached_record.get("_signature") == signature and cached_record.get("_version") == INDEX_VERSION:
            record = dict(cached_record)
        else:
            record = build_reading_record(path, readings_dir)
        record["_signature"] = signature
        record["_version"] = INDEX_VERSION
        next_cache_records[relative_key] = record
        readings.append({key: value for key, value in record.items() if not key.startswith("_")})

    readings.sort(key=lambda item: (item["year"] or 0, item["modified_at"], item["title"]), reverse=True)

    category_counts = Counter(item["category"] for item in readings)
    year_counts = Counter(str(item["year"]) for item in readings if item["year"])
    source_counts = Counter(item["source"] for item in readings)
    format_counts = Counter(item["extension"] for item in readings)
    latest_modified_at = max((item["modified_at"] for item in readings), default=None)
    total_size_mb = round(sum(item["size_mb"] for item in readings), 2)
    total_pages = sum(item["page_count"] or 0 for item in readings)

    if cache_path is not None:
        _atomic_write_json(cache_path, {"version": INDEX_VERSION, "records": next_cache_records})

    return {
        "meta": {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "source_dir": str(readings_dir.relative_to(PROJECT_ROOT)) if readings_dir.is_relative_to(PROJECT_ROOT) else str(readings_dir),
            "total_readings": len(readings),
            "latest_modified_at": latest_modified_at,
            "pdf_metadata_enabled": PdfReader is not None,
        },
        "summary": {
            "total_readings": len(readings),
            "total_size_mb": total_size_mb,
            "total_pages": total_pages,
            "latest_modified_at": latest_modified_at,
            "categories": [
                {"label": label, "count": count}
                for label, count in category_counts.most_common()
            ],
            "years": [
                {"year": year, "count": count}
                for year, count in sorted(year_counts.items(), reverse=True)
            ],
            "sources": [
                {"label": label, "count": count}
                for label, count in source_counts.most_common()
            ],
            "formats": [
                {"label": label, "count": count}
                for label, count in sorted(format_counts.items())
            ],
        },
        "featured": select_featured_readings(readings),
        "readings": readings,
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Build ESD Lab readings metadata for the dashboard.")
    parser.add_argument(
        "--readings-dir",
        type=Path,
        default=DEFAULT_READINGS_DIR,
        help="Directory containing PDFs and other reading materials.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="JSON output path for the dashboard readings metadata.",
    )
    parser.add_argument(
        "--cache",
        type=Path,
        default=DEFAULT_CACHE,
        help="Optional cache file for PDF-derived metadata. Omit to rebuild directly from source files.",
    )
    args = parser.parse_args(argv)

    payload = build_payload(args.readings_dir, cache_path=args.cache)
    _atomic_write_json(args.output, payload)
    print(f"Wrote readings index -> {args.output}")
    print(f"  total_readings: {payload['summary']['total_readings']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())