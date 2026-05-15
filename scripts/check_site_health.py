#!/usr/bin/env python3
"""
check_site_health.py
====================

Lightweight health probe for the public Cloudflare Pages deploy.
Used by the uptime GitHub Action and runnable locally for spot checks.

Checks
------
1. URL responds with HTTP 200 within `--timeout` seconds.
2. Body length > `--min-bytes` (default 4 KB) — guards against an empty
   shell rendered while the bundler payload is still uploading.
3. Body contains every string from `--must-contain` (comma-separated).
   Defaults: the deploy-stamp meta tag and the wordmark.
4. Optional `--max-stamp-age-hours` — fails if the embedded
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
import re
import sys
import urllib.error
import urllib.request


DEFAULT_URL = "https://esd-lab-namo.pages.dev/"
DEFAULT_MUST_CONTAIN = "esd-deploy-stamp,NANO"


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


def check(
    url: str,
    timeout: int,
    min_bytes: int,
    must_contain: list[str],
    max_stamp_age_hours: float | None,
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

    if len(raw) < min_bytes:
        print(
            f"[FAIL] body too small: {len(raw)} bytes < min {min_bytes} "
            f"(suspect empty/stub page)"
        )
        return 1

    body = raw.decode("utf-8", errors="ignore")
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

    print(
        f"[OK] {url} responded 200 with {len(raw):,} bytes "
        f"(stamp={stamp or 'n/a'})"
    )
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
    args = parser.parse_args()

    must = [s.strip() for s in args.must_contain.split(",") if s.strip()]
    return check(
        url=args.url,
        timeout=args.timeout,
        min_bytes=args.min_bytes,
        must_contain=must,
        max_stamp_age_hours=args.max_stamp_age_hours,
    )


if __name__ == "__main__":
    raise SystemExit(main())
