"""
What people keep: per-kind weights for the planner, from the reports they edit.

Every insight in a saved report records the kind of finding it rests on (a
group difference, a trend, a link that reverses inside groups). When someone
deletes an insight or rewrites it, the backend adds one to that kind's count
for that kind of data, and one to "shown" for every insight a report is
written with. Nothing else is kept: no account, no file, no words. The table
the backend sends here holds only those counts:

    [{"domain": "sales", "kind": "correlation", "shown": 40, "removed": 9, "rewritten": 3}, ...]

A kind that people delete more often than others of the same kind of data
weighs less in the planner; one they keep, more. The counts are smoothed
towards the average, so a handful of edits barely moves anything, and the
planner clamps the result to a small range (planner.MIN_WEIGHT..MAX_WEIGHT):
the data still decides what a report is about.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List, Optional

# How many "shown" a kind needs before its own rate counts as much as the
# average: the smoothing prior. With 20, a kind seen 5 times and deleted
# every time moves only a fifth of the way.
PRIOR = 20.0
# A rewrite says the finding was worth keeping but not as written: half a deletion.
REWRITE_COST = 0.5


def parse(raw: Any) -> List[Dict[str, Any]]:
    """The rows the backend sent, as a list of dicts with whole counts. [] for anything else."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw) if raw.strip() else []
        except ValueError:
            return []
    if not isinstance(raw, list):
        return []
    rows = []
    for r in raw:
        if not isinstance(r, dict) or not isinstance(r.get("kind"), str):
            continue
        try:
            shown, removed, rewritten = (max(0, int(r.get(k) or 0)) for k in ("shown", "removed", "rewritten"))
        except (TypeError, ValueError):
            continue
        rows.append({"domain": str(r.get("domain") or "general").lower(), "kind": r["kind"],
                     "shown": shown, "removed": min(removed, shown), "rewritten": min(rewritten, shown)})
    return rows


def _kept(rows: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
    out: Dict[str, Dict[str, float]] = {}
    for r in rows:
        k = out.setdefault(r["kind"], {"shown": 0.0, "lost": 0.0})
        k["shown"] += r["shown"]
        k["lost"] += r["removed"] + REWRITE_COST * r["rewritten"]
    return out


def weights(raw: Any, domain: Optional[str] = None) -> Dict[str, float]:
    """
    {kind: weight} for one kind of data, around 1.0. The domain's own counts
    when it has any, else everyone's. {} when nothing has been counted yet.
    """
    rows = parse(raw)
    if not rows:
        return {}
    domain = (domain or "general").lower()
    mine = [r for r in rows if r["domain"] == domain]
    kinds = _kept(mine if sum(r["shown"] for r in mine) > 0 else rows)
    shown = sum(k["shown"] for k in kinds.values())
    if shown <= 0:
        return {}
    average = 1.0 - sum(k["lost"] for k in kinds.values()) / shown
    if average <= 0:
        return {}
    out = {}
    for kind, k in kinds.items():
        if k["shown"] <= 0:
            continue
        rate = 1.0 - k["lost"] / k["shown"]
        smoothed = (k["shown"] * rate + PRIOR * average) / (k["shown"] + PRIOR)
        out[kind] = round(smoothed / average, 3)
    return out
