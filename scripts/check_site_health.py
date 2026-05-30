#!/usr/bin/env python3
"""
check_site_health.py
====================

Lightweight health probe for the public Cloudflare Pages deploy.
Used by the uptime GitHub Action and runnable locally for spot checks.

Checks
------
1. URL responds with HTTP 200 within `--timeout` seconds.
2. Assistant status endpoint responds with HTTP 200 and, by default,
    reports `ready=true`.
3. Body length > `--min-bytes` (default 4 KB) unless the response is a valid
    lightweight SPA shell with hashed asset references.
4. Body contains every string from `--must-contain` (comma-separated).
   Defaults: the deploy-stamp meta tag and the wordmark.
5. Optional `--max-stamp-age-hours` — fails if the embedded
   `esd-deploy-stamp` meta is older than the threshold.

Exit codes
----------
0  healthy
1  failed an assertion
2  network / unexpected error

Usage
-----
    python scripts/check_site_health.py
    python scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/
    python scripts/check_site_health.py --max-stamp-age-hours 48
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from urllib.parse import urljoin
import urllib.error
import urllib.request


DEFAULT_URL = "https://esd-lab-namo.pages.dev/"
DEFAULT_MUST_CONTAIN = "esd-deploy-stamp,NANO"
DEFAULT_ASSISTANT_STATUS_PATH = "/api/assistant/status"


def _looks_like_spa_shell(body: str) -> bool:
    return (
        '<div id="root"></div>' in body
        and re.search(r'src="/assets/index-[^"]+\.js"', body) is not None
        and re.search(r'href="/assets/index-[^"]+\.css"', body) is not None
    )


def _fetch(url: str, timeout: int) -> tuple[int, bytes]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ESD-Lab-USC-health-probe/1.0",
            "Accept": "text/html,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read()


def _extract_stamp(body: str) -> str | None:
    m = re.search(
        r'<meta\s+name="esd-deploy-stamp"\s+content="([^"]+)"',
        body,
        flags=re.IGNORECASE,
    )
    return m.group(1) if m else None


def _extract_api_origin(body: str) -> str | None:
    m = re.search(
        r'<meta\s+name="esd-api-origin"\s+content="([^"]+)"',
        body,
        flags=re.IGNORECASE,
    )
    return m.group(1) if m else None


def _probe_assistant_status(
    base_url: str,
    assistant_status_path: str,
    timeout: int,
    require_ready: bool,
) -> tuple[str, str | None]:
    assistant_url = urljoin(base_url.rstrip("/") + "/", assistant_status_path.lstrip("/"))
    try:
        status, raw = _fetch(assistant_url, timeout)
    except urllib.error.HTTPError as e:
        raise RuntimeError(
            f"assistant status probe returned HTTP {e.code} from {assistant_url}: {e.reason}"
        ) from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise RuntimeError(f"assistant status probe failed for {assistant_url}: {e}") from e

    if status != 200:
        raise RuntimeError(f"assistant status probe expected 200, got {status} from {assistant_url}")

    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as e:
        raise RuntimeError(f"assistant status probe returned invalid JSON from {assistant_url}: {e}") from e

    ready = payload.get("ready") is True
    state = payload.get("state") if isinstance(payload.get("state"), str) else None
    message = payload.get("message") if isinstance(payload.get("message"), str) else None

    status = payload.get("status") if isinstance(payload.get("status"), str) else None
    if status in {"ready", "unloaded", "error"}:
        state = status
        ready = status == "ready"
        if not message:
            error = payload.get("error") if isinstance(payload.get("error"), str) else None
            message = error

    if require_ready and ready is not True:
        detail = message or state or "assistant not ready"
        raise RuntimeError(f"assistant status probe reports not ready: {detail}")

    return state or ("ready" if ready else "unknown"), message


def check(
    url: str,
    timeout: int,
    min_bytes: int,
    must_contain: list[str],
    max_stamp_age_hours: float | None,
    assistant_status_path: str,
    probe_assistant: bool,
    require_assistant_ready: bool,
) -> int:
    try:
        status, raw = _fetch(url, timeout)
    except urllib.error.HTTPError as e:
        print(f"[FAIL] HTTP {e.code} from {url}: {e.reason}")
        return 1
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"[FAIL] network error fetching {url}: {e}")
        return 2

    if status != 200:
        print(f"[FAIL] expected 200, got {status} from {url}")
        return 1

    body = raw.decode("utf-8", errors="ignore")
    spa_shell = _looks_like_spa_shell(body)
    api_origin = _extract_api_origin(body)

    if len(raw) < min_bytes and not spa_shell:
        print(
            f"[FAIL] body too small: {len(raw)} bytes < min {min_bytes} "
            f"(suspect empty/stub page)"
        )
        return 1

    missing = [s for s in must_contain if s and s not in body]
    if missing:
        print(f"[FAIL] body missing required strings: {missing}")
        return 1

    stamp = _extract_stamp(body)
    if max_stamp_age_hours is not None:
        if stamp is None:
            print("[FAIL] esd-deploy-stamp meta missing — cannot verify freshness")
            return 1
        try:
            ts = dt.datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(
                tzinfo=dt.timezone.utc
            )
        except ValueError:
            print(f"[FAIL] esd-deploy-stamp unparsable: {stamp!r}")
            return 1
        age = dt.datetime.now(tz=dt.timezone.utc) - ts
        age_h = age.total_seconds() / 3600.0
        if age_h > max_stamp_age_hours:
            print(
                f"[FAIL] deploy stamp {stamp} is {age_h:.1f} h old, "
                f"max {max_stamp_age_hours} h"
            )
            return 1

    assistant_state = None
    assistant_message = None
    if probe_assistant:
        try:
            assistant_state, assistant_message = _probe_assistant_status(
                base_url=url,
                assistant_status_path=assistant_status_path,
                timeout=timeout,
                require_ready=require_assistant_ready,
            )
        except RuntimeError as e:
            origin_hint = f" (api-origin={api_origin})" if api_origin else ""
            print(f"[FAIL] {e}{origin_hint}")
            return 1

    print(
        f"[OK] {url} responded 200 with {len(raw):,} bytes "
        f"(stamp={stamp or 'n/a'}, spa_shell={'yes' if spa_shell else 'no'}, "
        f"assistant={assistant_state or 'skipped'}, api_origin={api_origin or 'n/a'})"
    )
    if assistant_message:
        print(f"[assistant] {assistant_message}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--min-bytes", type=int, default=4096)
    parser.add_argument("--must-contain", default=DEFAULT_MUST_CONTAIN)
    parser.add_argument(
        "--max-stamp-age-hours",
        type=float,
        default=None,
        help="If set, fail when esd-deploy-stamp is older than this.",
    )
    parser.add_argument(
        "--assistant-status-path",
        default=DEFAULT_ASSISTANT_STATUS_PATH,
        help="Relative assistant status endpoint to probe (default: /api/assistant/status).",
    )
    parser.add_argument(
        "--skip-assistant-probe",
        action="store_true",
        help="Skip the assistant status check and only validate the HTML shell.",
    )
    parser.add_argument(
        "--allow-assistant-unready",
        action="store_true",
        help="Treat a 200 assistant status response as healthy even when ready=false.",
    )
    args = parser.parse_args()

    must = [s.strip() for s in args.must_contain.split(",") if s.strip()]
    return check(
        url=args.url,
        timeout=args.timeout,
        min_bytes=args.min_bytes,
        must_contain=must,
        max_stamp_age_hours=args.max_stamp_age_hours,
        assistant_status_path=args.assistant_status_path,
        probe_assistant=not args.skip_assistant_probe,
        require_assistant_ready=not args.allow_assistant_unready,
    )


if __name__ == "__main__":
    raise SystemExit(main())
