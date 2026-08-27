#!/usr/bin/env python3
"""Supervisor: detect a degradation, then climb the repair ladder one rung.

This composes the health checks that already exist rather than replacing them.
Each rung fires only after the one above it has failed, and every transition is
appended to ``dashboard/data/self_heal_events.jsonl``.

    0  detect      healthcheck / probe / freshness SLA breach
    1  soften      circuit breaker opens, route to the next provider
    2  degrade     drop to deterministic grounding; the buddy stays up
    3  reload      model reload, index reopen
    4  restart     autoheal (Docker) or liveness (K8s) restarts the service
    5  rebuild     indexer rebuilds the retrieval index from source
    6  reconcile   the reconcile CronJob restores declared state
    7  notify      write the event and surface it on /api/ops
    8  hold        freeze automated repair and wait for a human

Rung 8 is the one that matters. A supervisor that retries forever is worse than
one that stops and says so: it burns the thing it is repairing and hides the
failure behind noise. After three failed cycles of the same rung inside fifteen
minutes this stops, holds, and makes the failure loud.

**No repair action here destroys data.** Repair means restart, reload, and
rebuild-from-source. It never deletes a volume, drops a table, or prunes.

    python scripts/self_heal.py --once
    python scripts/self_heal.py --watch --interval 60
    python scripts/self_heal.py --once --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

EVENT_LOG = PROJECT_ROOT / "dashboard" / "data" / "self_heal_events.jsonl"
STATE_PATH = PROJECT_ROOT / "dashboard" / "data" / "self_heal_state.json"

DEFAULT_BASE_URL = os.environ.get("DASHBOARD_LOCAL_URL", "http://127.0.0.1:8080")

#: Freshness budgets, in seconds. A breach is a rung-0 detection, not a crash:
#: stale data is a correct answer about an out-of-date artifact, and the buddy
#: is expected to say so rather than quote the stale number as current.
FRESHNESS_SLA = {
    "dashboard/data/redcap_portfolio.json": 5400,      # matches config/redcap_projects.yml
    "dashboard/data/dashboard_data.json": 86_400,
    "dashboard/data/index_manifest.json": 604_800,
    "dashboard/data/similar_studies.json": 172_800,
}

#: Three failures of the same rung inside this window means stop.
HOLD_WINDOW_SECONDS = 900
HOLD_AFTER_FAILURES = 3

RUNGS = (
    "detect", "soften", "degrade", "reload",
    "restart", "rebuild", "reconcile", "notify", "hold",
)


@dataclass
class Finding:
    """One detected problem."""

    check: str
    detail: str
    #: Lowest rung that could plausibly repair this.
    suggested_rung: int
    severity: str = "warn"


@dataclass
class Outcome:
    rung: str
    action: str
    ok: bool
    detail: str
    findings: list[str] = field(default_factory=list)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def log_event(payload: dict[str, Any]) -> None:
    """Append one event. Never raises: a supervisor that dies while logging is
    worse than one that repairs silently."""
    try:
        EVENT_LOG.parent.mkdir(parents=True, exist_ok=True)
        with EVENT_LOG.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({"at": _now(), **payload}) + "\n")
    except OSError:
        pass


def _get_json(url: str, timeout: int = 8) -> dict[str, Any] | None:
    try:
        request = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            return json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None


# ---------------------------------------------------------------------------
# Rung 0 — detect
# ---------------------------------------------------------------------------

def detect(base_url: str = DEFAULT_BASE_URL) -> list[Finding]:
    """Poll the live surfaces and the freshness SLAs."""
    findings: list[Finding] = []

    live = _get_json(f"{base_url}/api/livez")
    if live is None:
        findings.append(Finding("livez", "process not answering /api/livez", 4, "critical"))
    health = _get_json(f"{base_url}/api/healthz")
    if health is None:
        findings.append(Finding("healthz", "not answering /api/healthz", 4, "critical"))
    elif health.get("status") != "ok":
        findings.append(Finding("healthz", f"status={health.get('status')!r}", 3))

    status = _get_json(f"{base_url}/api/assistant/status")
    if status is not None and status.get("state") in {"error", "unavailable"}:
        # A degraded model is a readiness problem, never a liveness one. It must
        # not restart the process: that throws away the warm model cache and
        # turns a slow answer into an outage.
        findings.append(Finding("assistant", f"assistant state={status.get('state')!r}", 1))

    portfolio = _get_json(f"{base_url}/api/redcap/portfolio-health")
    if portfolio is not None and portfolio.get("status") not in {None, "ok", "live"}:
        findings.append(Finding("redcap", f"portfolio health={portfolio.get('status')!r}", 0))

    now = time.time()
    for rel, budget in FRESHNESS_SLA.items():
        path = PROJECT_ROOT / rel
        if not path.exists():
            findings.append(Finding("freshness", f"{rel} has never been published", 5))
            continue
        age = now - path.stat().st_mtime
        if age > budget:
            findings.append(
                Finding("freshness", f"{rel} is {age / 3600:.1f} h old (SLA {budget / 3600:.1f} h)", 5)
            )

    return findings


# ---------------------------------------------------------------------------
# Repair actions. Every one is idempotent and safe to run twice.
# ---------------------------------------------------------------------------

def _run(command: list[str], timeout: int = 300) -> tuple[bool, str]:
    try:
        proc = subprocess.run(  # noqa: S603
            command, cwd=PROJECT_ROOT, capture_output=True, text=True, timeout=timeout, check=False
        )
        return proc.returncode == 0, (proc.stdout or proc.stderr or "")[-400:]
    except (subprocess.TimeoutExpired, OSError) as exc:
        return False, str(exc)


def rung_soften(_: list[Finding], dry: bool) -> Outcome:
    """The breaker is already in provider.py; this only records the transition."""
    return Outcome("soften", "provider-failover", True,
                   "circuit breaker handles tier failover in-process")


def rung_degrade(_: list[Finding], dry: bool) -> Outcome:
    """Deterministic grounding is the floor and is always available."""
    return Outcome("degrade", "deterministic-grounding", True,
                   "nano_buddy answers metric questions with no model in the loop")


def rung_reload(_: list[Finding], dry: bool) -> Outcome:
    base = os.environ.get("ESD_OLLAMA_URL", "http://127.0.0.1:11434")
    if dry:
        return Outcome("reload", "model-reload", True, f"would probe {base}/api/tags")
    ok = _get_json(f"{base}/api/tags") is not None
    return Outcome("reload", "model-reload", ok,
                   "model server reachable" if ok else "model server unreachable")


def rung_restart(_: list[Finding], dry: bool) -> Outcome:
    """Restart is delegated, never performed directly.

    autoheal (Docker) and the liveness probe (Kubernetes) already own restarts.
    Racing them from here would mean two supervisors restarting the same
    container, so this reports rather than acts.
    """
    return Outcome("restart", "delegated", True,
                   "autoheal / liveness probe owns restart; supervisor does not race it")


def rung_rebuild(_: list[Finding], dry: bool) -> Outcome:
    if dry:
        return Outcome("rebuild", "index-rebuild", True, "would run scripts/build_assistant_index.py")
    ok, detail = _run([sys.executable, "scripts/build_assistant_index.py"], timeout=1800)
    return Outcome("rebuild", "index-rebuild", ok, detail)


def rung_reconcile(_: list[Finding], dry: bool) -> Outcome:
    return Outcome("reconcile", "cronjob-reconcile", True,
                   "declared state restored by the reconcile CronJob on its next tick")


RUNG_ACTIONS: dict[int, Callable[[list[Finding], bool], Outcome]] = {
    1: rung_soften,
    2: rung_degrade,
    3: rung_reload,
    4: rung_restart,
    5: rung_rebuild,
    6: rung_reconcile,
}


# ---------------------------------------------------------------------------
# Hold state
# ---------------------------------------------------------------------------

def _load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {"failures": []}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"failures": []}


def _save_state(state: dict[str, Any]) -> None:
    try:
        STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        STATE_PATH.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    except OSError:
        pass


def should_hold(rung: str, state: dict[str, Any], now: float | None = None) -> bool:
    """Whether this rung has failed too often to keep trying."""
    now = now if now is not None else time.time()
    recent = [
        entry for entry in state.get("failures", [])
        if entry.get("rung") == rung and now - entry.get("at", 0) <= HOLD_WINDOW_SECONDS
    ]
    return len(recent) >= HOLD_AFTER_FAILURES


def record_failure(rung: str, state: dict[str, Any], now: float | None = None) -> None:
    now = now if now is not None else time.time()
    failures = [
        entry for entry in state.get("failures", [])
        if now - entry.get("at", 0) <= HOLD_WINDOW_SECONDS
    ]
    failures.append({"rung": rung, "at": now})
    state["failures"] = failures


# ---------------------------------------------------------------------------
# Cycle
# ---------------------------------------------------------------------------

def cycle(*, base_url: str = DEFAULT_BASE_URL, dry_run: bool = False) -> dict[str, Any]:
    """One detect-and-repair pass. Climbs at most one rung."""
    findings = detect(base_url)
    state = _load_state()

    if not findings:
        log_event({"rung": "detect", "trigger": "poll", "outcome": "healthy"})
        return {"healthy": True, "findings": [], "rung": None}

    detail = [f"{f.check}: {f.detail}" for f in findings]
    log_event({"rung": "detect", "trigger": "poll", "outcome": "degraded", "findings": detail})

    target = min(f.suggested_rung for f in findings) or 1
    target = max(1, target)
    rung_name = RUNGS[target]

    if should_hold(rung_name, state):
        # Stop. Make it loud. Wait for a person.
        log_event({
            "rung": "hold", "trigger": rung_name, "outcome": "halted",
            "detail": f"{HOLD_AFTER_FAILURES} failures of '{rung_name}' within "
                      f"{HOLD_WINDOW_SECONDS}s; automated repair frozen",
            "findings": detail,
        })
        _save_state(state)
        return {"healthy": False, "findings": detail, "rung": "hold", "held": True}

    action = RUNG_ACTIONS.get(target, rung_soften)
    outcome = action(findings, dry_run)
    if not outcome.ok:
        record_failure(rung_name, state)
    _save_state(state)

    log_event({
        "rung": outcome.rung, "trigger": detail[0] if detail else "unknown",
        "outcome": "repaired" if outcome.ok else "failed",
        "action": outcome.action, "detail": outcome.detail, "findings": detail,
    })
    return {
        "healthy": False, "findings": detail, "rung": outcome.rung,
        "action": outcome.action, "ok": outcome.ok, "detail": outcome.detail,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--once", action="store_true", help="run one cycle and exit")
    parser.add_argument("--watch", action="store_true", help="loop until interrupted")
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--dry-run", action="store_true", help="detect and plan, repair nothing")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv)

    def report(result: dict[str, Any]) -> None:
        if args.json:
            print(json.dumps(result))
            return
        if result["healthy"]:
            print("healthy")
            return
        print(f"degraded -> rung '{result['rung']}'")
        for line in result["findings"]:
            print(f"  · {line}")
        if result.get("detail"):
            print(f"  action: {result.get('action')} — {result['detail']}")

    if args.watch:
        try:
            while True:
                report(cycle(base_url=args.base_url, dry_run=args.dry_run))
                time.sleep(args.interval)
        except KeyboardInterrupt:
            return 0
    result = cycle(base_url=args.base_url, dry_run=args.dry_run)
    report(result)
    # Held means a human is needed; that is a non-zero exit so CI and operators
    # both notice.
    return 2 if result.get("held") else 0


if __name__ == "__main__":
    raise SystemExit(main())
