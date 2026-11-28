"""
Try versions of the report prompt on the test set and keep the winner.

    python -m report_eval.tune --live                          # every variant, every case
    python -m report_eval.tune --live --variants plan_first    # just one against the current choice
    python -m report_eval.tune --dry                           # no model calls: checks the flow, keeps nothing

Each variant (ai_engine/llm/prompt_variants.py) writes one report per case.
The current choice is run again alongside, on the same day and models,
because the free models change and a score from last month is no yardstick.

A variant replaces the current choice only if
  * a model wrote every one of its reports (a fallback says nothing about a prompt),
  * its mean score beats the current one by at least MARGIN points, and
  * no single case scores more than MAX_CASE_DROP points lower.
The choice is saved to ai_engine/llm/prompt_choice.json, which ships with the
next deploy. Expect about six model calls per variant, spaced out.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ai_engine.llm import prompt_variants
from report_eval.cases import by_name
from report_eval.run import run, save

MARGIN = 3.0
MAX_CASE_DROP = 10.0


def decide(current: Dict[str, Any], tried: Dict[str, Dict[str, Any]]) -> Optional[str]:
    """The variant that should replace the current choice, or None. Pure: no files, no calls."""
    base = {r["case"]: r["score"] for r in current["results"]}
    if any(r["fallback"] for r in current["results"]):
        return None      # the yardstick itself was not written by a model
    best, best_mean = None, current["summary"]["mean"] + MARGIN
    for name, card in tried.items():
        if any(r["fallback"] for r in card["results"]):
            continue
        if any(base.get(r["case"], 0) - r["score"] > MAX_CASE_DROP for r in card["results"]):
            continue
        if card["summary"]["mean"] >= best_mean:
            best, best_mean = name, card["summary"]["mean"]
    return best


def keep(name: str, card: Dict[str, Any], against: Dict[str, Any]) -> None:
    prompt_variants.CHOICE_FILE.write_text(json.dumps({
        "variant": name,
        "chosenAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "meanScore": card["summary"]["mean"],
        "replaced": against["variant"],
        "replacedScore": against["summary"]["mean"],
        "cases": {r["case"]: r["score"] for r in card["results"]},
    }, indent=2) + "\n", encoding="utf-8")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Tune the report prompt on files with known answers.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--live", action="store_true", help="use the real models (costs model calls)")
    mode.add_argument("--dry", action="store_true", help="no model calls; never changes the choice")
    parser.add_argument("--variants", default="", help="comma-separated variants (default: all others)")
    parser.add_argument("--cases", default="", help="comma-separated case names (default: all)")
    args = parser.parse_args(argv)

    current = prompt_variants.chosen()
    names = [v.strip() for v in args.variants.split(",") if v.strip()] or \
        [v for v in prompt_variants.VARIANTS if v != current]
    unknown = [v for v in names if v not in prompt_variants.VARIANTS]
    if unknown:
        raise SystemExit(f"Unknown variant(s): {', '.join(unknown)}. Known: {', '.join(prompt_variants.VARIANTS)}")
    cases = by_name(args.cases.split(",") if args.cases else [])

    print(f"current choice: {current}", flush=True)
    yardstick = run(cases, args.live, current, quiet=True)
    yardstick["variant"] = current
    save(yardstick)
    tried = {}
    for name in names:
        card = run(cases, args.live, name, quiet=True)
        card["variant"] = name
        save(card)
        tried[name] = card
    for name, card in [(current, yardstick), *tried.items()]:
        s = card["summary"]
        print(f"{s['mean']:5.1f}  {name:<22} written by a model: {s['written']}/{s['cases']}", flush=True)

    winner = decide(yardstick, tried)
    if args.dry:
        print(f"dry run: would keep {winner or current}; nothing changed")
    elif winner:
        keep(winner, tried[winner], yardstick)
        print(f"kept {winner} in {prompt_variants.CHOICE_FILE.name}; it ships with the next deploy")
    else:
        print(f"kept {current}: no variant beat it by {MARGIN} points without losing a case")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
