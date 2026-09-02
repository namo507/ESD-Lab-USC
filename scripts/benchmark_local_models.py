#!/usr/bin/env python3
"""Benchmark candidate local models on this lab's actual grounded-answer task.

Picking a model from a leaderboard is picking it for someone else's workload.
What matters here is narrow and measurable:

  * **Faithfulness** -- does the answer contain a number that is not in the
    retrieved context? That is the exact failure the no-number-no-claim rule
    exists to prevent, and a small model handed a chunk mentioning "260 infants"
    will cheerfully report "260 studies". This is scored as a hard gate.
  * **Speed** -- time to first token and tokens per second, on this host's CPU.
    A model that answers well in ninety seconds is not usable on a front door.
  * **Groundedness** -- does the answer actually use the context, or ignore it?

Each candidate answers the same questions against the same retrieved chunks, so
the only variable is the model.

    python scripts/benchmark_local_models.py
    python scripts/benchmark_local_models.py --models qwen3:4b,gemma3:4b --json
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.assistant.retrieval import search  # noqa: E402

OLLAMA = "http://127.0.0.1:11434"

#: Questions that exercise the real job: synthesise from retrieved lab documents
#: without inventing anything. Deliberately includes one the corpus cannot
#: answer, to see whether the model admits it or fabricates.
QUESTIONS: tuple[tuple[str, str], ...] = (
    ("visit-schedule", "Which instruments are administered at the 12 month visit?"),
    ("cptd", "What is CPTd and how is skin temperature collected?"),
    (
        "groups",
        "What are the participant groups in the NANO study and what do the codes mean?",
    ),
    ("ecg", "What hardware is used to record ECG, and at what sampling rate?"),
    ("coding", "What tool is used for behavioural coding and is it double-coded?"),
    (
        "unanswerable",
        "What was the median household income of enrolled families in 2019?",
    ),
)

SYSTEM = (
    "You answer questions about the ESD Lab using only the CONTEXT provided. "
    "Never state a number that does not appear in the CONTEXT. "
    "If the CONTEXT does not contain the answer, say plainly that you do not have it. "
    "Be concise and specific. Do not speculate."
)

#: Licences this platform will deploy without a human reading them first.
#: Anything else is reported and excluded from the default pick -- Gemma Terms of
#: Use and the Llama community licence both carry restrictions that a research
#: lab handling health-adjacent data needs to decide on deliberately.
PERMISSIVE_LICENSES = {"apache-2.0", "mit", "bsd-3-clause"}

#: Prose that means the model narrated its own reasoning instead of answering.
#: Hybrid reasoning models (the Qwen3 family) do this under a modest token
#: budget: they spend the whole allowance thinking and emit nothing usable, or
#: leak the monologue into the answer. Either is disqualifying for a surface a
#: person is waiting on.
_REASONING_LEAK = re.compile(
    r"\b(okay,? (?:the )?(?:user|so)|let me (?:check|think|see)|first,? i (?:need|should)"
    r"|the user is asking|i should (?:look|check))\b",
    re.IGNORECASE,
)

_NUMBER = re.compile(r"\d+(?:\.\d+)?")
#: Numbers that carry no factual claim: list markers, years in prose, small
#: ordinals. Counting these as hallucinations would punish ordinary phrasing.
_TRIVIAL = {"1", "2", "3", "4", "5", "0"}


@dataclass
class Result:
    model: str
    ttft_ms: list[float] = field(default_factory=list)
    total_ms: list[float] = field(default_factory=list)
    tok_per_s: list[float] = field(default_factory=list)
    unsupported_numbers: int = 0
    total_numbers: int = 0
    context_overlap: list[float] = field(default_factory=list)
    admitted_unanswerable: bool = False
    license_id: str = "unknown"
    empty_answers: int = 0
    reasoning_leaks: int = 0
    answers: dict[str, str] = field(default_factory=dict)
    error: str | None = None

    def summary(self) -> dict[str, Any]:
        def med(xs: list[float]) -> float:
            return round(statistics.median(xs), 1) if xs else 0.0

        faithful = (
            1.0
            if self.total_numbers == 0
            else round(1 - self.unsupported_numbers / self.total_numbers, 3)
        )
        return {
            "model": self.model,
            "ttft_ms_median": med(self.ttft_ms),
            "total_ms_median": med(self.total_ms),
            "tok_per_s_median": med(self.tok_per_s),
            "faithfulness": faithful,
            "unsupported_numbers": self.unsupported_numbers,
            "total_numbers": self.total_numbers,
            "context_overlap": (
                round(statistics.median(self.context_overlap), 3)
                if self.context_overlap
                else 0.0
            ),
            "admitted_unanswerable": self.admitted_unanswerable,
            "empty_answers": self.empty_answers,
            "reasoning_leaks": self.reasoning_leaks,
            "usable": self.empty_answers == 0 and self.reasoning_leaks == 0,
            "license": self.license_id,
            "permissive": self.license_id in PERMISSIVE_LICENSES,
            "error": self.error,
        }


def stream_chat(
    model: str, prompt: str, context: str, *, timeout: int
) -> tuple[str, float, float, int]:
    """Return (text, ttft_ms, total_ms, tokens). Streams so TTFT is real."""
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM},
                {
                    "role": "user",
                    "content": f"CONTEXT:\n{context}\n\nQUESTION: {prompt}",
                },
            ],
            "stream": True,
            # A realistic budget, not a generous one. An earlier run used 220 and
            # hid the fact that a reasoning model emits nothing at all inside a
            # budget an interactive surface can afford.
            "options": {"temperature": 0.2, "num_predict": 160},
            # Qwen3 is a hybrid reasoning model; left on, it spends minutes
            # thinking before the first visible token, which is disqualifying
            # for an interactive surface.
            "think": False,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{OLLAMA}/api/chat", data=body, headers={"Content-Type": "application/json"}
    )
    started = time.perf_counter()
    ttft: float | None = None
    chunks: list[str] = []
    tokens = 0
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        for raw in response:
            if not raw.strip():
                continue
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue
            piece = (payload.get("message") or {}).get("content") or ""
            if piece:
                if ttft is None:
                    ttft = (time.perf_counter() - started) * 1000
                chunks.append(piece)
                tokens += 1
            if payload.get("done"):
                break
    total = (time.perf_counter() - started) * 1000
    return "".join(chunks), ttft or total, total, tokens


def license_for(model: str) -> str:
    """Identify the model's licence from the registry, not from memory."""
    try:
        from scripts.resolve_local_models import (
            LICENSE_MEDIA_TYPE,
            fetch_blob,
            fetch_manifest,
            identify_license,
        )

        name, _, tag = model.partition(":")
        manifest = fetch_manifest(name, tag or "latest")
        layers = [
            layer
            for layer in manifest.get("layers", [])
            if layer.get("mediaType") == LICENSE_MEDIA_TYPE
        ]
        if not layers:
            return "not-published"
        return identify_license(
            fetch_blob(name, layers[0]["digest"]).decode("utf-8", "replace")
        )
    except Exception:  # noqa: BLE001 - an unidentifiable licence is not permissive
        return "unknown"


def numbers_in(text: str) -> set[str]:
    return {n for n in _NUMBER.findall(text) if n not in _TRIVIAL}


def evaluate(model: str, *, timeout: int, verbose: bool) -> Result:
    result = Result(model=model)
    result.license_id = license_for(model)
    for key, question in QUESTIONS:
        hits = search(
            question, limit=5, embed_base_url=None
        )  # sparse: fast and identical per model
        context = "\n\n".join(f"[{h.source_path}]\n{h.text[:900]}" for h in hits)
        try:
            answer, ttft, total, tokens = stream_chat(
                model, question, context, timeout=timeout
            )
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            result.error = f"{type(exc).__name__}: {exc}"
            return result

        cleaned = answer.strip()
        result.answers[key] = cleaned
        # An answer nobody can read is not an answer, however faithful it is.
        if len(cleaned) < 3:
            result.empty_answers += 1
        if _REASONING_LEAK.search(cleaned[:400]):
            result.reasoning_leaks += 1
        result.ttft_ms.append(ttft)
        result.total_ms.append(total)
        if total > 0:
            result.tok_per_s.append(tokens / (total / 1000))

        # Faithfulness: every number in the answer must appear in the context.
        answer_numbers = numbers_in(answer)
        context_numbers = numbers_in(context)
        result.total_numbers += len(answer_numbers)
        result.unsupported_numbers += len(answer_numbers - context_numbers)

        # Groundedness: how much of the answer's vocabulary came from context.
        words = {w.lower() for w in re.findall(r"[A-Za-z][A-Za-z-]{3,}", answer)}
        ctx_words = {w.lower() for w in re.findall(r"[A-Za-z][A-Za-z-]{3,}", context)}
        if words:
            result.context_overlap.append(len(words & ctx_words) / len(words))

        if key == "unanswerable":
            lowered = answer.lower()
            result.admitted_unanswerable = any(
                phrase in lowered
                for phrase in (
                    "do not have",
                    "don't have",
                    "not in the context",
                    "no information",
                    "does not contain",
                    "not provided",
                    "cannot",
                    "unable",
                )
            )

        if verbose:
            print(f"    [{key}] {total / 1000:5.1f}s  {answer.strip()[:110]}")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--models", default="", help="comma-separated; default is everything installed"
    )
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument(
        "--write", type=Path, default=None, help="write the ranked report here"
    )
    args = parser.parse_args(argv)

    if args.models:
        models = [m.strip() for m in args.models.split(",") if m.strip()]
    else:
        try:
            with urllib.request.urlopen(
                f"{OLLAMA}/api/tags", timeout=10
            ) as r:  # noqa: S310
                models = [
                    m["name"]
                    for m in json.load(r).get("models", [])
                    if "embed" not in m["name"]
                ]
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            print(f"cannot reach Ollama at {OLLAMA}: {exc}", file=sys.stderr)
            return 1

    results: list[Result] = []
    for model in models:
        print(f"  benchmarking {model} …", flush=True)
        results.append(evaluate(model, timeout=args.timeout, verbose=args.verbose))

    summaries = [r.summary() for r in results if r.error is None]
    failed = [r.summary() for r in results if r.error is not None]

    # Rank: licence is a gate, then faithfulness, then speed.
    #
    # Licence first because a model that cannot be deployed is not a candidate
    # however well it scores, and "we shipped it before anyone read the terms"
    # is not a position a research lab should be put in. Faithfulness second
    # because inventing a number is the one failure this system exists to
    # prevent. Speed only breaks ties between models that clear both.
    def rank_key(s: dict[str, Any]) -> tuple:
        return (
            -(1 if s["permissive"] else 0),
            -(1 if s["usable"] else 0),
            -(1 if s["faithfulness"] >= 0.98 else 0),
            -s["faithfulness"],
            -s["context_overlap"],
            s["total_ms_median"],
        )

    summaries.sort(key=rank_key)

    if args.json:
        print(json.dumps({"ranked": summaries, "failed": failed}, indent=2))
    else:
        print(
            f"\n  {'model':<16}{'licence':>13}{'lic':>7}{'usable':>8}{'faith':>7}{'ground':>8}{'total':>9}"
        )
        for s in summaries:
            usable = (
                "yes"
                if s["usable"]
                else f"NO({s['empty_answers']}e/{s['reasoning_leaks']}r)"
            )
            print(
                f"  {s['model']:<16}{s['license']:>13}{('ok' if s['permissive'] else 'REVIEW'):>7}"
                f"{usable:>8}{s['faithfulness']:>7.2f}"
                f"{s['context_overlap']:>8.2f}{s['total_ms_median'] / 1000:>8.1f}s"
            )
        for s in failed:
            print(f"  {s['model']:<22}  FAILED: {s['error']}")
        if summaries:
            best = summaries[0]
            print(
                f"\n  winner: {best['model']}  ({best['license']}, faithfulness {best['faithfulness']:.2f})"
            )
            blocked = [s for s in summaries if not s["permissive"]]
            if blocked and blocked[0]["faithfulness"] > best["faithfulness"]:
                top = blocked[0]
                print(
                    f"  note:   {top['model']} scored higher ({top['faithfulness']:.2f}) but is "
                    f"{top['license']}, not permissive.\n"
                    f"          It is excluded from the default pick. Adopt it only after the "
                    f"lab has read those terms."
                )

    if args.write and summaries:
        args.write.write_text(
            json.dumps(
                {
                    "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "host": {"cpus": __import__("os").cpu_count(), "gpu": False},
                    "questions": [q for _, q in QUESTIONS],
                    "ranked": summaries,
                    "failed": failed,
                    "winner": summaries[0]["model"],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"  wrote {args.write}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
