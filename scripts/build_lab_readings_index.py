#!/usr/bin/env python3
"""
build_lab_readings_index.py
===========================

Produce `web/lab-readings.json` — the lean, browser-facing index used by
the dashboard's Knowledge Hub + AI chatbot retrieval layer.

Reads `dashboard/data/readings_data.json` (already produced by
`dashboard/pipelines/build_readings_index.py`) and emits a smaller payload
designed for in-browser retrieval:

- One entry per reading
- Stable id, title, year, category, source
- Cleaned author display string
- 280-char abstract excerpt
- Keyword array (5-8 tokens)
- Page count + size
- Suggested chart-bucket (so the visualizations panel can group
  readings by year / category without re-tokenizing client-side)

Optional: if `pdfplumber` is available locally, pull the first ~2000
characters of each PDF as a real abstract instead of the placeholder
text. Skipped in CI by default — the placeholder is good enough for
retrieval and keeps build deterministic.

Usage
-----
    python scripts/build_lab_readings_index.py
    python scripts/build_lab_readings_index.py --with-abstracts
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / "dashboard" / "data" / "readings_data.json"
OUT = REPO_ROOT / "web" / "lab-readings.json"
PDF_DIR = REPO_ROOT / "ESD Lab readings"
if not PDF_DIR.exists():
    PDF_DIR = REPO_ROOT.parent / "ESD Lab readings"


_STRIP_PUNCT = re.compile(r"[^\w\s\-]+")
_WS = re.compile(r"\s+")


def _clean(text: str) -> str:
    text = _STRIP_PUNCT.sub(" ", text or "")
    text = _WS.sub(" ", text).strip()
    return text


def _extract_abstract(pdf_path: pathlib.Path, max_chars: int = 2000) -> str:
    try:
        import pdfplumber  # type: ignore
    except ImportError:
        return ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            buf = []
            for page in pdf.pages[:3]:
                t = page.extract_text() or ""
                buf.append(t)
                if sum(len(x) for x in buf) >= max_chars:
                    break
            text = " ".join(buf)
            text = _WS.sub(" ", text).strip()
            return text[:max_chars]
    except Exception as e:  # pragma: no cover
        print(f"[warn] pdf extract failed for {pdf_path.name}: {e}", file=sys.stderr)
        return ""


def _bucket(category: str | None, year: int | None) -> str:
    cat = (category or "Other").strip()
    yr = year if year else "n/a"
    return f"{cat} · {yr}"


def build(with_abstracts: bool = False) -> pathlib.Path:
    if not SRC.exists():
        sys.exit(f"[build_lab_readings_index] missing {SRC}")

    data = json.loads(SRC.read_text(encoding="utf-8"))
    readings = data.get("readings", []) or data.get("featured", [])

    out_entries = []
    cat_counts: dict[str, int] = {}
    year_counts: dict[str, int] = {}
    bucket_counts: dict[str, int] = {}
    total_pages = 0
    total_mb = 0.0

    for r in readings:
        rid = r.get("id") or _clean(r.get("title", "")).lower().replace(" ", "-")[:80]
        title = r.get("title", "Untitled")
        year = r.get("year")
        cat = r.get("category", "Other")
        src = r.get("source", "")
        excerpt = r.get("excerpt") or ""
        keywords = r.get("keywords", [])[:8]
        pages = r.get("page_count", 0) or 0
        size_mb = r.get("size_mb", 0.0) or 0.0
        href = r.get("relative_href", "")
        display_name = r.get("display_name", "")

        # Optional real-abstract pull
        abstract = excerpt
        if with_abstracts and display_name:
            pdf = PDF_DIR / display_name
            if pdf.exists():
                real = _extract_abstract(pdf)
                if real:
                    abstract = real[:1200]

        entry = {
            "id": rid,
            "title": title,
            "year": year,
            "category": cat,
            "source": src,
            "keywords": keywords,
            "abstract": abstract,
            "page_count": pages,
            "size_mb": round(size_mb, 2),
            "href": href,
            "bucket": _bucket(cat, year),
        }
        out_entries.append(entry)

        cat_counts[cat] = cat_counts.get(cat, 0) + 1
        year_counts[str(year)] = year_counts.get(str(year), 0) + 1
        bucket_counts[entry["bucket"]] = bucket_counts.get(entry["bucket"], 0) + 1
        total_pages += pages
        total_mb += size_mb

    payload = {
        "generated_at": data.get("meta", {}).get("generated_at", ""),
        "summary": {
            "count": len(out_entries),
            "total_pages": total_pages,
            "total_size_mb": round(total_mb, 2),
            "by_category": cat_counts,
            "by_year": year_counts,
            "by_bucket": bucket_counts,
        },
        "readings": out_entries,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        f"[build_lab_readings_index] wrote {OUT.relative_to(REPO_ROOT)} "
        f"({len(out_entries)} entries, {total_pages} pages, "
        f"{total_mb:.1f} MB)"
    )
    return OUT


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--with-abstracts",
        action="store_true",
        help="Try to pull first 2000 chars of each PDF (needs pdfplumber).",
    )
    args = p.parse_args()
    build(with_abstracts=args.with_abstracts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
