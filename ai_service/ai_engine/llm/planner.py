"""
Which findings a report is about, chosen before a model writes a word.

The writer used to receive every result DIG computed and pick for itself. A
free model picks the way a hurried reader skims: the first block it meets,
the biggest number, the correlation between a total and its own parts. The
statistics that change a decision (a link that reverses inside every region,
a jump in one month, the group that stands far from the rest) sat lower in
the digest and were often left out.

So the order is decided here, by rules an analyst would use, and the writer
is handed a plan: these findings, in this order. It still writes every word
and may swap a planned finding for a better one, but it starts from the
findings that matter.

What a finding is worth:

  * its kind: a reversal or a change point outranks a plain correlation,
    and a description of one column ranks last;
  * how firm it is: significance, effect size, the strength of a link;
  * what the person asked for: focus, comparisons and must-mention items
    lift every finding about those columns, and "leave out" removes them;
  * what readers keep: learned weights per kind, from the reports people
    edit (see feedback.py), nudge the order within a small range;
  * variety: each pick makes later findings about the same columns or of
    the same kind worth less, so five insights cover five things. Two
    columns that record the same thing (a nearDuplicate pair) count as one,
    and a finding of the same kind about the same columns as an earlier
    pick is the same finding and is not picked twice.

No model calls. The same digest always gives the same plan.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Set

# What each kind of result is worth before its own strength is counted. The
# order is an analyst's: findings that answer what the data is for, then
# relationships, then descriptions.
BASE_WORTH: Dict[str, float] = {
    "misleading": 10.0,
    "trend": 7.0,
    "group_difference": 6.5,
    "driver": 6.0,
    "segment": 5.5,
    "concentration": 5.5,
    "repeat_entity": 5.0,
    "group_effect": 5.0,
    "correlation": 4.5,
    "association": 4.0,
    "requested": 9.0,
    "derived": 2.5,
    "missing_pattern": 2.0,
    "anomalies": 2.0,
    "measure": 1.5,
    "category": 1.0,
}

# Learned weights may move a kind's worth by at most this factor either way:
# a few dozen edits should nudge the order, never overturn it.
MIN_WEIGHT, MAX_WEIGHT = 0.6, 1.5

ASKED_BONUS = 4.0          # a finding about a column the person asked about
OVERLAP_COST = 4.0         # a finding whose columns an earlier pick already covers in full
SAME_KIND_COST = 1.5       # per earlier pick of the same kind
_STRENGTH = {"very strong": 1.0, "strong": 0.85, "moderate": 0.6, "weak": 0.3, "very weak": 0.1,
             "negligible": 0.05}
_EFFECT = {"large": 1.0, "medium": 0.7, "small": 0.35, "negligible": 0.05}


def _strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for k, v in value.items():
            yield from _strings(k)
            yield from _strings(v)
    elif isinstance(value, (list, tuple)):
        for v in value:
            yield from _strings(v)


def _columns_of(entry: Dict[str, Any], columns: Set[str]) -> Set[str]:
    """The dataset columns a result is about: every column name it mentions."""
    found = {s for s in _strings(entry.get("item")) if s in columns}
    for key in ("column", "target"):
        if isinstance(entry.get(key), str) and entry[key] in columns:
            found.add(entry[key])
    return found


def _num(value: Any) -> Optional[float]:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if n == n else None


def firmness(entry: Dict[str, Any]) -> float:
    """
    How firm a result is, from 0 to 1, from whatever its kind records:
    significance flags, effect sizes, the strength of a link, a lift.
    """
    kind, item = entry.get("kind"), entry.get("item") or {}
    if item.get("nearDuplicate"):
        return 0.0
    if kind == "correlation" and item.get("misleading"):
        # Its own entry in misleading_correlations carries it, with both figures.
        return 0.0
    signals: List[float] = []
    if item.get("significant") is False:
        signals.append(0.15)
    elif item.get("significant") is True:
        signals.append(0.8)
    for key in ("r", "spearman", "rho", "within_groups_r"):
        n = _num(item.get(key))
        if n is not None:
            signals.append(min(1.0, abs(n)))
    for key in ("eta_squared", "etaSquared"):
        n = _num(item.get(key))
        if n is not None:
            signals.append(min(1.0, n * 4))      # an eta-squared of 0.25 is large
    if isinstance(item.get("strength"), str):
        signals.append(_STRENGTH.get(item["strength"].lower(), 0.5))
    if isinstance(item.get("effect"), str):
        signals.append(_EFFECT.get(item["effect"].lower(), 0.5))
    lift = _num(item.get("lift"))
    if lift is not None and lift > 0:
        signals.append(min(1.0, abs(lift - 1) * 2))
    if kind == "misleading":
        # The bigger the gap between the whole file and inside the groups,
        # the more a reader needs telling.
        a, b = _num(item.get("overall_r")), _num(item.get("within_groups_r"))
        if a is not None and b is not None:
            signals.append(min(1.0, abs(a - b)))
    if kind == "trend" and item.get("changePoint"):
        signals.append(1.0)
    if kind == "derived":
        signals.append(0.6 if item.get("mismatched_rows") else 0.0)
    if kind in ("measure", "category"):
        signals.append(0.5)
    if not signals:
        return 0.5
    return sum(signals) / len(signals)


def _same_things(known: Dict[str, Dict[str, Any]]) -> Dict[str, str]:
    """Each column to one name for what it records: nearDuplicate pairs merged."""
    parent: Dict[str, str] = {}

    def root(c: str) -> str:
        while parent.get(c, c) != c:
            c = parent[c]
        return c

    for entry in (known or {}).values():
        item = entry.get("item") or {}
        if item.get("nearDuplicate") and isinstance(item.get("a"), str) and isinstance(item.get("b"), str):
            a, b = root(item["a"]), root(item["b"])
            if a != b:
                parent[max(a, b)] = min(a, b)
    return {c: root(c) for c in parent}


def _words(text: str) -> Set[str]:
    return {w for w in re.findall(r"[^\W_]+", (text or "").lower()) if len(w) > 2}


def _asked_columns(columns: Set[str], texts: Iterable[str]) -> Set[str]:
    """Columns the person's words name, by the column or by most of its words."""
    asked: Set[str] = set()
    said = " ".join(t for t in texts if t).lower()
    if not said.strip():
        return asked
    said_words = _words(said)
    for col in columns:
        name = str(col).lower()
        parts = _words(re.sub(r"[_\-.]+", " ", re.sub(r"(?<=[a-z])(?=[A-Z])", " ", str(col))))
        if name in said or (parts and len(parts & said_words) >= max(1, (len(parts) + 1) // 2)):
            asked.add(col)
    return asked


def plan(
    known: Dict[str, Dict[str, Any]],
    count: int,
    columns: Iterable[str],
    focus: Iterable[str] = (),
    avoid: str = "",
    key_columns: Iterable[str] = (),
    weights: Optional[Dict[str, float]] = None,
) -> List[Dict[str, Any]]:
    """
    The findings to write about, best first: up to `count` entries of
    {"id", "kind", "about" (columns), "worth"}.

    `known` is evidence.catalog(): every result with its id and kind.
    `focus` holds the person's own words (focus, comparisons, must-mention,
    questions); `avoid` what they want left out. `weights` are learned
    per-kind factors (feedback.weights()), clamped to a small range.
    """
    columns = {str(c) for c in columns}
    asked = _asked_columns(columns, focus)
    avoided = _asked_columns(columns, [avoid]) if avoid else set()
    key_columns = {str(c) for c in key_columns}
    weights = weights or {}

    candidates = []
    for fid, entry in (known or {}).items():
        kind = str(entry.get("kind") or "")
        about = _columns_of(entry, columns)
        if about & avoided:
            continue
        firm = firmness(entry)
        if firm <= 0.0:
            continue
        learned = _num(weights.get(kind))
        weight = 1.0 if learned is None else min(MAX_WEIGHT, max(MIN_WEIGHT, learned))
        worth = BASE_WORTH.get(kind, 2.0) * (0.4 + firm) * weight
        if about & asked or kind == "requested":
            worth += ASKED_BONUS
        if about & key_columns:
            worth += 0.5
        candidates.append({"id": fid, "kind": kind, "about": sorted(about), "worth": worth})

    alias = _same_things(known)

    def things(c) -> frozenset:
        return frozenset(alias.get(col, col) for col in c["about"])

    chosen: List[Dict[str, Any]] = []
    covered: Set[str] = set()
    picked: Set[tuple] = set()
    kinds: Dict[str, int] = {}
    # A stable order first, so ties always break the same way.
    candidates.sort(key=lambda c: (-c["worth"], _id_number(c["id"])))
    while candidates and len(chosen) < max(0, count):
        def adjusted(c):
            about = things(c)
            overlap = len(about & covered) / len(about) if about else 0.0
            return c["worth"] - OVERLAP_COST * overlap - SAME_KIND_COST * kinds.get(c["kind"], 0)
        # The same kind of result about the same things is the same finding.
        candidates = [c for c in candidates if not (c["about"] and (c["kind"], things(c)) in picked)]
        if not candidates:
            break
        best = max(candidates, key=lambda c: (adjusted(c), -_id_number(c["id"])))
        candidates.remove(best)
        chosen.append({**best, "worth": round(adjusted(best), 2)})
        covered |= things(best)
        picked.add((best["kind"], things(best)))
        kinds[best["kind"]] = kinds.get(best["kind"], 0) + 1
    return chosen


def _id_number(fid: str) -> int:
    digits = re.sub(r"\D", "", str(fid))
    offset = 1000 if str(fid).startswith("R") else 0      # the person's requests sort apart
    return offset + (int(digits) if digits else 0)


_KIND_WORDS = {
    "misleading": "a link that changes inside the groups",
    "trend": "change over time",
    "group_difference": "groups that differ",
    "driver": "what moves with the target",
    "segment": "a group that stands apart",
    "concentration": "how concentrated the total is",
    "repeat_entity": "a few entities doing most of it",
    "group_effect": "how much a grouping explains",
    "correlation": "two measures that move together",
    "association": "two categories that go together",
    "requested": "what the person asked for",
    "derived": "a calculated column that does not add up",
    "missing_pattern": "where values are missing",
    "anomalies": "unusual rows",
    "measure": "one measure described",
    "category": "one category described",
}


def plan_block(chosen: List[Dict[str, Any]]) -> str:
    """The plan as the prompt shows it, or "" when there is nothing to plan."""
    if not chosen:
        return ""
    lines = []
    for i, c in enumerate(chosen, 1):
        about = f" ({', '.join(c['about'][:3])})" if c["about"] else ""
        lines.append(f"  {i}. {c['id']}: {_KIND_WORDS.get(c['kind'], c['kind'])}{about}")
    return (
        "\n═══════════════════════════════════════════════════\n"
        "ANALYST'S PLAN — the findings this report is about, most important first\n"
        "═══════════════════════════════════════════════════\n"
        + "\n".join(lines)
        + "\nBuild insight 1 on finding 1, insight 2 on finding 2, and so on, with each id in rests_on. "
          "These were chosen from the results below for what they tell a reader, how firm they are, "
          "what the user asked for, and so that each insight covers something different. Swap one only "
          "when a result below plainly tells the reader more, and never for a nearDuplicate or a calculated column.\n"
    )
