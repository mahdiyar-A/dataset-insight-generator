"""
Versions of the report prompt, and the one that scored best offline.

A variant is one small, named change to the prompt the writer is given: move
the analyst's plan above the statistics, drop it, add a rule. Variants are
tried against the files in report_eval, whose right answers are known, and
`python -m report_eval.tune` keeps the winner in prompt_choice.json. Only a
variant that beats the current one on the whole set, and is worse on no
single file by more than a little, replaces it.

At run time the chosen variant is applied to every report prompt. A missing
or unreadable choice file, or a name that is not listed here, means the
prompt as written.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Callable, Dict, Optional

CHOICE_FILE = Path(__file__).with_name("prompt_choice.json")
BASELINE = "baseline"

_PLAN = re.compile(
    r"\n═+\nANALYST'S PLAN[^\n]*\n═+\n.*?(?=\n═+\nWRITING STANDARD)", re.S)
_DATA_HEADER = "═══════════════════════════════════════════════════\nENRICHED STATISTICAL DATA"
_INSIGHT_RULES = "INSIGHT RULES:\n"


def _plan_first(prompt: str) -> str:
    """The plan before the statistics, so the writer reads the order first."""
    found = _PLAN.search(prompt)
    if not found or _DATA_HEADER not in prompt:
        return prompt
    block = found.group(0).strip("\n")
    without = prompt[:found.start()] + prompt[found.end():]
    return without.replace(_DATA_HEADER, block + "\n\n" + _DATA_HEADER, 1)


def _no_plan(prompt: str) -> str:
    """The prompt without the plan: what the planner is worth, measured."""
    return _PLAN.sub("", prompt)


def _rule(line: str) -> Callable[[str], str]:
    def add(prompt: str) -> str:
        if _INSIGHT_RULES not in prompt:
            return prompt
        return prompt.replace(_INSIGHT_RULES, f"{_INSIGHT_RULES}- {line}\n", 1)
    return add


VARIANTS: Dict[str, Callable[[str], str]] = {
    BASELINE: lambda prompt: prompt,
    "plan_first": _plan_first,
    "no_plan": _no_plan,
    "say_what_it_means": _rule(
        "End every insight with one sentence on what it means for the reader's decisions, "
        "in their words, with no new figure."),
    "split_before_whole": _rule(
        "When a result differs inside groups from the whole file, give the inside-group figure first, "
        "then the overall one, and say the groups account for the difference."),
}


def chosen() -> str:
    """The variant the last tuning run kept, or the baseline."""
    try:
        name = json.loads(CHOICE_FILE.read_text(encoding="utf-8")).get("variant")
    except (OSError, ValueError, AttributeError):
        return BASELINE
    return name if name in VARIANTS else BASELINE


def apply(prompt: str, name: Optional[str] = None) -> str:
    """The prompt with variant `name` (default: the chosen one) applied. Never raises."""
    variant = VARIANTS.get(name or chosen(), VARIANTS[BASELINE])
    try:
        changed = variant(prompt)
    except Exception as e:   # a tuning experiment must never cost anyone their report
        print(f"[Prompt] variant {name!r} skipped: {type(e).__name__}: {e}", flush=True)
        return prompt
    return changed if isinstance(changed, str) and changed.strip() else prompt
