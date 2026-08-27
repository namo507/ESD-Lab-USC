#!/usr/bin/env python3
"""Track studies comparable to NANO, NICO, IPSA, ACTION and ABC.

Uses the official APIs rather than scraping. ClinicalTrials.gov, PubMed and NIH
RePORTER all publish documented, rate-limit-friendly endpoints intended for
exactly this; scraping their HTML would be slower, more fragile, and ruder.

    python dashboard/pipelines/build_similar_studies.py
    python dashboard/pipelines/build_similar_studies.py --study nano --limit 10

Output is ``dashboard/data/similar_studies.json`` plus a ``changes`` array
diffing against the previous snapshot. Every fetch failure is non-fatal: the
last good snapshot is kept and marked stale, because writing an empty snapshot
over a good one turns a transient outage into data loss.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

OUTPUT = PROJECT_ROOT / "dashboard" / "data" / "similar_studies.json"
CACHE_DIR = PROJECT_ROOT / "dashboard" / "data" / ".similar_studies_cache"

USER_AGENT = (
    "ESD-Lab-Dashboard/1.0 (+https://esd-lab-namo.pages.dev; "
    "research study landscape; contact esdlab@sc.edu)"
)

CTGOV = "https://clinicaltrials.gov/api/v2/studies"
PUBMED = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
REPORTER = "https://api.reporter.nih.gov/v2/projects/search"

#: Never more than two concurrent requests per host, and a pause between them.
#: esdlabsc.com rate-limited during reconnaissance and these hosts will too.
REQUEST_PAUSE_SECONDS = 0.7

#: Seed profiles, built from the lab's own study descriptions. These are search
#: terms, not claims about the studies -- they describe the population and
#: design well enough to find comparable work.
SEED_PROFILES: dict[str, dict[str, Any]] = {
    "nano": {
        "label": "NANO",
        "terms": ["preterm infant autonomic nervous system development",
                  "very preterm infant heart rate variability neurodevelopment"],
        "population": "very preterm infants (24-32 weeks) and infant siblings",
        "design": "longitudinal, birth to 36 months",
    },
    "nico": {
        "label": "NICO",
        "terms": ["NICU discharge preterm infant follow-up thermoregulation",
                  "preterm infant skin temperature heart rate 12 month outcome"],
        "population": "preterm infants exiting the NICU",
        "design": "longitudinal, under 1 month to 12 months",
    },
    "ipsa": {
        "label": "IPSA",
        "terms": ["infant siblings autism social attention longitudinal",
                  "infant predictors of social attention autism likelihood"],
        "population": "infants at high and low likelihood of autism",
        "design": "longitudinal, birth to 36 months",
    },
    "action": {
        "label": "ACTION",
        "terms": ["head-mounted eye tracking infant parent play interaction",
                  "infant eye tracking motor temperament 4 8 18 months"],
        "population": "infants at high and low likelihood of autism",
        "design": "in-home, 4/8/18 months",
    },
    "abc": {
        "label": "ABC",
        "terms": ["infant ADHD likelihood attention longitudinal 12 24 36 months",
                  "elevated likelihood ADHD infant sibling attention assessment"],
        "population": "infants at elevated likelihood for ADHD",
        "design": "lab-based, 12/24/36 months",
    },
}


def _fetch(url: str, *, timeout: int = 30, attempts: int = 3) -> bytes | None:
    """GET with backoff. Returns None rather than raising: a source that is down
    must degrade the snapshot, never fail the pipeline."""
    delay = 1.0
    for attempt in range(attempts):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
                time.sleep(REQUEST_PAUSE_SECONDS)
                return response.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                # Rate limited. Back off hard; do not hammer.
                time.sleep(delay * 4)
                delay *= 2
                continue
            if 500 <= exc.code < 600 and attempt + 1 < attempts:
                time.sleep(delay)
                delay *= 2
                continue
            return None
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt + 1 < attempts:
                time.sleep(delay)
                delay *= 2
                continue
            return None
    return None


def query_clinicaltrials(terms: Iterable[str], limit: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for term in terms:
        params = urllib.parse.urlencode({
            "query.term": term,
            "pageSize": min(limit, 25),
            "fields": "NCTId,BriefTitle,OverallStatus,StartDate,LeadSponsorName,BriefSummary",
        })
        raw = _fetch(f"{CTGOV}?{params}")
        if raw is None:
            continue
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for study in payload.get("studies", []):
            protocol = study.get("protocolSection", {})
            ident = protocol.get("identificationModule", {})
            status = protocol.get("statusModule", {})
            nct = ident.get("nctId")
            if not nct:
                continue
            out.append({
                "source": "clinicaltrials.gov",
                "id": nct,
                "title": ident.get("briefTitle", ""),
                "status": status.get("overallStatus", ""),
                "started": status.get("startDateStruct", {}).get("date", ""),
                "url": f"https://clinicaltrials.gov/study/{nct}",
                "matched_term": term,
            })
    return out


def query_pubmed(terms: Iterable[str], limit: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for term in terms:
        params = urllib.parse.urlencode({
            "db": "pubmed", "term": term, "retmax": min(limit, 20),
            "retmode": "json", "sort": "date",
        })
        raw = _fetch(f"{PUBMED}/esearch.fcgi?{params}")
        if raw is None:
            continue
        try:
            ids = json.loads(raw).get("esearchresult", {}).get("idlist", [])
        except json.JSONDecodeError:
            continue
        if not ids:
            continue
        summary = _fetch(
            f"{PUBMED}/esummary.fcgi?"
            + urllib.parse.urlencode({"db": "pubmed", "id": ",".join(ids), "retmode": "json"})
        )
        if summary is None:
            continue
        try:
            result = json.loads(summary).get("result", {})
        except json.JSONDecodeError:
            continue
        for pmid in ids:
            entry = result.get(pmid)
            if not isinstance(entry, dict):
                continue
            out.append({
                "source": "pubmed",
                "id": pmid,
                "title": entry.get("title", ""),
                "status": entry.get("pubdate", ""),
                "started": entry.get("pubdate", ""),
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                "matched_term": term,
            })
    return out


def query_reporter(terms: Iterable[str], limit: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for term in terms:
        body = json.dumps({
            "criteria": {"advanced_text_search": {"operator": "and", "search_field": "all", "search_text": term}},
            "include_fields": ["ProjectNum", "ProjectTitle", "FiscalYear", "Organization"],
            "limit": min(limit, 25),
        }).encode("utf-8")
        request = urllib.request.Request(
            REPORTER, data=body,
            headers={"User-Agent": USER_AGENT, "Content-Type": "application/json", "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310
                payload = json.loads(response.read())
            time.sleep(REQUEST_PAUSE_SECONDS)
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
            continue
        for project in payload.get("results", []):
            number = project.get("project_num")
            if not number:
                continue
            out.append({
                "source": "nih-reporter",
                "id": number,
                "title": project.get("project_title", ""),
                "status": str(project.get("fiscal_year", "")),
                "started": str(project.get("fiscal_year", "")),
                "url": f"https://reporter.nih.gov/search/{urllib.parse.quote(number)}/projects",
                "matched_term": term,
            })
    return out


def dedupe(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        key = (row["source"], row["id"])
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def diff(previous: dict[str, Any] | None, current: dict[str, Any]) -> list[dict[str, Any]]:
    """New, updated, and withdrawn entries against yesterday's snapshot."""
    if not previous:
        return [{"change": "initial", "count": sum(len(v["matches"]) for v in current["studies"].values())}]

    changes: list[dict[str, Any]] = []
    for key, block in current["studies"].items():
        before = {(m["source"], m["id"]): m for m in previous.get("studies", {}).get(key, {}).get("matches", [])}
        after = {(m["source"], m["id"]): m for m in block["matches"]}
        for ident, row in after.items():
            if ident not in before:
                changes.append({"change": "new", "study": key, "source": row["source"],
                                "id": row["id"], "title": row["title"], "url": row["url"]})
            elif before[ident].get("status") != row.get("status"):
                changes.append({"change": "updated", "study": key, "source": row["source"],
                                "id": row["id"], "from": before[ident].get("status"), "to": row.get("status")})
        for ident, row in before.items():
            if ident not in after:
                changes.append({"change": "withdrawn", "study": key, "source": row["source"], "id": row["id"]})
    return changes


def load_previous() -> dict[str, Any] | None:
    if not OUTPUT.exists():
        return None
    try:
        return json.loads(OUTPUT.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--study", action="append", choices=sorted(SEED_PROFILES), default=None)
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--offline", action="store_true", help="skip network; re-emit the previous snapshot")
    args = parser.parse_args(argv)

    keys = args.study or sorted(SEED_PROFILES)
    previous = load_previous()

    if args.offline:
        if previous is None:
            print("no previous snapshot to re-emit", file=sys.stderr)
            return 1
        previous["stale"] = True
        OUTPUT.write_text(json.dumps(previous, indent=2) + "\n", encoding="utf-8")
        print("re-emitted previous snapshot, marked stale")
        return 0

    studies: dict[str, Any] = {}
    degraded: list[str] = []
    for key in keys:
        profile = SEED_PROFILES[key]
        terms = profile["terms"]
        matches = dedupe(
            query_clinicaltrials(terms, args.limit)
            + query_pubmed(terms, args.limit)
            + query_reporter(terms, args.limit)
        )
        if not matches:
            degraded.append(key)
        studies[key] = {
            "label": profile["label"],
            "population": profile["population"],
            "design": profile["design"],
            "terms": terms,
            "matches": matches[: args.limit * 3],
        }

    current = {
        "schema": "esd.similar_studies.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": ["clinicaltrials.gov/api/v2", "eutils.ncbi.nlm.nih.gov", "api.reporter.nih.gov/v2"],
        "sla_seconds": 172_800,
        "studies": studies,
        "degraded_studies": degraded,
        "stale": False,
    }

    total = sum(len(block["matches"]) for block in studies.values())
    if total == 0 and previous is not None:
        # Every source failed. Keep the good snapshot; never overwrite it with
        # nothing, which would look like "no comparable work exists".
        previous["stale"] = True
        OUTPUT.write_text(json.dumps(previous, indent=2) + "\n", encoding="utf-8")
        print("all sources failed; kept previous snapshot and marked it stale", file=sys.stderr)
        return 0

    current["changes"] = diff(previous, current)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")

    print(f"{total} comparable records across {len(studies)} studies")
    for change in current["changes"][:12]:
        print(f"  {change.get('change'):<10} {change.get('study', '')} {change.get('title', '')[:70]}")
    if degraded:
        print(f"  no matches for: {', '.join(degraded)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
