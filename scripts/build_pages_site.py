#!/usr/bin/env python3
"""
Package the React dashboard for Cloudflare Pages.

Inputs
------
- web/build/                            :: Vite production build output
- dashboard/public/pages_wrapper/manifest.json
                                        :: latest live tunnel origin used to
                                           derive the /api proxy target

Outputs
-------
- dist/pages-wrapper/                   :: Cloudflare Pages deploy artifact
   - index.html with deploy metadata
   - assets/* copied from the Vite build
    - _worker.js for /api proxy + SPA asset fallback
    - _redirects for static SPA fallback

Run locally
-----------
    cd web && VITE_USE_MOCKS=false VITE_LIVE_ASSISTANT=true npm run build
    python scripts/build_pages_site.py
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from urllib.parse import urlparse

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_BUILD_DIR = REPO_ROOT / "web" / "build"
DEFAULT_OUT_DIR = REPO_ROOT / "dist" / "pages-wrapper"
DEFAULT_MANIFEST = (
    REPO_ROOT / "dashboard" / "public" / "pages_wrapper" / "manifest.json"
)

PUBLIC_NANO_FORBIDDEN_KEYS = {
    "participant",
    "participants",
    "participant_id",
    "participant_ids",
    "token",
    "api_token",
    "primary_key",
    "primary_key_field",
    "record_id",
    "record_ids",
    "subject_id",
    "subject_ids",
    "mrn",
    "dob",
    "date_of_birth",
    "first_name",
    "last_name",
    "free_text",
    "notes",
    "raw_signal",
    "waveform",
    "flagged_participants",
    "individual_traces",
    "hda_features",
}
PUBLIC_NANO_ID_RE = re.compile(r"\b(?:NANO|ASIB|PT|TD|VPT)[-_ ]?\d+\b", re.I)
PUBLIC_BUDDY_DOCUMENT_SUFFIXES = {".md", ".txt", ".rst"}
PUBLIC_METRICS_SCHEMA = "dashboard.metrics.v1"
PUBLIC_METRICS_VERSION_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
PUBLIC_METRICS_SMALL_CELL_THRESHOLD = 5
PUBLIC_METRICS_PROJECT_IDS = {
    "abc_surveys": 1140,
    "ipsa_surveys": 1289,
    "action": 1556,
    "ipsa_lab": 2084,
    "abc_lab": 2263,
    "nico": 3836,
    "nano_surveys": 4218,
    "nano_lab": 5484,
}
PUBLIC_METRICS_STUDY_PROJECTS = {
    "abc": 2,
    "ipsa": 2,
    "action": 1,
    "nico": 1,
    "nano": 2,
}
PUBLIC_METRICS_ENROLLMENT_AUTHORITIES = {
    "abc_surveys",
    "ipsa_surveys",
    "action",
    "nico",
    "nano_surveys",
}
PUBLIC_METRICS_PATH = "/dashboard/data/dashboard_metrics.json"
PUBLIC_METRICS_HEADER_RULE = f"""{PUBLIC_METRICS_PATH}
  Cache-Control: no-store, max-age=0, must-revalidate
  Content-Type: application/json; charset=utf-8
  X-Content-Type-Options: nosniff
"""


def _read(path: pathlib.Path) -> str:
    if not path.exists():
        sys.exit(f"[build_pages_site] missing required file: {path}")
    return path.read_text(encoding="utf-8")


def _write_pages_headers(out_dir: pathlib.Path) -> pathlib.Path:
    """Ensure the live aggregate artifact is never cached or content-sniffed."""

    headers_path = out_dir / "_headers"
    existing = headers_path.read_text(encoding="utf-8") if headers_path.exists() else ""
    existing_rule = re.compile(
        rf"(?m)^{re.escape(PUBLIC_METRICS_PATH)}[ \t]*\n(?:^[ \t]+.*(?:\n|$))*"
    )
    preserved = existing_rule.sub("", existing).rstrip()
    sections = [
        section
        for section in (preserved, PUBLIC_METRICS_HEADER_RULE.rstrip())
        if section
    ]
    headers_path.write_text("\n\n".join(sections) + "\n", encoding="utf-8")
    return headers_path


def _walk_json(value):
    if isinstance(value, dict):
        for key, inner in value.items():
            yield str(key), inner
            yield from _walk_json(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from _walk_json(inner)


def _validate_public_nano_payload(payload: object) -> dict:
    if not isinstance(payload, dict) or set(payload) != {"schema", "nano"}:
        raise ValueError("public NANO payload must contain only schema and nano")
    if payload.get("schema") != "nano-dashboard.v1":
        raise ValueError("public NANO payload has an invalid schema")
    nano = payload.get("nano")
    if not isinstance(nano, dict):
        raise ValueError("public NANO payload is missing the nano object")
    meta = nano.get("meta")
    if not isinstance(meta, dict) or meta.get("aggregate_only") is not True:
        raise ValueError("public NANO payload is not marked aggregate-only")
    for key, _value in _walk_json(nano):
        if key.casefold() in PUBLIC_NANO_FORBIDDEN_KEYS:
            raise ValueError(f"public NANO payload contains forbidden key: {key}")
    serialized = json.dumps(payload, ensure_ascii=True, allow_nan=False)
    if PUBLIC_NANO_ID_RE.search(serialized):
        raise ValueError("public NANO payload contains a study identifier")
    return payload


def _is_nonnegative_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _validate_metrics_forms(value: object, *, include_instruments: bool) -> None:
    if not isinstance(value, dict):
        raise ValueError("public dashboard metrics forms must be an object")
    expected = {
        "incomplete",
        "unverified",
        "complete",
        "unknown",
        "total",
        "completion_rate",
        "counts_suppressed",
    }
    if include_instruments:
        expected.add("instruments_total")
    if set(value) != expected:
        raise ValueError("public dashboard metrics forms have unexpected fields")
    if not isinstance(value["counts_suppressed"], bool):
        raise ValueError("public dashboard metrics form suppression flag is invalid")
    if include_instruments and not _is_nonnegative_int(value["instruments_total"]):
        raise ValueError("public dashboard metrics instrument count is invalid")

    count_keys = ("incomplete", "unverified", "complete", "unknown", "total")
    if value["counts_suppressed"]:
        if any(value[key] is not None for key in count_keys):
            raise ValueError("suppressed dashboard form buckets must not expose counts")
        if value["completion_rate"] is not None:
            raise ValueError("suppressed dashboard form counts must not expose a rate")
        return

    if any(not _is_nonnegative_int(value[key]) for key in count_keys):
        raise ValueError("public dashboard metrics form counts must be nonnegative")
    subtotal = sum(
        int(value[key]) for key in ("incomplete", "unverified", "complete", "unknown")
    )
    if subtotal != value["total"]:
        raise ValueError("public dashboard metrics form total is inconsistent")
    if any(
        0 < value[key] < PUBLIC_METRICS_SMALL_CELL_THRESHOLD
        for key in ("incomplete", "unverified", "complete", "unknown")
    ):
        raise ValueError("public dashboard metrics expose an unsuppressed small cell")
    expected_rate = round(value["complete"] / subtotal, 3) if subtotal else None
    if value["completion_rate"] != expected_rate:
        raise ValueError("public dashboard metrics completion rate is inconsistent")


def _validate_metrics_events(value: object) -> None:
    if not isinstance(value, list):
        raise ValueError("public dashboard metrics events must be a list")
    for event in value:
        if not isinstance(event, dict) or set(event) != {
            "event",
            "records",
            "suppressed",
        }:
            raise ValueError("public dashboard metrics event has unexpected fields")
        if not isinstance(event["event"], str) or not event["event"]:
            raise ValueError("public dashboard metrics event name is invalid")
        if not isinstance(event["suppressed"], bool):
            raise ValueError("public dashboard metrics suppression flag is invalid")
        if event["suppressed"]:
            if event["records"] is not None:
                raise ValueError("suppressed dashboard metric must not expose a count")
        elif not _is_nonnegative_int(event["records"]):
            raise ValueError("public dashboard metrics event count is invalid")
        elif 0 < event["records"] < PUBLIC_METRICS_SMALL_CELL_THRESHOLD:
            raise ValueError(
                "public dashboard metrics expose an unsuppressed event cell"
            )


def _validate_event_total(value: dict, *, label: str) -> None:
    suppressed = value.get("event_records_suppressed")
    total = value.get("event_records")
    if not isinstance(suppressed, bool):
        raise ValueError(
            f"public dashboard metrics {label} suppression flag is invalid"
        )
    if suppressed:
        if total is not None:
            raise ValueError(
                f"suppressed public dashboard metrics {label} total must be null"
            )
    elif not _is_nonnegative_int(total):
        raise ValueError(f"public dashboard metrics {label} total is invalid")


def _validate_participant_count(
    value: object,
    suppressed: object,
    *,
    label: str,
) -> None:
    """Validate a public participant count and its small-cell suppression flag."""

    if not isinstance(suppressed, bool):
        raise ValueError(
            f"public dashboard metrics {label} suppression flag is invalid"
        )
    if suppressed:
        if value is not None:
            raise ValueError(
                f"suppressed public dashboard metrics {label} must be null"
            )
        return
    if not _is_nonnegative_int(value):
        raise ValueError(f"public dashboard metrics {label} is invalid")
    if 0 < int(value) < PUBLIC_METRICS_SMALL_CELL_THRESHOLD:
        raise ValueError(
            f"public dashboard metrics expose an unsuppressed {label} small cell"
        )


def _validate_public_dashboard_metrics(
    payload: object,
    *,
    max_age_minutes: float | None = None,
    now: dt.datetime | None = None,
) -> dict:
    """Reject malformed, partial, or participant-level public metrics."""
    if not isinstance(payload, dict):
        raise ValueError("public dashboard metrics must be a JSON object")
    if payload.get("schema") != PUBLIC_METRICS_SCHEMA:
        raise ValueError(f"public dashboard metrics must use {PUBLIC_METRICS_SCHEMA}")
    if payload.get("aggregate_only") is not True:
        raise ValueError("public dashboard metrics must be marked aggregate_only")
    if not PUBLIC_METRICS_VERSION_RE.fullmatch(str(payload.get("data_version", ""))):
        raise ValueError(
            "public dashboard metrics data_version must be a sha256 digest"
        )

    if set(payload) != {
        "schema",
        "data_version",
        "generated_at",
        "aggregate_only",
        "source",
        "portfolio",
        "studies",
        "projects",
    }:
        raise ValueError("public dashboard metrics have unexpected top-level fields")

    for key, _value in _walk_json(payload):
        if key.casefold() in PUBLIC_NANO_FORBIDDEN_KEYS:
            raise ValueError(f"public dashboard metrics contain forbidden key: {key}")
    serialized = json.dumps(payload, ensure_ascii=True, allow_nan=False)
    if PUBLIC_NANO_ID_RE.search(serialized):
        raise ValueError("public dashboard metrics contain a study identifier")

    generated_at = str(payload.get("generated_at", ""))
    try:
        generated = dt.datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(
            "public dashboard metrics generated_at must be ISO-8601"
        ) from exc
    if generated.tzinfo is None:
        raise ValueError("public dashboard metrics generated_at needs a timezone")
    if max_age_minutes is not None:
        current = now or dt.datetime.now(dt.timezone.utc)
        age_minutes = (
            current - generated.astimezone(dt.timezone.utc)
        ).total_seconds() / 60
        if age_minutes < -5:
            raise ValueError("public dashboard metrics timestamp is in the future")
        if age_minutes > max_age_minutes:
            raise ValueError("public dashboard metrics are stale")

    source = payload.get("source")
    if not isinstance(source, dict):
        raise ValueError("public dashboard metrics source must be an object")
    if set(source) != {
        "kind",
        "transport",
        "system",
        "cadence",
        "sla",
        "projects_total",
        "projects_ok",
    }:
        raise ValueError("public dashboard metrics source has unexpected fields")
    if (
        source.get("kind") != "live"
        or source.get("transport") != "api"
        or source.get("system") != "REDCap"
    ):
        raise ValueError("public dashboard metrics must identify the live REDCap API")
    if source.get("cadence") != "every_5_minutes":
        raise ValueError("public dashboard metrics cadence must be five minutes")
    if source.get("sla") != {"max_age_minutes": 15}:
        raise ValueError("public dashboard metrics freshness SLA must be 15 minutes")
    if source.get("projects_total") != 8 or source.get("projects_ok") != 8:
        raise ValueError("public dashboard metrics require 8/8 healthy projects")

    portfolio = payload.get("portfolio")
    if not isinstance(portfolio, dict) or set(portfolio) != {
        "status",
        "studies_total",
        "studies_reporting",
        "study_enrollments",
        "study_enrollments_suppressed",
        "event_records",
        "event_records_suppressed",
        "forms",
    }:
        raise ValueError("public dashboard metrics portfolio has unexpected fields")
    if (
        portfolio.get("status") != "ok"
        or portfolio.get("studies_total") != 5
        or portfolio.get("studies_reporting") != 5
    ):
        raise ValueError("public dashboard metrics require 5/5 healthy studies")
    _validate_participant_count(
        portfolio.get("study_enrollments"),
        portfolio.get("study_enrollments_suppressed"),
        label="portfolio study enrollment",
    )
    _validate_event_total(portfolio, label="portfolio event")
    _validate_metrics_forms(portfolio.get("forms"), include_instruments=False)

    studies = payload.get("studies")
    if not isinstance(studies, list) or len(studies) != 5:
        raise ValueError("public dashboard metrics require exactly five studies")
    if {study.get("key") for study in studies if isinstance(study, dict)} != set(
        PUBLIC_METRICS_STUDY_PROJECTS
    ):
        raise ValueError("public dashboard metrics study set is invalid")
    for study in studies:
        if not isinstance(study, dict) or set(study) != {
            "key",
            "label",
            "status",
            "projects_total",
            "projects_ok",
            "target",
            "enrollment",
            "enrollment_suppressed",
            "event_records",
            "event_records_suppressed",
            "events",
            "forms",
        }:
            raise ValueError("public dashboard metrics study has unexpected fields")
        project_count = PUBLIC_METRICS_STUDY_PROJECTS[study["key"]]
        if (
            study["status"] != "ok"
            or study["projects_total"] != project_count
            or study["projects_ok"] != project_count
        ):
            raise ValueError("public dashboard metrics contain an unhealthy study")
        _validate_participant_count(
            study.get("enrollment"),
            study.get("enrollment_suppressed"),
            label="study enrollment",
        )
        _validate_event_total(study, label="study event")
        if study["target"] is not None and not _is_nonnegative_int(study["target"]):
            raise ValueError("public dashboard metrics study target is invalid")
        if not isinstance(study["label"], str) or not study["label"]:
            raise ValueError("public dashboard metrics study label is invalid")
        _validate_metrics_events(study["events"])
        _validate_metrics_forms(study["forms"], include_instruments=False)

    projects = payload.get("projects")
    if not isinstance(projects, list) or len(projects) != 8:
        raise ValueError("public dashboard metrics require exactly eight projects")
    if any(
        not isinstance(project, dict) or project.get("status") != "ok"
        for project in projects
    ):
        raise ValueError("every public dashboard metrics project must be healthy")
    if {project.get("key") for project in projects} != set(PUBLIC_METRICS_PROJECT_IDS):
        raise ValueError("public dashboard metrics project set is invalid")
    for project in projects:
        if set(project) != {
            "key",
            "study",
            "role",
            "project_id",
            "title",
            "status",
            "enrollment_authority",
            "records",
            "records_suppressed",
            "event_records",
            "event_records_suppressed",
            "events",
            "forms",
            "error",
        }:
            raise ValueError("public dashboard metrics project has unexpected fields")
        if project["project_id"] != PUBLIC_METRICS_PROJECT_IDS[project["key"]]:
            raise ValueError("public dashboard metrics project identity is invalid")
        if project["study"] not in PUBLIC_METRICS_STUDY_PROJECTS:
            raise ValueError("public dashboard metrics project study is invalid")
        if not isinstance(project["role"], str) or not project["role"]:
            raise ValueError("public dashboard metrics project role is invalid")
        if not isinstance(project["title"], str) or not project["title"]:
            raise ValueError("public dashboard metrics project title is invalid")
        if not isinstance(project["enrollment_authority"], bool):
            raise ValueError("public dashboard metrics enrollment authority is invalid")
        _validate_participant_count(
            project.get("records"),
            project.get("records_suppressed"),
            label="project records",
        )
        _validate_event_total(project, label="project event")
        if project["error"] is not None:
            raise ValueError("healthy public dashboard metrics project has an error")
        _validate_metrics_events(project["events"])
        _validate_metrics_forms(project["forms"], include_instruments=True)

    studies_by_key = {study["key"]: study for study in studies}
    actual_study_projects = {
        study_key: sum(project["study"] == study_key for project in projects)
        for study_key in PUBLIC_METRICS_STUDY_PROJECTS
    }
    if actual_study_projects != PUBLIC_METRICS_STUDY_PROJECTS:
        raise ValueError("public dashboard metrics project study map is invalid")
    authority_projects = [
        project for project in projects if project["enrollment_authority"]
    ]
    if {project["key"] for project in authority_projects} != (
        PUBLIC_METRICS_ENROLLMENT_AUTHORITIES
    ):
        raise ValueError("public dashboard metrics enrollment authority map is invalid")
    authority_by_study = {project["study"]: project for project in authority_projects}
    for study_key, study in studies_by_key.items():
        authority = authority_by_study.get(study_key)
        if authority is None:
            raise ValueError(
                "public dashboard metrics study is missing an enrollment authority"
            )
        if study["enrollment_suppressed"] != authority["records_suppressed"]:
            raise ValueError(
                "public dashboard metrics study enrollment suppression is inconsistent"
            )
        if (
            not study["enrollment_suppressed"]
            and study["enrollment"] != authority["records"]
        ):
            raise ValueError(
                "public dashboard metrics study enrollment does not match its authority"
            )

    suppressed_study_enrollment = any(
        study["enrollment_suppressed"] for study in studies
    )
    if portfolio["study_enrollments_suppressed"] != suppressed_study_enrollment:
        raise ValueError(
            "public dashboard metrics portfolio enrollment suppression is inconsistent"
        )
    if not suppressed_study_enrollment and portfolio["study_enrollments"] != sum(
        int(study["enrollment"]) for study in studies
    ):
        raise ValueError(
            "public dashboard metrics portfolio enrollment total is inconsistent"
        )

    for project in projects:
        study = studies_by_key[project["study"]]
        if project["records_suppressed"] and not project["forms"]["counts_suppressed"]:
            raise ValueError(
                "public dashboard metrics project forms reveal a suppressed "
                "participant count"
            )
        if project["records_suppressed"] and (
            not project["event_records_suppressed"]
            or any(not event["suppressed"] for event in project["events"])
        ):
            raise ValueError(
                "public dashboard metrics project events reveal a suppressed "
                "participant count"
            )
        if (
            project["forms"]["counts_suppressed"]
            and not study["forms"]["counts_suppressed"]
        ):
            raise ValueError(
                "public dashboard metrics study form totals reveal a suppressed project cell"
            )
        if (
            project["enrollment_authority"]
            and project["event_records_suppressed"]
            and not study["event_records_suppressed"]
        ):
            raise ValueError(
                "public dashboard metrics study event total reveals a suppressed cell"
            )
    if (
        any(project["forms"]["counts_suppressed"] for project in projects)
        and not portfolio["forms"]["counts_suppressed"]
    ):
        raise ValueError(
            "public dashboard metrics portfolio form totals reveal a suppressed project cell"
        )
    if (
        any(project["event_records_suppressed"] for project in authority_projects)
        and not portfolio["event_records_suppressed"]
    ):
        raise ValueError(
            "public dashboard metrics portfolio event total reveals a suppressed cell"
        )

    hash_input = {
        key: value
        for key, value in payload.items()
        if key not in {"data_version", "generated_at"}
    }
    canonical = json.dumps(
        hash_input, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    expected_version = f"sha256:{hashlib.sha256(canonical).hexdigest()}"
    if payload["data_version"] != expected_version:
        raise ValueError("public dashboard metrics data_version does not match content")
    return payload


def _clean_public_document_text(value: str, *, limit: int) -> str:
    text = re.sub(r"[\x00-\x1f\x7f]", " ", value)
    text = re.sub(
        r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
        "[redacted email]",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"(?<!\d)(?:\+?1[-. (]*)?\d{3}[-. )]*\d{3}[-. ]*\d{4}(?!\d)",
        "[redacted phone]",
        text,
    )
    text = re.sub(
        r"\b(?:\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?"
        r"|\d{1,2}/\d{1,2}/\d{2,4})\b",
        "[redacted date]",
        text,
    )
    text = re.sub(r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)", "[redacted SSN]", text)
    text = re.sub(
        r"\b(patient|participant|subject|infant|baby|caregiver|mother|father)"
        r"(?:'s|\s+(?:name\s*(?:is|:)?|named))?\s+"
        r"[A-Z][A-Za-z'’-]{1,40}(?:\s+[A-Z][A-Za-z'’-]{1,40}){1,3}\b",
        r"\1 [redacted name]",
        text,
    )
    text = re.sub(
        r"\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,5}"
        r"(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|court|ct|way)\b",
        "[redacted address]",
        text,
        flags=re.IGNORECASE,
    )
    text = PUBLIC_NANO_ID_RE.sub("[redacted study ID]", text)
    text = re.sub(r"[`*_>#|]+", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    return re.sub(r"\s+", " ", text).strip()[:limit].rstrip()


def _build_public_buddy_documents(repo_root: pathlib.Path) -> dict:
    resolved_root = repo_root.resolve()
    if not (resolved_root / ".git").exists():
        try:
            resolved_root = pathlib.Path(
                subprocess.run(
                    ["git", "rev-parse", "--show-toplevel"],
                    cwd=resolved_root,
                    check=True,
                    capture_output=True,
                    text=True,
                ).stdout.strip()
            )
        except (OSError, subprocess.CalledProcessError):
            resolved_root = REPO_ROOT

    try:
        tracked = (
            subprocess.run(
                [
                    "git",
                    "ls-files",
                    "-z",
                    "--",
                    "docs",
                    "dashboard/context_skill/references",
                ],
                cwd=resolved_root,
                check=True,
                capture_output=True,
            )
            .stdout.decode("utf-8")
            .split("\0")
        )
    except (OSError, subprocess.CalledProcessError, UnicodeDecodeError):
        tracked = []

    documents = []
    for relative in sorted(filter(None, tracked)):
        path = resolved_root / relative
        if (
            path.suffix.casefold() not in PUBLIC_BUDDY_DOCUMENT_SUFFIXES
            or not path.is_file()
        ):
            continue
        try:
            raw = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        heading = next(
            (
                line.lstrip("# ").strip()
                for line in raw.splitlines()
                if line.lstrip().startswith("#") and line.lstrip("# ").strip()
            ),
            path.stem.replace("_", " ").replace("-", " "),
        )
        title = _clean_public_document_text(heading, limit=160)
        search_text = _clean_public_document_text(raw, limit=4000)
        if not title or not search_text:
            continue
        documents.append(
            {
                "title": title,
                "relative_path": pathlib.PurePosixPath(relative).as_posix(),
                "excerpt": search_text[:1000],
                "search_text": search_text,
                "source": "tracked repository documentation",
                "category": "SOP and methods",
                "keywords": [],
            }
        )
    return {"schema": "nano-buddy-documents.v1", "documents": documents}


def _fingerprint_tree(root: pathlib.Path) -> str:
    hasher = hashlib.sha1()
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        hasher.update(str(path.relative_to(root)).encode("utf-8"))
        hasher.update(path.read_bytes())
    return hasher.hexdigest()[:8]


def _normalize_origin(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError(f"API origin must be an absolute HTTPS URL: {value!r}")
    return f"{parsed.scheme}://{parsed.netloc}"


def _is_quick_tunnel(origin: str) -> bool:
    return (urlparse(origin).hostname or "").lower().endswith(".trycloudflare.com")


def _api_origin_is_healthy(origin: str, timeout: float) -> bool:
    request = urllib.request.Request(
        origin.rstrip("/") + "/api/healthz",
        headers={
            "User-Agent": "ESD-Lab-USC-pages-packager/1.0",
            "Accept": "application/json",
            "Accept-Encoding": "identity",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                return False
            payload = json.loads(response.read().decode("utf-8"))
    except (
        json.JSONDecodeError,
        urllib.error.HTTPError,
        urllib.error.URLError,
        TimeoutError,
        OSError,
    ):
        return False
    return isinstance(payload, dict) and payload.get("status") == "ok"


def _worker_source(api_origin: str | None) -> str:
    return ("""
const API_ORIGIN = __API_ORIGIN__;
const BUDDY_PROVIDER_BASE = "https://integrate.api.nvidia.com/v1";
const BUDDY_PROVIDER_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const BUDDY_MAX_BODY_BYTES = 32 * 1024;
const BUDDY_RATE_LIMIT = 12;
const BUDDY_RATE_WINDOW_MS = 60 * 1000;
const PUBLIC_METRICS_PATH = "/dashboard/data/dashboard_metrics.json";

const presentationJobs = new Map();
const buddyRequests = new Map();

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function ndjsonResponse(text) {
  const body = text
    .split(/(\\s+)/)
    .filter(Boolean)
    .map((part) => JSON.stringify({ delta: part }) + "\\n")
    .join("") + JSON.stringify({ done: true }) + "\\n";
  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function publicMetricsResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store, max-age=0, must-revalidate");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  const bodyless = [101, 204, 205, 304].includes(response.status);
  return new Response(bodyless ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function readJson(request) {
  if (!request) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function retiredRedcapResponse() {
  return jsonResponse(
    { error: "The public REDCap proxy has been permanently retired.", status: "gone" },
    410,
  );
}

function assistantStatus(reason = "upstream-unavailable", env = null) {
  if (env?.DASHBOARD_ASSISTANT_API_KEY) {
    return {
      status: "ready",
      ready: true,
      state: "ready",
      error: null,
      provider: "nvidia",
      runtime: "pages-edge-nvidia-build-api",
      model: BUDDY_PROVIDER_MODEL,
      model_id: BUDDY_PROVIDER_MODEL,
      message: "The NVIDIA assistant is ready through the Pages edge runtime.",
      fallback: false,
      reason,
      freshness: {
        readings: { last_indexed_at: null, total_indexed: null, payload_version: "pages-packaged" },
        pipeline: { state: "pages-packaged", warnings: [] },
        redcap: { generated_at: null, record_count: null, anomaly_count: null, source: "pages-packaged" },
      },
    };
  }
  return {
    status: "fallback",
    ready: false,
    state: "fallback",
    error:
      "Pages fallback assistant is active because the live assistant origin is unavailable.",
    model: "pages://fallback-assistant",
    message:
      "Pages fallback assistant is active because the live assistant origin is unavailable.",
    fallback: true,
    reason,
    freshness: {
      readings: { last_indexed_at: null, total_indexed: null, payload_version: "pages-fallback" },
      pipeline: { state: "pages-fallback", warnings: [] },
      redcap: { generated_at: null, record_count: null, anomaly_count: null, source: "pages-fallback" },
    },
  };
}

function assistantReply(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("nano") && (text.includes("rollout") || text.includes("workflow") || text.includes("priority"))) {
    return "The current operations plan is Nano-first: start with lab process observation, REDCap workflow learning, coordinator shadowing, and quick wins. Nico stays visible as the secondary lane and should expand after Nano workflows, metrics, and reporting templates are stable.";
  }
  if (text.includes("report") && (text.includes("priority") || text.includes("demographic") || text.includes("participant") || text.includes("budget"))) {
    return "Reporting should start with actionable operating questions: demographic data availability, participant and family projections, and budget-ready aggregate inputs. The team should agree on priority data sets, owners, source systems, and cadence before building formal reports.";
  }
  if (text.includes("demographic") || (text.includes("pull") && text.includes("redcap"))) {
    return "The near-term demographic plan is Nano first: confirm REDCap field names and ownership, then time a de-identified pull for cohort composition, sex or gender targets, race and ethnicity categories, gestational-age strata, and visit stage. Nico demographic reporting is staged after the Nano definitions are stable.";
  }
  if (text.includes("budget")) {
    return "Budget-facing work should use prepared aggregate inputs such as enrollment versus target, active follow-up counts, visit volume, scoring or coding queue effort, REDCap freshness, and completion coverage. Live budget ledgers or staff-level effort should stay gated until Sam and Dr. Bradshaw approve the source and audience.";
  }
  if (text.includes("systems audit") || text.includes("workflow audit") || (text.includes("tools") && text.includes("staff"))) {
    return "The systems and workflow audit should list tools per staff member, responsibilities, process flows, data storage locations, duplicated trackers, source-of-truth ownership, and how data feeds dashboard, reporting, and manuscript decisions.";
  }
  if (text.includes("esdlabsc") || text.includes("public website") || text.includes("website integration") || text.includes("external collaboration")) {
    return "The public ESD Lab website at https://www.esdlabsc.com is functional for mission, team, study, contact, and recruitment context, but it is not integrated with internal REDCap tracking, participant operations, reporting, or decision workflows. Prisma, CAN, and CAB collaboration touchpoints should be documented before dashboard metrics depend on them.";
  }
  if (text.includes("coordinator") || text.includes("undergrad") || text.includes("grad student") || text.includes("handoff")) {
    return "Coordinator work centers on scheduling, visit windows, packet readiness, assessments, and blockers. Graduate students own scoring oversight, reliability, analytic interpretation, and research metrics. Undergraduates support frame-by-frame coding, data entry prep, and defined QA checks. Supervisors own priority setting and approvals.";
  }
  if (text.includes("family") && (text.includes("share") || text.includes("visual") || text.includes("insight"))) {
    return "Family-facing data sharing remains limited to text updates, on-site assessments, and individual feedback on request. Aggregate family-facing insights are a future option only after supervisor and governance review.";
  }
  if (text.includes("carry-forward") || text.includes("visit health") || text.includes("csbs")) {
    return "The Visit Health Monitor checks CSBS caregiver completion across 6m, 9m, 12m, and 24m REDCap events. It emits R1-R5 carry-forward anomaly codes when an earlier incomplete or blank CSBS state conflicts with a later visit date or completion state.";
  }
  if (text.includes("visit entry") || text.includes("visit date")) {
    return "Visit dates come from the REDCap visit_occurred.visit_date anchor at visit events only. Browser REDCap writes are disabled; any source correction should run through the audited server-side REDCap scripts.";
  }
  if (text.includes("coverage") && text.includes("skip")) {
    return "Coverage = (Complete + Skipped) / Total expected. The SKIP missing data code marks intentionally skipped visits so the team can distinguish workflow errors from planned study design decisions.";
  }
  if (text.includes("cga") || text.includes("milestone river") || (text.includes("hda") && text.includes("river"))) {
    return "The CGA Milestone River shows aggregate HDA phase composition across corrected-age milestones for VPT, ASIB, and TD groups. It uses normalized orienting, sustained, inattention, and termination shares from the /api/v2/hda-composition contract.";
  }
  if (text.includes("county") || text.includes("sdoh") || text.includes("comparator")) {
    return "The County Comparator pairs two county-level aggregate profiles with the SDOH map, mirrored access bars, and completion context. It avoids participant identity and never exposes addresses, ZIP codes, or tract-level location.";
  }
  if (text.includes("participant timeline") || text.includes("passport timeline") || text.includes("swimlane")) {
    return "The Participant Passport Timeline arranges de-identified NANO IDs into swim lanes across visit, REDCap, ECG, QA, and pipeline events. Detail drawers are designed for scrubbed event metadata only.";
  }
  if (text.includes("model terrain") || text.includes("confidence terrain") || text.includes("contour")) {
    return "The Model Confidence Terrain turns aggregate SHAP and confidence summaries into contour-style explanation views, with heatmap and 3D controls ready for richer model payloads.";
  }
  if (text.includes("attrition funnel") || text.includes("retention") || text.includes("nih")) {
    return "The Attrition Funnel v2 summarizes consent-to-analysis retention stages, dropout reason codes, quarter trends, subgroup filters, and a copy-ready NIH report note.";
  }
  if (text.includes("guided") || text.includes("hypothesis")) {
    return "The Guided Explorer offers five hypothesis cards that open preconfigured dashboard views for CGA-HDA change, county access context, adherence timelines, model confidence, and attrition pressure.";
  }
  if (text.includes("public insights") || text.includes("stakeholder")) {
    return "Public Insights is an aggregate stakeholder story surface with CDC-style charts for study reach, enrollment trajectory, county context, HDA patterns, and retention. It does not show participant-level rows.";
  }
  if (text.includes("executive")) {
    return "Executive Mode is a compact stakeholder dashboard with enrollment, completion, model, SDOH, and retention KPIs plus a PPTX export path.";
  }
  if (text.includes("co-reg") || text.includes("coreg") || text.includes("dyad")) {
    return "The Dynamics & Dyads build adds co-regulation braids, lag surfaces, and dyad-level summaries behind the DYN feature flags. Use the Co-regulation route to compare infant arousal with caregiver speech and attention alignment.";
  }
  if (text.includes("phase") || text.includes("portrait") || text.includes("arousal")) {
    return "The phase portrait view maps arousal against attention in 2D, with dwell bins and transition traces for NANO-only participant IDs.";
  }
  if (text.includes("cva") || text.includes("gaze")) {
    return "The CVA gaze theater synchronizes caregiver vocal affect, gaze, infant arousal, and attention markers so reviewers can inspect timing without exposing PHI.";
  }
  if (text.includes("cascade") || text.includes("sim")) {
    return "The cascade simulator supports de-identified what-if planning and exports a seeded presentation-maker prompt for decision-support slides.";
  }
  if (text.includes("passport")) {
    return "The infant passport summarizes longitudinal modalities, completeness, and risk trend for a selected NANO ID using de-identified labels only.";
  }
  return "The public Pages fallback assistant can answer high-level dashboard navigation questions while the hosted NVIDIA assistant is unavailable. Dashboard data remains mocked and de-identified in the browser build.";
}

function buddyStatus(reason, env) {
  const providerReady = Boolean(env?.DASHBOARD_ASSISTANT_API_KEY);
  return {
    endpoint: "/api/buddy",
    state: providerReady ? "ready" : "degraded",
    ready: true,
    provider_ready: providerReady,
    local_fallback: true,
    metrics_available: true,
    documents_available: true,
    model_id: providerReady ? BUDDY_PROVIDER_MODEL : null,
    message: providerReady
      ? "Buddy is ready with packaged aggregate grounding and the shared NVIDIA provider."
      : "Buddy generation is offline; packaged aggregate metrics and reading lookup remain available.",
    contract: "nano-buddy.v1",
    reason,
  };
}

function buddyRefuses(message) {
  const text = String(message || "");
  return /\\b(?:mrn|medical record number|date of birth|dob|home address|phone number|email address|caregiver name|participant name|subject name|identifiable|identified data|phi)\\b/i.test(text)
    || /\\{\\{REDACTED:(?:PHI|DATE|MRN|PHONE|SSN|EMAIL|NAME)\\}\\}|\\[redacted (?:phi|date|mrn|phone|ssn|email|name|address|study id)\\]/i.test(text)
    || /\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b/i.test(text)
    || /(?<!\\d)(?:\\+?1[-. (]*)?\\d{3}[-. )]*\\d{3}[-. ]*\\d{4}(?!\\d)/.test(text)
    || /\\b(?:\\d{4}-\\d{2}-\\d{2}(?:[T ]\\d{2}:\\d{2}(?::\\d{2})?(?:Z|[+-]\\d{2}:?\\d{2})?)?|\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})\\b/.test(text)
    || /(?<!\\d)\\d{3}-\\d{2}-\\d{4}(?!\\d)/.test(text)
    || /\\b(?:patient|participant|subject|infant|baby|caregiver|mother|father)(?:'s|\\s+(?:name\\s*(?:is|:)?|named))?\\s+[A-Z][A-Za-z'’-]{1,40}(?:\\s+[A-Z][A-Za-z'’-]{1,40}){1,3}\\b/.test(text)
    || /\\b\\d{1,6}\\s+(?:[A-Za-z0-9.'-]+\\s+){0,5}(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|court|ct|way)\\b/i.test(text)
    || /\\b(?:nano|asib|pt|td|vpt)[-_ ]?\\d{1,8}\\b|\\b(?:participant|subject|infant|baby)\\s*(?:id|number|no\\.?|#)?\\s*[-_:]?\\s*\\d{2,}\\b/i.test(text)
    || /\\b(?:participant|subject|infant|baby)[ -]level\\b/i.test(text)
    || /\\b(?:list|show|give|identify|name|find|lookup|open|download|export)\\b.{0,80}\\b(?:participants?|subjects?|infants?|babies|records?|rows?|ids?|names?)\\b/i.test(text)
    || /\\b(?:raw|sample[- ]level|waveform|trace)\\b.{0,35}\\b(?:ecg|ekg|temperature|signal|rr|r-r|sensor)\\b/i.test(text)
    || /\\b(?:ecg|ekg|temperature|signal|rr|r-r|sensor)\\b.{0,35}\\b(?:raw|sample[- ]level|waveform|trace)\\b/i.test(text);
}

function buddyRefusal() {
  return {
    answer: "I cannot provide participant-level, identifiable, or raw-signal data. That information stays in REDCap or the USC secure server under the lab's HIPAA workflow. I can help with de-identified aggregate counts, metric definitions, or an approved SOP instead.",
    citations: [],
    used_metrics: [],
    refused: true,
  };
}

function buddyTokens(value) {
  return new Set((String(value || "").toLowerCase().match(/[a-z0-9_]{2,}/g) || []));
}

function pickBuddyScalars(source, keys) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  return Object.fromEntries(keys
    .filter((key) => Object.hasOwn(source, key))
    .filter((key) => source[key] === null || ["string", "number", "boolean"].includes(typeof source[key]))
    .map((key) => [key, source[key]]));
}

function pickBuddyRows(value, keys, limit = 100) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((row) => pickBuddyScalars(row, keys)).filter((row) => Object.keys(row).length);
}

function pickBuddyScalarMap(value, limit = 100) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, limit).filter(([key, item]) =>
    key.length <= 80 && (item === null || ["string", "number", "boolean"].includes(typeof item))));
}

function sanitizeNanoForBuddy(payload) {
  const nano = payload?.nano;
  if (!nano || typeof nano !== "object" || Array.isArray(nano)) return {};
  const safe = {};
  const meta = pickBuddyScalars(nano.meta, ["study", "state", "as_of", "n_target", "source"]);
  if (Object.keys(meta).length) safe.meta = meta;
  const enrollment = pickBuddyScalars(nano.enrollment, ["target", "enrolled", "active", "retention_pct", "total", "asib", "pt", "td", "last_updated"]);
  const groups = pickBuddyRows(nano.enrollment?.by_group, ["group", "target", "enrolled", "hda_sustained_pct", "hda_quality_bpm", "rsa_baseline_ms2"]);
  const funnel = pickBuddyRows(nano.enrollment?.funnel, ["stage", "n"]);
  if (groups.length) enrollment.by_group = groups;
  if (funnel.length) enrollment.funnel = funnel;
  if (Object.keys(enrollment).length) safe.enrollment = enrollment;
  const attention = pickBuddyScalars(nano.attention, ["hda_sustained_pct", "hda_quality_bpm"]);
  const phases = pickBuddyRows(nano.attention?.phases, ["phase", "pct"]);
  const windows = pickBuddyRows(nano.attention?.by_window, ["window", "group", "sustained_pct", "hda_sustained_pct", "hda_quality_bpm", "rsa_baseline_ms2"]);
  const attentionGroups = pickBuddyRows(nano.attention?.by_group, ["group", "sustained_pct", "hda_sustained_pct", "hda_quality_bpm", "rsa_baseline_ms2"]);
  const attentionGroupWindows = pickBuddyRows(nano.attention?.by_group_window, ["group", "window", "sustained_pct", "hda_sustained_pct", "hda_quality_bpm", "orienting_pct", "termination_pct", "inattention_pct"]);
  if (phases.length) attention.phases = phases;
  if (windows.length) attention.by_window = windows;
  if (attentionGroups.length) attention.by_group = attentionGroups;
  if (attentionGroupWindows.length) attention.by_group_window = attentionGroupWindows;
  if (Object.keys(attention).length) safe.attention = attention;
  const autonomic = pickBuddyScalars(nano.autonomic, ["rsa_baseline_ms2", "cptd_mean_c"]);
  const autonomicGroupWindows = pickBuddyRows(nano.autonomic?.by_group_window, ["group", "window", "rsa_baseline_ms2", "cptd_mean_c"]);
  if (autonomicGroupWindows.length) autonomic.by_group_window = autonomicGroupWindows;
  if (Object.keys(autonomic).length) safe.autonomic = autonomic;
  const timepoints = pickBuddyRows(nano.schedule?.timepoints, ["id", "due", "upcoming_14d", "overdue", "completed", "window_adherence_pct"]);
  if (timepoints.length) safe.schedule = { timepoints };
  const pipeline = pickBuddyRows(nano.pipeline, ["stage", "count", "delta_7d", "qc_pass_pct", "qa_passed"]);
  if (pipeline.length) safe.pipeline = pipeline;
  const pipelineSummary = pickBuddyScalars(nano.pipeline_summary, ["qa_passed_sessions", "qa_pass_pct", "open_qc_actions"]);
  if (Object.keys(pipelineSummary).length) safe.pipeline_summary = pipelineSummary;
  const assessments = pickBuddyRows(nano.assessments, ["instrument", "timepoint", "complete", "expected"]);
  if (assessments.length) safe.assessments = assessments;
  const inventory = pickBuddyRows(nano.inventory, ["item", "in_use", "available", "calibration_due", "reorder_threshold", "low_stock", "status"]);
  if (inventory.length) safe.inventory = inventory;
  const checklists = pickBuddyScalars(nano.checklists, ["open_qc_actions", "sop_ack_pct"]);
  const onboarding = pickBuddyRows(nano.checklists?.onboarding, ["key", "done", "total"]);
  if (onboarding.length) checklists.onboarding = onboarding;
  if (Object.keys(checklists).length) safe.checklists = checklists;
  const redcap = pickBuddyScalars(nano.redcap, ["api_token_valid", "last_sync", "records_locked", "double_entry_discrepancies", "instruments_defined", "dags", "sync_health"]);
  if (Object.keys(redcap).length) safe.redcap = redcap;
  const models = pickBuddyScalars(nano.models, ["aim3_status", "best_metric", "shap_ready"]);
  if (Object.keys(models).length) safe.models = models;
  const library = pickBuddyScalars(nano.library, ["indexed_documents", "total_documents", "total_readings", "last_indexed", "last_indexed_at", "label", "index_source", "href", "api_href"]);
  if (Object.keys(library).length) safe.library = library;

  // Legacy aggregate compatibility. Participant rows, flagged IDs, HDA feature
  // rows, raw signals, and individual traces are intentionally not copied.
  const studyMeta = pickBuddyScalars(nano.study_meta, ["award", "start_date", "end_date", "n_target", "n_target_asib", "n_target_pt", "n_target_td"]);
  if (Object.keys(studyMeta).length) safe.study_meta = studyMeta;
  const activeFollowup = pickBuddyScalarMap(nano.active_followup);
  if (Object.keys(activeFollowup).length) safe.active_followup = activeFollowup;
  const ecgQuality = {};
  for (const key of ["pct_valid_ecg_by_visit", "pct_hda_synced_by_visit"]) {
    const values = pickBuddyScalarMap(nano.ecg_quality?.[key]);
    if (Object.keys(values).length) ecgQuality[key] = values;
  }
  if (Object.keys(ecgQuality).length) safe.ecg_quality = ecgQuality;
  const lgcm = {};
  for (const metric of ["pct_sa", "hr_decel", "rsa"]) {
    const source = nano.lgcm_results?.[metric];
    if (!source || typeof source !== "object") continue;
    const section = Object.fromEntries(Object.entries(source).filter(([key, value]) =>
      /^(?:asib|pt|td)_(?:intercept|slope)_mean$|^(?:asib|pt)_vs_td_(?:intercept|slope)_p$/.test(key)
      && (value === null || typeof value === "number")));
    const curves = pickBuddyRows(source.growth_curves, ["group", "timepoint_m", "mean", "ci_low", "ci_high"]);
    if (curves.length) section.growth_curves = curves;
    if (Object.keys(section).length) lgcm[metric] = section;
  }
  if (Object.keys(lgcm).length) safe.lgcm_results = lgcm;
  return safe;
}

function applyPortfolioMetricsToBuddy(nano, metrics) {
  if (!nano || typeof nano !== "object") return {};
  if (metrics?.schema !== "dashboard.metrics.v1" || metrics?.aggregate_only !== true) return nano;
  const study = Array.isArray(metrics.studies)
    ? metrics.studies.find((item) => item?.key === "nano")
    : null;
  if (!study || typeof study.enrollment !== "number") return nano;

  nano.meta = {
    ...(nano.meta || {}),
    study: "NANO",
    as_of: metrics.generated_at || nano.meta?.as_of,
    n_target: typeof study.target === "number" ? study.target : nano.meta?.n_target,
    source: "live REDCap aggregate",
  };
  nano.enrollment = {
    enrolled: study.enrollment,
    target: typeof study.target === "number" ? study.target : undefined,
    last_updated: metrics.generated_at || undefined,
  };
  nano.redcap = {
    last_sync: metrics.generated_at || undefined,
    sync_health: metrics.source?.kind === "live"
      ? `${metrics.source?.projects_ok || 0}/${metrics.source?.projects_total || 0} projects healthy`
      : "aggregate snapshot unavailable",
  };
  return nano;
}

function buddyValue(value, path = "") {
  if (value === null || value === undefined) return "Awaiting data";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number" && path.includes("pct")) {
    const pct = Math.abs(value) <= 1 ? value * 100 : value;
    return `${pct.toFixed(1)}%`;
  }
  return String(value);
}

function buddyAsOf(nano, requested) {
  return requested || nano?.meta?.as_of || nano?.enrollment?.last_updated || "the packaged aggregate snapshot";
}

function buddyMetricAnswer(message, nano, requestedAsOf) {
  const tokens = buddyTokens(message);
  const when = buddyAsOf(nano, requestedAsOf);
  const inflightRequested = tokens.has("inflight") || (tokens.has("in") && tokens.has("flight"));
  if ((tokens.has("pipeline") || tokens.has("stage") || tokens.has("stages"))
      && (inflightRequested
        || tokens.has("done")
        || tokens.has("explain")
        || tokens.has("fail")
        || tokens.has("failed")
        || tokens.has("read")
        || tokens.has("reading")
        || tokens.has("history")
        || tokens.has("operator")
        || tokens.has("run"))) {
    return {
      answer: "- Read the six cards left to right: Ingest, Preprocess, Window QA, HRV features, HDA labeling, Merge · de-id.\\n- In flight is work currently moving through a stage. Done is completed windows or jobs. Fail is a surfaced exception that needs human review.\\n- Open run history when a stage shows any fail count, when in-flight work looks stuck, or when the operator needs the run-level detail behind a stage total.",
      used_metrics: [],
    };
  }
  const timepoints = nano?.schedule?.timepoints || [];
  if (timepoints.length && ["visit", "visits", "schedule", "due", "overdue", "upcoming", "completed", "adherence", "window"].some((key) => tokens.has(key))) {
    const compact = String(message).toLowerCase().replace(/[- ]/g, "_");
    const row = timepoints.find((item) => {
      const id = String(item.id || "").toLowerCase();
      const month = id.startsWith("month_") ? id.slice(6) : "";
      return id && (compact.includes(id) || (month && (compact.includes(`${month}m`) || compact.includes(`${month}_month`))) || (id === "nicu_admission" && compact.includes("nicu")));
    });
    if (row) {
      let field = "due";
      if (tokens.has("overdue")) field = "overdue";
      else if (["upcoming", "week", "weeks"].some((key) => tokens.has(key))) field = "upcoming_14d";
      else if (tokens.has("completed") || tokens.has("complete")) field = "completed";
      else if (tokens.has("adherence") || tokens.has("window")) field = "window_adherence_pct";
      const label = field === "upcoming_14d" ? "upcoming in the next 14 days" : field.replaceAll("_", " ");
      return { answer: `The NANO ${row.id} aggregate has ${buddyValue(row[field], field)} visits ${label} as of ${when}. No participant list or identifier is exposed.`, used_metrics: [`nano.schedule.timepoints[${row.id}].${field}`] };
    }
    const due = timepoints.reduce((sum, item) => sum + Number(item.due || 0), 0);
    const upcoming = timepoints.reduce((sum, item) => sum + Number(item.upcoming_14d || 0), 0);
    const overdue = timepoints.reduce((sum, item) => sum + Number(item.overdue || 0), 0);
    return { answer: `Across NANO visit windows, ${due} are due, ${upcoming} are upcoming in the next 14 days, and ${overdue} are overdue as of ${when}. These are de-identified aggregate counts.`, used_metrics: ["nano.schedule.timepoints[].due", "nano.schedule.timepoints[].upcoming_14d", "nano.schedule.timepoints[].overdue"] };
  }
  const redcap = nano?.redcap || {};
  if (tokens.has("redcap") && Object.keys(redcap).length) {
    const candidates = [
      ["double_entry_discrepancies", ["discrepancy", "discrepancies", "double", "entry"]],
      ["sync_health", ["sync", "health", "healthy", "status"]],
      ["last_sync", ["last", "sync", "fresh", "freshness"]],
      ["api_token_valid", ["api", "token", "valid", "validity"]],
      ["records_locked", ["locked", "records"]],
      ["instruments_defined", ["instrument", "instruments", "defined"]],
      ["dags", ["dag", "dags", "coverage"]],
    ];
    const match = candidates.find(([field, words]) => Object.hasOwn(redcap, field) && words.some((word) => tokens.has(word)));
    const fields = match ? [match[0]] : ["sync_health", "last_sync", "double_entry_discrepancies"].filter((field) => Object.hasOwn(redcap, field));
    return { answer: `NANO REDCap status as of ${when}: ${fields.map((field) => `${field.replaceAll("_", " ")}: ${buddyValue(redcap[field], field)}`).join("; ")}.`, used_metrics: fields.map((field) => `nano.redcap.${field}`) };
  }
  const inventory = nano?.inventory || [];
  if (inventory.length && ["inventory", "equipment", "actiheart", "squirrel", "electrode", "electrodes", "kit", "kits", "calibration", "stock", "available"].some((key) => tokens.has(key))) {
    const row = [...inventory].sort((left, right) => [...tokens].filter((token) => buddyTokens(right.item).has(token)).length - [...tokens].filter((token) => buddyTokens(left.item).has(token)).length)[0];
    const fields = ["available", "in_use", "calibration_due", "low_stock", "reorder_threshold", "status"].filter((field) => Object.hasOwn(row, field));
    return { answer: `${row.item || "Selected equipment"} aggregate inventory as of ${when}: ${fields.map((field) => `${field.replaceAll("_", " ")}: ${buddyValue(row[field], field)}`).join("; ")}.`, used_metrics: fields.map((field) => `nano.inventory[${row.item}].${field}`) };
  }
  const enrollment = nano?.enrollment || {};
  if (Object.keys(enrollment).length && ["enrollment", "enrolled", "cohort", "recruitment", "retention", "active", "target"].some((key) => tokens.has(key))) {
    const groupTokens = ["asib", "pt", "td"].filter((group) => tokens.has(group));
    const groupRows = enrollment.by_group || [];
    if (groupRows.length && (groupTokens.length || tokens.has("group") || tokens.has("cohort"))) {
      const selected = groupRows.filter((row) => !groupTokens.length || groupTokens.includes(String(row.group || "").toLowerCase()));
      return { answer: `NANO enrollment by group as of ${when}: ${selected.map((row) => `${String(row.group).toUpperCase()} ${row.enrolled} of ${row.target}`).join("; ")}.`, used_metrics: selected.flatMap((row) => [`nano.enrollment.by_group[${String(row.group).toUpperCase()}].enrolled`, `nano.enrollment.by_group[${String(row.group).toUpperCase()}].target`]) };
    }
    const enrolledField = Object.hasOwn(enrollment, "enrolled") ? "enrolled" : "total";
    const enrolled = enrollment[enrolledField];
    const target = enrollment.target ?? nano?.meta?.n_target ?? nano?.study_meta?.n_target;
    if (enrolled !== undefined) return { answer: `Current NANO aggregate enrollment is ${enrolled}${target !== undefined ? ` of ${target}` : ""} as of ${when}.`, used_metrics: [`nano.enrollment.${enrolledField}`, ...(target !== undefined ? [enrollment.target !== undefined ? "nano.enrollment.target" : nano?.meta?.n_target !== undefined ? "nano.meta.n_target" : "nano.study_meta.n_target"] : [])] };
  }
  const attention = nano?.attention || {};
  if (["hda", "attention", "sustained", "orienting", "termination", "inattention", "deceleration", "quality", "rsa", "autonomic", "cptd", "temperature"].some((key) => tokens.has(key))) {
    const requestedGroups = ["asib", "pt", "td"].filter((group) => tokens.has(group));
    const attentionGroupWindows = attention.by_group_window || [];
    if (attentionGroupWindows.length && (requestedGroups.length || tokens.has("group") || tokens.has("groups") || tokens.has("window") || tokens.has("windows"))) {
      const rows = attentionGroupWindows.filter((row) => !requestedGroups.length || requestedGroups.includes(String(row.group || "").toLowerCase())).slice(0, 12);
      const field = (tokens.has("quality") || tokens.has("deceleration"))
        ? "hda_quality_bpm"
        : rows.some((row) => Object.hasOwn(row, "hda_sustained_pct")) ? "hda_sustained_pct" : "sustained_pct";
      const selected = rows.filter((row) => Object.hasOwn(row, field));
      if (selected.length) return { answer: `NANO aggregate ${field === "hda_quality_bpm" ? "HDA quality" : "sustained-attention HDA share"} by group and window as of ${when}: ${selected.map((row) => `${String(row.group).toUpperCase()} ${row.window} ${buddyValue(row[field], field)}`).join("; ")}.`, used_metrics: selected.map((row) => `nano.attention.by_group_window[${String(row.group).toUpperCase()}-${row.window}].${field}`) };
    }
    const autonomicGroupWindows = nano?.autonomic?.by_group_window || [];
    if (autonomicGroupWindows.length && ["rsa", "autonomic", "cptd", "temperature"].some((key) => tokens.has(key))) {
      const field = tokens.has("cptd") || tokens.has("temperature") ? "cptd_mean_c" : "rsa_baseline_ms2";
      const rows = autonomicGroupWindows.filter((row) => Object.hasOwn(row, field) && (!requestedGroups.length || requestedGroups.includes(String(row.group || "").toLowerCase()))).slice(0, 12);
      if (rows.length) return { answer: `NANO aggregate ${field === "cptd_mean_c" ? "mean CPTd" : "baseline RSA"} by group and window as of ${when}: ${rows.map((row) => `${String(row.group).toUpperCase()} ${row.window} ${buddyValue(row[field], field)}`).join("; ")}.`, used_metrics: rows.map((row) => `nano.autonomic.by_group_window[${String(row.group).toUpperCase()}-${row.window}].${field}`) };
    }
    if ((tokens.has("rsa") || tokens.has("autonomic")) && nano?.autonomic?.rsa_baseline_ms2 !== undefined) return { answer: `NANO baseline RSA is ${buddyValue(nano.autonomic.rsa_baseline_ms2)} ms² in the aggregate snapshot as of ${when}.`, used_metrics: ["nano.autonomic.rsa_baseline_ms2"] };
    if ((tokens.has("cptd") || tokens.has("temperature")) && nano?.autonomic?.cptd_mean_c !== undefined) return { answer: `NANO mean CPTd is ${buddyValue(nano.autonomic.cptd_mean_c)} °C in the aggregate snapshot as of ${when}.`, used_metrics: ["nano.autonomic.cptd_mean_c"] };
    if (attention.hda_sustained_pct !== undefined) return { answer: `NANO sustained-attention HDA share is ${buddyValue(attention.hda_sustained_pct, "pct")} as of ${when}.`, used_metrics: ["nano.attention.hda_sustained_pct"] };
    const legacy = nano?.lgcm_results?.pct_sa?.growth_curves || [];
    if (legacy.length) {
      const requested = ["asib", "pt", "td"].filter((group) => tokens.has(group));
      const rows = legacy.filter((row) => !requested.length || requested.includes(String(row.group).toLowerCase())).slice(0, 9);
      return { answer: `NANO aggregate sustained-attention share by group and age as of ${when}: ${rows.map((row) => `${String(row.group).toUpperCase()} ${row.timepoint_m}m ${buddyValue(row.mean, "pct")}`).join("; ")}.`, used_metrics: rows.map((row) => `nano.lgcm_results.pct_sa.growth_curves[${String(row.group).toUpperCase()}-${row.timepoint_m}m].mean`) };
    }
  }
  const pipeline = nano?.pipeline || [];
  const pipelineSummary = nano?.pipeline_summary || {};
  if ((pipeline.length || Object.keys(pipelineSummary).length) && ["pipeline", "qc", "qa", "quality", "ingested", "preproc", "preprocessing", "imputation", "model", "ready", "sessions", "week", "actions"].some((key) => tokens.has(key))) {
    if (Object.keys(pipelineSummary).length && ["qc", "qa", "quality", "sessions", "week", "actions"].some((key) => tokens.has(key))) {
      const fields = (tokens.has("action") || tokens.has("actions") || tokens.has("open")) && Object.hasOwn(pipelineSummary, "open_qc_actions")
        ? ["open_qc_actions"]
        : ["qa_passed_sessions", "qa_pass_pct", "open_qc_actions"].filter((field) => Object.hasOwn(pipelineSummary, field));
      if (fields.length) return { answer: `NANO aggregate pipeline QA as of ${when}: ${fields.map((field) => `${field.replaceAll("_", " ")}: ${buddyValue(pipelineSummary[field], field)}`).join("; ")}.`, used_metrics: fields.map((field) => `nano.pipeline_summary.${field}`) };
    }
    if (!pipeline.length) return null;
    const row = [...pipeline].sort((left, right) => [...tokens].filter((token) => buddyTokens(right.stage).has(token)).length - [...tokens].filter((token) => buddyTokens(left.stage).has(token)).length)[0];
    const fields = ["count", "delta_7d", "qc_pass_pct", "qa_passed"].filter((field) => Object.hasOwn(row, field));
    return { answer: `NANO ${row.stage} as of ${when}: ${fields.map((field) => `${field.replaceAll("_", " ")}: ${buddyValue(row[field], field)}`).join("; ")}.`, used_metrics: fields.map((field) => `nano.pipeline[${row.stage}].${field}`) };
  }
  const models = nano?.models || {};
  if (Object.keys(models).length && ["aim3", "aim", "model", "models", "shap", "training", "evaluated"].some((key) => tokens.has(key))) {
    const fields = ["aim3_status", "best_metric", "shap_ready"].filter((field) => Object.hasOwn(models, field));
    return { answer: `NANO Aim 3 model status as of ${when}: ${fields.map((field) => `${field.replaceAll("_", " ")}: ${buddyValue(models[field], field)}`).join("; ")}.`, used_metrics: fields.map((field) => `nano.models.${field}`) };
  }
  return null;
}

function safeBuddyCitationPath(value) {
  const rawPath = String(value || "").trim().split(String.fromCharCode(92)).join("/");
  const path = rawPath.startsWith("/") ? rawPath.replace(new RegExp("^/+"), "") : rawPath;
  if (!path || path.split("/").includes("..") || !/\\.(?:md|txt|rst|pdf)$/i.test(path)) return null;
  if (!["docs/", "esd-lab-readings/", "ESD Lab readings/", "dashboard/context_skill/references/"].some((prefix) => path.startsWith(prefix))) return null;
  return path;
}

function cleanBuddyText(value, limit = 700) {
  return String(value || "")
    .replace(/[\\x00-\\x1f\\x7f]/g, " ")
    .replace(/\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b/gi, "[redacted email]")
    .replace(/(?<!\\d)(?:\\+?1[-. (]*)?\\d{3}[-. )]*\\d{3}[-. ]*\\d{4}(?!\\d)/g, "[redacted phone]")
    .replace(/\\b(?:\\d{4}-\\d{2}-\\d{2}(?:[T ]\\d{2}:\\d{2}(?::\\d{2})?(?:Z|[+-]\\d{2}:?\\d{2})?)?|\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})\\b/g, "[redacted date]")
    .replace(/(?<!\\d)\\d{3}-\\d{2}-\\d{4}(?!\\d)/g, "[redacted SSN]")
    .replace(/\\b(patient|participant|subject|infant|baby|caregiver|mother|father)(?:'s|\\s+(?:name\\s*(?:is|:)?|named))?\\s+[A-Z][A-Za-z'’-]{1,40}(?:\\s+[A-Z][A-Za-z'’-]{1,40}){1,3}\\b/g, "$1 [redacted name]")
    .replace(/\\b\\d{1,6}\\s+(?:[A-Za-z0-9.'-]+\\s+){0,5}(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|court|ct|way)\\b/gi, "[redacted address]")
    .replace(/\\b(?:nano|asib|pt|td|vpt)[-_ ]?\\d{1,8}\\b/gi, "[redacted study ID]")
    .replace(/\\s+/g, " ").trim().slice(0, limit);
}

function cleanBuddyProviderOutput(value, limit = 2400) {
  let text = String(value || "")
    .replace(/<(?:think|analysis|reasoning)\\s*>[\\s\\S]*?<[/](?:think|analysis|reasoning)\\s*>/gi, " ")
    .replace(/<(?:think|analysis|reasoning)\\s*>[\\s\\S]*$/gi, " ")
    .replace(/<[/]?(?:think|analysis|reasoning)\\s*>/gi, " ")
    .trim();
  if (!text) return "";

  const normalized = text.toLowerCase().replace(/\\s+/g, " ").trim();
  const looksLikePlanning = /^(?:(?:we|i)\\s+(?:need|must|should|have)\\s+to\\s+(?:answer|respond|explain|analy[sz]e|craft)|(?:the\\s+)?user\\s+(?:asks|wants|requested)|(?:let(?:'s|\\s+us))\\s+(?:reason|analy[sz]e|craft)|analysis\\s*:)/i.test(normalized)
    && (normalized.startsWith("we need to answer")
      || normalized.startsWith("i need to answer")
      || ["allowlisted aggregate", "provided grounding", "context only", "be concise", "grounded in", "do not invent", "supplied"].filter((marker) => normalized.includes(marker)).length >= 2);

  if (looksLikePlanning) {
    const markers = [...text.matchAll(/(?:^|\\n|[.!?]\\s+)\\s*(?:final\\s+answer|answer)\\s*:\\s*/gi)];
    if (!markers.length) return "";
    const last = markers[markers.length - 1];
    text = text.slice((last.index || 0) + last[0].length).trim();
  } else {
    text = text.replace(/^(?:final\\s+answer|answer)\\s*:\\s*/i, " ").trim();
  }
  return cleanBuddyText(text, limit);
}

function buddyDocumentMatches(message, readings, limit = 2) {
  const common = new Set(["about", "according", "and", "are", "can", "current", "does", "for", "from", "have", "how", "into", "its", "many", "nano", "of", "on", "please", "required", "should", "show", "study", "that", "the", "this", "through", "to", "using", "what", "when", "where", "which", "with", "you", "your"]);
  const query = [...buddyTokens(message)].filter((token) => !common.has(token));
  if (!query.length) return [];
  const seen = new Set();
  const matches = [];
  for (const bucket of ["featured", "readings"]) {
    for (const item of readings?.[bucket] || []) {
      const path = safeBuddyCitationPath(item?.relative_path);
      if (!path || seen.has(path)) continue;
      seen.add(path);
      const title = cleanBuddyText(item.title || item.display_name || path, 160);
      const snippet = cleanBuddyText([item.excerpt, item.search_text, item.source, item.category, ...(item.keywords || [])].filter(Boolean).join(" "), 1000);
      const titleTokens = buddyTokens(`${title} ${path}`);
      const bodyTokens = buddyTokens(snippet);
      const titleOverlap = query.filter((token) => titleTokens.has(token)).length;
      const overlap = query.filter((token) => titleTokens.has(token) || bodyTokens.has(token)).length;
      const score = 4 * titleOverlap + overlap;
      if (score >= 3) matches.push({ title, path, loc: "Library index", snippet, score });
    }
  }
  const ranked = matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  if (!ranked.length) return [];
  const comparisonIntent = ["between", "compare", "comparison", "contrast", "difference", "differences", "versus", "vs"].some((token) => buddyTokens(message).has(token));
  if (comparisonIntent) return ranked.slice(0, limit);
  const minimumScore = Math.max(3, Math.ceil(ranked[0].score * 0.75));
  return ranked.filter((match) => match.score >= minimumScore).slice(0, limit);
}

function buddyDocumentHelpRequest(message) {
  const tokens = buddyTokens(message);
  return ["sop", "protocol", "procedure", "procedures", "instruction", "instructions", "guide", "manual", "steps"].some((token) => tokens.has(token))
    || /(?:how\\s+(?:do|can|should)\\s+i|how\\s+to|where\\s+do\\s+i)/i.test(String(message || ""));
}

async function readPackagedJson(env, url, path) {
  if (!env?.ASSETS) return {};
  try {
    const target = new URL(path, url);
    const response = await env.ASSETS.fetch(new Request(target.toString(), { headers: { accept: "application/json" } }));
    if (!response.ok) return {};
    const payload = await response.json();
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

function buddyRateLimit(request) {
  const now = Date.now();
  const key = request.headers.get("CF-Connecting-IP") || "anonymous";
  if (buddyRequests.size > 4096) {
    for (const [tracked, timestamps] of buddyRequests) {
      const active = timestamps.filter((timestamp) => timestamp > now - BUDDY_RATE_WINDOW_MS);
      if (active.length) buddyRequests.set(tracked, active);
      else buddyRequests.delete(tracked);
    }
  }
  const timestamps = (buddyRequests.get(key) || []).filter((timestamp) => timestamp > now - BUDDY_RATE_WINDOW_MS);
  if (timestamps.length >= BUDDY_RATE_LIMIT) return Math.max(1, Math.ceil((timestamps[0] + BUDDY_RATE_WINDOW_MS - now) / 1000));
  timestamps.push(now);
  buddyRequests.set(key, timestamps);
  return 0;
}

async function parseBuddyRequest(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") return { error: jsonResponse({ error: "Buddy requests require Content-Type: application/json." }, 415) };
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > BUDDY_MAX_BODY_BYTES) return { error: jsonResponse({ error: "Request body exceeds the configured size limit." }, 413) };
  let text;
  try { text = await request.text(); } catch { return { error: jsonResponse({ error: "Request body must be valid JSON." }, 400) }; }
  if (new TextEncoder().encode(text).byteLength > BUDDY_MAX_BODY_BYTES) return { error: jsonResponse({ error: "Request body exceeds the configured size limit." }, 413) };
  let payload;
  try { payload = JSON.parse(text); } catch { return { error: jsonResponse({ error: "Request body must be valid JSON." }, 400) }; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { error: jsonResponse({ error: "Request body must be a JSON object." }, 400) };
  if (typeof payload.message !== "string") return { error: jsonResponse({ error: "Buddy message must be text." }, 400) };
  const message = payload.message.trim();
  if (!message) return { error: jsonResponse({ error: "Please ask Buddy a question before submitting." }, 400) };
  if (message.length > 6000) return { error: jsonResponse({ error: "Buddy message is too long; limit it to 6000 characters." }, 413) };
  const context = payload.context ?? { section: "nano" };
  if (!context || typeof context !== "object" || Array.isArray(context)) return { error: jsonResponse({ error: "Buddy context must be a JSON object." }, 400) };
  if (context.section !== undefined && String(context.section).trim().toLowerCase() !== "nano") return { error: jsonResponse({ error: "Buddy context section must be nano." }, 400) };
  if (context.as_of !== undefined && (typeof context.as_of !== "string" || !/^\\d{4}-\\d{2}-\\d{2}(?:T[0-9:.+\\-]+Z?)?$/.test(context.as_of) || context.as_of.length > 64)) return { error: jsonResponse({ error: "Buddy context as_of must be an ISO-8601 date or timestamp." }, 400) };
  return { message, asOf: context.as_of || null };
}

async function edgeBuddyProvider(message, nano, documents, env) {
  const apiKey = env?.DASHBOARD_ASSISTANT_API_KEY;
  if (!apiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const safeDocuments = documents.map(({ title, path, loc, snippet }) => ({ title, path, loc, snippet }));
  const groundingPayload = safeDocuments.length
    ? { documents: safeDocuments, nano: { meta: nano?.meta || {}, library: nano?.library || {} } }
    : { nano };
  const grounding = JSON.stringify(groundingPayload).slice(0, 12000);
  try {
    const response = await fetch(`${BUDDY_PROVIDER_BASE}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: BUDDY_PROVIDER_MODEL,
        temperature: 0.2,
        top_p: 0.95,
        // Nemotron is a reasoning model; reserve enough output budget for a
        // complete concise answer after any hidden reasoning tokens.
        max_tokens: 420,
        messages: [
          { role: "system", content: "You are ESD Lab Buddy for the NANO dashboard. Answer only from the supplied allowlisted aggregate metrics and public document snippets. Never infer, request, or reveal participant-level data, identifiers, raw signals, names, dates of birth, MRNs, contact details, or free-text notes. If evidence is missing, say so. Be concise. Do not invent citations or paths because the API attaches allowlisted citations." },
          { role: "user", content: `Grounding: ${grounding}\n\nQuestion: ${cleanBuddyText(message, 6000)}` },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const answer = cleanBuddyProviderOutput(payload?.choices?.[0]?.message?.content, 2400);
    return answer || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function buddyFallbackResponse(request, url, env, reason) {
  const retryAfter = buddyRateLimit(request);
  if (retryAfter) return jsonResponse({ error: "Buddy request limit reached. Please try again shortly.", status: "rate-limited", retry_after: retryAfter }, 429);
  const parsed = await parseBuddyRequest(request);
  if (parsed.error) return parsed.error;
  if (buddyRefuses(parsed.message)) return jsonResponse(buddyRefusal());
  const [dashboard, metrics, readings, repositoryDocuments] = await Promise.all([
    readPackagedJson(env, url, "/dashboard/data/nano_dashboard_data.json"),
    readPackagedJson(env, url, "/dashboard/data/dashboard_metrics.json"),
    readPackagedJson(env, url, "/dashboard/data/readings_data.json"),
    readPackagedJson(env, url, "/dashboard/data/buddy_documents.json"),
  ]);
  const nano = applyPortfolioMetricsToBuddy(sanitizeNanoForBuddy(dashboard), metrics);
  const documentCatalog = {
    featured: readings?.featured || [],
    readings: [...(readings?.readings || []), ...(repositoryDocuments?.documents || [])],
  };
  const documents = buddyDocumentMatches(parsed.message, documentCatalog);
  if (buddyDocumentHelpRequest(parsed.message) && documents.length) {
    const generated = await edgeBuddyProvider(parsed.message, nano, documents, env);
    if (generated) return jsonResponse({ answer: generated, citations: documents.map(({ title, path, loc }) => ({ title, path, loc })), used_metrics: [], refused: false });
    return jsonResponse({ answer: `According to ${documents[0].title}, ${documents[0].snippet} The linked citation is the approved source for the full procedure.`, citations: documents.map(({ title, path, loc }) => ({ title, path, loc })), used_metrics: [], refused: false });
  }
  const metric = buddyMetricAnswer(parsed.message, nano, parsed.asOf);
  if (metric) return jsonResponse({ answer: metric.answer, citations: [], used_metrics: metric.used_metrics, refused: false });
  const generated = await edgeBuddyProvider(parsed.message, nano, documents, env);
  if (generated) return jsonResponse({ answer: generated, citations: documents.map(({ title, path, loc }) => ({ title, path, loc })), used_metrics: [], refused: false });
  if (documents.length) return jsonResponse({ answer: `According to ${documents[0].title}, ${documents[0].snippet} The linked citation is the approved source for the full procedure.`, citations: documents.map(({ title, path, loc }) => ({ title, path, loc })), used_metrics: [], refused: false });
  return jsonResponse({ answer: "Buddy is offline for open-ended generation, but the packaged aggregate dashboard metrics remain available. Ask about NANO enrollment, visit counts, HDA, RSA, pipeline QC, inventory, REDCap health, or an indexed reading.", citations: [], used_metrics: [], refused: false, degraded_reason: reason });
}

function presentationPlan(concept, options = {}) {
  const topic = String(concept || "this concept").trim() || "this concept";
  const title = topic.charAt(0).toUpperCase() + topic.slice(1);
  const audience = ["beginner", "intermediate", "advanced"].includes(options.audience_level)
    ? options.audience_level
    : "beginner";
  const slides = [
    {
      id: "title-1",
      type: "title",
      title: `Understanding ${title}`,
      subtitle: `A simple, ${audience}-friendly explainer`,
      bullets: [],
      example: null,
      analogy: null,
      note: null,
      citations: [],
      visual: "clean title with a thin garnet divider",
    },
    {
      id: "why-2",
      type: "why",
      title: "Why this matters",
      subtitle: null,
      bullets: [
        `${title} shows up in dashboard review and study-planning conversations`,
        "A plain-language model helps reviewers align before deeper analysis",
        "The public fallback avoids PHI and avoids fabricated lab citations",
      ],
      example: null,
      analogy: null,
      note: null,
      citations: [],
      visual: null,
    },
    {
      id: "concept-3",
      type: "concept",
      title: `What ${title} means`,
      subtitle: null,
      bullets: [
        "Define the core idea in one sentence",
        "Name the key inputs and outputs",
        "Separate observed evidence from interpretation",
      ],
      example: null,
      analogy: null,
      note: "Keep the slide de-identified and study-safe.",
      citations: [],
      visual: null,
    },
    {
      id: "recap-4",
      type: "recap",
      title: "Recap",
      subtitle: null,
      bullets: [
        "Start with the dashboard view that owns the evidence",
        "Use NANO IDs only",
        "Treat model projections as decision support, not ground truth",
      ],
      example: null,
      analogy: null,
      note: null,
      citations: [],
      visual: "three-line summary with a gold underline",
    },
  ];
  return {
    plan: {
      title: `Understanding ${title}`,
      subtitle: `A simple, ${audience}-friendly explainer`,
      audience_level: audience,
      summary: `A clear, ${audience} introduction to ${title}.`,
      disclaimer:
        "This deck was generated by the Cloudflare Pages fallback while the hosted NVIDIA assistant was unavailable. It is de-identified and carries no lab-specific citations.",
      grounded: false,
      citations: [],
      concept: topic,
      generated_at: new Date().toISOString().slice(0, 19),
      slides,
    },
  };
}

async function fallbackApiResponse(url, request, reason, env) {
  const path = url.pathname;
  if (path === "/api/healthz") {
    return jsonResponse({
      status: "ok",
      dashboard: true,
      readings: true,
      assistant: assistantStatus(reason, env),
      origin: "pages-fallback",
    });
  }
  if (path === "/api/assistant/status" || path === "/api/chat/status") {
    return jsonResponse(assistantStatus(reason, env));
  }
  if (path === "/api/buddy" && (!request || request.method === "GET" || request.method === "HEAD")) {
    if (request?.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }
    return jsonResponse(buddyStatus(reason, env));
  }
  if (path === "/api/buddy" && request?.method === "POST") {
    return buddyFallbackResponse(request, url, env, reason);
  }
  if (path === "/api/assistant/freshness") {
    return jsonResponse({
      schema: "assistant_freshness.v1",
      mode: "pages-fallback",
      generated_at: new Date().toISOString(),
      assistant: assistantStatus(reason, env),
      readings: { last_indexed_at: null, total_indexed: null, payload_version: "pages-fallback" },
      pipeline: { state: "pages-fallback", warnings: [] },
      redcap: { generated_at: null, record_count: null, anomaly_count: null, source: "pages-fallback" },
    });
  }
  if (path === "/api/v2/redcap-visit-health" || path === "/api/v2/redcap-missing-data") {
    return jsonResponse({
      data: [],
      meta: { generatedAt: new Date().toISOString(), participantCount: 0, source: "mock" },
      anomalies: [],
      visitOptions: [
        { key: "sixMonth", label: "6m", eventName: "6_months_arm_1" },
        { key: "nineMonth", label: "9m", eventName: "9_months_arm_1" },
        { key: "twelveMonth", label: "12m", eventName: "12_months_arm_1" },
        { key: "twentyFourMonth", label: "24m", eventName: "24_months_arm_1" },
      ],
      error: "Backend offline - live REDCap data unavailable",
    });
  }
  if (path === "/api/v2/redcap-visit-entry" && request?.method === "POST") {
    return jsonResponse({ error: "Backend offline - REDCap visit entry unavailable" }, 503);
  }
  if (path === "/api/assistant/chat" && request?.method === "POST") {
    const response = await buddyFallbackResponse(request, url, env, reason);
    if (!response.ok) return response;
    const payload = await response.json();
    return ndjsonResponse(payload.answer);
  }
  if (path === "/api/chat" && request?.method === "POST") {
    const response = await buddyFallbackResponse(request, url, env, reason);
    if (!response.ok) return response;
    const payload = await response.json();
    return jsonResponse({
      reply: payload.answer,
      citations: payload.citations || [],
      status: assistantStatus(reason, env),
    });
  }
  if (path === "/api/presentation/plan" && request?.method === "POST") {
    const payload = await readJson(request);
    return jsonResponse(presentationPlan(payload.concept, payload.options));
  }
  if (path === "/api/presentation/jobs" && request?.method === "POST") {
    const payload = await readJson(request);
    const jobId = `pages_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const result = presentationPlan(payload.concept, payload.options);
    presentationJobs.set(jobId, result);
    return jsonResponse({
      job_id: jobId,
      status: "succeeded",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      progress_message: "Generated by the Pages fallback assistant.",
      poll_after_ms: 300,
    });
  }
  if (path.startsWith("/api/presentation/jobs/")) {
    const jobId = decodeURIComponent(path.slice("/api/presentation/jobs/".length));
    const result = presentationJobs.get(jobId) || presentationPlan("dashboard presentation", {});
    return jsonResponse({
      job_id: jobId,
      status: "succeeded",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      progress_message: null,
      result,
    });
  }
  return null;
}

async function proxyApi(request, url, env) {
  if (!API_ORIGIN) {
    const directFallbackRequest = url.pathname === "/api/buddy"
      ? request.clone()
      : request.method === "GET" || request.method === "HEAD"
        ? null
        : request.clone();
    const fallback = await fallbackApiResponse(url, directFallbackRequest, "no-healthy-origin", env);
    return fallback || jsonResponse({ error: "API route unavailable in fallback-only mode" }, 503);
  }
  const target = new URL(url.pathname + url.search, API_ORIGIN);
  const fallbackRequest = request.method === "GET" || request.method === "HEAD"
    ? null
    : request.clone();
  try {
    const upstreamRequest = new Request(target.toString(), request);
    const originalClientIp = request.headers.get("CF-Connecting-IP") || "";
    if (originalClientIp) {
      upstreamRequest.headers.set("X-ESD-Original-Client-IP", originalClientIp);
    } else {
      upstreamRequest.headers.delete("X-ESD-Original-Client-IP");
    }
    const response = await fetch(upstreamRequest);
    if (response.status < 500) return response;
    const fallback = await fallbackApiResponse(url, fallbackRequest, `upstream-${response.status}`, env);
    return fallback || response;
  } catch (error) {
    const fallback = await fallbackApiResponse(url, fallbackRequest, "upstream-fetch-failed", env);
    if (fallback) return fallback;
    return jsonResponse(
      { error: "API origin unavailable", origin: API_ORIGIN, detail: String(error?.message || error) },
      502,
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const legacyDashboardPaths = new Set(["/dashboard", "/dashboard/", "/dashboard/index.html"]);
    if (legacyDashboardPaths.has(url.pathname)) {
      const target = new URL("/overview", url);
      return Response.redirect(target.toString(), 308);
    }

    if (url.pathname === "/api/redcap") {
      return retiredRedcapResponse();
    }

    if (url.pathname === "/api/buddy") {
      const origin = request.headers.get("Origin");
      const normalizedOrigin = origin?.endsWith("/") ? origin.slice(0, -1) : origin;
      if (normalizedOrigin && normalizedOrigin !== url.origin) {
        return jsonResponse({ error: "Origin is not allowed" }, 403);
      }
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
            "access-control-allow-headers": "Content-Type",
            "cache-control": "no-store",
          },
        });
      }
      if (!["GET", "HEAD", "POST"].includes(request.method)) {
        return jsonResponse({ error: "Use GET for status or POST for Buddy questions." }, 405);
      }
      if (request.method === "POST") {
        const parsed = await parseBuddyRequest(request.clone());
        if (parsed.error) return parsed.error;
        if (buddyRefuses(parsed.message)) return jsonResponse(buddyRefusal());
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return proxyApi(request, url, env);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return url.pathname === PUBLIC_METRICS_PATH
        ? publicMetricsResponse(assetResponse)
        : assetResponse;
    }

    const lastSegment = url.pathname.split("/").pop() || "";
    if ((request.method === "GET" || request.method === "HEAD") && !lastSegment.includes(".")) {
      const fallbackUrl = new URL("/index.html", url);
      return env.ASSETS.fetch(new Request(fallbackUrl.toString(), request));
    }

    return assetResponse;
  },
};
""").lstrip().replace("__API_ORIGIN__", json.dumps(api_origin))


def _resolve_api_origin(
    api_origin: str | None,
    manifest_path: pathlib.Path,
    *,
    probe_timeout: float = 8.0,
) -> str | None:
    explicit = (
        api_origin or os.getenv("PAGES_API_ORIGIN") or os.getenv("DASHBOARD_API_ORIGIN")
    )
    candidate: str | None = explicit

    if not candidate and manifest_path.exists():
        try:
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(
                f"[build_pages_site] ignoring invalid manifest JSON at {manifest_path}: {exc}",
                file=sys.stderr,
            )
            payload = {}
        if isinstance(payload, dict):
            candidate = (
                str(
                    payload.get("deployed_url")
                    or payload.get("dashboard_url")
                    or payload.get("api_origin")
                    or ""
                ).strip()
                or None
            )

    if not candidate:
        print(
            "[build_pages_site] no API origin configured; packaging fallback-only API",
            file=sys.stderr,
        )
        return None

    try:
        normalized = _normalize_origin(candidate)
    except ValueError as exc:
        print(f"[build_pages_site] {exc}; packaging fallback-only API", file=sys.stderr)
        return None

    if _is_quick_tunnel(normalized):
        print(
            "[build_pages_site] refusing ephemeral trycloudflare origin for the "
            "canonical site; packaging fallback-only API",
            file=sys.stderr,
        )
        return None
    if not _api_origin_is_healthy(normalized, timeout=probe_timeout):
        print(
            f"[build_pages_site] API origin failed /api/healthz probe: {normalized}; "
            "packaging fallback-only API",
            file=sys.stderr,
        )
        return None
    return normalized


def build(
    build_dir: pathlib.Path = DEFAULT_BUILD_DIR,
    out_dir: pathlib.Path = DEFAULT_OUT_DIR,
    manifest_path: pathlib.Path = DEFAULT_MANIFEST,
    api_origin: str | None = None,
    stamp: str | None = None,
    origin_probe_timeout: float = 8.0,
    require_live_metrics: bool = False,
) -> pathlib.Path:
    index_path = build_dir / "index.html"
    if not index_path.exists():
        sys.exit(
            f"[build_pages_site] missing built SPA at {index_path}. "
            "Run `cd web && VITE_USE_MOCKS=false VITE_LIVE_ASSISTANT=true npm run build` first."
        )

    if out_dir.exists():
        shutil.rmtree(out_dir)
    shutil.copytree(build_dir, out_dir)
    dashboard_data_out = out_dir / "dashboard" / "data"
    dashboard_data_out.mkdir(parents=True, exist_ok=True)

    # Vite copies web/public verbatim. Explicitly remove the historical full
    # dashboard payload before adding privacy-validated public snapshots.
    legacy_dashboard_data = dashboard_data_out / "dashboard_data.json"
    if legacy_dashboard_data.exists():
        legacy_dashboard_data.unlink()

    for name in ("readings_data.json", "runtime_status.json"):
        source = REPO_ROOT / "dashboard" / "data" / name
        if source.exists():
            shutil.copy2(source, dashboard_data_out / name)

    metrics_source = REPO_ROOT / "dashboard" / "data" / "dashboard_metrics.json"
    if require_live_metrics and not metrics_source.exists():
        sys.exit(
            "[build_pages_site] missing live aggregate dashboard_metrics.json; "
            "run scripts/sync_redcap_portfolio.py --require-all first"
        )
    if metrics_source.exists():
        try:
            metrics_payload = json.loads(metrics_source.read_text(encoding="utf-8"))
            _validate_public_dashboard_metrics(
                metrics_payload,
                max_age_minutes=15 if require_live_metrics else None,
            )
        except (json.JSONDecodeError, ValueError) as exc:
            sys.exit(f"[build_pages_site] unsafe public dashboard metrics: {exc}")
        (dashboard_data_out / metrics_source.name).write_text(
            json.dumps(metrics_payload, indent=2, ensure_ascii=True, allow_nan=False),
            encoding="utf-8",
        )

    nano_source = REPO_ROOT / "dashboard" / "data" / "nano_dashboard_data.json"
    if not nano_source.exists():
        sys.exit("[build_pages_site] missing aggregate-only NANO dashboard payload")
    try:
        nano_payload = json.loads(nano_source.read_text(encoding="utf-8"))
        _validate_public_nano_payload(nano_payload)
    except (json.JSONDecodeError, ValueError) as exc:
        sys.exit(f"[build_pages_site] unsafe public NANO payload: {exc}")
    (dashboard_data_out / nano_source.name).write_text(
        json.dumps(nano_payload, indent=2, ensure_ascii=True, allow_nan=False),
        encoding="utf-8",
    )

    buddy_documents = _build_public_buddy_documents(REPO_ROOT)
    (dashboard_data_out / "buddy_documents.json").write_text(
        json.dumps(buddy_documents, indent=2, ensure_ascii=True, allow_nan=False),
        encoding="utf-8",
    )

    out_index = out_dir / "index.html"
    html = _read(out_index)
    resolved_api_origin = _resolve_api_origin(
        api_origin,
        manifest_path,
        probe_timeout=origin_probe_timeout,
    )

    stamp = stamp or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    build_sha = _fingerprint_tree(build_dir)

    if "</head>" not in html:
        sys.exit("[build_pages_site] built index.html missing </head>")

    head_inject = (
        f'\n<meta name="esd-deploy-stamp" content="{stamp}">\n'
        f'<meta name="esd-build-sha" content="{build_sha}">\n'
        f'<meta name="esd-api-mode" content="{"proxy" if resolved_api_origin else "fallback-only"}">\n'
    )
    if resolved_api_origin:
        head_inject += f'<meta name="esd-api-origin" content="{resolved_api_origin}">\n'
    html = html.replace("</head>", head_inject + "</head>", 1)
    out_index.write_text(html if html.endswith("\n") else html + "\n", encoding="utf-8")

    worker_path = out_dir / "_worker.js"
    worker_path.write_text(_worker_source(resolved_api_origin), encoding="utf-8")

    redirects_path = out_dir / "_redirects"
    redirects_path.write_text(
        "/dashboard /overview 308\n"
        "/dashboard/ /overview 308\n"
        "/dashboard/index.html /overview 308\n"
        "/* /index.html 200\n",
        encoding="utf-8",
    )
    headers_path = _write_pages_headers(out_dir)

    size_kb = out_index.stat().st_size / 1024
    print(
        f"[build_pages_site] wrote {out_index.relative_to(REPO_ROOT)} "
        f"({size_kb:,.1f} KB, sha={build_sha}, stamp={stamp}, "
        f"api={resolved_api_origin or 'fallback-only'})"
    )
    print(
        f"[build_pages_site] wrote {redirects_path.relative_to(REPO_ROOT)} "
        "(static SPA fallback)"
    )
    print(
        f"[build_pages_site] wrote {headers_path.relative_to(REPO_ROOT)} "
        "(live metrics no-store policy)"
    )
    print(
        f"[build_pages_site] wrote {worker_path.relative_to(REPO_ROOT)} "
        f"(advanced-mode /api -> {resolved_api_origin or 'built-in fallback'})"
    )
    return out_index


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-dir", type=pathlib.Path, default=DEFAULT_BUILD_DIR)
    parser.add_argument("--out-dir", type=pathlib.Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--manifest", type=pathlib.Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--api-origin", type=str, default=None)
    parser.add_argument("--stamp", type=str, default=None)
    parser.add_argument("--origin-probe-timeout", type=float, default=8.0)
    parser.add_argument(
        "--require-live-metrics",
        action="store_true",
        help="Fail unless a validated live 8/8 REDCap aggregate snapshot is packaged.",
    )
    args = parser.parse_args()

    build(
        build_dir=args.build_dir,
        out_dir=args.out_dir,
        manifest_path=args.manifest,
        api_origin=args.api_origin,
        stamp=args.stamp,
        origin_probe_timeout=args.origin_probe_timeout,
        require_live_metrics=args.require_live_metrics,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
