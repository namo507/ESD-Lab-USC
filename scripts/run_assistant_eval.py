#!/usr/bin/env python3
"""Run the assistant eval fixtures. A regression here blocks the deploy.

What is asserted, and what deliberately is not:

  * **Routing** -- every question must land in the right domain. This is the
    decision that determines whether a model is consulted at all, so it is the
    one worth pinning.
  * **Refusal** -- every PHI fixture must be refused. 100%, no exceptions.
  * **Citation** -- where a fixture names an expected source, retrieval must
    surface it. This is what stops the buddy answering from the model's own
    memory instead of the lab's documents.

Generated prose is **not** asserted. Pinning wording would test the model's
mood; these three properties are what actually make an answer trustworthy.

    python scripts/run_assistant_eval.py
    python scripts/run_assistant_eval.py --no-retrieval   # routing + refusal only
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.assistant.retrieval import search  # noqa: E402
from dashboard.assistant.routing import plan_domain  # noqa: E402

FIXTURES = PROJECT_ROOT / "tests" / "fixtures" / "assistant_eval.json"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--no-retrieval", action="store_true", help="skip citation checks"
    )
    parser.add_argument(
        "--embed-base-url",
        default="http://127.0.0.1:11434",
        help="embedding service for the dense half; pass '' to force sparse-only",
    )
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    spec = json.loads(FIXTURES.read_text(encoding="utf-8"))
    cases = spec["cases"]

    routing_pass = phi_pass = phi_total = citation_pass = citation_total = 0
    failures: list[str] = []

    for case in cases:
        decision = plan_domain(case["q"])
        expected = case["expect_domain"]
        ok = decision.domain == expected
        routing_pass += ok
        if not ok:
            failures.append(
                f"{case['id']}: routed {decision.domain!r}, expected {expected!r} — {case['q'][:60]}"
            )

        if case.get("phi"):
            phi_total += 1
            # A PHI fixture has exactly one acceptable outcome.
            if decision.domain == "refused":
                phi_pass += 1
            else:
                failures.append(
                    f"{case['id']}: PHI REFUSAL FAILED — routed {decision.domain!r}"
                )

        expect_source = case.get("expect_source")
        if expect_source and not args.no_retrieval:
            # A fixture may list several acceptable sources: the assertion is
            # that the answer is grounded in a document that genuinely covers
            # the question, not that one particular file ranked first.
            accepted = (
                [expect_source]
                if isinstance(expect_source, str)
                else list(expect_source)
            )
            citation_total += 1
            hits = search(
                case["q"], limit=8, embed_base_url=args.embed_base_url or None
            )
            if any(
                any(source in hit.source_path for source in accepted) for hit in hits
            ):
                citation_pass += 1
            else:
                got = ", ".join(h.source_path for h in hits[:3]) or "(nothing)"
                failures.append(
                    f"{case['id']}: expected a citation from one of {accepted}; got {got}"
                )

        if args.verbose:
            print(f"  {decision.domain:<14} {case['id']:<9} {case['q'][:58]}")

    routing_rate = routing_pass / len(cases) if cases else 0.0
    phi_rate = phi_pass / phi_total if phi_total else 1.0
    citation_rate = citation_pass / citation_total if citation_total else 1.0

    summary = {
        "cases": len(cases),
        "routing_pass": routing_pass,
        "routing_rate": round(routing_rate, 4),
        "phi_pass": phi_pass,
        "phi_total": phi_total,
        "phi_rate": round(phi_rate, 4),
        "citation_pass": citation_pass,
        "citation_total": citation_total,
        "citation_rate": round(citation_rate, 4),
        "pass_floor": spec["pass_floor"],
        "phi_pass_floor": spec["phi_pass_floor"],
    }

    if args.json:
        print(json.dumps({**summary, "failures": failures}, indent=2))
    else:
        print(
            f"routing   {routing_pass}/{len(cases)}  ({routing_rate:.1%}, floor {spec['pass_floor']:.0%})"
        )
        print(
            f"PHI       {phi_pass}/{phi_total}  ({phi_rate:.1%}, floor {spec['phi_pass_floor']:.0%})"
        )
        if citation_total:
            print(f"citations {citation_pass}/{citation_total}  ({citation_rate:.1%})")
        if failures:
            print("\nfailures:")
            for line in failures:
                print(f"  · {line}")

    # PHI is an absolute gate; the others use the configured floor.
    if phi_rate < spec["phi_pass_floor"]:
        print(
            "\nBLOCKED: a PHI refusal fixture failed. This gate has no tolerance.",
            file=sys.stderr,
        )
        return 1
    if routing_rate < spec["pass_floor"]:
        print(
            f"\nBLOCKED: routing {routing_rate:.1%} is below the {spec['pass_floor']:.0%} floor.",
            file=sys.stderr,
        )
        return 1
    if citation_total and citation_rate < spec["pass_floor"]:
        print(
            f"\nBLOCKED: citations {citation_rate:.1%} is below the {spec['pass_floor']:.0%} floor.",
            file=sys.stderr,
        )
        return 1
    print("\neval passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
