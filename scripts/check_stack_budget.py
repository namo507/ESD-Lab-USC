#!/usr/bin/env python3
"""Check declared container limits against the host budget, and sample live use.

Two questions, deliberately separate:

  * **declared** -- do the limits in docker-compose.yml sum to something the host
    can actually honour? Answerable without Docker, so CI can enforce it.
  * **observed** -- what is the stack really using? Needs a running daemon.

`mem_limit` is a hard cap that OOM-kills, so the memory column must not exceed
the host. `cpus` is a quota rather than a reservation, so CPU may oversubscribe
and the check only warns.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
COMPOSE = PROJECT_ROOT / "docker-compose.yml"

HOST_CPUS = 32
HOST_MEMORY_GB = 15.1

_SIZE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*([kmgt]?)b?\s*$", re.IGNORECASE)
_DEFAULT = re.compile(r"^\$\{[A-Z0-9_]+:-(.+)\}$")


def parse_size_gb(value: object) -> float:
    """Parse a compose memory value, resolving `${VAR:-default}` to its default.

    Without resolving the default, every templated limit reads as zero and the
    budget check silently passes on a stack that is over it.
    """
    if value is None:
        return 0.0
    text = str(value).strip()
    default = _DEFAULT.match(text)
    if default:
        text = default.group(1).strip()
    match = _SIZE.match(text)
    if not match:
        return 0.0
    number = float(match.group(1))
    unit = match.group(2).lower()
    return {
        "": number / 1e9,
        "k": number / 1e6,
        "m": number / 1024,
        "g": number,
        "t": number * 1024,
    }[unit]


def parse_cpus(value: object) -> float:
    if value is None:
        return 0.0
    text = str(value).strip()
    default = _DEFAULT.match(text)
    if default:
        text = default.group(1).strip()
    try:
        return float(text)
    except ValueError:
        return 0.0


def declared() -> tuple[list[tuple[str, float, float, bool]], float, float]:
    import yaml

    spec = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    rows: list[tuple[str, float, float, bool]] = []
    cpu_total = mem_total = 0.0
    for name, service in (spec.get("services") or {}).items():
        gated = bool(service.get("profiles"))
        cpus = parse_cpus(service.get("cpus"))
        mem = parse_size_gb(service.get("mem_limit"))
        rows.append((name, cpus, mem, gated))
        if not gated:
            cpu_total += cpus
            mem_total += mem
    return rows, cpu_total, mem_total


def observed() -> list[dict[str, str]] | None:
    if not shutil.which("docker"):
        return None
    try:
        proc = subprocess.run(  # noqa: S603
            ["docker", "stats", "--no-stream", "--format", "{{json .}}"],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError):
        return None
    if proc.returncode != 0:
        return None
    rows = []
    for line in proc.stdout.splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    rows, cpu_total, mem_total = declared()
    live = observed()

    if args.json:
        print(
            json.dumps(
                {
                    "declared": [
                        {"service": n, "cpus": c, "memory_gb": m, "profile_gated": g}
                        for n, c, m, g in rows
                    ],
                    "default_totals": {
                        "cpus": cpu_total,
                        "memory_gb": round(mem_total, 2),
                    },
                    "host": {"cpus": HOST_CPUS, "memory_gb": HOST_MEMORY_GB},
                    "observed": live,
                },
                indent=2,
            )
        )
        return 0 if mem_total <= HOST_MEMORY_GB else 1

    print(f"Declared limits (host: {HOST_CPUS} CPU / {HOST_MEMORY_GB} GB)\n")
    for name, cpus, mem, gated in sorted(rows):
        tag = "  (profile-gated)" if gated else ""
        print(f"  {name:<24} {cpus:>6.2f} cpu  {mem:>5.2f} GB{tag}")
    print(f"\n  {'default total':<24} {cpu_total:>6.2f} cpu  {mem_total:>5.2f} GB")
    print(
        f"  {'headroom':<24} {HOST_CPUS - cpu_total:>6.2f} cpu  {HOST_MEMORY_GB - mem_total:>5.2f} GB"
    )

    status = 0
    if mem_total > HOST_MEMORY_GB:
        print(
            f"\nFAIL: declared memory {mem_total:.2f} GB exceeds the {HOST_MEMORY_GB} GB host budget."
        )
        print("      mem_limit is a hard cap; the overage OOM-kills rather than swaps.")
        status = 1
    if cpu_total > HOST_CPUS:
        print(
            f"\nnote: CPU quota sums to {cpu_total:.2f} over {HOST_CPUS} cores. `cpus` is a quota, not a"
        )
        print("      reservation, so this oversubscribes rather than failing.")

    if live is None:
        print("\nobserved: docker unavailable here, so live usage was not sampled.")
    else:
        print("\nObserved (docker stats):")
        for row in live:
            print(
                f"  {row.get('Name', '?'):<24} {row.get('CPUPerc', '?'):>8}  {row.get('MemUsage', '?')}"
            )
    return status


if __name__ == "__main__":
    raise SystemExit(main())
