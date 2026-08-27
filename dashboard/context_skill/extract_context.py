"""Context extractor — keep the NANO dashboard skill in sync with code.

What it does
------------
Walks the data dictionary, the feature matrix schema, and the dashboard
pipelines, then compares against the Markdown references under this
folder. Prints a diff of anything that has drifted so the analyst can
update `references/*.md` before it bit-rots.

Usage
-----
``python dashboard/context_skill/extract_context.py --check``

In ``--check`` mode it exits non-zero on any drift so CI can catch it.
Without ``--check`` it prints a human-readable report and exits 0.

Design notes
------------
* No heavy deps (only ``pandas``, ``pyyaml`` if available).
* Never touches raw data — only reads schema files.
* Safe to run on a developer laptop without the secure mount attached.
"""
from __future__ import annotations

import argparse
import ast
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Iterable

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SKILL_ROOT   = Path(__file__).resolve().parent
DD_PATH      = PROJECT_ROOT / "data" / "data_dictionary" / "NANO_master_data_dictionary.csv"
PIPELINE_PY  = PROJECT_ROOT / "dashboard" / "pipelines" / "build_dashboard_data.py"
PIPELINE_R   = PROJECT_ROOT / "dashboard" / "pipelines" / "build_dashboard_data.R"
REDCAP_CONFIG = PROJECT_ROOT / "config" / "redcap_config.yml"
REDCAP_TABLE = SKILL_ROOT / "references" / "tables" / "redcap.md"
DASHBOARD_SCHEMA = SKILL_ROOT / "references" / "dashboard_schema.md"

PIPELINE_INTERNAL_COLUMNS = {
    "dashboard_input_source",
    "enrolled_month",
    "hasCarryForwardRisk",
    "recordId",
}

REFERENCE_ONLY_COLUMNS = {
    # Feature-matrix columns documented for modeling/downstream joins even
    # when the dashboard payload builder does not aggregate them directly.
    "event",
    "cptd_mean",
    "sample_entropy",
    "sd1",
    "sd2",
    "nnns_attention",
    "mchat_total",
    "bayley_cog",
}

SOURCE_GLOSSARY_HEADERS = {"column", "flag column", "field", "variable"}


# ─── Helpers ────────────────────────────────────────────────────────────────
def _read(path: Path) -> str:
    try:
        return path.read_text()
    except FileNotFoundError:
        return ""


def _load_redcap_contract() -> dict:
    import yaml

    return yaml.safe_load(REDCAP_CONFIG.read_text(encoding="utf-8")) or {}


def _replace_auto_block(path: Path, rendered: str) -> None:
    text = path.read_text(encoding="utf-8")
    pattern = re.compile(r"<!-- AUTO:start -->.*?<!-- AUTO:end -->", re.S)
    replacement = f"<!-- AUTO:start -->\n{rendered.rstrip()}\n<!-- AUTO:end -->"
    if not pattern.search(text):
        raise RuntimeError(f"{path} is missing AUTO markers")
    path.write_text(pattern.sub(replacement, text), encoding="utf-8")


def _render_redcap_auto_block(contract: dict) -> str:
    project = contract["project"]
    events = contract["events"]
    instruments = contract["instruments"]
    status_codes = contract["status_codes"]
    anomaly_codes = contract["anomaly_codes"]
    visit_events = set(events["visit_events"])

    lines = [
        "## Project",
        "",
        "| Field | Value |",
        "|---|---|",
        f"| PID | `{project['pid']}` |",
        f"| Title | {project['title']} |",
        f"| Longitudinal | {'yes' if project.get('is_longitudinal') else 'no'} |",
        f"| Missing data codes | {', '.join(f'`{code}`' for code in project.get('missing_data_codes', []))} |",
        "",
        "## Events",
        "",
        "| Event | Label | Visit-date available |",
        "|---|---|---|",
    ]
    for event_name in events["order"]:
        lines.append(
            f"| `{event_name}` | {events.get('labels', {}).get(event_name, event_name)} | "
            f"{'yes' if event_name in visit_events else 'no'} |"
        )
    carry = instruments["carry_forward"]
    lines.extend([
        "",
        "## Carry-Forward Monitor",
        "",
        "| Concept | REDCap source |",
        "|---|---|",
        f"| Visit anchor instrument | `{instruments['visit_anchor']}` |",
        f"| Visit date field | `{instruments['visit_date_field']}` |",
        f"| CSBS instrument | `{carry['instrument']}` |",
        f"| CSBS complete field | `{carry['complete_field']}` |",
        f"| Monitored events | {', '.join(f'`{item}`' for item in carry['events'])} |",
        "| Browser write policy | Read-only; writes run through audited server-side scripts |",
        "",
        "## Status Codes",
        "",
        "| REDCap value | Meaning | Dashboard token | Normalized value |",
        "|---|---|---|---|",
    ])
    for code, meta in status_codes.items():
        label = "``" if code == "" else f"`{code}`"
        lines.append(f"| {label} | {meta['label']} | `{meta['token']}` | `{meta['normalized']}` |")
    lines.extend([
        "",
        "## Carry-Forward Anomaly Codes",
        "",
        "| Code | Meaning |",
        "|---|---|",
    ])
    for code, meaning in anomaly_codes.items():
        lines.append(f"| `{code}` | {meaning} |")
    lines.extend([
        "",
        "## Dashboard JSON Keys",
        "",
        "| JSON key | Feeds |",
        "|---|---|",
        "| `redcap_meta.generated_at` | Buddy freshness line, Ask AI freshness answers, `/redcap` sync status |",
        "| `redcap_meta.record_count` | Buddy freshness answers, anomaly banner context |",
        "| `redcap_meta.anomaly_count` | `/redcap` anomaly banner, Ask AI carry-forward answers |",
        "| `redcap_completion_stats` | `/redcap` stacked completeness chart, `/public-insights` REDCap tiles |",
        "| `redcap_visit_health.data` | `/redcap` visit-health grid, Buddy R-code record answers |",
        "| `redcap_visit_health.anomaly_count` | Public and internal anomaly KPI |",
    ])
    return "\n".join(lines)


def emit_redcap_context() -> int:
    contract = _load_redcap_contract()
    _replace_auto_block(REDCAP_TABLE, _render_redcap_auto_block(contract))
    schema = DASHBOARD_SCHEMA.read_text(encoding="utf-8")
    replacement = """## REDCap Contract (v2)

| JSON Key | UI / Assistant Consumer | Source | Computation |
|----------|-------------------------|--------|-------------|
| `redcap_meta` | `/redcap` freshness, Ask AI freshness answers, Buddy status | `build_redcap_*` builders | Generated from the canonical YAML and current REDCap mirror |
| `redcap_completion_stats` | `/redcap` stacked bars, `/public-insights` REDCap section | Python/R dashboard builders | Counts `csbs_caregiver_complete` by 6m, 9m, 12m, and 24m events |
| `redcap_visit_health.data` | `/redcap` visit grid, Buddy R-code answers | Python/R dashboard builders | Groups de-identified records by event and applies R1-R5 carry-forward logic |
| `redcap_visit_health.anomaly_count` | Anomaly KPI and public aggregate tile | Same | Count of rows with any R1-R5 flag |

"""
    schema = re.sub(
        r"## Visit Health Monitor \(v2\).*?(?=## Invariants the UI assumes)",
        replacement,
        schema,
        flags=re.S,
    )
    DASHBOARD_SCHEMA.write_text(schema, encoding="utf-8")
    print("✓ Regenerated REDCap context blocks from config/redcap_config.yml")
    return 0


def _redcap_api(content: str) -> list[dict]:
    api_url = os.getenv("REDCAP_API_URL")
    token = os.getenv("REDCAP_API_KEY") or os.getenv("REDCAP_API_TOKEN")
    if not api_url or not token:
        raise EnvironmentError("REDCAP_API_URL and REDCAP_API_KEY/REDCAP_API_TOKEN are required")
    payload = urllib.parse.urlencode({
        "token": token,
        "content": content,
        "format": "json",
        "returnFormat": "json",
    }).encode()
    request = urllib.request.Request(api_url, data=payload, method="POST")
    request.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read().decode("utf-8")
    parsed = json.loads(body)
    if not isinstance(parsed, list):
        raise ValueError(f"Unexpected REDCap {content} response")
    return [row for row in parsed if isinstance(row, dict)]


def verify_redcap_live() -> int:
    contract = _load_redcap_contract()
    expected_events = contract["events"]["order"]
    expected_csbs_events = set(contract["instruments"]["carry_forward"]["events"])
    csbs_instrument = contract["instruments"]["carry_forward"]["instrument"]

    events = _redcap_api("event")
    live_events = [
        row.get("unique_event_name") or row.get("event_name")
        for row in events
        if row.get("unique_event_name") or row.get("event_name")
    ]
    missing_events = [event for event in expected_events if event not in live_events]
    if missing_events:
        print("✗ REDCap live events missing expected names: " + ", ".join(missing_events))
        return 1

    mapping = _redcap_api("formEventMapping")
    mapped = {
        row.get("unique_event_name") or row.get("event_name")
        for row in mapping
        if (row.get("form") or row.get("instrument")) == csbs_instrument
    }
    missing_csbs = sorted(expected_csbs_events - mapped)
    if missing_csbs:
        print(f"✗ `{csbs_instrument}` missing expected event mappings: {', '.join(missing_csbs)}")
        return 1

    print(f"✓ REDCap live structure verified: {len(expected_events)} events and {csbs_instrument} 6/9/12/24m mapping")
    return 0


def _extract_referenced_columns() -> set[str]:
    """Scan the Python pipeline for `.get("col")` / `df["col"]` uses."""
    src = _read(PIPELINE_PY)
    cols: set[str] = set()
    for owner in ("redcap", "features", "df", "event_df", "g_df", "group_df", "gf", "mf", "row", "r"):
        cols.update(re.findall(rf"""{owner}\.get\(\s*["']([a-zA-Z_][\w]*)["']""", src))
        cols.update(re.findall(rf"""{owner}\[\s*["']([a-zA-Z_][\w]*)["']\s*\]""", src))
    try:
        tree = ast.parse(src)
    except SyntaxError:
        tree = None
    if tree is not None:
        for node in ast.walk(tree):
            if not isinstance(node, ast.Assign):
                continue
            if not any(isinstance(target, ast.Name) and target.id == "bm_col_map" for target in node.targets):
                continue
            if not isinstance(node.value, ast.Dict):
                continue
            for value in node.value.values:
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    cols.add(value.value)
    # Drop obvious non-columns
    noise = {"phi_flag", "models", "paths", "meta", "summary", "redcap_meta", "redcap_completion_stats", "redcap_visit_health"}
    return {c for c in cols if c not in noise}


def _data_dictionary_columns() -> set[str]:
    try:
        import pandas as pd
    except ImportError:
        print("pandas not available — skipping dictionary check.")
        return set()
    if not DD_PATH.exists():
        return set()
    try:
        df = pd.read_csv(DD_PATH, engine="python", on_bad_lines="skip", quotechar='"')
    except Exception as e:
        print(f"Could not parse data dictionary ({e}) — skipping dictionary check.")
        return set()
    if "variable_name" not in df.columns:
        return set()
    return set(df["variable_name"].dropna().astype(str))


def _table_cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _is_markdown_separator(line: str) -> bool:
    cells = _table_cells(line)
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells)


def _markdown_referenced_columns(paths: Iterable[Path] | None = None) -> set[str]:
    """Collect `| column_name | ...` entries from each table glossary."""
    cols: set[str] = set()
    for md in paths or SKILL_ROOT.glob("references/**/*.md"):
        lines = md.read_text().splitlines()
        include_first_column = False
        for idx, line in enumerate(lines):
            if not line.startswith("|"):
                include_first_column = False
                continue
            next_line = lines[idx + 1] if idx + 1 < len(lines) else ""
            if next_line.startswith("|") and _is_markdown_separator(next_line):
                headers = [re.sub(r"[`*]", "", cell).strip().lower() for cell in _table_cells(line)]
                include_first_column = bool(headers and headers[0] in SOURCE_GLOSSARY_HEADERS)
                continue
            if _is_markdown_separator(line) or not include_first_column:
                continue
            cells = _table_cells(line)
            if not cells:
                continue
            cols.update(re.findall(r"`([a-zA-Z_][\w]*)`", cells[0]))
    return cols


# ─── Main check ─────────────────────────────────────────────────────────────
def run_check(check_only: bool = False) -> int:
    py_cols = _extract_referenced_columns()
    dd_cols = _data_dictionary_columns()
    md_cols = _markdown_referenced_columns()
    feature_cols = _markdown_referenced_columns([SKILL_ROOT / "references" / "tables" / "feature_matrix.md"])

    drift = 0

    def _report(label: str, items: Iterable[str]) -> None:
        nonlocal drift
        items = sorted(items)
        if items:
            drift += 1
            print(f"\n⚠  {label} ({len(items)}):")
            for c in items:
                print(f"   - {c}")

    if dd_cols:
        _report("Columns used in pipeline but NOT in data dictionary",
                py_cols - dd_cols - md_cols - feature_cols - PIPELINE_INTERNAL_COLUMNS)
    _report("Columns in pipeline but NOT documented in Markdown",
            py_cols - md_cols - dd_cols - PIPELINE_INTERNAL_COLUMNS)
    _report("Columns in Markdown but NOT used by the pipeline (possibly stale)",
            md_cols - py_cols - REFERENCE_ONLY_COLUMNS)

    # Sanity: R pipeline uses same constants
    if "%||%" in _read(PIPELINE_R) and "build_trajectories" in _read(PIPELINE_R):
        print("✓ R pipeline exports the expected builder functions.")
    else:
        drift += 1
        print("⚠  R pipeline missing expected builder functions.")

    required_code_terms = {
        "build_redcap_completion_stats",
        "build_redcap_visit_health",
        "redcap_visit_health",
        "csbs_caregiver_complete",
        "24_months_arm_1",
        "R5",
    }
    required_md_terms = {
        "redcap_visit_health",
        "csbs_caregiver_complete",
        "24_months_arm_1",
        "R5",
    }
    py_src = _read(PIPELINE_PY)
    r_src = _read(PIPELINE_R)
    md_src = _read(REDCAP_TABLE)
    missing_terms = [
        term for term in sorted(required_code_terms)
        if term not in py_src or term not in r_src
    ] + [
        term for term in sorted(required_md_terms)
        if term not in md_src
    ]
    if missing_terms:
        drift += 1
        print("⚠  REDCap contract terms missing from Python, R, or Markdown: " + ", ".join(missing_terms))
    else:
        print("✓ REDCap Python/R/Markdown contract terms are aligned.")

    if drift == 0:
        print("\n✓ Context is in sync — nothing to update.")
    else:
        print(f"\n✗ {drift} drift category(ies) detected. Update references/*.md.")

    return 1 if (check_only and drift) else 0


def main() -> int:
    p = argparse.ArgumentParser(description="NANO dashboard context extractor.")
    p.add_argument("--check", action="store_true",
                   help="Exit non-zero on any drift (useful for CI).")
    p.add_argument("--emit", action="store_true",
                   help="Regenerate machine-managed REDCap context blocks from the canonical YAML.")
    p.add_argument("--verify-redcap", action="store_true",
                   help="Verify live REDCap events and CSBS mappings against config/redcap_config.yml.")
    args = p.parse_args()
    if args.emit:
        return emit_redcap_context()
    if args.verify_redcap:
        return verify_redcap_live()
    return run_check(check_only=args.check)


if __name__ == "__main__":
    raise SystemExit(main())
