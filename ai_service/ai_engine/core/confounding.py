"""
Does a correlation survive inside groups?

A correlation across a whole file can be an artefact of how the rows are
grouped. Regions that spend more may also sell more, while inside every region
spending more sells less (Simpson's paradox). Or two measures may each simply
differ by region and have nothing to do with each other beyond that. Either
way "spend and revenue are strongly correlated" is true of the file and not of
any one region, and it is the kind of sentence a report gets quoted on.

For each strong correlation, each category is tried as an explanation. The
group means are removed from both measures and the correlation is measured
again on what is left: the partial correlation controlling for that category.

  reversed   the relationship inside the groups runs the other way, it is
             significant after correcting for every combination tried, and
             most rows sit in groups that agree.
  vanished   almost nothing is left inside the groups, and the interval around
             what is left rules out the overall relationship.

"Almost nothing left" is judged on slopes as well as correlations. Groups can
shrink a correlation without touching the relationship: "age_band" made from
"age" narrows the range of age inside each group, and a narrower range means a
smaller r whatever the truth. The slope is what narrowing leaves alone.

This finds a relationship that groups account for. It does not show that the
group causes it: if the group sits between the two measures, the relationship
is real and runs through the group. So a flagged correlation is one to report
with its groups, not one to call false. A correlation that passes is not
thereby proven either.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

import numpy as np
import pandas as pd

from ai_engine.core.stat_tests import bh_adjust, correlation_p_value, fisher_ci, fmt_p

MIN_PAIR_R = 0.3          # weaker correlations are not findings worth checking
MIN_GROUP_ROWS = 30       # below this a group's own r is mostly noise
MIN_COVERAGE = 0.8        # the groups kept must hold this share of the pair's rows
MIN_REVERSED_R = 0.1      # smaller than this is "nothing", not "the other way"
VANISHED_R = 0.1
VANISHED_SHARE = 0.35     # what is left must be at most this share of the original
# Banded categories leave the slope exactly as it was, so the chance of flagging
# one is the chance this interval misses: 1 in 40 at 95%, measured at up to 3%
# on simulated files. Calling a real relationship a group effect is the worst
# mistake here, so the bar is high.
VANISHED_CONFIDENCE = 0.999
MIN_AGREEING_ROWS = 2 / 3
MAX_RESULTS = 3
MAX_GROUPS_SHOWN = 4

# A group's spread below this share of the groups' total is rounding error.
NO_SPREAD = 1e-12


def _measure(a: np.ndarray, b: np.ndarray, codes: np.ndarray, levels: Sequence[Any]) -> Optional[Dict[str, Any]]:
    """
    The correlation of a and b overall and inside groups.

    `codes` holds each row's position in `levels`, -1 for a missing label. This
    runs for every pair and category, up to 160 times on 100,000 rows, so it
    sums over integer codes: grouping the text labels each time took half a
    minute.
    """
    present = np.isfinite(a) & np.isfinite(b) & (codes >= 0)
    a, b, codes = a[present], b[present], codes[present]
    if not len(a):
        return None
    counts = np.bincount(codes, minlength=len(levels))
    big = counts >= MIN_GROUP_ROWS
    kept = big[codes]
    if big.sum() < 2 or kept.sum() < MIN_COVERAGE * len(a):
        return None
    a, b, codes = a[kept], b[kept], codes[kept]

    def centred(values: np.ndarray) -> np.ndarray:
        return values - (np.bincount(codes, values, len(counts)) / np.maximum(counts, 1))[codes]

    inside_a, inside_b = centred(a), centred(b)
    ab = np.bincount(codes, inside_a * inside_b, len(counts))
    aa = np.bincount(codes, inside_a * inside_a, len(counts))
    bb = np.bincount(codes, inside_b * inside_b, len(counts))
    all_a, all_b = a - a.mean(), b - b.mean()
    spread_a, spread_b = all_a @ all_a, all_b @ all_b
    if min(spread_a, spread_b, aa.sum(), bb.sum()) <= 0:
        return None

    groups = []
    for code in np.flatnonzero(big):
        # A group where either measure is constant has no correlation of its own.
        if aa[code] > NO_SPREAD * aa.sum() and bb[code] > NO_SPREAD * bb.sum():
            r = float(ab[code] / np.sqrt(aa[code] * bb[code]))
            groups.append({"group": str(levels[code]), "r": round(r, 3), "n": int(counts[code])})

    within = float(ab.sum() / np.sqrt(aa.sum() * bb.sum()))
    # Removing k group means costs k degrees of freedom. correlation_p_value
    # and fisher_ci allow for one, so they are given n less the other k - 1.
    effective_n = len(a) - int(big.sum()) + 1
    return {
        "overall": float((all_a @ all_b) / np.sqrt(spread_a * spread_b)),
        "within": within,
        "n": int(len(a)),
        "p": correlation_p_value(within, effective_n),
        "ci": fisher_ci(within, effective_n, level=VANISHED_CONFIDENCE),
        # How much more the groups narrowed a than b. A slope is r times the
        # ratio of the two spreads, so this and the two r's give both slopes.
        "narrowing": float(np.sqrt((aa.sum() / spread_a) / (bb.sum() / spread_b))),
        "groups": groups,
    }


def _verdict(m: Dict[str, Any], q: Optional[float]) -> Optional[str]:
    overall, within = m["overall"], m["within"]
    if abs(overall) < MIN_PAIR_R:
        return None
    if overall * within < 0 and abs(within) >= MIN_REVERSED_R and q is not None and q < 0.05:
        agreeing = sum(g["n"] for g in m["groups"] if g["r"] * within > 0)
        if agreeing >= MIN_AGREEING_ROWS * m["n"]:
            return "reversed"
    if abs(within) >= VANISHED_R or not m["ci"]:
        return None
    # A within-group r divided by the overall r, times this, is the share left
    # of the slope that survives best: of a on b or of b on a, since either
    # measure can be the one the groups narrowed.
    to_slope = max(m["narrowing"], 1 / m["narrowing"]) / abs(overall)
    furthest = max(abs(end) for end in m["ci"])
    if abs(within) * to_slope <= VANISHED_SHARE and furthest * to_slope < 1:
        return "vanished"
    return None


def check_correlations(
    df: pd.DataFrame,
    correlations: Sequence[Dict[str, Any]],
    categories: Sequence[str],
) -> List[Dict[str, Any]]:
    """
    Correlations that groups reverse or explain away, the most striking first.

    `correlations` are the rows stats_analyzer ranked; only significant ones
    strong enough to be findings are checked. Each pair is reported once, for
    the category that changes it most.
    """
    pairs = [
        (c["col1"], c["col2"]) for c in correlations
        if abs(c.get("correlation") or 0) >= MIN_PAIR_R and c.get("significant")
        and not c.get("nearDuplicate") and not c.get("arithmetic")
        and c["col1"] in df.columns and c["col2"] in df.columns
    ]
    if not pairs:
        return []
    grouped = {by: pd.factorize(df[by]) for by in categories if by in df.columns}
    numbers = {
        col: pd.to_numeric(df[col], errors="coerce").to_numpy(dtype="float64", na_value=np.nan)
        for col in {col for pair in pairs for col in pair}
    }

    measured = []
    for a, b in pairs:
        for by, (codes, levels) in grouped.items():
            m = _measure(numbers[a], numbers[b], codes, levels)
            if m:
                measured.append({**m, "a": a, "b": b, "by": by})
    if not measured:
        return []

    # Corrected across everything tried: with several pairs and categories,
    # some combination would otherwise look reversed by chance.
    best: Dict[frozenset, Dict[str, Any]] = {}
    for m, q in zip(measured, bh_adjust([m["p"] for m in measured])):
        kind = _verdict(m, q)
        if kind is None:
            continue
        rank = (kind == "reversed", abs(m["overall"] - m["within"]))
        key = frozenset((m["a"], m["b"]))
        if key not in best or rank > best[key]["rank"]:
            groups = sorted(m["groups"], key=lambda g: g["n"], reverse=True)[:MAX_GROUPS_SHOWN]
            best[key] = {
                "rank": rank,
                "a": m["a"], "b": m["b"], "by": m["by"], "kind": kind,
                "overallR": round(m["overall"], 3), "withinR": round(m["within"], 3),
                "n": m["n"], "q": fmt_p(q), "groups": groups,
            }

    results = sorted(best.values(), key=lambda item: item["rank"], reverse=True)[:MAX_RESULTS]
    return [{k: v for k, v in item.items() if k != "rank"} for item in results]


def misleading_pairs(checks: Optional[Sequence[Dict[str, Any]]]) -> set:
    """The column pairs a report must not present as findings on their own."""
    return {frozenset((c.get("a"), c.get("b"))) for c in (checks or [])}
